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
   * Per-file thread cache populated by `useComments` when it loads a file's
   * threads. Used by `workspaceHasOtherUnresolved` to make the toolbar's
   * "Next unresolved (workspace)" disabled state precise. Lazy: a tab path
   * with no entry has not been opened/loaded yet — selectors must treat
   * "absent" as "unknown", not as "no unresolved".
   */
  threadsByFile: Record<string, CommentThread[]>;
  /**
   * VM-registered handler for the focused-thread resolve action. The
   * slice does not call `update_comment` directly — it routes through
   * the VM hook (`useCommentActions.resolveFocusedThread`) registered
   * here at mount time.
   */
  _resolveFocusedThreadHandler: (() => Promise<void>) | null;

  setFocusedThread: (id: string | null) => void;
  setThreadsForFile: (filePath: string, threads: CommentThread[]) => void;
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
    threadsByFile: {},
    _resolveFocusedThreadHandler: null,

    setFocusedThread: (id) => set({ focusedThreadId: id }),
    setThreadsForFile: (filePath, threads) =>
      set((s) => ({
        threadsByFile: { ...s.threadsByFile, [filePath]: threads },
      })),
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

/**
 * A4 (iter 7) — workspace-wide selector for the "Next unresolved" toolbar
 * button's disabled state.
 *
 * Returns `true` iff there is plausibly an unresolved thread in some tab
 * other than `currentFilePath`. Logic:
 *
 *   1. If no other tab is open → `false` (button must be disabled).
 *   2. If any other tab has loaded threads with at least one unresolved
 *      → `true` (definitely something to jump to).
 *   3. Otherwise some other tabs may not have been loaded yet
 *      (`threadsByFile` is lazy-populated by `useComments`). We fall back
 *      to the conservative "tabs.length > 1" heuristic and return `true`
 *      so the user can click and let the action's badge query decide —
 *      same behaviour as before the precise selector existed.
 *   4. All other tabs loaded with zero unresolved → `false`.
 *
 * Limitation: precision depends on the user having visited the other tabs
 * (so `useComments` could populate `threadsByFile`). Files never opened
 * in the current session fall through case (3) and keep the heuristic.
 */
export function workspaceHasOtherUnresolved(
  state: Store,
  currentFilePath: string | null,
): boolean {
  const otherTabs = state.tabs.filter((t) => t.path !== currentFilePath);
  if (otherTabs.length === 0) return false;

  let allLoaded = true;
  for (const tab of otherTabs) {
    const threads = state.threadsByFile[tab.path];
    if (!threads) {
      allLoaded = false;
      continue;
    }
    if (threads.some((t) => !t.root.resolved)) return true;
  }
  // No loaded other-tab has unresolved. If some are unloaded, fall back
  // to the heuristic (assume there might be unresolved). If all loaded
  // and none have unresolved, return false (button disabled).
  return !allLoaded;
}
