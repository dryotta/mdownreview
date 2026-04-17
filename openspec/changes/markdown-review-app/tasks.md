## 1. Project Scaffolding

- [ ] 1.1 Initialize Tauri v2 project with `create-tauri-app` using React + TypeScript template
- [ ] 1.2 Add frontend dependencies: `react-markdown`, `remark-gfm`, `rehype-highlight`, `shiki`, `zustand`, `@tauri-apps/api`
- [ ] 1.3 Configure TypeScript strict mode and ESLint + Prettier
- [ ] 1.4 Set up Vite config with path aliases (`@/` → `src/`)
- [ ] 1.5 Configure Tauri `tauri.conf.json`: app name, window size (1200×800 default), minimum size (800×600)
- [ ] 1.6 Add Tauri capabilities for filesystem read access and dialog plugin

## 2. Application Shell and Layout

- [ ] 2.1 Create root `App` component with three-pane layout: folder tree (left) | viewer (center) | comments panel (right)
- [ ] 2.2 Implement CSS layout with resizable panes (CSS grid or flexbox with drag handle)
- [ ] 2.3 Add drag handle between folder pane and viewer; enforce min width 160px and max 50% of window
- [ ] 2.4 Implement Zustand store with slices: `workspaceSlice` (root folder, tree state), `tabsSlice` (open tabs, active tab), `commentsSlice` (comments by file path)
- [ ] 2.5 Add global keyboard shortcut handler for `Ctrl/Cmd+B` (toggle folder pane) and `Ctrl/Cmd+Shift+C` (toggle comments panel)
- [ ] 2.6 Persist UI state (folder pane width, pane visibility, last workspace root) to Tauri store or `localStorage`

## 3. Folder Navigation

- [ ] 3.1 Implement Tauri command `read_dir_recursive` (or use Tauri fs plugin) to list directory contents
- [ ] 3.2 Build `FolderTree` React component: renders files and folders as a tree with expand/collapse nodes
- [ ] 3.3 Implement expand/collapse per node with state persisted in Zustand workspace slice
- [ ] 3.4 Add "Open Folder…" button that invokes Tauri dialog `open({ directory: true })` and sets workspace root
- [ ] 3.5 Restore last opened folder on app launch; handle missing folder with empty-state UI
- [ ] 3.6 Highlight the active file's tree entry when the active tab changes
- [ ] 3.7 Add file name filter input above the tree; implement case-insensitive substring filtering that keeps parent folders of matching files visible
- [ ] 3.8 Add "Collapse All" and "Expand All" toolbar buttons for the tree
- [ ] 3.9 Add toggle button to collapse/hide the folder pane entirely

## 4. Document Viewer (Tab System)

- [ ] 4.1 Build `TabBar` component: renders tabs with file name labels, close buttons, and active-tab styling
- [ ] 4.2 Implement open-file logic: if file already in tabs, activate it; otherwise add new tab and load content
- [ ] 4.3 Implement close-tab logic: remove tab, activate adjacent tab if needed, show empty state when last tab is closed
- [ ] 4.4 Display full file path as tooltip on tab hover
- [ ] 4.5 Implement file type router: `.md`/`.mdx` → `MarkdownViewer`, recognized code extensions → `SourceViewer`, binary → `BinaryPlaceholder`
- [ ] 4.6 Implement `useFileContent` hook that reads file content via Tauri fs API
- [ ] 4.7 Persist and restore per-tab scroll position when switching tabs
- [ ] 4.8 Implement `Ctrl+Tab` / `Ctrl+Shift+Tab` (`Cmd+}` / `Cmd+{` on macOS) shortcuts to cycle tabs
- [ ] 4.9 Show comment count badge on tabs that have saved comments (read from comments slice)

## 5. Markdown Viewer

- [ ] 5.1 Build `MarkdownViewer` component using `react-markdown` with `remark-gfm` plugin for GFM support
- [ ] 5.2 Integrate `rehype-highlight` (or `shiki` rehype plugin) for syntax-highlighted fenced code blocks
- [ ] 5.3 Configure custom `img` renderer to resolve relative image paths via Tauri `convertFileSrc` for local files
- [ ] 5.4 Configure custom `a` renderer to open links in system browser via `open` shell command (Tauri shell API)
- [ ] 5.5 Implement YAML frontmatter detection and stripping from markdown body; render collapsed `FrontmatterBlock` component above document
- [ ] 5.6 Build `FrontmatterBlock` component: collapsed by default, expands on click to show key-value pairs
- [ ] 5.7 Build `TableOfContents` component: extract H1–H3 headings, render hierarchical list; clicking entry scrolls to heading anchor
- [ ] 5.8 Add anchor IDs to rendered headings so TOC scroll works
- [ ] 5.9 Apply GitHub-style CSS for markdown elements (typography, table borders, blockquotes, code blocks)

## 6. Source Code Viewer

- [ ] 6.1 Build `SourceViewer` component that loads and displays file text with line numbers
- [ ] 6.2 Integrate Shiki for syntax highlighting: detect language from file extension, apply highlighting at render time
- [ ] 6.3 Apply a default VS Code-compatible theme (e.g., GitHub Light / GitHub Dark based on OS color scheme)
- [ ] 6.4 Handle files >500KB: show a warning banner and offer to display as plain text without highlighting
- [ ] 6.5 Build `BinaryPlaceholder` component displaying "This file cannot be displayed" with the file name and size

## 7. Review Comments

- [ ] 7.1 Build comment gutter: render a thin left gutter column in both `MarkdownViewer` and `SourceViewer` with per-line hover affordance (comment `+` icon)
- [ ] 7.2 Implement `CommentInput` inline component: appears below a line when `+` icon is clicked; supports text entry, Save (`Ctrl+Enter`) and Cancel (`Escape`)
- [ ] 7.3 Implement Zustand comments actions: `addComment(filePath, lineNumber, text)`, `editComment(id, text)`, `deleteComment(id)`
- [ ] 7.4 Implement Tauri command `save_review_comments(file_path, comments)` that writes `<filename>.review.json` sidecar
- [ ] 7.5 Implement Tauri command `load_review_comments(file_path)` that reads the sidecar file if it exists
- [ ] 7.6 Load comments into Zustand store when a file is opened; skip if no sidecar exists
- [ ] 7.7 Render comment gutter indicators (icon or count badge) at lines with saved comments
- [ ] 7.8 Build inline `CommentThread` component: expands below a line showing comment text, timestamp, Edit and Delete buttons
- [ ] 7.9 Build `CommentsPanel` right-side panel: lists all comments for active document sorted by line number, with preview text and timestamp
- [ ] 7.10 Wire comments panel list item click to scroll document to line and expand inline thread
- [ ] 7.11 Implement comments panel empty state: "No comments yet"
- [ ] 7.12 Add toggle button and `Ctrl+Shift+C` / `Cmd+Shift+C` shortcut to show/hide comments panel

## 8. Packaging and Distribution

- [ ] 8.1 Configure Tauri `bundle` settings for Windows: NSIS installer, product name "Markdown Review", bundle identifier
- [ ] 8.2 Configure Tauri `bundle` settings for macOS: DMG packaging, code signing placeholder, universal binary (x64 + arm64)
- [ ] 8.3 Add `tauri build` script to `package.json` and verify build succeeds on Windows
- [ ] 8.4 Add application icon assets (512×512 PNG, ICO for Windows, ICNS for macOS)
- [ ] 8.5 Test app launch, folder open, file viewing, and comment workflow end-to-end on Windows
