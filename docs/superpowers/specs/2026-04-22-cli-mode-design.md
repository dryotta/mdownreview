# CLI Mode + Core Extraction — Design Spec

**Issue:** [#17 — Rich CLI support without GUI](https://github.com/dryotta/mdownreview/issues/17)
**Scope:** Phase 1 of 4 — CLI binary and core module extraction
**Date:** 2026-04-22

## Problem

mdownreview's core review-file logic (load/save/scan MRSF sidecars, comment mutations) lives inside Tauri command handlers that depend on `tauri::State` and `tauri::AppHandle`. This makes the logic unusable outside the GUI. A separate [Python CLI script](https://github.com/dryotta/mdownreview-skills/blob/main/skills/mdownreview.py) duplicates this logic for headless use by AI agents. The Python script is a maintenance burden and diverges from the Rust implementation.

## Goal

1. Extract core review-file logic into a pure Rust module with no Tauri dependencies.
2. Build a `mdownreview-cli` binary that provides the same subcommands as the Python script.
3. Thin the Tauri command layer to delegate into the shared core.
4. Zero changes to the React frontend — Tauri command signatures stay identical.

## Non-Goals (this phase)

- Full MVVM refactor of the React layer (Phase 2)
- React optimization or dep pruning (Phase 3)
- Performance benchmarks (Phase 4)
- The `open` subcommand (launches the GUI binary) — deferred

---

## Architecture

### Two Binaries, One Library

```
src-tauri/
  src/
    main.rs              ← GUI binary (windows_subsystem = "windows")
    bin/
      cli.rs             ← CLI binary (console subsystem, default)
    lib.rs               ← Tauri app setup, GUI entry point
    commands.rs           ← Thin Tauri adapters calling core::
    watcher.rs            ← File watcher (GUI only, unchanged)
    core/
      mod.rs              ← Re-exports
      types.rs            ← MrsfComment, MrsfSidecar, DirEntry (shared types)
      sidecar.rs          ← Load/save/patch MRSF sidecar files
      scanner.rs          ← Walk directory trees for review files
      comments.rs         ← Comment filtering, mutation helpers
```

Cargo.toml adds:
```toml
[[bin]]
name = "mdownreview-cli"
path = "src/bin/cli.rs"

[dependencies]
clap = { version = "4", features = ["derive"] }
```

### Dependency Rules

| Module | May depend on |
|---|---|
| `core/*` | `serde`, `serde_yaml`, `serde_json`, `walkdir`, `sha2`, `std` |
| `commands.rs` | `core/*`, `tauri`, `tracing` |
| `watcher.rs` | `notify`, `tauri` |
| `bin/cli.rs` | `core/*`, `clap` |

**Hard rule:** `core/` never imports `tauri`.

---

## Core Module API

### `core::types`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrsfComment {
    pub id: String,
    pub author: String,
    pub timestamp: String,
    pub text: String,
    pub resolved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchored_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub comment_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrsfSidecar {
    pub mrsf_version: String,
    pub document: String,
    pub comments: Vec<MrsfComment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}
```

### `core::sidecar`

**Full load** (for read operations and GUI):
```rust
/// Load a sidecar file. Tries .review.yaml first, then .review.json.
/// Returns None if no sidecar exists.
pub fn load_sidecar(file_path: &str) -> Result<Option<MrsfSidecar>, SidecarError>;

/// Save a complete sidecar. Atomically writes via temp+rename.
/// Deletes the sidecar if comments is empty.
pub fn save_sidecar(
    file_path: &str,
    document: &str,
    comments: &[MrsfComment],
) -> Result<(), SidecarError>;
```

**Patch mode** (for CLI mutations — preserves unknown fields):
```rust
/// Surgically modify a comment in a sidecar file.
/// Loads as serde_yaml::Value, finds comment by ID, applies mutations,
/// writes back preserving all unknown fields and structure.
pub fn patch_comment(
    file_path: &str,
    comment_id: &str,
    mutations: &[CommentMutation],
) -> Result<(), SidecarError>;

pub enum CommentMutation {
    SetResolved(bool),
    AddResponse {
        author: String,
        text: String,
        timestamp: String,
    },
}
```

**Error type:**
```rust
#[derive(Debug)]
pub enum SidecarError {
    Io(std::io::Error),
    YamlParse(serde_yaml::Error),
    JsonParse(serde_json::Error),
    NotFound,
    CommentNotFound(String),
}
```

### `core::scanner`

```rust
/// Walk a directory tree and find MRSF sidecar files.
/// YAML takes priority over JSON when both exist for the same source file.
/// Results are capped at `cap` entries.
/// Returns (sidecar_path, source_file_path) pairs.
pub fn find_review_files(root: &str, cap: usize) -> Result<Vec<(String, String)>, SidecarError>;
```

### `core::comments`

```rust
/// Filter to only unresolved comments.
pub fn filter_unresolved(comments: &[MrsfComment]) -> Vec<&MrsfComment>;

/// Derive the source filename from a sidecar path.
pub fn source_file_for(review_path: &str) -> String;

/// Return current UTC time as ISO-8601 string with Z suffix.
pub fn iso_now() -> String;
```

---

## CLI Binary Interface

Binary: `mdownreview-cli` (or `mdownreview-cli.exe` on Windows)

### Subcommands

#### `read`
```
mdownreview-cli read [--folder <path>] [--format text|json] [--all]
```

- `--folder` defaults to current working directory
- `--format` defaults to `text`
- `--all` includes resolved comments (default: unresolved only)

**Text output** (matches Python):
```
-- filename.md (3 unresolved comments) --
  [uuid-1] line 42: [suggestion] (medium) Consider using a constant here
  [uuid-2] line 57: This needs documentation
```

**JSON output** (matches Python):
```json
[
  {
    "reviewFile": "relative/path/to/file.review.yaml",
    "sourceFile": "file.md",
    "comments": [ ... ]
  }
]
```

#### `cleanup`
```
mdownreview-cli cleanup [--folder <path>] [--dry-run]
```

- Deletes sidecar files where ALL comments are resolved
- `--dry-run` prints what would be deleted without deleting
- Reports count of files deleted

#### `resolve`
```
mdownreview-cli resolve <review_file> <comment_id> [--response <text>]
```

- Uses `patch_comment` for surgical edit
- Prints confirmation or error to stderr

#### `respond`
```
mdownreview-cli respond <review_file> <comment_id> --response <text>
```

- Uses `patch_comment` for surgical edit
- Adds response without changing `resolved` status
- `--response` is required

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Error (file not found, comment not found, parse error) |

### Output Conventions

- Normal output → stdout
- Warnings and errors → stderr (prefixed with `warning:` or `error:`)
- `--format json` outputs only valid JSON to stdout (no mixed text)

---

## Tauri Command Adapter Pattern

`commands.rs` becomes thin wrappers. Example:

```rust
use crate::core;

#[tauri::command]
pub fn load_review_comments(file_path: String) -> Result<Option<core::types::MrsfSidecar>, String> {
    core::sidecar::load_sidecar(&file_path)
        .map_err(|e| {
            tracing::error!("[rust] command error: {e}");
            e.to_string()
        })
}

#[tauri::command]
pub fn save_review_comments(
    file_path: String,
    document: String,
    comments: Vec<core::types::MrsfComment>,
) -> Result<(), String> {
    core::sidecar::save_sidecar(&file_path, &document, &comments)
        .map_err(|e| {
            tracing::error!("[rust] command error: {e}");
            e.to_string()
        })
}
```

**Frontend impact: zero.** All Tauri command signatures and return types remain identical.

---

## Testing

### Core Unit Tests

Located in each `core/` module as `#[cfg(test)] mod tests`. Test:

- `sidecar::load_sidecar` — YAML load, JSON fallback, missing file returns None, malformed YAML errors
- `sidecar::save_sidecar` — writes valid YAML, atomic (no partial writes), empty comments deletes file
- `sidecar::patch_comment` — resolves comment by ID, adds response, preserves unknown fields, comment-not-found error
- `scanner::find_review_files` — YAML priority over JSON, respects cap, nested directories
- `comments::filter_unresolved` — correct filtering, empty input

Run with `cargo test`.

### CLI Integration Tests

Located in `src-tauri/tests/cli_integration.rs`. Run the `mdownreview-cli` binary as a subprocess against fixture directories:

- `read` — text and JSON format, `--all` flag, empty directory
- `cleanup` — deletes resolved files, skips unresolved, `--dry-run` doesn't delete
- `resolve` — marks comment resolved, preserves other comments
- `respond` — adds response without resolving

Fixtures: `src-tauri/tests/fixtures/cli/` with pre-built `.review.yaml` files.

### Existing Tests

All existing tests continue to pass unchanged:
- `src-tauri/tests/commands_integration.rs` — Tauri command tests
- `npm test` — Vitest unit/component tests
- `npm run test:e2e` — Playwright browser integration tests

---

## Build & Distribution

### Cargo.toml Changes

```toml
[[bin]]
name = "mdownreview-cli"
path = "src/bin/cli.rs"

[dependencies]
clap = { version = "4", features = ["derive"] }
# chrono for iso_now() UTC timestamp formatting (std::time has no UTC formatting)
chrono = { version = "0.4", default-features = false, features = ["clock"] }
```

### CI Changes

Add to the build workflow:
```yaml
- name: Build CLI binary
  run: cargo build --release --bin mdownreview-cli
```

The CLI binary should be included in release artifacts alongside the GUI installer.

### Windows Console

- `main.rs` (GUI): keeps `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
- `bin/cli.rs` (CLI): no `windows_subsystem` attribute (defaults to console)

---

## Migration Path

Once the CLI binary is stable:
1. The Python `mdownreview.py` script can delegate to `mdownreview-cli` when available
2. Eventually the Python script is deprecated in favor of the Rust CLI
3. The `open` subcommand can be added later to launch the GUI binary

## Future Phases

- **Phase 2:** MVVM refactor — move comment-matching, anchoring, and thread-building from TypeScript into `core/`
- **Phase 3:** React optimization — Zustand selectors, Shiki consolidation, dep pruning
- **Phase 4:** Performance benchmarks — CLI timing, GUI rendering metrics, CI regression gates
