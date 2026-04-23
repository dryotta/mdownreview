# MVVM Refactor + React Optimization — Design Spec

**Issue:** [#17 — Rich CLI support without GUI](https://github.com/dryotta/mdownreview/issues/17)
**Scope:** Phase 2 of 3 — Move domain logic to Rust, restructure React as pure View layer
**Phases:** Phase 1 (CLI + Core Extraction) → **Phase 2 (MVVM Refactor)** → Phase 3 (Performance Benchmarks)
**Date:** 2026-04-22
**Depends on:** Phase 1 (CLI Mode + Core Extraction) — `core/` module must exist before this phase begins

## Problem

After Phase 1 extracts sidecar I/O into `core/`, significant domain logic still lives in TypeScript:

- **Comment matching** (`comment-matching.ts`, 138 lines) — 4-step re-anchoring with O(N×M) Levenshtein fuzzy matching, runs in React render path via `useMemo`
- **Anchor creation** (`comment-anchors.ts`, 47 lines) — SHA-256 hashing via WebCrypto, targeting field validation
- **Thread building** (`comment-threads.ts`, 41 lines) — groups flat `reply_to` comments into threaded structures
- **Comment mutations** (store `commentsSlice`, ~120 lines) — addComment, addReply, editComment, deleteComment (with MRSF §9.1 reply reparenting), resolveComment, unresolveComment
- **Comment utilities** (`comment-utils.ts`, 53 lines) — UUID generation, text truncation, targeting field validation

This logic runs client-side only, meaning the CLI binary can't build threads, match comments to file lines, or perform mutations with proper reply reparenting. The store is a monolithic 459-line Zustand blob mixing domain state with UI concerns.

## Goal

1. Move all comment domain logic to Rust `core/` — matching, anchoring, threading, mutations, utilities
2. Restructure the React layer into a pure View with a thin ViewModel adapter
3. Domain state (comments, workspace, file tree) driven by Rust via Tauri events
4. UI-only state (theme, pane widths, scroll positions) stays client-side in a minimal Zustand store
5. Consolidate Shiki highlighter singletons and prune unused npm dependencies
6. Zero user-facing behavior changes — all existing tests must pass

## Non-Goals (this phase)

- Performance benchmarks (Phase 3)
- Changing the frontend framework (React stays)
- Adding new features to the CLI beyond what Phase 1 provides
- Changing the MRSF sidecar format

---

## Architecture

### MVVM Boundary

```
┌─────────────────────────────────────┐
│  View (React)                       │
│  Components render from ViewModel   │
│  hooks. No domain logic, no direct  │
│  IPC calls from components.         │
│                                     │
│  UI-only state: Zustand (theme,     │
│  pane widths, scroll positions)     │
└──────────┬──────────────────────────┘
           │ React hooks
┌──────────▼──────────────────────────┐
│  ViewModel Adapter (TypeScript)     │
│  src/lib/vm/                        │
│  Subscribes to Tauri events, calls  │
│  Tauri commands, exposes React      │
│  hooks with domain state.           │
└──────────┬──────────────────────────┘
           │ Tauri IPC (commands + events)
┌──────────▼──────────────────────────┐
│  Model (Rust core/)                 │
│  Domain logic: matching, anchoring, │
│  threading, mutations, scanning.    │
│  Shared by GUI and CLI binary.      │
└─────────────────────────────────────┘
```

### State Ownership

| State | Owner | Persistence | Why |
|---|---|---|---|
| Comments by file | Rust (sidecar files) | MRSF `.review.yaml` | Domain — CLI needs this too |
| Matched/anchored comments | Rust `core::matching` | Computed on demand | Domain — expensive computation belongs in Rust |
| Thread structure | Rust `core::threads` | Computed on demand | Domain — CLI `read` could use threaded output |
| Workspace root | Rust (Tauri state) | Persisted in UI Zustand | Domain — shared between CLI and GUI |
| File tree / dir entries | Rust (Tauri commands) | Not persisted | Domain — already Rust |
| Ghost entries | Rust (scanner) | Not persisted | Domain — already Rust |
| Author name | UI Zustand | localStorage | User preference |
| Theme, pane widths | UI Zustand | localStorage | Pure presentation |
| Scroll positions | UI Zustand | localStorage | Pure presentation |
| Tab list, active tab | UI Zustand | localStorage | Pure presentation |
| Expanded folders | UI Zustand | localStorage | Pure presentation |
| Auto-reveal toggle | UI Zustand | localStorage | Pure presentation |
| Update status | UI Zustand | Not persisted | GUI-only feature |
| Recent items | UI Zustand | localStorage | User preference |

### New Rust `core/` Modules

Building on Phase 1's `core/` structure, add:

```
src-tauri/src/
  core/
    mod.rs              ← Re-exports (updated)
    types.rs            ← Extended with MatchedComment, CommentThread
    sidecar.rs          ← (Phase 1, unchanged)
    scanner.rs          ← (Phase 1, unchanged)
    comments.rs         ← Extended: mutations with reply reparenting
    matching.rs         ← NEW: 4-step re-anchoring + Levenshtein
    anchors.rs          ← NEW: SHA-256 hashing, anchor creation, validation
    threads.rs          ← NEW: thread grouping from flat reply_to
```

### New TypeScript ViewModel Layer

```
src/lib/vm/
  index.ts              ← Re-exports all hooks
  use-comments.ts       ← useComments(filePath) — matched comments for a file
  use-workspace.ts      ← useWorkspace() — root, dir entries, ghost entries
  use-comment-actions.ts ← useCommentActions() — add, edit, delete, resolve, reply
```

---

## Rust Core API Additions

### `core::types` (extended)

```rust
/// Comment with match result (computed by core::matching)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedComment {
    #[serde(flatten)]
    pub comment: MrsfComment,
    pub matched_line_number: u32,
    pub is_orphaned: bool,
    /// Text found at matched location (for fuzzy matches)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchored_text: Option<String>,
}

/// A thread: root comment with its replies sorted by timestamp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentThread {
    pub root: MatchedComment,
    pub replies: Vec<MatchedComment>,
}

/// Anchor specification for creating new comments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentAnchor {
    pub line: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_hash: Option<String>,
}
```

### `core::matching`

```rust
const FUZZY_THRESHOLD: f64 = 0.6;

/// Match comments to file lines using the 4-step re-anchoring algorithm.
/// Steps: exact text match → line fallback → fuzzy (Levenshtein ≥ 0.6) → orphan.
pub fn match_comments(
    comments: &[MrsfComment],
    file_lines: &[&str],
) -> Vec<MatchedComment>;

/// Levenshtein distance between two strings (public for benchmarking).
pub fn levenshtein(a: &str, b: &str) -> usize;

/// Fuzzy similarity score: 1.0 = identical, 0.0 = completely different.
/// Substring containment returns 0.9. Otherwise 1 - (levenshtein / max_len).
pub fn fuzzy_score(a: &str, b: &str) -> f64;
```

**Implementation notes:**
- Case-insensitive comparison (lowercase both strings)
- When multiple lines score equally, prefer the one closest to the original line number
- Return `is_orphaned: true` when all 4 steps fail
- Levenshtein uses a single-row DP (O(min(m,n)) memory) instead of the O(m×n) matrix used in the TypeScript version

### `core::anchors`

```rust
/// Compute SHA-256 hash of selected text, returned as lowercase hex string.
pub fn compute_selected_text_hash(text: &str) -> String;

/// Create a line-only anchor.
pub fn create_line_anchor(line: u32) -> CommentAnchor;

/// Create a selection anchor with validated targeting fields.
/// Truncates selected_text to 4096 chars per MRSF §6.2.
/// Clamps end_line ≥ line and end_column ≥ start_column (same line).
pub fn create_selection_anchor(
    start_line: u32,
    end_line: u32,
    start_column: u32,
    end_column: u32,
    selected_text: &str,
) -> CommentAnchor;

/// MRSF §6.2: max selected_text length
pub const SELECTED_TEXT_MAX_LENGTH: usize = 4096;

/// MRSF §6.1: recommended max text length
pub const TEXT_MAX_LENGTH: usize = 16384;
```

### `core::threads`

```rust
/// Group flat comments into threaded structures.
/// Root comments: no reply_to field.
/// Replies to non-existent parents are promoted to root threads.
/// Replies within each thread sorted by timestamp ascending.
pub fn group_into_threads(comments: &[MatchedComment]) -> Vec<CommentThread>;
```

### `core::comments` (extended from Phase 1)

Add mutation operations:

```rust
/// Generate a new UUIDv4 comment ID.
pub fn generate_comment_id() -> String;

/// Create a new comment with generated ID and current timestamp.
pub fn create_comment(
    author: &str,
    text: &str,
    anchor: Option<CommentAnchor>,
    comment_type: Option<&str>,
    severity: Option<&str>,
) -> MrsfComment;

/// Create a reply to an existing comment.
pub fn create_reply(
    author: &str,
    text: &str,
    parent: &MrsfComment,
) -> MrsfComment;

/// Delete a comment from a list, promoting its direct replies per MRSF §9.1.
/// Returns the modified comment list.
pub fn delete_comment(comments: &[MrsfComment], id: &str) -> Vec<MrsfComment>;
```

**Reply reparenting on delete (MRSF §9.1):**
When deleting a parent comment, direct replies (`reply_to == parent.id`) are:
1. Reparented to grandparent (`reply_to = parent.reply_to`, or removed if parent was root)
2. Inherit targeting fields (line, end_line, start_column, end_column, selected_text + hash) from parent if the reply doesn't have its own

---

## New Tauri Commands

These commands expose the new `core/` modules to the React frontend:

### Combined Hot-Path Command

The GUI's most frequent operation is "load comments for a file and display them as threads." Instead of requiring 3 IPC round-trips (load → match → thread), a single combined command handles the hot path:

```rust
/// Combined hot-path: load sidecar → match to file lines → build threads.
/// Single IPC call for the GUI's most common operation.
#[tauri::command]
pub fn get_file_comments(
    file_path: String,
) -> Result<Vec<CommentThread>, String>;
```

This reads the file content, loads the sidecar, runs matching, and returns threaded results in one call.

The individual commands below are retained for granular use (CLI, testing, future extensions):

```rust
/// Match comments to file content and return with anchoring results.
#[tauri::command]
pub fn match_comments_to_file(
    file_path: String,
    comments: Vec<MrsfComment>,
) -> Result<Vec<MatchedComment>, String>;

/// Group matched comments into threads.
#[tauri::command]
pub fn build_comment_threads(
    comments: Vec<MatchedComment>,
) -> Result<Vec<CommentThread>, String>;

/// Create a new comment, save to sidecar, return updated matched comments.
#[tauri::command]
pub fn add_comment(
    file_path: String,
    author: String,
    text: String,
    anchor: Option<CommentAnchor>,
    comment_type: Option<String>,
    severity: Option<String>,
) -> Result<(), String>;

/// Create a reply to an existing comment, save to sidecar.
#[tauri::command]
pub fn add_reply(
    file_path: String,
    parent_id: String,
    author: String,
    text: String,
) -> Result<(), String>;

/// Edit a comment's text, save to sidecar.
#[tauri::command]
pub fn edit_comment(
    file_path: String,
    comment_id: String,
    text: String,
) -> Result<(), String>;

/// Delete a comment (with reply reparenting), save to sidecar.
#[tauri::command]
pub fn delete_comment(
    file_path: String,
    comment_id: String,
) -> Result<(), String>;

/// Resolve/unresolve a comment, save to sidecar.
#[tauri::command]
pub fn set_comment_resolved(
    file_path: String,
    comment_id: String,
    resolved: bool,
) -> Result<(), String>;

/// Compute SHA-256 hash for selected text anchor.
#[tauri::command]
pub fn compute_anchor_hash(text: String) -> String;
```

**Event emission pattern:** After each mutation command (add, edit, delete, resolve), Rust:
1. Performs the operation on the sidecar file
2. Emits a `comments-changed` Tauri event with `{ file_path: String }` so the ViewModel adapter knows to re-fetch

### Event Deduplication

The file watcher (`watcher.rs`) also detects sidecar writes and emits `file-changed` events with `kind: "review"`. Without deduplication, a single mutation would trigger two refreshes:
1. `comments-changed` (from the mutation command)
2. `file-changed` (from the watcher detecting the sidecar write)

**Solution:** The mutation commands record a "self-write timestamp" in Rust state (similar to the existing `lastSaveByPath` pattern). The watcher checks this timestamp and suppresses `file-changed` events for sidecar files written within the last 1.5 seconds by the app itself. External sidecar changes (e.g., AI agent writing a review file) still trigger `file-changed` normally.

The ViewModel `useComments` hook only listens to `comments-changed` for mutation-triggered refreshes. It listens to `file-changed` with `kind: "review"` only for external sidecar changes (which won't have a corresponding `comments-changed` event).

### Author Source

The `author` parameter in mutation commands comes from the UI preferences store (`authorName` in `PreferencesSlice`). The ViewModel `useCommentActions` hook reads this from the Zustand UI store and passes it to each Rust command. If empty, it defaults to `"Anonymous"`.

---

## TypeScript ViewModel Adapter

### `src/lib/vm/use-comments.ts`

```typescript
import { listen } from "@tauri-apps/api/event";

interface UseCommentsResult {
  comments: MatchedComment[];
  threads: CommentThread[];
  loading: boolean;
}

/**
 * Hook that loads matched and threaded comments for a file path.
 * Uses the combined `get_file_comments` command (single IPC call).
 * Subscribes to 'comments-changed' Tauri event for mutation-triggered updates.
 * Subscribes to 'file-changed' (kind: "review") for external sidecar changes.
 */
export function useComments(filePath: string | null): UseCommentsResult;
```

### `src/lib/vm/use-comment-actions.ts`

```typescript
interface UseCommentActionsResult {
  addComment: (filePath: string, text: string, anchor?: CommentAnchor, type?: string, severity?: string) => Promise<void>;
  addReply: (filePath: string, parentId: string, text: string) => Promise<void>;
  editComment: (filePath: string, commentId: string, text: string) => Promise<void>;
  deleteComment: (filePath: string, commentId: string) => Promise<void>;
  resolveComment: (filePath: string, commentId: string) => Promise<void>;
  unresolveComment: (filePath: string, commentId: string) => Promise<void>;
}

/**
 * Hook that exposes comment mutation actions.
 * Each action calls the corresponding Rust command.
 * No local state — mutations go through Rust, React re-renders from events.
 */
export function useCommentActions(): UseCommentActionsResult;
```

### `src/lib/vm/use-workspace.ts`

```typescript
interface UseWorkspaceResult {
  root: string | null;
  ghostEntries: GhostEntry[];
}

/**
 * Hook that provides workspace domain state.
 * Ghost entries come from Rust scan_review_files.
 */
export function useWorkspace(): UseWorkspaceResult;
```

---

## Zustand Store Refactor

### Before (monolithic, 7 slices)

```
WorkspaceSlice → domain + UI
TabsSlice → UI
CommentsSlice → domain (heavy logic)
UISlice → UI
WatcherSlice → mixed
UpdateSlice → UI
RecentSlice → UI
```

### After (UI-only, 5 slices)

```
TabsSlice → UI (unchanged)
UISlice → UI (unchanged)
UpdateSlice → UI (unchanged)
RecentSlice → UI (unchanged)
PreferencesSlice → UI (author name, workspace root, expanded folders, auto-reveal)
```

**Removed:**
- `CommentsSlice` — replaced by ViewModel hooks backed by Rust
- `WatcherSlice.ghostEntries` — moved to ViewModel `useWorkspace()`
- `WatcherSlice.lastSaveByPath` — moved to Rust watcher (debounce guard)
- `WorkspaceSlice` domain parts — root comes from Rust, expanded folders stay UI

**Store drops from ~459 lines to ~200 lines.**

---

## Shiki Consolidation

Currently two highlighter singletons:
- `SourceView.tsx:28-38` — module-level `getHighlighter()` call
- `MarkdownViewer.tsx:68-78` — separate module-level `getHighlighter()` call

### Solution

Create `src/lib/shiki.ts`:
```typescript
import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

export function getSharedHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [], // lazy-load languages on demand
    });
  }
  return highlighterPromise;
}
```

Both `SourceView` and `MarkdownViewer` import from `src/lib/shiki.ts` instead of creating their own instances. This halves memory usage for the highlighter grammar cache.

---

## Dependency Pruning

| Package | Action | Reason |
|---|---|---|
| `@types/js-yaml` | Remove | Dev dependency for `js-yaml` — remove together |
| `js-yaml` | Remove | Only used in test fixtures; replace with inline YAML strings or use `serde_yaml` in Rust tests |
| `eslint-config-prettier` | Keep | Prevents ESLint/Prettier conflicts |

**Note:** The dependency audit should be re-verified during implementation. The TypeScript ViewModel adapter still needs all `@tauri-apps/*` packages, `react-markdown`, `remark-gfm`, `@shikijs/rehype`, `rehype-slug`, `shiki`, `zustand`, `mermaid`, `papaparse`.

---

## Migration Strategy

### Incremental, slice by slice

This refactor can be done incrementally — each step leaves the app fully functional:

1. **Add Rust `core::matching`** — implement `match_comments` + `levenshtein` in Rust, add `match_comments_to_file` Tauri command. TypeScript `comment-matching.ts` still exists as fallback.
2. **Add Rust `core::anchors`** — implement hashing + anchor creation. Add `compute_anchor_hash` command.
3. **Add Rust `core::threads`** — implement thread grouping. Add `build_comment_threads` command.
4. **Create ViewModel hooks** — `useComments`, `useCommentActions` call Rust commands. Components migrate to hooks one at a time.
5. **Add Rust mutation commands** — `add_comment`, `edit_comment`, `delete_comment`, etc. with `comments-changed` event emission.
6. **Migrate components** — switch from store `commentsSlice` to ViewModel hooks. Each component is a separate commit.
7. **Remove TypeScript domain code** — delete `comment-matching.ts`, `comment-anchors.ts`, `comment-threads.ts`, `comment-utils.ts` and store `commentsSlice`. Also remove orphaned hooks: `useAutoSaveComments` (replaced by Rust-side save in mutation commands), comment load/watch orchestration in SourceView and MarkdownViewer (replaced by `useComments` hook).
8. **Consolidate Shiki** — create shared module, update SourceView and MarkdownViewer.
9. **Prune deps** — remove `js-yaml`, `@types/js-yaml`.

### Rollback safety

At every step, both the old TypeScript path and the new Rust path coexist. If a Rust command fails, the ViewModel hook can fall back to the TypeScript implementation during development. The fallback is removed in step 7.

---

## Testing

### New Rust Unit Tests

In each `core/` module as `#[cfg(test)] mod tests`:

- **`matching`**: exact match at original line, exact match elsewhere, line fallback, fuzzy match above threshold, fuzzy match below threshold (orphan), empty file, empty comments, case-insensitive fuzzy, prefer closest line on equal score
- **`anchors`**: SHA-256 hash matches known values, selected_text truncation at 4096, targeting field clamping (end_line < line, end_column < start_column on same line)
- **`threads`**: basic threading, orphan reply promotion, timestamp sorting, no replies, single comment
- **`comments` mutations**: delete with reply reparenting (targeting field inheritance, grandparent reparenting), delete root promotes children, delete leaf (no reparenting needed)

### Updated TypeScript Tests

- **ViewModel hook tests** (Vitest + React Testing Library): mock Tauri `invoke` to return Rust-like responses, verify hooks expose correct state and actions
- **Component tests**: update to use ViewModel hooks instead of store destructuring
- **Existing store tests**: update to cover only UI slices

### Existing Tests

All must continue to pass:
- `cargo test` — existing + new core module tests
- `npm test` — Vitest (updated component/hook tests)
- `npm run test:e2e` — Playwright browser integration (IPC mock updated for new commands)
- `npm run lint` — ESLint

### Browser E2E Mock Updates

The IPC mock in `e2e/browser/fixtures/index.ts` must handle the new commands:

```typescript
if (cmd === "match_comments_to_file") return [/* MatchedComment[] */];
if (cmd === "build_comment_threads") return [/* CommentThread[] */];
if (cmd === "add_comment") return null;
if (cmd === "add_reply") return null;
if (cmd === "edit_comment") return null;
if (cmd === "delete_comment") return null;
if (cmd === "set_comment_resolved") return null;
if (cmd === "compute_anchor_hash") return "mock-hash";
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| IPC latency for comment matching on large files | Benchmark in Phase 3; Levenshtein is faster in Rust than JS; single-row DP uses less memory |
| Breaking component tests during migration | Incremental migration: one component at a time, old path coexists with new |
| Event-driven state causing stale renders | ViewModel hooks use `useState` + `listen()` with proper cleanup; `useEffect` deps ensure re-fetch |
| Sidecar file contention (GUI + CLI writing simultaneously) | Atomic write (temp + rename) from Phase 1 handles this; file watcher detects external changes |
