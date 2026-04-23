# mdownreview — Client Architecture & Design Patterns

This document is the canonical reference for **how mdownreview is put
together** and **what patterns every change must follow**. It expands the
high‑level summary in `AGENTS.md` and is bound by the rules in
`docs/principles.md`.

If an architectural decision in code disagrees with this document, treat it as
a bug — either the code is wrong, or this document needs a PR to update it.

---

## Runtime layers

mdownreview has **two layers bridged by Tauri v2 IPC**.

```
┌────────────────────────────────────────────────────────────────────────┐
│  React / TypeScript layer (src/)                                       │
│  ├── components/   ← rendering, interaction                            │
│  ├── hooks/        ← side‑effect orchestration                         │
│  ├── store/        ← Zustand slices (UI state only persisted)          │
│  ├── lib/          ← pure logic + tauri-commands.ts (the IPC wrapper)  │
│  └── logger.ts     ← single web‑side logging entry point               │
└────────────────────────────────────────────────────────────────────────┘
                                  │ Tauri v2 IPC
                                  │ (typed commands + events)
┌────────────────────────────────────────────────────────────────────────┐
│  Rust layer (src-tauri/src/)                                           │
│  ├── commands.rs  ← every Tauri command (file I/O, comments, scans)    │
│  ├── watcher.rs   ← file system watching (notify-debouncer-mini)       │
│  ├── core/        ← pure Rust logic (matching, anchors, threading)     │
│  └── lib.rs       ← setup, plugins, command registration, panic hook   │
└────────────────────────────────────────────────────────────────────────┘
```

**Layer responsibilities (non‑negotiable):**

| Layer | Owns | Does not own |
|---|---|---|
| Rust | File I/O, path normalization, MRSF serde, comment matching/threading, watching, hashing, scanning | UI rendering, view state, interaction |
| React/TS | UI rendering, UI‑state, interaction handlers, viewer composition | Business logic, file I/O, heavy computation |
| Tauri IPC | Strongly‑typed transport between the two | Anything stateful — neither layer should hide state inside the bridge |

When in doubt about where logic belongs, see **Rust‑First** in
`docs/principles.md`.

---

## The IPC boundary

There is **exactly one** IPC boundary file: `src/lib/tauri-commands.ts`.

- Every Rust command in `src-tauri/src/commands.rs` has a typed wrapper here.
- Components and hooks **never** import `@tauri-apps/api/core` directly.
- Errors come back as thrown exceptions from the wrapper; call sites handle
  them. Rust returns `Result<T, String>` and wrappers translate `Err` to
  `throw`.
- Mocks live in `src/__mocks__/@tauri-apps/api/core.ts`. Mock return shapes
  reuse the same TypeScript interfaces as the wrappers, so the compiler
  guarantees the mock matches the real signature.

**Adding a new IPC command** means a coordinated change in three places, in
this order:

1. Add the `#[tauri::command]` to `src-tauri/src/commands.rs` with a
   `Result<T, String>` return type and matching test in
   `src-tauri/tests/commands_integration.rs`.
2. Register it in the `invoke_handler` list in `src-tauri/src/lib.rs`.
3. Add the typed wrapper in `src/lib/tauri-commands.ts` and update any
   relevant entry in `src/__mocks__/@tauri-apps/api/core.ts`.

---

## State

State lives in **one** Zustand store (`src/store/`) split into six slices:

| Slice | Responsibility |
|---|---|
| `workspaceSlice` | Root folder, expanded tree state, current selection |
| `tabsSlice` | Open tabs, active tab, per‑tab scroll positions |
| `commentsSlice` | In‑memory comment cache keyed by file path |
| `uiSlice` | Theme, pane widths, panel toggles |
| `updateSlice` | Auto‑update lifecycle state |
| `watcherSlice` | Ghost entries, auto‑reveal toggle, last save timestamp |

**Rules:**

1. **Persist only UI state.** Zustand `persist` middleware whitelists theme,
   pane widths, scroll positions, workspace root. Comment content is never
   persisted via Zustand — it lives in MRSF sidecar files on disk.
2. **Read with fine‑grained selectors.** `const x = useStore(s => s.x)` or
   `useShallow`. Bare destructuring of `useStore()` re‑renders on every
   change and is treated as a perf bug.
3. **Mutate the smallest necessary key.** A reducer that touches one file's
   comments must not iterate `Object.fromEntries` over every file's comments.
4. **No parallel state systems.** If you need new app state, add a slice or a
   key. Do not introduce a second store, a context, or a module‑level
   mutable global.

---

## Components & viewers

```
src/components/
  FolderTree/        ← left sidebar; supports auto-reveal, ghost entries
  TabBar/            ← top tabs with badges
  viewers/
    ViewerRouter.tsx       ← maps file → viewer (incl. ghost detection)
    MarkdownViewer.tsx     ← react-markdown + @shikijs/rehype + remark-gfm
    SourceView.tsx         ← Shiki direct API + comments + folding + search
    DeletedFileViewer.tsx  ← orphaned comments for deleted files
    BinaryPlaceholder.tsx
  comments/
    CommentInput.tsx
    CommentThread.tsx       ← threaded view, reply, orphan banner
    CommentsPanel.tsx
    LineCommentMargin.tsx
    SelectionToolbar.tsx
  AboutDialog.tsx
  ErrorBoundary.tsx
```

**Patterns viewers follow:**

- **Module‑scope expensive resources.** Shiki highlighters and
  `MD_COMPONENTS` are defined once at module scope. Never inside render.
- **Per‑block IDs from AST line numbers.** `MarkdownViewer` derives stable
  IDs from `node.position.start.line` to keep React happy in concurrent mode
  (avoids React error #185).
- **Single Shiki source.** The same Shiki configuration drives both
  `MarkdownViewer` fenced blocks and `SourceView`. Two independent
  highlighters would produce inconsistent themes.
- **Routing, not branching.** `ViewerRouter` decides which viewer to use,
  including ghost detection. Individual viewers do not detect file type.

---

## Hooks (side‑effect orchestration)

```
src/hooks/
  useFileContent.ts   ← loads file content; reloads on watcher 'content' event
  useFileWatcher.ts   ← syncs open tabs to Rust watcher; manages ghost entries
  useSearch.ts        ← in-document search
```

**Rules:**

1. Every `listen()` returns an `unlisten` that must be called from the
   `useEffect` cleanup. Missing cleanup is a confirmed bug.
2. Hooks orchestrate; they do not contain pure logic. Move pure functions
   into `src/lib/`.
3. Hooks do not call each other in cycles. If two hooks need shared state, it
   moves into a store slice.
4. Effects guard against unmount and out‑of‑order async resolution.

---

## Pure logic libraries

```
src/lib/
  tauri-commands.ts     ← THE IPC boundary
  comment-matching.ts   ← MRSF 4-step re-anchoring algorithm
  comment-anchors.ts    ← SHA-256 hash, MRSF anchor creators
  comment-threads.ts    ← reply_to flattening / grouping
```

These modules are pure (no React, no Tauri). Each has a unit test next to it
in `src/lib/__tests__/`. Pure logic that is also performance‑critical (e.g.
the Levenshtein loop in `comment-matching.ts`) is a candidate for migration
to Rust per the **Rust‑First** rule.

---

## File watcher

`src-tauri/src/watcher.rs` uses `notify-debouncer-mini` (300 ms debounce).

**What it watches:**
- The currently open files
- Their MRSF sidecars (`<file>.review.yaml` and the legacy `.review.json`)

**What it emits:** Tauri `file-changed` events with shape
`{ path: string, kind: "content" | "review" | "deleted" }`.

**How it reaches React:** `useFileWatcher` calls `listen("file-changed", …)`,
maintains the watch set against open tabs, and re‑emits each event as a DOM
`CustomEvent`:

```ts
window.dispatchEvent(new CustomEvent("mdownreview:file-changed", {
  detail: { path, kind }
}));
```

Viewers and `useFileContent` listen for this `CustomEvent`. The DOM event
indirection lets browser‑integration tests simulate watcher events without a
real Tauri runtime.

**Save‑loop prevention:** a 1.5 s debounce after the app's own save
suppresses self‑triggered watcher events, preventing
`save → watcher → reload → save` cycles.

---

## CLI args & single‑instance

- CLI args are parsed in the `setup` hook and stored in
  `Arc<Mutex<Option<LaunchArgs>>>`.
- The first instance reads them via `get_launch_args` *as a command*, polled
  on React mount. Polling avoids the race where a `args-received` event fires
  before React's first `useEffect` registers a listener.
- Subsequent instances (single‑instance plugin) deliver args via the
  `args-received` event — safe because the window is already alive.

---

## Comment data model (MRSF v1.0)

mdownreview implements [MRSF v1.0](https://sidemark.org/specification.html),
the same open standard used by VS Code's Sidemark extension.

- Sidecar file per document: `<filename>.review.yaml` (primary) or legacy
  `.review.json` (read‑only fallback).
- Threading is **flat** via `reply_to` — replies are top‑level comments that
  reference the parent's `id`. There is no nested `responses[]` array.
- Anchors carry `selected_text`, `selected_text_hash` (SHA‑256), `line`,
  `end_line`, `start_column`, `end_column`. Re‑anchoring runs the 4‑step
  algorithm: exact text → line fallback → fuzzy match (Levenshtein ≥ 0.6) →
  orphan.
- Sidecars are filtered out of `read_dir` results so the tree shows only
  source files, with comment counts displayed as numeric badges.
- Ghost entries (deleted source, surviving sidecar) are surfaced via
  `scan_review_files`, capped at 10 000 results per scan.

---

## Logging

- Web: every `console.*` and `tracing` call routes through `src/logger.ts`,
  which prefixes `[web]` and forwards to `tauri-plugin-log`. Components must
  not import `@tauri-apps/plugin-log` directly.
- Rust: `tracing` macros routed through `tauri-plugin-log`.
- Release builds suppress web `console.log/debug`; only `warn`/`error` are
  forwarded.
- Log file: `{appDataDir}/logs/mdownreview.log`, rotated at 5 MB × 3 files.
- Log path is exposed in the About dialog with a "Copy path" button.

---

## Capability & security model

- `tauri-plugin-fs` is *intentionally bypassed*. All file system access goes
  through explicit Rust commands (`read_text_file`, `read_dir`,
  `save_review_comments`, `load_review_comments`, `scan_review_files`,
  `check_path_exists`).
- `read_text_file` rejects files larger than 10 MB and detects binary content
  via a first‑512‑byte null‑byte scan.
- `read_dir` filters out `.review.yaml` / `.review.json` so they never reach
  the UI by accident.
- `react-markdown` is configured **without** `rehype-raw`. Untrusted HTML in
  markdown cannot escape into the DOM.
- Shiki is fed only the language declared in the fenced block; unknown
  languages fall back to plain text.
- File associations register per‑user on Windows (no UAC elevation).

---

## Design patterns checklist (for new code)

When adding code, ask:

- [ ] Could this logic live in Rust? (See Rust‑First.)
- [ ] If touching IPC, did I update `commands.rs`, `lib.rs`, and
      `tauri-commands.ts` together?
- [ ] Did I introduce a new Tauri event? Does every `listen()` have a
      matching `unlisten()` in the same cleanup?
- [ ] Did I add new state? Is it in a slice with a fine‑grained selector?
      Is persistence intentional?
- [ ] Did I reuse the canonical singletons (Shiki highlighter, logger,
      tauri‑commands wrappers) instead of creating a parallel one?
- [ ] Did I keep `App.tsx` slim? Heavy logic belongs in a hook or a lib.
- [ ] Did I cover the change with tests at the right layer? (See
      `docs/test-strategy.md`.)

---

## Companion documents

- `docs/principles.md` — the seven product pillars and their rules.
- `docs/test-strategy.md` — the test strategy and how to choose a layer.
- `docs/specs/` — per‑feature behavioural specs.
