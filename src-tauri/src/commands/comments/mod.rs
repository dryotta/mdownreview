//! Comment thread mutation commands (sidecar reads, writes, anchor hashing).
//!
//! Split into 4 submodules for the 400-LOC budget (architecture rule 23):
//! - `mod.rs` — workspace guard + CRUD entry points
//! - `badges.rs` — `get_file_badges`
//! - `export.rs` — `export_review_summary`
//! - `update.rs` — `update_comment` + `CommentPatch`

use crate::core::mrsf_version::MRSF_VERSION_DEFAULT;
use crate::core::types::{CommentAnchor, CommentThread, MrsfComment, MrsfSidecar};
use std::path::Path;
use tauri::{Emitter, State};

use crate::watcher::WatcherState;

pub mod badges;
pub mod export;
pub mod update;

pub use badges::{get_file_badges, get_file_badges_inner, FileBadge};
pub use export::{export_review_summary, export_review_summary_inner};
pub use update::{update_comment, update_comment_apply, CommentPatch};

/// Payload emitted to the frontend after a mutation command modifies a sidecar.
#[derive(Clone, serde::Serialize)]
pub struct CommentsChangedEvent {
    pub file_path: String,
}

/// Workspace-path containment guard shared by every mutation/aggregator
/// command. Mirrors the convention from `stat_file_inner` (advisory #5):
/// rejects paths the user has not opened (a workspace dir or active tab).
///
/// Uses [`WatcherState::is_path_or_parent_allowed`] (not the strict
/// `is_path_allowed`) so mutations against deleted, renamed, or
/// editor-swapped files still succeed — these are routine for the orphan
/// comment / DeletedFileViewer flow and OneDrive/iCloud sync. The parent
/// directory must still canonicalize inside the workspace, so a symlink
/// trick cannot smuggle through.
///
/// Returns `"path not in workspace"` on rejection so callers can match the
/// same string the rest of the FS surface emits.
pub(crate) fn enforce_workspace_path(state: &WatcherState, file_path: &str) -> Result<(), String> {
    if state.is_path_or_parent_allowed(Path::new(file_path)) {
        Ok(())
    } else {
        tracing::warn!("[comments] rejected: path outside workspace: {file_path}");
        Err("path not in workspace".to_string())
    }
}

/// Load a sidecar, apply a mutation, save, and emit `comments-changed`.
fn with_sidecar_mut(
    app: &tauri::AppHandle,
    file_path: &str,
    mutate: impl FnOnce(&mut MrsfSidecar) -> Result<(), String>,
) -> Result<(), String> {
    let mut sidecar = crate::core::sidecar::load_sidecar(file_path)
        .map_err(|e| e.to_string())?
        .ok_or("sidecar not found")?;
    mutate(&mut sidecar)?;
    crate::core::sidecar::save_sidecar(file_path, &sidecar.document, &sidecar.comments)
        .map_err(|e| e.to_string())?;
    let _ = app.emit_to(
        "main",
        "comments-changed",
        CommentsChangedEvent {
            file_path: file_path.to_string(),
        },
    );
    Ok(())
}

/// Pure helper: load an existing sidecar OR create an empty default,
/// apply a mutation, then save. Does NOT emit (so it can be unit-tested
/// without a Tauri AppHandle). Used by `with_sidecar_or_create`.
pub fn mutate_sidecar_or_create(
    file_path: &str,
    document_default: Option<String>,
    mutate: impl FnOnce(&mut MrsfSidecar) -> Result<(), String>,
) -> Result<(), String> {
    let mut sidecar = crate::core::sidecar::load_sidecar(file_path)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| MrsfSidecar {
            mrsf_version: MRSF_VERSION_DEFAULT.to_string(),
            document: document_default.unwrap_or_else(|| {
                std::path::Path::new(file_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default()
            }),
            comments: vec![],
        });
    mutate(&mut sidecar)?;
    crate::core::sidecar::save_sidecar(file_path, &sidecar.document, &sidecar.comments)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Like `with_sidecar_mut` but creates an empty default sidecar if none exists.
/// Use for "create" operations (e.g. adding the first comment to a file).
fn with_sidecar_or_create(
    app: &tauri::AppHandle,
    file_path: &str,
    document_default: Option<String>,
    mutate: impl FnOnce(&mut MrsfSidecar) -> Result<(), String>,
) -> Result<(), String> {
    mutate_sidecar_or_create(file_path, document_default, mutate)?;
    let _ = app.emit_to(
        "main",
        "comments-changed",
        CommentsChangedEvent {
            file_path: file_path.to_string(),
        },
    );
    Ok(())
}

/// Combined hot-path: load sidecar → match to file lines → build threads.
/// Single IPC call for the GUI's most common operation.
///
/// Comments are partitioned by anchor variant: `Line`/`File` go through the
/// existing `match_comments` batch algorithm (line-targeting heuristics);
/// typed anchors (CSV cell, JSON path, HTML range/element, image rect,
/// word range) are dispatched through [`crate::core::anchors::resolve_anchor`]
/// against a single shared [`crate::core::anchors::LazyParsedDoc`] so the
/// file is parsed at most once per call (lazily, only for the
/// representations the present anchors actually need).
///
/// Workspace-allowlisted via [`enforce_workspace_path`] (advisory #5 / iter-4
/// security blocker S2): rejects paths the user has not opened so a renderer
/// cannot probe arbitrary files. The file body itself is read with a 10 MB
/// cap (matching `read_text_file` and `SIDECAR_MAX_BYTES`) — anything larger
/// degrades silently to empty bytes so all comments orphan, identical to the
/// `NotFound` branch.
#[tauri::command]
pub fn get_file_comments(
    state: State<'_, WatcherState>,
    file_path: String,
) -> Result<Vec<CommentThread>, String> {
    enforce_workspace_path(&state, &file_path)?;
    get_file_comments_inner(&file_path)
}

/// Pure helper for [`get_file_comments`]. Skips the workspace guard so
/// integration tests can exercise the matcher / typed-anchor path without
/// fabricating a `State<'_, WatcherState>`. The IPC layer must call the
/// `#[tauri::command]` wrapper above, never this function directly.
pub fn get_file_comments_inner(file_path: &str) -> Result<Vec<CommentThread>, String> {
    use crate::core::anchors::{resolve_anchor, LazyParsedDoc, MatchOutcome};
    use crate::core::types::{Anchor, MatchedComment};

    let sidecar = crate::core::sidecar::load_sidecar(file_path).map_err(|e| e.to_string())?;
    let comments = match sidecar {
        Some(s) => s.comments,
        None => return Ok(vec![]),
    };
    if comments.is_empty() {
        return Ok(vec![]);
    }

    // Read raw bytes once with a 10 MB cap (security blocker S1: docs/security.md
    // rule 1 — every fs read must be bounded). NotFound (deleted/renamed),
    // over-cap, and other errors all silently degrade to empty bytes so all
    // comments orphan; cause is logged.
    const MAX_BYTES: usize = 10 * 1024 * 1024;
    let bytes = match std::fs::File::open(file_path) {
        Ok(f) => {
            use std::io::Read;
            let mut buf = Vec::new();
            match f.take((MAX_BYTES + 1) as u64).read_to_end(&mut buf) {
                Ok(_) if buf.len() > MAX_BYTES => {
                    tracing::warn!(
                        "get_file_comments: {file_path} exceeds {MAX_BYTES}-byte cap; orphaning all comments"
                    );
                    Vec::new()
                }
                Ok(_) => buf,
                Err(e) => {
                    tracing::warn!("Could not read {file_path} for comment matching: {e}");
                    Vec::new()
                }
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(e) => {
            tracing::warn!("Could not open {file_path} for comment matching: {e}");
            Vec::new()
        }
    };
    let doc = LazyParsedDoc::new(bytes);

    let mut line_or_file: Vec<MrsfComment> = Vec::new();
    let mut typed: Vec<MrsfComment> = Vec::new();
    for c in comments {
        match c.anchor {
            Anchor::Line { .. } | Anchor::File => line_or_file.push(c),
            _ => typed.push(c),
        }
    }

    // Line/File: existing line-targeting heuristics. Skip materializing
    // `doc.lines()` entirely when there are no Line/File anchors — typed-only
    // sidecars on multi-MB files do not need the line-split cache, and
    // populating it would be the dominant cost (perf-expert iter-4 finding).
    let mut matched = if line_or_file.is_empty() {
        Vec::new()
    } else {
        let lines_str: Vec<&str> = doc.lines().iter().map(String::as_str).collect();
        crate::core::matching::match_comments(&line_or_file, &lines_str)
    };

    // Typed anchors: per-comment dispatch with lazily-cached file parses.
    for c in typed {
        let outcome = resolve_anchor(&c.anchor, &doc);
        matched.push(MatchedComment {
            comment: c,
            matched_line_number: 0,
            is_orphaned: matches!(outcome, MatchOutcome::Orphan),
            anchored_text: None,
        });
    }

    Ok(crate::core::threads::group_into_threads(&matched))
}

/// Create a new comment, save to sidecar.
///
/// `clippy::too_many_arguments` is intentionally permitted here: this is a
/// `#[tauri::command]`, so its parameter list is the IPC wire shape consumed
/// by `invoke("add_comment", { ... })` on the JS side. Grouping arguments
/// into a struct would change the wire contract.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn add_comment(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    author: String,
    text: String,
    anchor: Option<CommentAnchor>,
    comment_type: Option<String>,
    severity: Option<String>,
    document: Option<String>,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    let comment = crate::core::comments::create_comment(
        &author,
        &text,
        anchor,
        comment_type.as_deref(),
        severity.as_deref(),
    );
    with_sidecar_or_create(&app, &file_path, document, |sidecar| {
        sidecar.comments.push(comment);
        Ok(())
    })
}

/// Test seam: calls `enforce_workspace_path` for each retrofitted command so
/// integration tests can verify the guard is wired without bringing up a
/// Tauri runtime. Not registered at the IPC layer; only the
/// `#[tauri::command]` handlers above are.
pub fn check_workspace_for(
    command: &str,
    state: &WatcherState,
    file_path: &str,
) -> Result<(), String> {
    let _ = command;
    enforce_workspace_path(state, file_path)
}

/// Create a reply to an existing comment, save to sidecar.
#[tauri::command]
pub fn add_reply(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    parent_id: String,
    author: String,
    text: String,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    with_sidecar_mut(&app, &file_path, |sidecar| {
        let parent = sidecar
            .comments
            .iter()
            .find(|c| c.id == parent_id)
            .ok_or_else(|| format!("parent comment {} not found", parent_id))?
            .clone();
        let reply = crate::core::comments::create_reply(&author, &text, &parent);
        sidecar.comments.push(reply);
        Ok(())
    })
}

/// Edit a comment's text, save to sidecar.
#[tauri::command]
pub fn edit_comment(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    comment_id: String,
    text: String,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    with_sidecar_mut(&app, &file_path, |sidecar| {
        let comment = sidecar
            .comments
            .iter_mut()
            .find(|c| c.id == comment_id)
            .ok_or_else(|| format!("comment {} not found", comment_id))?;
        comment.text = text;
        Ok(())
    })
}

/// Delete a comment (with reply reparenting per MRSF §9.1), save to sidecar.
#[tauri::command]
pub fn delete_comment(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    comment_id: String,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    with_sidecar_mut(&app, &file_path, |sidecar| {
        sidecar.comments = crate::core::comments::delete_comment(&sidecar.comments, &comment_id);
        Ok(())
    })
}

/// Compute SHA-256 hash for selected text anchor.
#[tauri::command]
pub fn compute_anchor_hash(text: String) -> String {
    crate::core::anchors::compute_selected_text_hash(&text)
}

#[cfg(test)]
mod tests {
    use super::get_file_comments_inner;
    use crate::core::anchors::LINES_INIT_COUNT;
    use crate::core::sidecar::save_sidecar;
    use crate::core::types::{Anchor, HtmlElementAnchor, ImageRectAnchor, MrsfComment};

    fn typed_comment(id: &str, anchor: Anchor) -> MrsfComment {
        MrsfComment {
            id: id.into(),
            author: "Test User (test)".into(),
            timestamp: "2026-04-20T12:00:00-07:00".into(),
            text: "typed".into(),
            resolved: false,
            anchor,
            ..Default::default()
        }
    }

    /// D1 perf guard: a sidecar containing ONLY typed anchors (no Line/File)
    /// must NOT materialize `LazyParsedDoc::lines()`  the per-line UTF-8
    /// split is the dominant cost on multi-MB files and is unused by these
    /// typed resolvers (HtmlElement, ImageRect; CSV/JSON likewise).
    /// `LINES_INIT_COUNT` is a thread-local so concurrent tests do not race.
    #[test]
    fn get_file_comments_only_typed_does_not_read_lines() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.html");
        std::fs::write(&file, b"<html><body>x</body></html>").unwrap();
        let file_path = file.to_str().unwrap().to_string();

        let html_c = typed_comment(
            "c-html",
            Anchor::HtmlElement(HtmlElementAnchor {
                selector_path: "html > body".into(),
                tag: "body".into(),
                text_preview: "x".into(),
            }),
        );
        let img_c = typed_comment(
            "c-img",
            Anchor::ImageRect(ImageRectAnchor {
                x_pct: 10.0,
                y_pct: 10.0,
                w_pct: Some(20.0),
                h_pct: Some(20.0),
            }),
        );
        save_sidecar(&file_path, "doc.html", &[html_c, img_c]).unwrap();

        LINES_INIT_COUNT.with(|c| c.set(0));
        let _threads = get_file_comments_inner(&file_path).expect("ok");
        assert_eq!(
            LINES_INIT_COUNT.with(|c| c.get()),
            0,
            "typed-only sidecars must not materialize doc.lines()  \
             D1 perf guard regressed"
        );
    }

    /// Companion to the perf-guard test: when the sidecar contains a
    /// Line/File anchor, the lines cache MUST be initialized exactly once.
    /// Locks in the positive side of the conditional so a future refactor
    /// that drops the line read entirely cannot pass silently.
    #[test]
    fn get_file_comments_with_line_anchor_initializes_lines_once() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.md");
        std::fs::write(&file, b"line one\nline two\nline three\n").unwrap();
        let file_path = file.to_str().unwrap().to_string();

        let line_c = typed_comment(
            "c-line",
            Anchor::Line {
                line: 2,
                end_line: None,
                start_column: None,
                end_column: None,
                selected_text: Some("line two".into()),
                selected_text_hash: None,
            },
        );
        save_sidecar(&file_path, "doc.md", &[line_c]).unwrap();

        LINES_INIT_COUNT.with(|c| c.set(0));
        let _ = get_file_comments_inner(&file_path).expect("ok");
        assert_eq!(
            LINES_INIT_COUNT.with(|c| c.get()),
            1,
            "Line-anchor path must materialize lines exactly once"
        );
    }
}
