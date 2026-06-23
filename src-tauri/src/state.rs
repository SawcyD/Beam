//! Process-wide shared state: persisted settings, the live peer table, pending
//! incoming-offer decisions, and per-transfer cancel flags.
//!
//! Everything lives behind `Arc<Inner>` so background tasks (the TCP accept loop,
//! individual send/receive jobs) can cheaply clone a handle to the shared maps.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use crate::protocol::Device;

/// The receiver's answer to an incoming offer: whether to accept, and where to
/// save the files if so.
pub type OfferDecision = (bool, Option<String>);

/// User-facing settings persisted to a small JSON file in the app config dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub device_name: String,
    pub default_save_dir: String,
    /// "dark" | "light" — reserved for the backlog theme toggle.
    pub theme: String,
}

/// Shared, cloneable handle to all mutable app state.
#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<Inner>,
}

pub struct Inner {
    pub settings: Mutex<Settings>,
    /// Where `settings` is persisted.
    pub config_path: PathBuf,
    /// Discovered LAN peers, keyed by their stable device id.
    pub peers: Mutex<HashMap<String, Device>>,
    /// Receivers awaiting a user decision, keyed by transfer id.
    pub pending_offers: Mutex<HashMap<String, oneshot::Sender<OfferDecision>>>,
    /// Cancellation flags for in-flight transfers, keyed by transfer id.
    pub cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Our own device id, used to filter ourselves out of discovery results.
    pub our_id: String,
    /// mDNS re-registration hook, populated once discovery is running, so a
    /// device-name change can re-advertise without a restart.
    pub mdns: Mutex<Option<MdnsHandle>>,
}

/// Enough state to re-advertise our mDNS service when the device name changes.
pub struct MdnsHandle {
    pub daemon: mdns_sd::ServiceDaemon,
    pub host_name: String,
    pub port: u16,
}

impl AppState {
    /// Load settings from `config_path`, falling back to the supplied defaults
    /// (and writing them out) when the file is missing or unreadable.
    pub fn load(config_path: PathBuf, defaults: Settings, our_id: String) -> Self {
        let settings = std::fs::read_to_string(&config_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
            .unwrap_or_else(|| {
                // First run (or corrupt file): persist the defaults so the user
                // sees a stable name/dir on the next launch.
                let _ = write_settings(&config_path, &defaults);
                defaults
            });

        AppState {
            inner: Arc::new(Inner {
                settings: Mutex::new(settings),
                config_path,
                peers: Mutex::new(HashMap::new()),
                pending_offers: Mutex::new(HashMap::new()),
                cancels: Mutex::new(HashMap::new()),
                our_id,
                mdns: Mutex::new(None),
            }),
        }
    }

    /// Persist the current settings to disk. Best-effort: returns a String error
    /// suitable for surfacing to the frontend.
    pub fn save_settings(&self) -> Result<(), String> {
        let settings = self.inner.settings.lock().unwrap().clone();
        write_settings(&self.inner.config_path, &settings).map_err(|e| e.to_string())
    }

    /// Register a fresh cancel flag for a transfer and return it. The same flag
    /// is shared with whoever drives the transfer loop.
    pub fn new_cancel_flag(&self, transfer_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.inner
            .cancels
            .lock()
            .unwrap()
            .insert(transfer_id.to_string(), flag.clone());
        flag
    }

    /// Drop a transfer's cancel flag once it has finished.
    pub fn clear_cancel_flag(&self, transfer_id: &str) {
        self.inner.cancels.lock().unwrap().remove(transfer_id);
    }
}

fn write_settings(path: &PathBuf, settings: &Settings) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, json)
}
