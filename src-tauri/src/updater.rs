//! Update checker: periodically poll for new Beam releases and notify the user.
//!
//! Uses Tauri's built-in updater plugin which reads from the update server
//! configured in tauri.conf.json. In production this would point to a real
//! update endpoint; for now it's a no-op (the updater gracefully handles no
//! update server being configured).

use tauri::{AppHandle, Emitter};

/// Check for updates once on startup and optionally on a timer.
/// Returns `true` if an update is available.
pub async fn check_for_updates(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_updater::TauriUpdaterExt;

    let update = app
        .updater()
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?;

    if update.is_update_available() {
        let version = update.latest_version();
        let body = update.body().unwrap_or("New version available");
        let _ = app.emit("update-available", serde_json::json!({
            "version": version,
            "body": body,
        }));
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Perform the update: downloads the new version and installs it (requires a restart).
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::TauriUpdaterExt;

    let update = app
        .updater()
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?;

    if update.is_update_available() {
        update
            .download_and_install()
            .await
            .map_err(|e| format!("Update installation failed: {e}"))?;
        // After install, the app should be restarted for the new version to take effect.
        Ok(())
    } else {
        Err("No update available".to_string())
    }
}
