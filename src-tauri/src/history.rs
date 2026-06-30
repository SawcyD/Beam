//! Persistent transfer history — a rolling JSON log of the last 500 transfers.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MAX_ENTRIES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub direction: String,
    pub peer_name: String,
    pub file_count: usize,
    pub total_bytes: u64,
    /// "done" | "failed" | "cancelled" | "declined"
    pub status: String,
    pub message: String,
    pub save_dir: Option<String>,
    pub timestamp_ms: u64,
    /// Optional note the sender attached to the transfer.
    #[serde(default)]
    pub note: Option<String>,
    /// Name of the first (or only) file in the transfer.
    #[serde(default)]
    pub file_name: Option<String>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Append an entry and trim to `MAX_ENTRIES`. Best-effort: errors are ignored
/// so a history write failure never affects the transfer itself.
pub fn append(path: &Path, entry: HistoryEntry) {
    let mut entries = load(path);
    entries.push(entry);
    if entries.len() > MAX_ENTRIES {
        entries.drain(0..entries.len() - MAX_ENTRIES);
    }
    if let Ok(json) = serde_json::to_string_pretty(&entries) {
        let _ = std::fs::write(path, json);
    }
}

pub fn load(path: &Path) -> Vec<HistoryEntry> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn clear(path: &Path) {
    let _ = std::fs::write(path, "[]");
}

/// Remove a single entry by id. Best-effort.
pub fn delete_entry(path: &Path, id: &str) {
    let mut entries = load(path);
    entries.retain(|e| e.id != id);
    if let Ok(json) = serde_json::to_string_pretty(&entries) {
        let _ = std::fs::write(path, json);
    }
}
