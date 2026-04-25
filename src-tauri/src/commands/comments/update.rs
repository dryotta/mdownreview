//! `update_comment` — consolidated patch surface for per-comment mutations.

use super::{enforce_workspace_path, CommentsChangedEvent};
use crate::core::types::Reaction;
use crate::watcher::WatcherState;
use tauri::{Emitter, State};

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

/// Apply a [`CommentPatch`] to a single comment.
#[tauri::command]
pub fn update_comment(
    app: tauri::AppHandle,
    state: State<'_, WatcherState>,
    file_path: String,
    comment_id: String,
    patch: CommentPatch,
) -> Result<(), String> {
    enforce_workspace_path(&state, &file_path)?;
    let changed = update_comment_apply(&file_path, &comment_id, patch)?;
    if changed {
        let _ = app.emit_to(
            "main",
            "comments-changed",
            CommentsChangedEvent {
                file_path: file_path.clone(),
            },
        );
    }
    Ok(())
}

/// Pure helper for [`update_comment`] — no `AppHandle`, no event emission.
/// Returns `true` if the sidecar was actually mutated, `false` for no-ops
/// (e.g. `SetResolved { resolved }` matching the comment's current state)
/// so the IPC entry point can skip both the save and the event emission.
pub fn update_comment_apply(
    file_path: &str,
    comment_id: &str,
    patch: CommentPatch,
) -> Result<bool, String> {
    let mut sidecar = crate::core::sidecar::load_sidecar(file_path)
        .map_err(|e| e.to_string())?
        .ok_or("sidecar not found")?;
    let comment = sidecar
        .comments
        .iter_mut()
        .find(|c| c.id == comment_id)
        .ok_or_else(|| format!("comment {} not found", comment_id))?;
    let mutated = match patch {
        CommentPatch::AddReaction { user, kind, ts } => {
            let list = comment.reactions.get_or_insert_with(Vec::new);
            if list.iter().any(|r| r.user == user && r.kind == kind) {
                false
            } else {
                list.push(Reaction { user, kind, ts });
                true
            }
        }
        CommentPatch::SetResolved { resolved } => {
            // Compare-then-write: skip the save+emit cycle entirely if the
            // resolved bit isn't actually changing. Prevents the renderer
            // from getting an "events storm" of `comments-changed` for
            // no-op resolves (bug-hunter #9).
            if comment.resolved == resolved {
                false
            } else {
                comment.resolved = resolved;
                true
            }
        }
    };
    if mutated {
        crate::core::sidecar::save_sidecar(file_path, &sidecar.document, &sidecar.comments)
            .map_err(|e| e.to_string())?;
    }
    Ok(mutated)
}
