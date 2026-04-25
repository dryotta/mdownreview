//! `export_review_summary` — workspace-wide markdown digest.

use super::enforce_workspace_path;
use crate::core::types::CommentThread;
use crate::watcher::WatcherState;
use std::path::Path;
use tauri::State;

/// Render a markdown digest of every thread under `workspace`. Threads are
/// aggregated by scanning every `*.review.{yaml,json}` sidecar reachable
/// from the workspace root via `core::scanner`.
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
    let workspace_path = Path::new(workspace);

    // Iter 6 forward-fix B7 — when the user launched mdownreview on a
    // single source file (no workspace root), `workspace` is that file's
    // path, not a directory. Detect that case, scan the parent directory,
    // and filter to that single file's sidecar so we still produce a
    // sensible summary instead of an empty one.
    let (root, single_file): (&Path, Option<String>) = if workspace_path.is_file() {
        let parent = workspace_path.parent().unwrap_or(Path::new(""));
        (parent, Some(workspace.to_string()))
    } else {
        (workspace_path, None)
    };

    let scan_root = root.to_string_lossy().to_string();
    let pairs = crate::core::scanner::find_review_files(&scan_root, 10_000);
    let mut by_path: std::collections::BTreeMap<String, Vec<CommentThread>> =
        std::collections::BTreeMap::new();
    for (_sidecar_path, file_path) in pairs {
        if let Some(target) = single_file.as_ref() {
            if &file_path != target {
                continue;
            }
        }
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
