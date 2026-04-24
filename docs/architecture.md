# Architecture — rules for mdownreview

**Status:** Canonical for structural and layering rules. Cite violations as "violates rule N in `docs/architecture.md`".
**Charter:** [`docs/principles.md`](principles.md)
**Last updated:** 2026-04-23

## Principles

These principles are unique to architecture. **Rust-First** is a charter meta-principle — see [`docs/principles.md`](principles.md).

1. **Single IPC Chokepoint.** Every `invoke()` call flows through `src/lib/tauri-commands.ts`, which owns wrapper signatures, argument shape, and TypeScript return types mirrored from Rust.
2. **Single Logging Chokepoint.** All frontend logging flows through `src/logger.ts`; all backend logging uses `tracing` macros or `log::*`, both routed by `tauri-plugin-log` to one rotating file.
3. **State Stratification.** Domain state (comments) lives in MRSF sidecar files; reactive UI state lives in Zustand; ephemeral view state (scroll, selection, folding) lives in component `useState`/`useRef`. Persist middleware serializes UI only.
4. **Commands Mutate, Events Notify.** Tauri commands perform imperative actions (read, write, compute) and return typed results. Tauri events notify the frontend of asynchronous change. Events can fire before React's first `useEffect`, so deterministic bootstrap uses commands.
5. **Layer Directionality.** Dependencies flow inward only: `components/` → `hooks/` → `lib/` → `store/`. `lib/vm/` is the single seam where `lib/` may read `@/store`. `lib/` must not import `components/` or `hooks/`.

## Rules

### IPC & logging chokepoints
1. Every Tauri IPC call MUST go through a typed wrapper in `src/lib/tauri-commands.ts`; production code MUST NOT import `invoke` directly. **Evidence:** `src/lib/tauri-commands.ts:1` is the only non-test `invoke` importer.
2. Every new Rust command MUST ship with a matching typed wrapper in `tauri-commands.ts`; the wrapper's return type MUST match the Rust `Result<T, String>` unwrapped `T`. **Evidence:** `read_text_file` (`commands.rs:107`) paired with `readTextFile` (`tauri-commands.ts:44`).
3. Every Rust command MUST be registered in `shared_commands!` in `src-tauri/src/lib.rs`. **Evidence:** `src-tauri/src/lib.rs:220-242`.
4. All frontend logging MUST go through `src/logger.ts`; no file outside `src/logger.ts` and its test may import from `@tauri-apps/plugin-log`. **Evidence:** grep returns only `src/logger.ts:7` and its test.
5. Log prefix tags: frontend `[web]`, Rust `[rust]` or a subsystem like `[watcher]`. **Evidence:** `src/logger.ts:9-13`; `src-tauri/src/watcher.rs:93`.
6. `console.log`/`console.info` MUST NOT appear in production frontend code; `console.warn`/`console.debug` tolerated only as watcher-internal scaffolding. **Evidence:** `src/hooks/useFileWatcher.ts:35,56,61`.

### MRSF ownership (Rust is the source of truth)
7. MRSF sidecar read/write/serde/reparenting MUST live in Rust (`src-tauri/src/core/sidecar.rs`, `core/comments.rs`); TypeScript MUST NOT parse or serialize sidecars. **Evidence:** no YAML/JSON parsing of `.review.yaml` exists under `src/`.
8. Sidecar-mutating commands MUST emit `comments-changed` after save. **Evidence:** `src-tauri/src/commands.rs:44-49` `with_sidecar_mut`.
9. The 4-step re-anchoring algorithm MUST be a single Rust pipeline exposed via `get_file_comments`. **Evidence:** `src-tauri/src/commands.rs:244` `match_comments` + `:247` `group_into_threads`.
10. SHA-256 of `selected_text` MUST be computed in Rust via `compute_anchor_hash`. **Evidence:** `src-tauri/src/commands.rs:369`.

### Commands vs events
11. First-instance launch args MUST be retrieved via the `get_launch_args` command on mount; second-instance args MUST use the `args-received` event. **Evidence:** `src/App.tsx:98,102`; `src-tauri/src/lib.rs:100`; `src-tauri/src/commands.rs:150`.
12. The file watcher MUST live in Rust and emit `file-changed` events with kinds `content | review | deleted`. **Evidence:** `src-tauri/src/watcher.rs:58,88-92`. (Debounce window: rule 4 in [`docs/performance.md`](performance.md).)
13. The frontend MUST NOT poll the filesystem; reactive reload uses watcher events routed through `useFileWatcher` → DOM `CustomEvent("mdownreview:file-changed")`. **Evidence:** `src/hooks/useFileWatcher.ts:51-73`.
14. Ghost-entry scanning MUST use a single Rust command. **Evidence:** `src-tauri/src/commands.rs:167-169`. (Cap: rule 3 in [`docs/performance.md`](performance.md).)

### State boundaries
15. Zustand `persist` MUST serialize only UI state: `theme`, `folderPaneWidth`, `commentsPaneVisible`, `root`, `expandedFolders`, `autoReveal`, `authorName`, `recentItems`, `tabs`, `activeTabPath`. `ghostEntries`, `lastSaveByPath`, `updateStatus`, comments, and scroll values MUST NOT be persisted. **Evidence:** `src/store/index.ts:224-234` `partialize`.
16. Cross-slice state changes from a single user action MUST be grouped in a single store action. **Evidence:** `src/store/index.ts:146-158` `closeTab`.
17. `lib/` MUST NOT import `components/` or `hooks/`; `lib/vm/` is the only place `lib/` may read `@/store`. **Evidence:** grep `from "@/components"` in `src/lib/` → 0; `from "@/store"` → only `src/lib/vm/use-comment-actions.ts:2`.

### Component & viewer boundaries
18. Viewer components MUST route through `ViewerRouter` based on `FileStatus` from `useFileContent`. **Evidence:** `src/components/viewers/ViewerRouter.tsx:93-131`.
19. Components MUST subscribe to the store with narrow selectors (single-field or `useShallow`), never unfiltered `useStore()`. **Evidence:** `src/App.tsx:54-62`; `src/components/TabBar/TabBar.tsx:8-10`.
20. Comment mutation UI MUST use `useCommentActions` from `src/lib/vm/use-comment-actions.ts`; components MUST NOT call low-level `addComment`/`editComment` wrappers directly. **Evidence:** `src/components/comments/CommentThread.tsx:30,113`.
21. Comment rendering MUST read through `useComments` (`src/lib/vm/use-comments.ts`); components MUST NOT call `getFileComments` directly. **Evidence:** grep `getFileComments` → only the wrapper definition and the VM hook consumer.
22. `read_dir` MUST filter out sidecar files (`.review.yaml`, `.review.json`) before returning. **Evidence:** `src-tauri/src/commands.rs:86-88`.

### File-size budgets
23. Any file >400 lines in `src/components/` or `src-tauri/src/` is a structural smell and MUST be split. Budget for shared-chokepoint files (`src/store/index.ts`, `src/App.tsx`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`) is 500 lines. **Evidence:** current largest in budget — `MarkdownViewer.tsx` 424, `commands.rs` 393.

### Native menu
24. Native OS menu events MUST be forwarded as `menu-*` Tauri events handled in `src/App.tsx`, not invoked as commands. **Evidence:** `src-tauri/src/lib.rs:191-210`; `src/App.tsx:220-245`.

## MRSF v1.0 sidecar schema

Comments persist as **Markdown Review Sidecar Format (MRSF) v1.0** — an open standard ([specification](https://sidemark.org/specification.html)) compatible with VS Code's Sidemark extension. One sidecar per reviewed document:

- **`<filename>.review.yaml`** (primary)
- **`<filename>.review.json`** (legacy read-only fallback)

```yaml
mrsf_version: "1.0"
document: "filename.ext"                      # Relative path to reviewed file
comments:
  - id: "uuid"                                # Required: unique identifier
    author: "Display Name (id)"               # Required: "Name (identifier)" format
    timestamp: "2025-04-15T10:00:00Z"         # Required: RFC 3339
    text: "Comment text"                      # Required: comment body
    resolved: false                           # Required: resolution status
    # Anchor (optional):
    line: 42                                  # 1-based line number
    end_line: 45                              # Multi-line selection end
    start_column: 10                          # 0-based
    end_column: 30
    selected_text: "code here"                # For re-anchoring
    selected_text_hash: "sha256..."           # SHA-256 of selected_text
    # Metadata (optional):
    type: "suggestion"                        # suggestion | issue | question | accuracy | style | clarity
    severity: "low"                           # low | medium | high
    reply_to: "parent-uuid"                   # Threading: parent comment ID
    commit: "abc1234"                         # Git SHA at creation
```

### Threading
Flat `reply_to` model — replies are top-level comments with `reply_to` referencing the parent's `id`. No nested `responses[]` array.

### 4-step re-anchoring
When the document changes, comments re-anchor via this algorithm (canonical implementation: `src-tauri/src/core/matching.rs:12`):

1. **Exact match** — find `selected_text` at original line, then search the full document.
2. **Line fallback** — if the original line number is still in bounds, anchor there.
3. **Fuzzy match** — Levenshtein similarity ≥ 0.6, prefer closest to original line.
4. **Orphan** — all strategies failed; comment displays with an orphan banner.

### Surviving AI refactoring
Comments survive AI edits via layered defenses: (1) MRSF 4-step re-anchoring; (2) sidecars travel alongside source files; (3) ghost entries surface deleted-source sidecars; (4) the Rust watcher auto-reloads content and comments (debounce and save-loop windows: rules 4-6 in [`docs/performance.md`](performance.md)).

## Gaps (unenforced, backlog)

- No ESLint rule forbids direct `invoke()` imports outside `src/lib/tauri-commands.ts`. Today grep-clean but not mechanical.
- No ESLint rule forbids direct `@tauri-apps/plugin-log` imports outside `src/logger.ts`.
- No lint rule forbids `console.log/info` in production code; `useFileWatcher.ts` uses raw `console.warn`/`console.debug`.
- Dependency directionality (rule 17) not mechanically enforced; `dependency-cruiser` config would codify it.
- TS types in `tauri-commands.ts` are hand-mirrors of `src-tauri/src/core/types.rs`. A `ts-rs` or `specta` codegen step would remove drift risk.
- File-size budgets (rule 23) not enforced by CI; a `wc -l` whitelist check would make the budget real.
- No written rule forbids the UI from writing sidecars directly. True today (no UI write path), worth codifying.
- CLI launch-args event name is `args-received` without a protocol prefix — future Tauri versions may change; codifying removes doubt.
