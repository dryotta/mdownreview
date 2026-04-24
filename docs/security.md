# Security & Reliability — rules for mdownreview

**Status:** Canonical for threat-model and safety rules. Cite violations as "violates rule N in `docs/security.md`".
**Charter:** [`docs/principles.md`](principles.md)
**Last updated:** 2026-04-23

## Principles

Unique to security. **Rust-First** is a charter meta-principle — see [`docs/principles.md`](principles.md).

1. **Local-only, offline-first trust model.** The app makes no outbound calls except a signed updater check and user-initiated `openUrl` links. The entire IPC surface is local-trust; keeping network out of the threat model lets us treat filesystem IPC as local-privileged.
2. **Custom IPC commands replace `tauri-plugin-fs` scope.** File access is intentionally unscoped at the plugin layer and gated by command-level guards (size, binary, path canonicalization). A markdown viewer pointed at arbitrary local folders cannot work under plugin path-scope, so every custom command MUST enforce its own bounds.
3. **Rendered content is structurally sanitized by default.** Markdown renders without `rehype-raw`; any `dangerouslySetInnerHTML` is paired with an explicit sanitizer or produces output from a library whose output is known-safe. `react-markdown`'s escape-by-default is the single most important XSS control.
4. **Atomic writes, never partial sidecars.** Comment persistence uses temp-write + rename so a crash or watcher race never leaves a half-written `.review.yaml`. The only acceptable failure is "no write".
5. **Fail closed, log, continue.** Command handlers return `Result<_, String>` and log; React renders behind `ErrorBoundary`; the Rust panic hook logs before propagating; promise rejections route to the log. A viewer must never crash to a blank window on malformed input.

## Rules

### File-read bounds (threat model canonical)
1. Every Rust command that opens a file MUST enforce a 10 MB hard cap. **Evidence:** `src-tauri/src/commands.rs:114` in `read_text_file`; `:139` in `read_binary_file`.
2. `read_text_file` MUST reject binaries by scanning the first 512 bytes for NUL and MUST only succeed on valid UTF-8. **Evidence:** `src-tauri/src/commands.rs:120-128`.
3. Size and binary checks MUST happen on already-read bytes, not on `metadata()` before a second read (no TOCTOU). **Evidence:** `src-tauri/src/commands.rs:108` comment.
4. `read_dir` MUST canonicalize the requested path and reject any request whose canonical form differs from the canonicalized input. **Evidence:** `src-tauri/src/commands.rs:58-69`.

### Sidecar atomicity & integrity
5. Sidecar writes MUST be temp-file + atomic rename; a failed rename MUST clean up the temp file. **Evidence:** `src-tauri/src/core/sidecar.rs:91-101`.
6. Saving an empty comment list MUST delete the sidecar rather than writing an empty YAML. **Evidence:** `src-tauri/src/core/sidecar.rs:74-79`.
7. Sidecar loading MUST prefer YAML over JSON and MUST treat a missing file as `Ok(None)`, never an error. **Evidence:** `src-tauri/src/core/sidecar.rs:42-62`.
8. Malformed YAML/JSON MUST surface as a typed error (`SidecarError::YamlParse` / `JsonParse`), not a panic. **Evidence:** `src-tauri/src/core/sidecar.rs:45,57`.

### Launch-args & CLI handling
9. The `LaunchArgsState` handler MUST use `.take()` so launch args are consumed exactly once. **Evidence:** `src-tauri/src/commands.rs:150-153`.
10. Single-instance emits `args-received` only when `get_webview_window("main")` is `Some`. **Evidence:** `src-tauri/src/lib.rs:95-102`.
11. CLI argument parsing MUST canonicalize every path via `std::fs::canonicalize` and silently drop paths that fail to resolve. **Evidence:** `src-tauri/src/lib.rs:24-44`.

### Markdown rendering safety
12. Markdown rendering MUST NOT use `rehype-raw`; only `remarkGfm` and `rehypeSlug` are installed. **Evidence:** `src/components/viewers/MarkdownViewer.tsx:387-388`.
13. Markdown anchor clicks MUST only open `http(s)` URLs, blocking `file://`, `javascript:`, etc. **Evidence:** `src/components/viewers/MarkdownViewer.tsx:146-148`.
14. Local image `src` MUST be piped through `convertFileSrc` so the WebView loads via `asset:`, never raw `file://`. **Evidence:** `src/components/viewers/MarkdownViewer.tsx:302-309`.
15. Mermaid MUST run with `securityLevel: "strict"`. **Evidence:** `src/components/viewers/MermaidView.tsx:21`.
16. `SourceView`'s `dangerouslySetInnerHTML` payload MUST come only from Shiki output, `escapeHtml`, or search highlight built from `escapeHtml`-segmented pieces. **Evidence:** `src/components/viewers/SourceView.tsx:184-190`; `src/hooks/useSourceHighlighting.ts:8-10`.

### Process-level hardening
17. The CSP MUST disallow inline scripts, `object`, `frame-ancestors`, and MUST whitelist `asset:` for images only. **Evidence:** `src-tauri/tauri.conf.json:23`.
18. The window MUST request only the minimal Tauri capability set: log, dialog open, clipboard write-text, opener open-url, updater. **Evidence:** `src-tauri/capabilities/default.json:5-16`.
19. The updater MUST verify payloads via the configured minisign public key. **Evidence:** `src-tauri/tauri.conf.json:55`.
20. `set_root_via_test` MUST be compiled out of release builds via `#[cfg(debug_assertions)]`. **Evidence:** `src-tauri/src/commands.rs:172`.

### Watcher integrity
21. The file watcher MUST watch parent directories (not individual files, to survive atomic-rename saves) and MUST emit only for paths on the current watch list. **Evidence:** `src-tauri/src/watcher.rs:146-169, 80-102`. (Debounce window: rule 4 in [`docs/performance.md`](performance.md).)
22. Watcher bookkeeping MUST store both canonical and raw paths so deleted files (which cannot canonicalize) still match. **Evidence:** `src-tauri/src/watcher.rs:184-197`.
23. Closing a tab MUST evict that path from `lastSaveByPath` so stale timestamps cannot suppress a later event. **Evidence:** `src/store/index.ts:156-159`.

### Logging & crash capture
24. Release builds MUST forward only `warn`/`error` from WebView `console.*` to the log. **Evidence:** `src-tauri/src/lib.rs:75-77`.
25. Log rotation MUST cap file size at 5 MB and keep rotated files. **Evidence:** `src-tauri/src/lib.rs:55-56`.
26. Rust panics MUST be logged with location via a panic hook installed in `setup`. **Evidence:** `src-tauri/src/lib.rs:109-123`.

### IPC & error-surface contracts (references)
- IPC chokepoint: see rule 1 in [`docs/architecture.md`](architecture.md).
- `window.onerror` at module scope before `createRoot`: see rule 1 in [`docs/design-patterns.md`](design-patterns.md).
- `ErrorBoundary` wrapping independently-rendered regions: see rule 20 in [`docs/design-patterns.md`](design-patterns.md).
- `read_dir` sidecar filtering (UI hygiene): see rule 22 in [`docs/architecture.md`](architecture.md).

## Gaps (unenforced, backlog)

- **No path-origin restriction on mutation commands.** `add_comment`, `edit_comment`, `delete_comment`, `set_comment_resolved`, `add_reply`, `get_file_comments` accept any `file_path` string from the frontend. A confused/compromised renderer call could write `<any_path>.review.yaml`. Mitigation: allowlist against open tabs/root.
- **`check_path_exists` and `read_binary_file` lack the canonicalization guard used by `read_dir`** (`commands.rs:10-16, 133-146`). A symlink could redirect image loads outside the workspace.
- **Sidecar `selected_text` and `text` have no length limit** (`core/types.rs:17-45`). `load_sidecar` uses unbounded `fs::read_to_string`. A 50 MB comment would pass through SHA-256 + YAML serialization.
- **Full file paths are logged unredacted** (`commands.rs:237`, `watcher.rs:158`). Shared logs leak workspace structure and usernames.
- **No MRSF schema version gate.** `load_sidecar` accepts any `mrsf_version` string; a future-versioned sidecar may deserialize with silently dropped fields.
- **Mermaid SVG injected via `dangerouslySetInnerHTML`** (`MermaidView.tsx:89`). Relies on upstream `securityLevel: "strict"` with no defense in depth.
- **Supply-chain rule is not codified.** No `deny.toml` / `cargo-deny` or npm audit gate in CI. A new transitive dep could pull in a network-using crate, silently breaking offline.
- **`patch_comment` in `core/sidecar.rs` is internally reachable but public.** Future wiring without `with_sidecar_mut` discipline would bypass atomic-save.
- **Launch-args race on macOS "Open With"** (`lib.rs:258-287`): if `get_launch_args` fires between the `is_none` check and the emit, files can be silently lost.
