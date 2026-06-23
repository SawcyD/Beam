//! Watch folder auto-send: monitor a folder for new files and send them to a peer.
//!
//! A user configures `watch_path` and `peer_id`, and Beam monitors the folder
//! for create events. New files are automatically staged and sent (via `send_files`).
//! Watches are persisted in settings so they resume across restarts.

use std::path::PathBuf;

use notify::{RecursiveMode, Result as NotifyResult, Watcher};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::state::AppState;
use crate::transfer;

/// Configuration for one watch folder: where to watch and which peer to send to.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchConfig {
    pub id: String,
    pub path: String,
    pub peer_id: String,
    pub peer_name: String,
    pub enabled: bool,
}

/// Start monitoring a folder for new files. Returns the watch id.
pub fn add_watch(
    app: AppHandle,
    state: AppState,
    path: String,
    peer_id: String,
    peer_name: String,
) -> Result<String, String> {
    let watch_id = uuid::Uuid::new_v4().to_string();
    let config = WatchConfig {
        id: watch_id.clone(),
        path: path.clone(),
        peer_id: peer_id.clone(),
        peer_name: peer_name.clone(),
        enabled: true,
    };

    // Add to the watch list (persisted in state).
    state
        .inner
        .watches
        .lock()
        .unwrap()
        .insert(watch_id.clone(), config);
    let _ = state.save_watches();

    // Start the file system watcher on a background task.
    let state_bg = state.clone();
    let watch_id_bg = watch_id.clone();
    let app_bg = app.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) =
            watch_folder(app_bg, state_bg, watch_id_bg, path, peer_id, peer_name).await
        {
            eprintln!("Watch folder error: {e}");
        }
    });

    Ok(watch_id)
}

/// Stop monitoring a watch folder.
pub fn remove_watch(state: &AppState, watch_id: &str) -> Result<(), String> {
    state.inner.watches.lock().unwrap().remove(watch_id);
    state.save_watches()
}

/// Toggle a watch on/off.
pub fn toggle_watch(state: &AppState, watch_id: &str, enabled: bool) -> Result<(), String> {
    let mut watches = state.inner.watches.lock().unwrap();
    if let Some(config) = watches.get_mut(watch_id) {
        config.enabled = enabled;
    }
    drop(watches);
    state.save_watches()
}

/// Get the current list of watched folders.
pub fn list_watches(state: &AppState) -> Vec<WatchConfig> {
    state
        .inner
        .watches
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect()
}

/// Main watch loop: monitor a folder and send new files to a peer.
async fn watch_folder(
    app: AppHandle,
    state: AppState,
    watch_id: String,
    path: String,
    peer_id: String,
    _peer_name: String,
) -> Result<(), String> {
    let path = PathBuf::from(&path);

    // Create the folder if it doesn't exist.
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| format!("Could not create watch folder: {e}"))?;

    // Set up the file system watcher.
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(32);
    let path2 = path.clone();

    std::thread::spawn(move || {
        if let Err(e) = watch_thread(path2, tx) {
            eprintln!("Watch thread error: {e}");
        }
    });

    // Listen for file create events and send them.
    let send_delay = std::time::Duration::from_millis(500); // grace period before sending
    let mut pending: Option<(String, std::time::Instant)> = None;

    loop {
        let now = std::time::Instant::now();

        // Check if this watch is still enabled; if disabled, exit.
        let enabled = state
            .inner
            .watches
            .lock()
            .unwrap()
            .get(&watch_id)
            .map(|w| w.enabled)
            .unwrap_or(false);
        if !enabled {
            break;
        }

        // Process pending file (send after a grace period so temp files are written).
        if let Some((file_path, queued_at)) = &pending {
            if now.duration_since(*queued_at) > send_delay {
                let to_send = file_path.clone();
                pending = None;

                // Find the peer again (it may have gone offline/online).
                let devices = state.inner.peers.lock().unwrap();
                let current_peer = devices
                    .values()
                    .find(|d| d.id == peer_id)
                    .cloned();
                drop(devices);

                if let Some(peer) = current_peer {
                    // Send the file in the background.
                    let app_clone = app.clone();
                    let state_clone = state.clone();
                    let paths = vec![to_send.clone()];
                    tauri::async_runtime::spawn(async move {
                        match transfer::spawn_send(app_clone, state_clone, peer.addr, paths) {
                            Ok(_tid) => {
                                // Optional: emit a watch-auto-send event
                            }
                            Err(e) => eprintln!("Auto-send failed: {e}"),
                        }
                    });
                }
            }
        }

        // Check if there's a new file event (with a small timeout so we don't spin).
        match tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv()).await {
            Ok(Some(file_path)) => {
                // A file was created. Queue it for sending after a grace period.
                pending = Some((file_path, now));
            }
            _ => {} // timeout or channel closed
        }

        // Check every 100ms if the watch is still enabled.
    }

    Ok(())
}

/// Blocking thread that monitors the folder and sends file paths over a channel.
fn watch_thread(path: PathBuf, tx: tokio::sync::mpsc::Sender<String>) -> NotifyResult<()> {
    let mut watcher = notify::recommended_watcher(move |res: NotifyResult<notify::Event>| {
        match res {
            Ok(event) => {
                // Only care about file creates, not deletes/modifies.
                if event.kind == notify::EventKind::Create(notify::event::CreateKind::File) {
                    for p in &event.paths {
                        if p.is_file() {
                            let path_str = p.to_string_lossy().to_string();
                            let _ = tx.blocking_send(path_str);
                        }
                    }
                }
            }
            Err(_e) => {} // Ignore watch errors; they're usually transient.
        }
    })?;

    watcher.watch(&path, RecursiveMode::NonRecursive)?;

    // Keep the watcher alive (this thread never exits unless an error occurs).
    std::thread::sleep(std::time::Duration::from_secs(u64::MAX));
    Ok(())
}
