## Why

AI agents produce large volumes of markdown and source files that need human review — documents, reports, generated code — but no desktop tool is purpose-built for reviewing (not editing) AI-generated output with annotation support. Existing editors (VS Code, Obsidian) are heavy and optimized for authoring, not read-and-comment workflows.

## What Changes

This is a greenfield desktop application. There is no existing code being modified.

- New Rust + Tauri shell with React + TypeScript frontend
- GitHub-flavored Markdown renderer for `.md` files
- Syntax-highlighted source viewer for code files and plain text
- Tab-based multi-document interface for switching between open files
- Folder/file tree pane for navigating a directory
- Review comment system: users can annotate lines or sections with comments
- Application packaging for Windows (MSI/NSIS) and macOS (DMG)

## Capabilities

### New Capabilities

- `document-viewer`: Tab-based viewer that opens and displays markdown, source code, and plain text files with file-type detection
- `markdown-rendering`: GitHub-flavored Markdown rendering with syntax-highlighted code blocks, tables, task lists, and image support
- `folder-navigation`: Collapsible folder/file tree pane that lets users browse a directory and open files into the viewer
- `review-comments`: Mechanism for attaching review comments to specific lines or sections of a document, with the ability to view and manage all comments

### Modified Capabilities

<!-- None — this is a new application -->

## Impact

- **New dependencies**: Tauri v2 (Rust), React 18, TypeScript, a Markdown rendering library (e.g., `react-markdown` + `remark-gfm`), syntax highlighting (`shiki` or `highlight.js`), a code editor component for read-only display
- **Platform targets**: Windows 10+ (x64), macOS 12+ (arm64 + x64)
- **No existing code affected** — this is a new repository
