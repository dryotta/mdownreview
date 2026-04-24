# Performance — rules for mdownreview

**Status:** Canonical for numeric budgets and hot-path rules. Cite violations as "violates rule N in `docs/performance.md`" or "exceeds budget X".
**Charter:** [`docs/principles.md`](principles.md)
**Last updated:** 2026-04-23

## Principles

Unique to performance. **Rust-First** is a charter meta-principle — see [`docs/principles.md`](principles.md).

1. **Hard cap every unbounded input.** No loop or scan over user-supplied data is permitted without a numeric ceiling or early-exit guard. Every new scan states its cap in code, not in commentary.
2. **One IPC round-trip per user action.** The frontend never chains two `invoke` calls where a single Rust command could return the aggregate. `get_file_comments` and `get_unresolved_counts` exist specifically to avoid N+1 IPC.
3. **Debounce noisy producers, never consumers.** Watcher events, scans, and save loops collapsed at the source with a documented window. Consumers (viewers, panels) render synchronously from post-debounce state.
4. **Shared singletons for heavyweight init.** Expensive initializers (Shiki, Tauri listeners) exist once per process. Two instances cost real memory and startup time.
5. **Module-scope component tables.** `react-markdown`'s `components` prop is never rebuilt inside render — prevents React error #185 in concurrent mode and avoids full re-parse.

## Budgets

| Metric | Budget | Measured? | Evidence / bench needed |
|---|---|---|---|
| Cold startup to first paint | < 800 ms (release) | No | Add Playwright native bench on `window-ready` |
| First file open (≤ 100 KB, cached Shiki) | < 150 ms p95 | No | — |
| First file open (≤ 1 MB md) | < 400 ms p95 | No | — |
| `get_file_comments` — 200 comments × 5000 lines | < 20 ms | Yes | `hot_path_bench.rs:64` |
| `match_comments` — 50 comments × 1000 lines | < 5 ms | Yes | `matching_bench.rs:76` |
| `scan_review_files` — 10K sidecars | < 500 ms | Yes | `scanner_bench.rs` |
| Watcher event → `file-changed` emit | ≤ 300 ms + 200 ms | Yes (code) | `watcher.rs:58, 70` |
| Save-loop suppression window | 1500 ms | Yes (code) | `useFileWatcher.ts:7` |
| Ghost re-scan debounce | 500 ms | Yes (code) | `useFileWatcher.ts:8` |
| Folder tree `read_dir` — 1000 entries | < 100 ms | No | Add Criterion bench |
| Open-tab steady-state memory | < 15 MB per tab | No | Add native e2e memory assertion |
| 100-file folder memory footprint | < 250 MB RSS | No | Add native e2e memory assertion |
| JS bundle (gzip) | < 2 MB | No | Add CI `vite build` size check |
| Release binary (Windows) | < 12 MB | No | No `[profile.release]` in `Cargo.toml` |

## Rules

### Hard caps
1. Every Rust command that reads a file MUST reject inputs above 10 MB. Threat-model canonical: rule 1 in [`docs/security.md`](security.md). Performance implication: bounds read time.
2. Binary detection MUST scan at most the first 512 bytes. Threat-model canonical: rule 2 in [`docs/security.md`](security.md).
3. `scan_review_files` MUST cap results at 10,000 entries and `walkdir` depth at 50. **Evidence:** `commands.rs:168`; `scanner.rs:12`.

### Debounce windows
4. File-watcher debounce is 300 ms; MUST NOT be reduced below 200 ms or raised above 500 ms without a Criterion bench. **Evidence:** `watcher.rs:58`.
5. Save-loop suppression window is 1500 ms; frontend ignores `file-changed` events within that window after a local save. **Evidence:** `useFileWatcher.ts:7,56`.
6. Ghost re-scans after a deletion MUST be debounced by at least 500 ms to coalesce bulk deletes. **Evidence:** `useFileWatcher.ts:8,25`.

### Shared singletons
7. The Shiki highlighter MUST be a single process-wide singleton created lazily. **Evidence:** `src/lib/shiki.ts:3`.
8. Shiki pre-loads only `github-light` and `github-dark` themes with zero langs; languages load on demand. **Evidence:** `src/lib/shiki.ts:12-15`.

### Render cost
9. `react-markdown` `components` tables that don't close over props MUST be declared at module scope. **Evidence:** `MarkdownViewer.tsx:140` `MD_COMPONENTS`. Correctness note: prevents React error #185 in concurrent mode.
10. Per-render `components` merges are limited to entries that close over component-specific values (currently only `img`). **Evidence:** `MarkdownViewer.tsx:299-312`.
11. `SourceView` MUST run Shiki once per file/theme change, not per line. **Evidence:** `useSourceHighlighting.ts:54`.
12. `useSourceHighlighting` MUST use `useDeferredValue` so highlighting cannot block typing/scrolling. **Evidence:** `useSourceHighlighting.ts:28`.
13. `useFileContent` MUST render "loading" only on initial mount or path change, not on same-file watcher reloads. **Evidence:** `useFileContent.ts:35`.

### Rust hot paths
14. Comment anchoring (`match_comments`) MUST stay in Rust; no TypeScript re-implementation. **Evidence:** `core/matching.rs:12`, exposed via `get_file_comments`.
15. Levenshtein MUST use O(min(m,n)) memory — never allocate a full m×n matrix. **Evidence:** `matching.rs:184-217`.
16. Fuzzy matching MUST short-circuit identical/substring cases before computing Levenshtein. **Evidence:** `matching.rs:168-173`.
17. Sidecar mutations MUST go through `with_sidecar_mut` (load → mutate → save → emit) — never from the frontend. **Evidence:** `commands.rs:33`.
18. Batch counts for N files MUST be a single IPC call (`get_unresolved_counts`), not N calls. **Evidence:** `commands.rs:376`.

### Watcher efficiency
19. The watcher thread MUST own its receiver exclusively via `.take()`; no double-start. **Evidence:** `watcher.rs:41-53`.
20. The watcher MUST coalesce sync signals by draining with `try_recv` before calling `sync_dirs`. **Evidence:** `watcher.rs:117-124`.
21. `update_watched_files` MUST use `try_send(())` on its 1-slot channel so the frontend call never blocks the watcher loop. **Evidence:** `watcher.rs:202`.

### Directory listing
22. Directory listings MUST be sorted once in Rust and returned pre-sorted. **Evidence:** `commands.rs:97-102`.

### Render short-circuits
23. `setScrollTop` MUST short-circuit when the value is unchanged to avoid re-render storms on scroll. **Evidence:** `store/index.ts:162-167`.
24. `setGhostEntries` MUST diff old vs new and skip `set` on equality. **Evidence:** `store/index.ts:186-193`.

### User expectations
25. `MarkdownViewer` and `SourceView` MUST display a "large file" warning above `SIZE_WARN_THRESHOLD` so users expect slower rendering instead of assuming a hang. **Evidence:** `MarkdownViewer.tsx:321,371-375`; `SourceView.tsx:113,128-132`.

## Gaps (unenforced, backlog)

- No cold-startup benchmark. Rules 1-3 cap what startup may do, but no test verifies end-to-end launch time. Add a Playwright native e2e timing the window-ready event.
- `read_text_file` reads the file before checking size (`commands.rs:109-115`). A `metadata().len()` pre-check would reject large files in O(1). Bench on a 50 MB file before changing.
- No `[profile.release]` in `Cargo.toml` — `lto`, `codegen-units = 1`, `strip = true` not configured; binary size and runtime are default-profile.
- No JS bundle-size budget enforced in CI.
- No benchmark for `read_dir` on a 1000-entry folder.
- Shiki language load is unmeasured for uncommon languages.
- `MarkdownViewer` re-parses markdown on every `content` change, including watcher reloads (`MarkdownViewer.tsx:276,282`). For > 1 MB files this blocks the main thread; no bench quantifies the cost.
- No memory ceiling test. Per-tab and 100-file workspace memory are aspirational budgets.
- Watcher event volume is bounded by OS but not by the app. `rm -rf` on a 10K-file folder emits bursts; debouncer smooths at 300 ms but no upper forward-per-tick cap exists.
- `get_unresolved_counts` is linear in N × sidecar-read I/O. 10K sidecars would stall the folder tree; consider caching per-file counts invalidated on `comments-changed`.
