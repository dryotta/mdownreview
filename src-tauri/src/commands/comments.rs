//! Comment thread mutation commands (sidecar reads, writes, anchor hashing).

use crate::core::severity::{max_severity, Severity};
use crate::core::types::{
    CommentAnchor, CommentThread, MrsfSidecar, Reaction, MRSF_VERSION_DEFAULT,
};
use std::collections::HashMap;
use std::path::Path;
use tauri::{Emitter, State};

use crate::watcher::WatcherState;

/// Payload emitted to the frontend after a mutation command modifies a sidecar.
#[derive(Clone, serde::Serialize)]
pub struct CommentsChangedEvent {
    pub file_path: String,
}

/// Workspace-path containment guard shared by every mutation/aggregator
/// command. Mirrors the convention from `stat_file_inner` (advisory #5):
/// rejects paths the user has not opened (a workspace dir or active tab).
/// Returns `"path not in workspace"` on rejection so callers can match the
/// same string the rest of the FS surface emits.
fn enforce_workspace_path(state: &WatcherState, file_path: &str) -> Result<(), String> {
    if state.is_path_allowed(Path::new(file_path)) {
        Ok(())
    } else {
        tracing::warn!("[comments] rejected: path outside workspace: {file_path}");
        Err("path not in workspace".to_string())
    }
}

/// Per-file badge: count of unresolved threads + max severity across them.
/// Combines the previous `get_unresolved_counts` + a future
/// `get_max_severity_per_file` into a single aggregator (advisory #3) so the
/// renderer makes one IPC call to compute the tree/tab badge state.
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileBadge {
    pub count: u32,
    pub max_severity: Severity,
}

/// Patch payloads for `update_comment`. Discriminated enum (serde adjacent
/// `kind`/`data` tags) so the TS side can branch cleanly. `MoveAnchor`
/// will land alongside the `Anchor` enum refactor in a follow-up commit
/// (advisory #1) — until then `update_comment` accepts only the variants
/// that don't depend on the new anchor representation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum CommentPatch {
    /// Append a reaction. Idempotent on (`user`, `kind`) — adding the same
    /// reaction twice from the same user is a no-op so renderer-side
    /// double-clicks don't pollute the sidecar.
    AddReaction { user: String, kind: String, ts: String },
    /// Toggle resolved state. Mirrors the legacy `set_comment_resolved`
    /// command so future consumers can route everything through
    /// `update_comment`; the legacy command stays in place for back-compat.
    SetResolved { resolved: bool },
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
        CommentsChangedEvent { file_path: file_path.to_string() },
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
        CommentsChangedEvent { file_path: file_path.to_string() },
    );
    Ok(())
}

/// Combined hot-path: load sidecar → match to file lines → build threads.
/// Single IPC call for the GUI's most common operation.
#[tauri::command]
pub fn get_file_comments(file_path: String) -> Result<Vec<CommentThread>, String> {
    // Load sidecar
    let sidecar = crate::core::sidecar::load_sidecar(&file_path).map_err(|e| e.to_string())?;
    let comments = match sidecar {
        Some(s) => s.comments,
        None => return Ok(vec![]),
    };
    if comments.is_empty() {
        return Ok(vec![]);
    }

    // Read file content for matching (empty string for deleted/unreadable files → comments become orphans)
    let content = match std::fs::read_to_string(&file_path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => {
            tracing::warn!("Could not read {file_path} for comment matching: {e}");
            String::new()
        }
    };
    let lines: Vec<&str> = content.lines().collect();

    // Match comments to lines
    let matched = crate::core::matching::match_comments(&comments, &lines);

    // Build threads
    Ok(crate::core::threads::group_into_threads(&matched))
}

/// Create a new comment, save to sidecar.
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

/// Resolve or unresolve a comment, save to sidecar.
#[tauri::command]
pub fn set_comment_resolved(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    comment_id: String,
    resolved: bool,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    with_sidecar_mut(&app, &file_path, |sidecar| {
        let comment = sidecar
            .comments
            .iter_mut()
            .find(|c| c.id == comment_id)
            .ok_or_else(|| format!("comment {} not found", comment_id))?;
        comment.resolved = resolved;
        Ok(())
    })
}

/// Compute SHA-256 hash for selected text anchor.
#[tauri::command]
pub fn compute_anchor_hash(text: String) -> String {
    crate::core::anchors::compute_selected_text_hash(&text)
}

// ── New v1.1 IPC surface (advisory #2/3) ──────────────────────────────────

/// Apply a [`CommentPatch`] to a single comment. Consolidation point for
/// future per-comment mutations (`MoveAnchor` lands with the Anchor enum;
/// `AddReaction`/`SetResolved` land here today).
#[tauri::command]
pub fn update_comment(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    comment_id: String,
    patch: CommentPatch,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    update_comment_apply(&file_path, &comment_id, patch)?;
    let _ = app.emit_to(
        "main",
        "comments-changed",
        CommentsChangedEvent {
            file_path: file_path.clone(),
        },
    );
    Ok(())
}

/// Pure helper for [`update_comment`] — no `AppHandle`, no event emission.
/// Tests call this directly so they can drive the patch path without bringing
/// up a Tauri runtime. The IPC entry point composes it with the workspace
/// guard + emit.
pub fn update_comment_apply(
    file_path: &str,
    comment_id: &str,
    patch: CommentPatch,
) -> Result<(), String> {
    let mut sidecar = crate::core::sidecar::load_sidecar(file_path)
        .map_err(|e| e.to_string())?
        .ok_or("sidecar not found")?;
    let comment = sidecar
        .comments
        .iter_mut()
        .find(|c| c.id == comment_id)
        .ok_or_else(|| format!("comment {} not found", comment_id))?;
    match patch {
        CommentPatch::AddReaction { user, kind, ts } => {
            let list = comment.reactions.get_or_insert_with(Vec::new);
            if !list.iter().any(|r| r.user == user && r.kind == kind) {
                list.push(Reaction { user, kind, ts });
            }
        }
        CommentPatch::SetResolved { resolved } => {
            comment.resolved = resolved;
        }
    }
    crate::core::sidecar::save_sidecar(file_path, &sidecar.document, &sidecar.comments)
        .map_err(|e| e.to_string())
}

/// Per-file unresolved-thread count + worst severity. Replaces the pair
/// {`get_unresolved_counts`, `get_max_severity_per_file`} with a single
/// IPC call so the renderer makes one round-trip per badge refresh
/// (advisory #3). The legacy `get_unresolved_counts` remains in place
/// until consumers are migrated in the C-group iter.
#[tauri::command]
pub fn get_file_badges(
    state: State<'_, WatcherState>,
    file_paths: Vec<String>,
) -> Result<HashMap<String, FileBadge>, String> {
    Ok(get_file_badges_inner(&state, &file_paths))
}

/// Pure helper for [`get_file_badges`].
pub fn get_file_badges_inner(state: &WatcherState, file_paths: &[String]) -> HashMap<String, FileBadge> {
    let mut out: HashMap<String, FileBadge> = HashMap::new();
    for fp in file_paths {
        if !state.is_path_allowed(Path::new(fp)) {
            continue;
        }
        let sidecar = match crate::core::sidecar::load_sidecar(fp) {
            Ok(Some(s)) => s,
            Ok(None) => continue,
            Err(e) => {
                tracing::warn!("[get_file_badges] could not load {fp}: {e}");
                continue;
            }
        };
        if sidecar.comments.is_empty() {
            continue;
        }
        let content = std::fs::read_to_string(fp).unwrap_or_default();
        let lines: Vec<&str> = content.lines().collect();
        let matched = crate::core::matching::match_comments(&sidecar.comments, &lines);
        let threads = crate::core::threads::group_into_threads(&matched);
        let mut count = 0u32;
        let mut worst = Severity::None;
        for t in &threads {
            let unresolved = !t.root.comment.resolved
                || t.replies.iter().any(|r| !r.comment.resolved);
            if !unresolved {
                continue;
            }
            count += 1;
            let s = max_severity(t);
            if s > worst {
                worst = s;
            }
        }
        if count > 0 {
            out.insert(
                fp.clone(),
                FileBadge {
                    count,
                    max_severity: worst,
                },
            );
        }
    }
    out
}

/// Render a markdown digest of every thread under `workspace`. Threads are
/// aggregated by scanning every `*.review.{yaml,json}` sidecar reachable from
/// the workspace root via `core::scanner`.
#[tauri::command]
pub fn export_review_summary(
    state: State<'_, WatcherState>,
    workspace: String,
) -> Result<String, String> {
    enforce_workspace_path(&state, &workspace)?;
    Ok(export_review_summary_inner(&workspace))
}

/// Pure helper for [`export_review_summary`] — no workspace guard, no IPC.
pub fn export_review_summary_inner(workspace: &str) -> String {
    let root = Path::new(workspace);
    let pairs = crate::core::scanner::find_review_files(workspace, 10_000);
    let mut by_path: std::collections::BTreeMap<String, Vec<CommentThread>> =
        std::collections::BTreeMap::new();
    for (_sidecar_path, file_path) in pairs {
        let sidecar = match crate::core::sidecar::load_sidecar(&file_path) {
            Ok(Some(s)) => s,
            _ => continue,
        };
        if sidecar.comments.is_empty() {
            continue;
        }
        let content = std::fs::read_to_string(&file_path).unwrap_or_default();
        let lines: Vec<&str> = content.lines().collect();
        let matched = crate::core::matching::match_comments(&sidecar.comments, &lines);
        let threads = crate::core::threads::group_into_threads(&matched);
        by_path.insert(file_path, threads);
    }
    let view: crate::core::export::WorkspaceThreads = by_path
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_slice()))
        .collect();
    crate::core::export::export_summary(root, &view)
}

/// Batch: count unresolved comments for each file path.
/// Returns a map of file_path → unresolved count. Skips files without sidecars.
///
/// Retained for backward-compat with the C-group consumers (TabBar /
/// FolderTree). Will be removed once those migrate to `get_file_badges`.
#[tauri::command]
pub fn get_unresolved_counts(
    state: State<'_, WatcherState>,
    file_paths: Vec<String>,
) -> Result<std::collections::HashMap<String, u32>, String> {
    let mut counts = std::collections::HashMap::new();
    for file_path in file_paths {
        if !state.is_path_allowed(Path::new(&file_path)) {
            continue;
        }
        match crate::core::sidecar::load_sidecar(&file_path) {
            Ok(Some(sidecar)) => {
                let unresolved = sidecar.comments.iter().filter(|c| !c.resolved).count() as u32;
                if unresolved > 0 {
                    counts.insert(file_path, unresolved);
                }
            }
            Ok(None) => {}
            Err(e) => {
                tracing::warn!("Could not load sidecar for {file_path}: {e}");
            }
        }
    }
    Ok(counts)
}
