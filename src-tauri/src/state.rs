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
use crate::watch::WatchConfig;

/// The receiver's answer to an incoming offer: whether to accept, and where to
/// save the files if so.
pub type OfferDecision = (bool, Option<String>);

/// A device the user has explicitly trusted; incoming transfers from it are
/// auto-accepted without a prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDevice {
    pub id: String,
    pub name: String,
}

/// A named group of devices — send to all members in one click.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceGroup {
    pub id: String,
    pub name: String,
    /// Matched against peer device names (case-sensitive).
    pub device_names: Vec<String>,
}

/// User-facing settings persisted to a small JSON file in the app config dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub device_name: String,
    pub default_save_dir: String,
    /// "dark" | "light" | "system"
    #[serde(default = "default_theme")]
    pub theme: String,
    /// What to do when a received file already exists at the destination:
    /// "rename" (keep both, add suffix) | "overwrite" | "skip"
    #[serde(default = "default_conflict_policy")]
    pub conflict_policy: String,
    /// Devices whose transfers are auto-accepted without a prompt.
    #[serde(default)]
    pub trusted_devices: Vec<TrustedDevice>,
    /// Maximum bytes per second for outbound transfers; None = unlimited.
    #[serde(default)]
    pub bandwidth_limit: Option<u64>,
    /// User-defined groups of devices for batch sends.
    #[serde(default)]
    pub groups: Vec<DeviceGroup>,
    /// Show an approval dialog before accepting any incoming transfer.
    /// When false, all transfers are auto-accepted to the default save dir.
    #[serde(default = "default_ask_before_receiving")]
    pub ask_before_receiving: bool,
    /// Hide the window to the system tray when the user minimises it.
    #[serde(default)]
    pub minimize_to_tray: bool,
    /// Which tab to open on launch ("transfer" | "explorer" | "history" | "settings").
    /// None falls back to "transfer".
    #[serde(default)]
    pub launch_tab: Option<String>,
}

fn default_theme() -> String { "dark".to_string() }
fn default_conflict_policy() -> String { "rename".to_string() }
fn default_ask_before_receiving() -> bool { true }

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
    /// Watched folders for auto-send, keyed by watch id.
    pub watches: Mutex<HashMap<String, WatchConfig>>,
    /// Where watches are persisted.
    pub watches_path: PathBuf,
    /// Where transfer history is persisted.
    pub history_path: PathBuf,
    /// Our own device id, used to filter ourselves out of discovery results.
    pub our_id: String,
    /// mDNS re-registration hook, populated once discovery is running, so a
    /// device-name change can re-advertise without a restart.
    pub mdns: Mutex<Option<MdnsHandle>>,
    /// The TCP port we're listening on — set once by `transfer::listen`.
    pub tcp_port: Mutex<u16>,
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

        // Derive the watches file path from the config dir.
        let watches_path = config_path
            .parent()
            .map(|p| p.join("watches.json"))
            .unwrap_or_else(|| PathBuf::from("watches.json"));

        let history_path = config_path
            .parent()
            .map(|p| p.join("history.json"))
            .unwrap_or_else(|| PathBuf::from("history.json"));

        let watches = std::fs::read_to_string(&watches_path)
            .ok()
            .and_then(|raw| {
                serde_json::from_str::<Vec<WatchConfig>>(&raw)
                    .ok()
                    .map(|v| v.into_iter().map(|w| (w.id.clone(), w)).collect())
            })
            .unwrap_or_default();

        AppState {
            inner: Arc::new(Inner {
                settings: Mutex::new(settings),
                config_path,
                peers: Mutex::new(HashMap::new()),
                pending_offers: Mutex::new(HashMap::new()),
                cancels: Mutex::new(HashMap::new()),
                watches: Mutex::new(watches),
                watches_path,
                history_path,
                our_id,
                mdns: Mutex::new(None),
                tcp_port: Mutex::new(0),
            }),
        }
    }

    /// Persist the current settings to disk. Best-effort: returns a String error
    /// suitable for surfacing to the frontend.
    pub fn save_settings(&self) -> Result<(), String> {
        let settings = self.inner.settings.lock().unwrap().clone();
        write_settings(&self.inner.config_path, &settings).map_err(|e| e.to_string())
    }

    /// Persist the current watches to disk.
    pub fn save_watches(&self) -> Result<(), String> {
        let watches: Vec<WatchConfig> = self
            .inner
            .watches
            .lock()
            .unwrap()
            .values()
            .cloned()
            .collect();
        let json = serde_json::to_string_pretty(&watches)
            .map_err(|e| format!("Serialize watches: {e}"))?;
        std::fs::write(&self.inner.watches_path, json)
            .map_err(|e| format!("Write watches: {e}"))
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

    /// Returns true if `device_id` is in the trusted-devices list.
    pub fn is_trusted(&self, device_id: &str) -> bool {
        if device_id.is_empty() {
            return false;
        }
        self.inner
            .settings
            .lock()
            .unwrap()
            .trusted_devices
            .iter()
            .any(|d| d.id == device_id)
    }
}

fn write_settings(path: &PathBuf, settings: &Settings) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, json)
}
