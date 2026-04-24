# Design Patterns & Idioms — rules for mdownreview

**Status:** Canonical for React 19 + Tauri v2 idioms and hook composition. Cite violations as "violates rule N in `docs/design-patterns.md`".
**Charter:** [`docs/principles.md`](principles.md)
**Last updated:** 2026-04-23

> **Stack note:** `package.json` pins **React 19.1**. The Tauri layer is v2.

## Principles

Unique to design-patterns. Structural chokepoints (IPC, logger) are canonical in [`docs/architecture.md`](architecture.md); **Rust-First** is a charter meta-principle — see [`docs/principles.md`](principles.md).

1. **Hooks are wires, not state owners.** Hooks subscribe to external state (DOM events, Tauri events, the Zustand store) and mirror it; durable state lives in Zustand or in Rust. Keeps effects cancellable and idempotent.
2. **Deterministic keys from source positions.** Every per-block React key, `data-*` attribute, or anchor derives from `node.position.start.line` or an equivalent stable identifier — never from array index or render order. Prevents React error #185 under concurrent rendering and keeps comment anchors stable.
3. **Persist UI, not content.** Zustand `persist` middleware stores only UI/workspace state (canonical allowlist: rule 15 in [`docs/architecture.md`](architecture.md)); user-authored content lives in Rust-owned sidecars. A stale or corrupt localStorage can never damage comments.
4. **Errors captured before first render.** Global error handlers install at module scope before `ReactDOM.createRoot()` so module-load and first-render failures are logged. Installing handlers in a `useEffect` misses those.

## Rules

### Error capture & crash surfaces
1. `window.onerror` and `window.onunhandledrejection` MUST be installed at module scope in `src/main.tsx` **before** `ReactDOM.createRoot`. **Evidence:** `src/main.tsx:8-19` then `:21`.
2. Every independently-rendered region (toolbar, folder tree, viewer, comments panel) MUST be wrapped in `<ErrorBoundary>`; the boundary MUST forward to the logger. **Evidence:** `src/App.tsx:278,306,315,325,335`; `src/components/ErrorBoundary.tsx:22`.

### Tauri v2 idioms
3. Rust state shared with the Tauri `setup` hook MUST use `Arc<Mutex<Option<T>>>` managed via `app.manage()`. **Evidence:** `src-tauri/src/lib.rs:130-131`.
4. Rust MUST emit window-scoped events (`emit_to("main", …)`), not app-wide. **Evidence:** `src-tauri/src/commands.rs:44-48,290`; `src-tauri/src/watcher.rs:94`.
5. Every Tauri `listen()` subscription in a `useEffect` MUST return an unlisten cleanup. **Evidence pattern:** `src/App.tsx:107-109`; `src/hooks/useFileWatcher.ts:75-78`.
6. Every `useEffect` that subscribes to a `Promise<UnlistenFn>` MUST `.catch(() => {})` on the unlisten rejection to avoid unhandled-rejection noise on hot-reload. **Evidence:** `src/App.tsx:108,248`.

### React 19 idioms
7. In-flight async work in effects MUST use a `cancelled` flag to drop stale responses. **Evidence:** `src/hooks/useFileContent.ts:44-59`; `src/hooks/useUnresolvedCounts.ts:22-41`.
8. Debounced timers in hooks MUST be stored in a `useRef` and cleared on unmount. **Evidence:** `src/hooks/useFileWatcher.ts:16,77`.
9. Store reads inside imperative handlers MUST use `useStore.getState()`; subscriptions MUST use `useStore((s) => ...)` with `useShallow` for multi-field selectors. **Evidence:** `src/App.tsx:3,55-62,159,164`.
10. DOM-attribute external stores MUST be read with `useSyncExternalStore`, not `useEffect`-polled state. **Evidence:** `src/hooks/useTheme.ts:1-22` (`<html data-theme>` via `MutationObserver`).
11. Expensive derived values from text input MUST be guarded by `useDeferredValue` before the `useMemo` that consumes them. **Evidence:** `src/hooks/useSearch.ts:12-31`; `src/hooks/useSourceHighlighting.ts:1,28`.
12. Rehydrated `tabs` MUST be validated against the filesystem via `check_path_exists` before use. **Evidence:** `src/store/index.ts:236-264`.

### Per-block identity (markdown)
13. Per-block identity MUST be derived from `node.position.start.line` supplied by react-markdown. **Evidence:** `src/components/viewers/MarkdownViewer.tsx:106,123` (`data-source-line`, `data-line-idx`).
14. `MarkdownViewer` MUST NOT pass `className` via `components.p/li/hN` — the commentable wrappers (`makeCommentableBlock`, `CommentableLi`) own the class. **Evidence:** `MarkdownViewer.tsx:104-137`.

### Cross-hook communication
15. Cross-hook communication MUST go through `window` `CustomEvent` with the `mdownreview:*` namespace. **Evidence:** `src/hooks/useFileWatcher.ts:62-66` dispatch; `src/hooks/useFileContent.ts:26` listen.
16. File-watcher save-loop prevention MUST compare against `lastSaveByPathRef` (the ref, not the reactive value) to avoid stale closures. **Evidence:** `src/hooks/useFileWatcher.ts:18-20,53-59`.
17. Every `scanReviewFiles` trigger MUST be behind the debounced helper. **Evidence:** `src/hooks/useFileWatcher.ts:23-39,71`.

### Mock-file idioms (testing)
18. The single-file mock of `@tauri-apps/api/core` drives every Vitest test; its `InvokeResult` union MUST be a subset of types imported from `tauri-commands.ts`. **Evidence:** `src/__mocks__/@tauri-apps/api/core.ts:2-27`.
19. `src/__mocks__/logger.ts` MUST expose `vi.fn()` for every real logger export so untyped imports stay mockable. **Evidence:** `src/__mocks__/logger.ts:3-7`.

### Handler lifecycle
20. Native menu events and global key handlers MUST be registered from the same effect lifecycle as the handlers they invoke, with dependencies listed. **Evidence:** `src/App.tsx:218-250,142-186`.

### Console hygiene (production code)
21. Legitimate non-error warnings MUST use `console.warn` (or migrate to `logger.warn`) and MUST NEVER use `console.error` — the Vitest `test-setup.ts` fails tests on any `console.error`. **Evidence:** `src/hooks/useFileWatcher.ts:35,45,94`; `src/test-setup.ts:13-14`.

### Cross-doc contracts (references)
- Module-scope `MD_COMPONENTS` / `components` table: rules 9-10 in [`docs/performance.md`](performance.md).
- `convertFileSrc` for local images: rule 14 in [`docs/security.md`](security.md).
- Shiki singleton: rule 7 in [`docs/performance.md`](performance.md).
- Zustand `persist` allowlist: rule 15 in [`docs/architecture.md`](architecture.md).

## Gaps (unenforced, backlog)

- **`useOptimistic` opportunity.** `CommentInput` currently waits on an IPC round-trip before updating the UI. React 19's `useOptimistic` would show a pending comment immediately.
- **No lint rule blocks `forwardRef` reintroduction.** Codebase has zero usages (correct for React 19), but nothing enforces it.
- **Rust-First violation: frontmatter parsing.** `MarkdownViewer.tsx:44-62` reimplements YAML-ish parsing in TS on every markdown open. Move to a `#[tauri::command] fn parse_frontmatter` via `serde_yaml`.
- **Rust-First violation: search.** `useSearch.ts:15-31` scans the entire file in JS per query. Move to a Rust `search_in_document` streaming results.
- **Rust-First violation: per-line `commentCountByLine`** in `MarkdownViewer.tsx:323-334` recomputes every render. Extend `get_unresolved_counts` to return per-line counts, memoize by sidecar-mtime.
- **Dead abstraction: `readBinaryFile`** (`src/lib/tauri-commands.ts:47-48`) — exported but only referenced by mocks; delete if no real caller exists.
- **`updater.createUpdaterArtifacts: "v1Compatible"`** (`src-tauri/tauri.conf.json:29`) is v1-compat; once all released clients are v2, drop to default to reduce artifact size.
- **No per-window capability ACL.** Commands are registered via `tauri::generate_handler!` (`src-tauri/src/lib.rs:222-240`), bypassing v2's capability system. Add a `default.json` capability enumerating commands per window.
- **`ErrorBoundary` as only class component.** Required by React 19, but CI should grep-check that `extends Component` appears exactly once.
