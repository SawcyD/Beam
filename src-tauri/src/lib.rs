//! Beam backend entry point: wires up shared state, the mDNS discovery, the TCP
//! receive listener, and the Tauri command surface the frontend calls.

mod discovery;
mod explorer;
mod history;
mod protocol;
mod state;
mod transfer;
mod updater;
mod watch;

use tauri::{AppHandle, Manager, State};

use history::HistoryEntry;
use protocol::Device;
use state::{AppState, DeviceGroup, Settings, TrustedDevice};

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
    peer_name: String,
    paths: Vec<String>,
    note: Option<String>,
) -> Result<String, String> {
    transfer::spawn_send(app, (*state).clone(), addr, peer_name, paths, note)
}

#[tauri::command]
fn send_text(
    app: AppHandle,
    state: State<AppState>,
    addr: String,
    peer_name: String,
    content: String,
) -> Result<String, String> {
    // Write the text to a temp file and send it as a regular transfer.
    let tmp = std::env::temp_dir()
        .join(format!("beam_clip_{}.txt", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, &content)
        .map_err(|e| format!("Could not write clipboard temp file: {e}"))?;
    transfer::spawn_send(
        app,
        (*state).clone(),
        addr,
        peer_name,
        vec![tmp.to_string_lossy().to_string()],
        None, // text sends carry no note
    )
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

#[tauri::command]
fn get_theme(state: State<AppState>) -> String {
    state.inner.settings.lock().unwrap().theme.clone()
}

#[tauri::command]
fn set_theme(state: State<AppState>, theme: String) -> Result<(), String> {
    state.inner.settings.lock().unwrap().theme = theme;
    state.save_settings()
}

#[tauri::command]
fn get_conflict_policy(state: State<AppState>) -> String {
    state.inner.settings.lock().unwrap().conflict_policy.clone()
}

#[tauri::command]
fn set_conflict_policy(state: State<AppState>, policy: String) -> Result<(), String> {
    state.inner.settings.lock().unwrap().conflict_policy = policy;
    state.save_settings()
}

// --- Trusted device commands ---

#[tauri::command]
fn list_trusted_devices(state: State<AppState>) -> Vec<TrustedDevice> {
    state.inner.settings.lock().unwrap().trusted_devices.clone()
}

#[tauri::command]
fn add_trusted_device(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    let mut s = state.inner.settings.lock().unwrap();
    if !s.trusted_devices.iter().any(|d| d.id == id) {
        s.trusted_devices.push(TrustedDevice { id, name });
    }
    drop(s);
    state.save_settings()
}

#[tauri::command]
fn remove_trusted_device(state: State<AppState>, id: String) -> Result<(), String> {
    state
        .inner
        .settings
        .lock()
        .unwrap()
        .trusted_devices
        .retain(|d| d.id != id);
    state.save_settings()
}

// --- History commands ---

#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<HistoryEntry> {
    history::load(&state.inner.history_path)
}

#[tauri::command]
fn clear_history(state: State<AppState>) -> Result<(), String> {
    history::clear(&state.inner.history_path);
    Ok(())
}

// --- Watch folder commands ---

#[tauri::command]
fn add_watch(
    app: tauri::AppHandle,
    state: State<AppState>,
    path: String,
    peer_id: String,
    peer_name: String,
) -> Result<String, String> {
    watch::add_watch(app, (*state).clone(), path, peer_id, peer_name)
}

#[tauri::command]
fn remove_watch(state: State<AppState>, watch_id: String) -> Result<(), String> {
    watch::remove_watch(&state, &watch_id)
}

#[tauri::command]
fn toggle_watch(state: State<AppState>, watch_id: String, enabled: bool) -> Result<(), String> {
    watch::toggle_watch(&state, &watch_id, enabled)
}

#[tauri::command]
fn list_watches(state: State<AppState>) -> Vec<watch::WatchConfig> {
    watch::list_watches(&state)
}

// --- Bandwidth limit ---

#[tauri::command]
fn get_bandwidth_limit(state: State<AppState>) -> Option<u64> {
    state.inner.settings.lock().unwrap().bandwidth_limit
}

#[tauri::command]
fn set_bandwidth_limit(state: State<AppState>, bytes_per_sec: Option<u64>) -> Result<(), String> {
    state.inner.settings.lock().unwrap().bandwidth_limit = bytes_per_sec;
    state.save_settings()
}

// --- Device groups ---

#[tauri::command]
fn get_groups(state: State<AppState>) -> Vec<DeviceGroup> {
    state.inner.settings.lock().unwrap().groups.clone()
}

#[tauri::command]
fn add_group(
    state: State<AppState>,
    name: String,
    device_names: Vec<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    state.inner.settings.lock().unwrap().groups.push(DeviceGroup {
        id: id.clone(),
        name,
        device_names,
    });
    state.save_settings()?;
    Ok(id)
}

#[tauri::command]
fn remove_group(state: State<AppState>, id: String) -> Result<(), String> {
    state.inner.settings.lock().unwrap().groups.retain(|g| g.id != id);
    state.save_settings()
}

// --- Updater commands ---

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<bool, String> {
    updater::check_for_updates(app).await
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    updater::install_update(app).await
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // Apply Windows 11 Mica effect — gives the window the blurred-desktop
            // background that makes Fluent UI look native. No-op on other platforms.
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    let _ = window_vibrancy::apply_mica(&w, None);
                }
            }

            // ── System tray ────────────────────────────────────────────────
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let show = MenuItem::with_id(app, "show", "Show Beam", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit",  "Quit Beam",  true, None::<&str>)?;
                let sep  = tauri::menu::PredefinedMenuItem::separator(app)?;
                let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Beam — LAN File Transfer")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(false) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;

                // Close button hides the window rather than quitting.
                if let Some(win) = app.get_webview_window("main") {
                    let win2 = win.clone();
                    win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win2.hide();
                        }
                    });
                }
            }

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
                conflict_policy: "rename".to_string(),
                trusted_devices: Vec::new(),
                bandwidth_limit: None,
                groups: Vec::new(),
            };
            let our_id = uuid::Uuid::new_v4().to_string();
            let app_state = AppState::load(config_path, defaults, our_id);
            app.manage(app_state.clone());

            let device_name = app_state.inner.settings.lock().unwrap().device_name.clone();
            let port =
                tauri::async_runtime::block_on(transfer::listen(handle.clone(), app_state.clone()))
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
            send_text,
            respond_to_offer,
            cancel_transfer,
            get_default_save_dir,
            set_default_save_dir,
            get_theme,
            set_theme,
            get_conflict_policy,
            set_conflict_policy,
            list_trusted_devices,
            add_trusted_device,
            remove_trusted_device,
            get_history,
            clear_history,
            add_watch,
            remove_watch,
            toggle_watch,
            list_watches,
            check_for_updates,
            install_update,
            get_bandwidth_limit,
            set_bandwidth_limit,
            get_groups,
            add_group,
            remove_group,
            // Explorer
            explorer::list_dir,
            explorer::get_drives,
            explorer::get_special_dirs,
            explorer::rename_fs_entry,
            explorer::delete_fs_entry,
            explorer::create_folder,
            explorer::move_fs_entry,
            explorer::copy_fs_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beam");
}

fn default_device_name() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Beam Device".to_string())
}
