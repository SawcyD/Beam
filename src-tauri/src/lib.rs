//! Beam backend entry point: wires up shared state, the mDNS discovery, the TCP
//! receive listener, and the Tauri command surface the frontend calls.

mod discovery;
mod protocol;
mod state;
mod transfer;

use tauri::{AppHandle, Manager, State};

use protocol::Device;
use state::{AppState, Settings};

// ---------------------------------------------------------------------------
// Commands (Rust functions callable from the frontend)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_device_name(state: State<AppState>) -> String {
    state.inner.settings.lock().unwrap().device_name.clone()
}

#[tauri::command]
fn set_device_name(state: State<AppState>, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Device name cannot be empty".to_string());
    }
    state.inner.settings.lock().unwrap().device_name = name.clone();
    state.save_settings()?;
    // Re-advertise so peers see the new name without a restart.
    discovery::reregister_name(&state, &name)
}

#[tauri::command]
fn list_devices(state: State<AppState>) -> Vec<Device> {
    state.inner.peers.lock().unwrap().values().cloned().collect()
}

#[tauri::command]
fn send_files(
    app: AppHandle,
    state: State<AppState>,
    addr: String,
    paths: Vec<String>,
) -> Result<String, String> {
    transfer::spawn_send(app, (*state).clone(), addr, paths)
}

#[tauri::command]
fn respond_to_offer(
    state: State<AppState>,
    transfer_id: String,
    accept: bool,
    save_dir: Option<String>,
) -> Result<(), String> {
    let sender = state
        .inner
        .pending_offers
        .lock()
        .unwrap()
        .remove(&transfer_id);
    match sender {
        Some(tx) => tx
            .send((accept, save_dir))
            .map_err(|_| "The transfer is no longer waiting for a decision".to_string()),
        None => Err("No pending offer with that id".to_string()),
    }
}

#[tauri::command]
fn cancel_transfer(state: State<AppState>, transfer_id: String) {
    if let Some(flag) = state.inner.cancels.lock().unwrap().get(&transfer_id) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    // If the transfer is still waiting on a user decision, also unblock it as a reject.
    if let Some(tx) = state
        .inner
        .pending_offers
        .lock()
        .unwrap()
        .remove(&transfer_id)
    {
        let _ = tx.send((false, None));
    }
}

#[tauri::command]
fn get_default_save_dir(state: State<AppState>) -> String {
    state.inner.settings.lock().unwrap().default_save_dir.clone()
}

#[tauri::command]
fn set_default_save_dir(state: State<AppState>, path: String) -> Result<(), String> {
    state.inner.settings.lock().unwrap().default_save_dir = path;
    state.save_settings()
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Resolve platform dirs via Tauri (never hardcode paths).
            let config_path = handle
                .path()
                .app_config_dir()
                .expect("app config dir")
                .join("settings.json");
            let default_save_dir = handle
                .path()
                .download_dir()
                .map(|d| d.join("Beam"))
                .unwrap_or_else(|_| std::path::PathBuf::from("Beam"))
                .to_string_lossy()
                .to_string();

            let defaults = Settings {
                device_name: default_device_name(),
                default_save_dir,
                theme: "dark".to_string(),
            };
            let our_id = uuid::Uuid::new_v4().to_string();
            let app_state = AppState::load(config_path, defaults, our_id);
            app.manage(app_state.clone());

            // Bind the receive listener first so we can advertise the real port.
            let device_name = app_state.inner.settings.lock().unwrap().device_name.clone();
            let port = tauri::async_runtime::block_on(transfer::listen(handle.clone(), app_state.clone()))
                .expect("failed to start receive listener");

            if let Err(e) = discovery::start(handle, app_state, port, device_name) {
                eprintln!("discovery failed to start: {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_device_name,
            set_device_name,
            list_devices,
            send_files,
            respond_to_offer,
            cancel_transfer,
            get_default_save_dir,
            set_default_save_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beam");
}

/// A friendly default device name derived from the machine hostname.
fn default_device_name() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Beam Device".to_string())
}
