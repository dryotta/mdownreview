## Context

Markdown Review is a new greenfield desktop application for reviewing AI-generated text artifacts. The primary users are developers and reviewers who receive batches of files from AI agents and need to read, navigate, and annotate them without a full editing environment.

The reference project (Ferrite) uses Rust + egui, which requires GPU rendering and is not suitable for all deployment contexts. This application uses Tauri v2 as the shell to get native OS integration (file system, menus, tray) with a web-based UI layer (React + TypeScript) that renders without GPU dependency.

**Constraints:**
- Must run on Windows 10+ and macOS 12+ without GPU requirement
- Comments must survive application restarts and be portable alongside the reviewed files
- No cloud/network requirement — fully local operation

## Goals / Non-Goals

**Goals:**
- Fast read-only viewing of markdown and source files with GitHub-quality rendering
- Low-friction comment workflow: click-to-annotate any line or section
- File tree navigation within a selected root directory
- Multi-tab document switching with persistent tab state within a session
- Offline-only, local-first operation

**Non-Goals:**
- Editing file content (this is a viewer/reviewer, not an editor)
- Git integration, diff views, or version history
- Cloud sync or real-time collaboration
- Plugin/extension system
- Terminal emulation

## Decisions

### 1. Tauri v2 over Electron

**Decision:** Use Tauri v2 (Rust + WebView) rather than Electron.

**Rationale:** Tauri uses the system WebView (WebView2 on Windows, WKWebView on macOS), resulting in ~5–20 MB installer vs. Electron's 100+ MB. Native Rust backend handles file I/O and OS integration efficiently. No GPU requirement (unlike egui).

**Alternative considered:** Electron — rejected due to bundle size and memory overhead that is unnecessary for a read-only viewer.

### 2. React + TypeScript for UI

**Decision:** Use React 18 + TypeScript for all UI components.

**Rationale:** Rich ecosystem for text rendering, syntax highlighting, and comment UIs. Type safety reduces bugs in comment data models. Component model maps cleanly to tabs, panes, and overlays.

**Alternative considered:** Svelte — smaller bundle, but smaller ecosystem for the specialized components needed (markdown renderers, code highlighters).

### 3. react-markdown + remark-gfm for Markdown

**Decision:** Use `react-markdown` with `remark-gfm` and `rehype-highlight` (or `shiki` via rehype plugin).

**Rationale:** `react-markdown` is the de-facto standard React markdown renderer. `remark-gfm` adds GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks). This combination is battle-tested for GFM compatibility.

**Alternative considered:** Marked.js with `dangerouslySetInnerHTML` — rejected due to XSS risk from arbitrary AI-generated content.

### 4. Shiki for syntax highlighting

**Decision:** Use Shiki (via `@shikijs/rehype` or standalone) for code block and source file highlighting.

**Rationale:** Shiki uses TextMate grammars (same as VS Code), producing accurate highlighting for 100+ languages. Themes are VS Code-compatible. Works in the browser bundle.

**Alternative considered:** highlight.js — simpler API but lower accuracy for complex languages.

### 5. Comments stored as sidecar JSON files

**Decision:** Store review comments in a sidecar file per reviewed document: `<filename>.review.json` in the same directory.

**Rationale:** Comments are portable — moving the directory keeps comments attached. No database dependency. Human-readable and inspectable. Easy to share reviews by sharing the directory.

**Alternative considered:** SQLite database — better for querying across files, but creates a hidden `.review.db` that is hard to share and ties comments to a specific machine path.

### 6. Zustand for frontend state

**Decision:** Use Zustand for application state (open tabs, active file, comments cache, tree state).

**Rationale:** Minimal boilerplate, works well with React 18 concurrent features, TypeScript-native. State slices map cleanly to UI concerns.

**Alternative considered:** Redux Toolkit — more powerful but excessive ceremony for this app's state complexity.

### 7. Application layout: three-pane

**Decision:** Fixed three-pane layout: collapsible folder tree (left) | document viewer with tab bar (center) | review comments panel (right, toggleable).

**Rationale:** Mirrors familiar IDE layout that reviewers know. The comment panel can be hidden to maximize reading space.

## Risks / Trade-offs

- **WebView rendering differences** → Tauri uses different WebView engines per OS (WebView2 vs. WKWebView). UI must be tested on both platforms. Mitigation: use CSS resets and avoid browser-specific APIs.
- **Large file performance** → Very large generated files (>1MB markdown) may cause slow render. Mitigation: implement virtualized rendering for long documents (react-window or similar) in a later iteration; initial version sets a soft warning at >500KB.
- **Sidecar file conflicts** → If the review directory is under source control, `.review.json` files will appear as untracked. Mitigation: document that users may want to add `*.review.json` to `.gitignore`.
- **Tauri v2 API surface** → Tauri v2 is relatively new; some APIs may change. Mitigation: pin Tauri version and audit on each upgrade.

## Open Questions

- Should the comments panel support exporting a summary report (e.g., markdown or HTML)? Deferred to post-MVP.
- Should file watching (auto-reload on change) be included in v1? Marked as a stretch goal.
