//! File-system commands that back the built-in Explorer tab.
//!
//! All operations are synchronous (no async/await needed since `invoke` runs
//! them on a Tauri thread-pool worker automatically). Errors are returned as
//! `Result<_, String>` so they surface cleanly in the frontend.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::Manager;

// ---------------------------------------------------------------------------
// Types exposed to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// Milliseconds since Unix epoch, 0 if unavailable.
    pub modified: u64,
    /// Lowercase extension without the leading dot, empty for directories.
    pub extension: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Drive {
    /// Display label, e.g. `"C:"`.
    pub name: String,
    /// Absolute root path, e.g. `"C:\\"`.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialDirs {
    pub home: String,
    pub desktop: String,
    pub documents: String,
    pub downloads: String,
    pub pictures: String,
    pub music: String,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let dir = std::fs::read_dir(&path).map_err(|e| format!("Cannot open \"{path}\": {e}"))?;

    let mut entries: Vec<FsEntry> = dir
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            // Skip symlinks so we never follow anything we shouldn't.
            if meta.file_type().is_symlink() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let path_str = entry.path().to_string_lossy().to_string();
            let is_dir = meta.is_dir();
            let size = if is_dir { 0 } else { meta.len() };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let extension = if is_dir {
                String::new()
            } else {
                entry
                    .path()
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
            };
            Some(FsEntry { name, path: path_str, is_dir, size, modified, extension })
        })
        .collect();

    // Folders first, then alphabetical (case-insensitive) within each group.
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn get_drives() -> Vec<Drive> {
    platform_drives()
}

#[cfg(target_os = "windows")]
fn platform_drives() -> Vec<Drive> {
    (b'A'..=b'Z')
        .filter_map(|c| {
            let letter = char::from(c);
            let path = format!("{letter}:\\");
            std::fs::metadata(&path).ok().map(|_| Drive {
                name: format!("{letter}:"),
                path,
            })
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn platform_drives() -> Vec<Drive> {
    vec![Drive { name: "/".to_string(), path: "/".to_string() }]
}

#[tauri::command]
pub fn get_special_dirs(app: tauri::AppHandle) -> SpecialDirs {
    let p = app.path();
    let s = |r: tauri::Result<PathBuf>| {
        r.map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
    };
    SpecialDirs {
        home:      s(p.home_dir()),
        desktop:   s(p.desktop_dir()),
        documents: s(p.document_dir()),
        downloads: s(p.download_dir()),
        pictures:  s(p.picture_dir()),
        music:     s(p.audio_dir()),
    }
}

#[tauri::command]
pub fn rename_fs_entry(path: String, new_name: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let dest = src
        .parent()
        .ok_or("Cannot rename root")?
        .join(&new_name);
    if dest.exists() {
        return Err(format!("\"{new_name}\" already exists"));
    }
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_fs_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    // Prefer moving to the OS Recycle Bin / Trash for safety.
    match trash::delete(p) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Fallback for paths that the trash crate can't handle.
            if p.is_dir() {
                std::fs::remove_dir_all(p).map_err(|e| e.to_string())
            } else {
                std::fs::remove_file(p).map_err(|e| e.to_string())
            }
        }
    }
}

#[tauri::command]
pub fn create_folder(path: String) -> Result<(), String> {
    // Find a unique name if "New folder" already exists.
    let base = PathBuf::from(&path);
    let target = unique_path(&base);
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn move_fs_entry(src: String, dest: String) -> Result<(), String> {
    std::fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_fs_entry(src: String, dest: String) -> Result<(), String> {
    let src = PathBuf::from(&src);
    let dest = PathBuf::from(&dest);
    if src.is_dir() {
        copy_dir_all(&src, &dest)
    } else {
        std::fs::copy(&src, &dest).map(|_| ()).map_err(|e| e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find a non-conflicting path by appending ` (2)`, ` (3)`, … to the stem.
fn unique_path(base: &Path) -> PathBuf {
    if !base.exists() {
        return base.to_path_buf();
    }
    let stem = base.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let ext = base.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = base.parent().unwrap_or(Path::new("."));
    for n in 2.. {
        let candidate = parent.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

fn copy_dir_all(src: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dest_path)?;
        } else {
            std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
