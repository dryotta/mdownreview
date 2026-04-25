/**
 * Comments slice — F1 keyboard navigation state.
 *
 * Owns transient, non-persisted UI state for the comment review flow:
 *   - `focusedThreadId` — the thread the J/K/N shortcuts are stepping
 *     through (also drives `R` resolve target).
 *
 * The navigation actions read threads via the existing
 * `get_file_comments` IPC chokepoint (a pure read; mutations stay in
 * the VM via `update_comment` — see `useCommentActions`).
 *
 * `resolveFocusedThread` delegates to a VM-registered handler so the
 * IPC mutation path goes through `update_comment` rather than re-
 * implemented in the slice (rule: chokepoint discipline).
 */
import type { StoreApi } from "zustand";
import type { Store } from "./index";
import {
  getFileBadges,
  getFileComments,
  type CommentThread,
} from "@/lib/tauri-commands";
import { error } from "@/logger";

export interface CommentsSlice {
  focusedThreadId: string | null;
  /**
   * VM-registered handler for the focused-thread resolve action. The
   * slice does not call `update_comment` directly — it routes through
   * the VM hook (`useCommentActions.resolveFocusedThread`) registered
   * here at mount time.
   */
  _resolveFocusedThreadHandler: (() => Promise<void>) | null;

  setFocusedThread: (id: string | null) => void;
  setResolveFocusedThreadHandler: (
    fn: (() => Promise<void>) | null,
  ) => void;
  resolveFocusedThread: () => Promise<void>;
  nextUnresolvedInActiveFile: () => Promise<void>;
  prevUnresolvedInActiveFile: () => Promise<void>;
  nextUnresolvedAcrossFiles: () => Promise<void>;
}

type SliceSet = StoreApi<Store>["setState"];
type SliceGet = StoreApi<Store>["getState"];

/** Sort threads by best-effort line number; orphans (matchedLineNumber=0) sink to top. */
function sortByLine(threads: CommentThread[]): CommentThread[] {
  return [...threads].sort(
    (a, b) =>
      (a.root.matchedLineNumber ?? a.root.line ?? 0) -
      (b.root.matchedLineNumber ?? b.root.line ?? 0),
  );
}

function unresolved(threads: CommentThread[]): CommentThread[] {
  return sortByLine(threads.filter((t) => !t.root.resolved));
}

function dispatchScrollToLine(line: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("scroll-to-line", { detail: { line } }),
  );
}

function lineOf(t: CommentThread): number {
  return t.root.matchedLineNumber ?? t.root.line ?? 1;
}

export function createCommentsSlice(
  set: SliceSet,
  get: SliceGet,
): CommentsSlice {
  return {
    focusedThreadId: null,
    _resolveFocusedThreadHandler: null,

    setFocusedThread: (id) => set({ focusedThreadId: id }),
    setResolveFocusedThreadHandler: (fn) =>
      set({ _resolveFocusedThreadHandler: fn }),

    resolveFocusedThread: async () => {
      const fn = get()._resolveFocusedThreadHandler;
      if (!fn) return;
      try {
        await fn();
      } catch (e) {
        error(`[comments-slice] resolveFocusedThread failed: ${e}`);
      }
    },

    nextUnresolvedInActiveFile: async () => {
      const { activeTabPath, focusedThreadId } = get();
      if (!activeTabPath) return;
      let threads: CommentThread[];
      try {
        threads = await getFileComments(activeTabPath);
      } catch (e) {
        error(`[comments-slice] getFileComments failed: ${e}`);
        return;
      }
      const list = unresolved(threads);
      if (list.length === 0) return;
      const curIdx = focusedThreadId
        ? list.findIndex((t) => t.root.id === focusedThreadId)
        : -1;
      const next = list[(curIdx + 1) % list.length];
      set({ focusedThreadId: next.root.id });
      dispatchScrollToLine(lineOf(next));
    },

    prevUnresolvedInActiveFile: async () => {
      const { activeTabPath, focusedThreadId } = get();
      if (!activeTabPath) return;
      let threads: CommentThread[];
      try {
        threads = await getFileComments(activeTabPath);
      } catch (e) {
        error(`[comments-slice] getFileComments failed: ${e}`);
        return;
      }
      const list = unresolved(threads);
      if (list.length === 0) return;
      const curIdx = focusedThreadId
        ? list.findIndex((t) => t.root.id === focusedThreadId)
        : 0;
      // (curIdx - 1 + len) % len; if curIdx === -1 (focused not in list), wrap to last.
      const prevIdx =
        curIdx <= 0 ? list.length - 1 : curIdx - 1;
      const prev = list[prevIdx];
      set({ focusedThreadId: prev.root.id });
      dispatchScrollToLine(lineOf(prev));
    },

    nextUnresolvedAcrossFiles: async () => {
      const { activeTabPath, focusedThreadId, tabs } = get();
      // First: try advancing within the active file.
      if (activeTabPath) {
        let threads: CommentThread[] = [];
        try {
          threads = await getFileComments(activeTabPath);
        } catch (e) {
          error(`[comments-slice] getFileComments failed: ${e}`);
        }
        const list = unresolved(threads);
        const curIdx = focusedThreadId
          ? list.findIndex((t) => t.root.id === focusedThreadId)
          : -1;
        if (curIdx < list.length - 1 && list.length > 0) {
          const next = list[curIdx + 1];
          set({ focusedThreadId: next.root.id });
          dispatchScrollToLine(lineOf(next));
          return;
        }
      }
      // Else: find next file with unresolved comments via badges.
      const otherPaths = tabs
        .map((t) => t.path)
        .filter((p) => p !== activeTabPath);
      if (otherPaths.length === 0) return;
      let badges: Record<string, { count: number }>;
      try {
        badges = await getFileBadges(otherPaths);
      } catch (e) {
        error(`[comments-slice] getFileBadges failed: ${e}`);
        return;
      }
      const target = otherPaths.find((p) => (badges[p]?.count ?? 0) > 0);
      if (!target) return;
      get().setActiveTab(target);
      // Load that file's threads and focus the first unresolved.
      let threads: CommentThread[] = [];
      try {
        threads = await getFileComments(target);
      } catch (e) {
        error(`[comments-slice] getFileComments failed: ${e}`);
        return;
      }
      const list = unresolved(threads);
      if (list.length === 0) return;
      const first = list[0];
      set({ focusedThreadId: first.root.id });
      dispatchScrollToLine(lineOf(first));
    },
  };
}
