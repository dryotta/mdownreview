use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherState {
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
    /// Sending on this channel wakes the watcher thread to sync dirs immediately.
    sync_tx: std::sync::mpsc::SyncSender<()>,
}

impl WatcherState {
    pub fn new(sync_tx: std::sync::mpsc::SyncSender<()>) -> Self {
        Self {
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
            sync_tx,
        }
    }
}

/// Event payload sent to the frontend
#[derive(Clone, serde::Serialize)]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String, // "content" | "review" | "deleted"
}

/// Wrapper so AppHandle can store the receiver end of the sync channel.
pub struct SyncRx(pub Mutex<Option<std::sync::mpsc::Receiver<()>>>);

/// Start the file watcher. Should be called once during app setup.
pub fn start_watcher(app: &AppHandle) {
    let state = app.state::<WatcherState>();
    let watched = Arc::clone(&state.watched_paths);
    let app_handle = app.clone();

    // Take the sync_rx out of managed state — the watcher thread owns it exclusively.
    let sync_rx = app
        .state::<SyncRx>()
        .inner()
        .0
        .lock()
        .expect("sync_rx lock")
        .take()
        .expect("sync_rx already consumed");

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(300), tx) {
            Ok(d) => d,
            Err(e) => {
                tracing::error!("[watcher] failed to create debouncer: {}", e);
                return;
            }
        };

        let mut watched_dirs: HashSet<PathBuf> = HashSet::new();

        loop {
            // Drain any sync signals — their presence means watched_paths changed
            // and we must re-sync dirs immediately after processing events.
            let mut needs_sync = false;
            while sync_rx.try_recv().is_ok() {
                needs_sync = true;
            }

            // Process debounced file-change events (200ms timeout for responsiveness).
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Ok(events)) => {
                    let current_watched = lock_watched(&watched);
                    for event in events {
                        if event.kind != DebouncedEventKind::Any {
                            continue;
                        }
                        let path = &event.path;
                        let canonical = std::fs::canonicalize(path)
                            .unwrap_or_else(|_| path.clone());
                        if current_watched.contains(&canonical)
                            || current_watched.contains(path)
                        {
                            let path_str = path.to_string_lossy().to_string();
                            let is_review = path_str.ends_with(".review.yaml")
                                || path_str.ends_with(".review.json");
                            let exists = path.exists();
                            let kind = match (is_review, exists) {
                                (_, false) => "deleted",
                                (true, true) => "review",
                                (false, true) => "content",
                            };
                            tracing::debug!("[watcher] file change: {} ({})", path_str, kind);
                            let _ = app_handle.emit(
                                "file-changed",
                                FileChangeEvent {
                                    path: path_str,
                                    kind: kind.to_string(),
                                },
                            );
                        }
                    }
                    needs_sync = true;
                }
                Ok(Err(e)) => {
                    tracing::warn!("[watcher] notify error: {}", e);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    tracing::info!("[watcher] channel disconnected, stopping");
                    break;
                }
            }

            if needs_sync {
                sync_dirs(&watched, &mut watched_dirs, &mut debouncer);
            }
        }
    });
}

fn lock_watched(watched: &Arc<Mutex<HashSet<PathBuf>>>) -> HashSet<PathBuf> {
    match watched.lock() {
        Ok(g) => g.clone(),
        Err(p) => {
            tracing::warn!("[watcher] mutex poisoned, recovering");
            p.into_inner().clone()
        }
    }
}

fn sync_dirs(
    watched: &Arc<Mutex<HashSet<PathBuf>>>,
    watched_dirs: &mut HashSet<PathBuf>,
    debouncer: &mut notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
) {
    let current_watched = lock_watched(watched);
    let needed: HashSet<PathBuf> = current_watched
        .iter()
        .filter_map(|p| p.parent().map(|d| d.to_path_buf()))
        .collect();

    for dir in &needed {
        if !watched_dirs.contains(dir) && dir.exists() {
            if let Err(e) = debouncer
                .watcher()
                .watch(dir, notify::RecursiveMode::NonRecursive)
            {
                tracing::warn!("[watcher] failed to watch {:?}: {}", dir, e);
            } else {
                tracing::debug!("[watcher] watching dir: {:?}", dir);
                watched_dirs.insert(dir.clone());
            }
        }
    }

    let stale: Vec<PathBuf> = watched_dirs.difference(&needed).cloned().collect();
    for dir in stale {
        let _ = debouncer.watcher().unwatch(&dir);
        watched_dirs.remove(&dir);
        tracing::debug!("[watcher] unwatched dir: {:?}", dir);
    }
}

/// Tauri command: update the set of watched file paths.
/// The frontend calls this whenever the set of open tabs changes.
#[tauri::command]
pub fn update_watched_files(
    paths: Vec<String>,
    state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    let mut watched = state.watched_paths.lock().map_err(|e| e.to_string())?;
    watched.clear();

    for path_str in &paths {
        let path = PathBuf::from(path_str);
        if let Ok(canonical) = std::fs::canonicalize(&path) {
            watched.insert(canonical);
        } else {
            watched.insert(path.clone());
        }
        // Also watch sidecars
        for ext in &[".review.yaml", ".review.json"] {
            let sidecar = PathBuf::from(format!("{}{}", path_str, ext));
            if let Ok(canonical) = std::fs::canonicalize(&sidecar) {
                watched.insert(canonical);
            } else {
                watched.insert(sidecar);
            }
        }
    }

    tracing::debug!("[watcher] updated watched files: {} paths", watched.len());
    // Signal the watcher thread to sync dirs immediately (non-blocking: drop if full).
    let _ = state.sync_tx.try_send(());
    Ok(())
}
