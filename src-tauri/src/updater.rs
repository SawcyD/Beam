//! Update checker: periodically poll for new Beam releases and notify the user.
//!
//! Uses Tauri's built-in updater plugin which reads from the update server
//! configured in tauri.conf.json. In production this would point to a real
//! update endpoint; for now it's a no-op (the updater gracefully handles no
//! update server being configured).

use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// Check for updates once on startup and optionally on a timer.
/// Returns `true` if an update is available.
pub async fn check_for_updates(app: AppHandle) -> Result<bool, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Update check failed: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let body = update.body.clone().unwrap_or_default();
            let _ = app.emit(
                "update-available",
                serde_json::json!({
                    "version": version,
                    "body": body,
                }),
            );
            Ok(true)
        }
        Ok(None) => Ok(false),
        Err(e) => Err(format!("Update check failed: {e}")),
    }
}

/// Perform the update: downloads the new version and installs it (requires a restart).
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("Update check failed: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => {
            // download_and_install requires progress callbacks; provide no-op closures.
            update
                .download_and_install(
                    |_chunk_len, _total| {}, // progress callback
                    || {},                   // completion callback
                )
                .await
                .map_err(|e| format!("Update installation failed: {e}"))?;
            Ok(())
        }
        Ok(None) => Err("No update available".to_string()),
        Err(e) => Err(format!("Update check failed: {e}")),
    }
}
