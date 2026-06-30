//! The file-transfer engine: a TCP receive listener and an outbound send path,
//! both speaking the framed control protocol in `protocol.rs`.
//!
//! Layout of a transfer on the wire:
//!   1. sender connects, sends `Offer`
//!   2. receiver replies `Response { accept }`
//!   3. if accepted, sender streams each file's raw bytes in offer order
//!   4. receiver hashes as it writes and verifies SHA-256 per file
//! Both sides emit `transfer-progress` throughout and a final `transfer-done`.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::history::{self, HistoryEntry};
use crate::protocol::{
    read_control, write_control, Control, FileMeta, HashProgress, IncomingOffer, ProgressEvent,
    TransferDone, DIRECTION_RECEIVE, DIRECTION_SEND,
};
use crate::state::AppState;

/// Payload chunk size. 256 KiB keeps syscall overhead low without making
/// progress updates feel coarse.
const CHUNK: usize = 256 * 1024;

/// Minimum gap between progress emits, so we never flood the UI thread.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// The outcome of a transfer: a human message, optional save dir, and total
/// bytes moved (for history). Errors carry only a message.
type Outcome = Result<(String, Option<String>, u64), String>;

// ---------------------------------------------------------------------------
// Receive side
// ---------------------------------------------------------------------------

/// Bind an ephemeral TCP port, start accepting connections, and return the port
/// so discovery can advertise it. Each connection is handled on its own task.
pub async fn listen(app: AppHandle, state: AppState) -> Result<u16, String> {
    let listener = TcpListener::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("Could not bind a listening port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Could not read listener address: {e}"))?
        .port();

    tauri::async_runtime::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _peer)) => {
                    let _ = stream.set_nodelay(true);
                    let app = app.clone();
                    let state = state.clone();
                    tauri::async_runtime::spawn(handle_incoming(app, state, stream));
                }
                Err(e) => {
                    // A single failed accept shouldn't kill the listener; log and continue.
                    eprintln!("accept error: {e}");
                }
            }
        }
    });

    Ok(port)
}

/// Handle one inbound connection: read the offer, ask the user, then receive.
async fn handle_incoming(app: AppHandle, state: AppState, mut stream: TcpStream) {
    // 1. Read the offer. Anything else on a fresh connection is junk we ignore.
    let (transfer_id, device_name, device_id, files, compressed, note) =
        match read_control(&mut stream).await {
            Ok(Control::Offer {
                transfer_id,
                device_name,
                device_id,
                files,
                compressed,
                note,
            }) => (transfer_id, device_name, device_id, files, compressed, note),
            _ => return,
        };

    let total_bytes: u64 = files.iter().map(|f| f.size).sum();
    let file_count = files.len();

    // Save these before potentially moving `note` into the emit below.
    let note_for_history = note.clone();
    let first_file_name = files.first().map(|f| f.name.clone());

    // 2. Decide: auto-accept for trusted devices or when ask_before_receiving=false.
    let (ask, is_trusted) = {
        let s = state.inner.settings.lock().unwrap();
        (s.ask_before_receiving, state.is_trusted(&device_id))
    };

    let (accept, save_dir) = if is_trusted || !ask {
        let dir = state.inner.settings.lock().unwrap().default_save_dir.clone();
        (true, Some(dir))
    } else {
        let (tx, rx) = oneshot::channel();
        state
            .inner
            .pending_offers
            .lock()
            .unwrap()
            .insert(transfer_id.clone(), tx);

        let _ = app.emit(
            "incoming-offer",
            IncomingOffer {
                transfer_id: transfer_id.clone(),
                device_name: device_name.clone(),
                device_id: device_id.clone(),
                files: files.clone(),
                total_bytes,
                note,
            },
        );

        let decision = rx.await.unwrap_or((false, None));
        state.inner.pending_offers.lock().unwrap().remove(&transfer_id);
        decision
    };

    // 3. Tell the sender.
    if write_control(&mut stream, &Control::Response { accept })
        .await
        .is_err()
    {
        return;
    }
    if !accept {
        return;
    }

    // 4. Receive into the chosen (or default) directory.
    let dir = save_dir.unwrap_or_else(|| {
        state.inner.settings.lock().unwrap().default_save_dir.clone()
    });
    let conflict_policy = state.inner.settings.lock().unwrap().conflict_policy.clone();
    let cancel = state.new_cancel_flag(&transfer_id);

    let outcome = receive_files(
        &app,
        &mut stream,
        &transfer_id,
        &files,
        total_bytes,
        &dir,
        cancel,
        &conflict_policy,
        compressed,
    )
    .await;

    finish(&app, &state, &transfer_id, DIRECTION_RECEIVE, &device_name, file_count, outcome, note_for_history, first_file_name);
}

/// Stream every offered file to disk, hashing as we go and verifying SHA-256.
/// When `compressed` is true the single received file is a zip archive; we
/// unzip it in place and delete the archive after extraction.
async fn receive_files(
    app: &AppHandle,
    stream: &mut TcpStream,
    transfer_id: &str,
    files: &[FileMeta],
    total_size: u64,
    dir: &str,
    cancel: Arc<AtomicBool>,
    conflict_policy: &str,
    compressed: bool,
) -> Outcome {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("Could not create save folder: {e}"))?;

    // Track everything we open so we can clean up on cancel or failure.
    let mut written: Vec<PathBuf> = Vec::new();
    let mut meter = SpeedMeter::new();
    let mut total_bytes: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut buf = vec![0u8; CHUNK];

    for (file_index, meta) in files.iter().enumerate() {
        let rel = sanitize_rel(&meta.name).map_err(|e| {
            cleanup(&written);
            e
        })?;
        let raw_dest = Path::new(dir).join(&rel);
        if let Some(parent) = raw_dest.parent() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                cleanup(&written);
                return Err(format!("Could not create folder for {}: {e}", meta.name));
            }
        }

        // Conflict resolution: check if the destination already exists.
        let dest = if tokio::fs::metadata(&raw_dest).await.is_ok() {
            match conflict_policy {
                "overwrite" => raw_dest,
                "skip" => {
                    // Consume the bytes so the stream stays in sync.
                    if let Err(e) =
                        drain_bytes(stream, meta.size, &mut buf, cancel.clone()).await
                    {
                        return Err(e);
                    }
                    continue;
                }
                _ => renamed_path(&raw_dest), // "rename" (default)
            }
        } else {
            raw_dest
        };

        let mut file = match File::create(&dest).await {
            Ok(f) => f,
            Err(e) => {
                cleanup(&written);
                return Err(format!("Could not write {}: {e}", meta.name));
            }
        };
        written.push(dest.clone());

        let mut hasher = Sha256::new();
        let mut remaining = meta.size;
        let mut file_bytes: u64 = 0;

        while remaining > 0 {
            if cancel.load(Ordering::Relaxed) {
                cleanup(&written);
                return Err("Transfer cancelled".to_string());
            }

            let want = remaining.min(CHUNK as u64) as usize;
            let n = match stream.read(&mut buf[..want]).await {
                Ok(0) => {
                    // EOF before we got all the bytes: sender vanished or cancelled.
                    cleanup(&written);
                    return Err("Connection lost during transfer".to_string());
                }
                Ok(n) => n,
                Err(e) => {
                    cleanup(&written);
                    return Err(format!("Read error: {e}"));
                }
            };

            if let Err(e) = file.write_all(&buf[..n]).await {
                cleanup(&written);
                return Err(format!("Disk write failed (out of space?): {e}"));
            }
            hasher.update(&buf[..n]);

            remaining -= n as u64;
            file_bytes += n as u64;
            total_bytes += n as u64;

            let now = Instant::now();
            meter.record(now, total_bytes);
            if now.duration_since(last_emit) >= PROGRESS_INTERVAL {
                emit_progress(
                    app, transfer_id, DIRECTION_RECEIVE, file_index, meta, file_bytes,
                    total_bytes, total_size, &meter, now,
                );
                last_emit = now;
            }
        }

        if let Err(e) = file.flush().await {
            cleanup(&written);
            return Err(format!("Disk flush failed: {e}"));
        }

        // Integrity gate: a mismatch fails the whole transfer and removes files.
        let digest = to_hex(&hasher.finalize());
        if !digest.eq_ignore_ascii_case(&meta.sha256) {
            cleanup(&written);
            return Err(format!("Checksum mismatch for {} — file discarded", meta.name));
        }

        // Make sure the per-file bar reaches 100%.
        emit_progress(
            app, transfer_id, DIRECTION_RECEIVE, file_index, meta, file_bytes, total_bytes,
            total_size, &meter, Instant::now(),
        );
    }

    // If the sender compressed everything into a single archive, unzip now.
    if compressed {
        if let Some(archive_meta) = files.first() {
            let archive_path = PathBuf::from(dir).join(&archive_meta.name);
            let dest = dir.to_string();
            let unzip_result = tokio::task::spawn_blocking(move || {
                unzip_archive(&archive_path, &dest)
            })
            .await
            .map_err(|e| format!("unzip panicked: {e}"))?;
            if let Err(e) = unzip_result {
                return Err(format!("Unzip failed: {e}"));
            }
        }
    }

    // Extract any individual folder archives (.beam.zip) in the destination directory.
    let dest_dir = dir.to_string();
    let extract_folders_result = tokio::task::spawn_blocking(move || {
        extract_all_beam_zips(&dest_dir)
    })
    .await
    .map_err(|e| format!("extract folders panicked: {e}"))?;
    if let Err(e) = extract_folders_result {
        return Err(format!("Folder extraction failed: {e}"));
    }

    let file_word = if compressed { "file(s)" } else { "file(s), all checksums verified" };
    Ok((
        format!("Received {} {}", files.len(), file_word),
        Some(dir.to_string()),
        total_size,
    ))
}

// ---------------------------------------------------------------------------
// Send side
// ---------------------------------------------------------------------------

/// Kick off a send in the background and return its transfer id immediately.
/// `compress` zips all files into a single archive before sending — best for
/// large numbers of small files (source code, documents, etc.).
pub fn spawn_send(
    app: AppHandle,
    state: AppState,
    addr: String,
    peer_name: String,
    paths: Vec<String>,
    note: Option<String>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("No files selected".to_string());
    }
    let transfer_id = Uuid::new_v4().to_string();
    let cancel = state.new_cancel_flag(&transfer_id);
    let device_name = state.inner.settings.lock().unwrap().device_name.clone();
    let bandwidth_limit = state.inner.settings.lock().unwrap().bandwidth_limit;
    let our_id = state.inner.our_id.clone();

    let first_file_name = paths.first().and_then(|p| {
        std::path::Path::new(p).file_name()?.to_str().map(String::from)
    });
    let note_for_history = note.clone();

    let app_bg = app.clone();
    let state_bg = state.clone();
    let tid = transfer_id.clone();
    tauri::async_runtime::spawn(async move {
        let (outcome, file_count) = do_send(
            &app_bg, &state_bg, &addr, &tid, &device_name, &our_id,
            paths, cancel, note, bandwidth_limit,
        ).await;
        finish(&app_bg, &state_bg, &tid, DIRECTION_SEND, &peer_name, file_count, outcome, note_for_history, first_file_name);
    });

    Ok(transfer_id)
}

async fn do_send(
    app: &AppHandle,
    _state: &AppState,
    addr: &str,
    transfer_id: &str,
    device_name: &str,
    our_id: &str,
    paths: Vec<String>,
    cancel: Arc<AtomicBool>,
    note: Option<String>,
    bandwidth_limit: Option<u64>,
) -> (Outcome, usize) {
    let mut files = Vec::new();
    let mut sender_temp_zips = Vec::new();

    // Check paths for directories and zip them on the fly
    for p in paths {
        let path = PathBuf::from(&p);
        let md = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(e) => {
                cleanup_temp_files(&sender_temp_zips);
                return (Err(format!("Could not read {p}: {e}")), 0);
            }
        };

        if md.is_dir() {
            let folder_name = match path.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => "folder".to_string(),
            };
            let _ = app.emit(
                "hash-progress",
                HashProgress {
                    transfer_id: transfer_id.to_string(),
                    hashed: 0,
                    total: 1,
                    file_name: format!("Compressing folder: {}...", folder_name),
                },
            );

            let zip_name = format!("{}.beam.zip", folder_name);
            let zip_path = std::env::temp_dir().join(format!("beam_folder_{}_{}.beam.zip", folder_name, Uuid::new_v4()));
            let src_dir = path.clone();
            let zp = zip_path.clone();

            let zip_result = tokio::task::spawn_blocking(move || {
                zip_directory(&src_dir, &zp)
            })
            .await
            .map_err(|e| format!("zip folder panicked: {e}"));

            match zip_result {
                Ok(Ok(())) => {
                    sender_temp_zips.push(zip_path.clone());
                    files.push((zip_path, zip_name));
                }
                Ok(Err(e)) => {
                    cleanup_temp_files(&sender_temp_zips);
                    return (Err(format!("Failed to compress folder {folder_name}: {e}")), 0);
                }
                Err(e) => {
                    cleanup_temp_files(&sender_temp_zips);
                    return (Err(e), 0);
                }
            }
        } else {
            let name = match path.file_name() {
                Some(n) => n.to_string_lossy().to_string(),
                None => {
                    cleanup_temp_files(&sender_temp_zips);
                    return (Err(format!("Invalid file name: {p}")), 0);
                }
            };
            files.push((path, name));
        }
    }

    let total_files = files.len();
    let compress = total_files > 10;

    // -----------------------------------------------------------------------
    // Phase 1: Parallel SHA-256 hashing.
    // Clone `files` so we keep abs paths available after hashing.
    // rayon runs all cores simultaneously; each reports progress atomically.
    // -----------------------------------------------------------------------
    let files_clone = files.clone();
    let tid = transfer_id.to_string();
    let app_clone = app.clone();
    let counter2 = Arc::new(AtomicUsize::new(0));

    let metas_result = tokio::task::spawn_blocking(move || {
        use rayon::prelude::*;
        files_clone
            .par_iter()
            .map(|(abs, rel)| {
                let size = std::fs::metadata(abs)
                    .map_err(|e| format!("stat {rel}: {e}"))?
                    .len();
                let sha256 = sha256_file_sync(abs)
                    .map_err(|e| format!("hash {rel}: {e}"))?;
                let done = counter2.fetch_add(1, Ordering::Relaxed) + 1;
                let _ = app_clone.emit(
                    "hash-progress",
                    HashProgress {
                        transfer_id: tid.clone(),
                        hashed: done,
                        total: total_files,
                        file_name: rel.clone(),
                    },
                );
                Ok::<FileMeta, String>(FileMeta { name: rel.clone(), size, sha256 })
            })
            .collect::<Result<Vec<_>, _>>()
    })
    .await;

    let metas = match metas_result {
        Ok(Ok(m)) => m,
        Ok(Err(e)) => {
            cleanup_temp_files(&sender_temp_zips);
            return (Err(e), total_files);
        }
        Err(e) => {
            cleanup_temp_files(&sender_temp_zips);
            return (Err(format!("hashing panicked: {e}")), total_files);
        }
    };

    let total_size: u64 = metas.iter().map(|m| m.size).sum();

    // -----------------------------------------------------------------------
    // Phase 2: Optionally compress into a single zip archive.
    // -----------------------------------------------------------------------
    let (offer_files, offer_metas, compressed, tmp_zip): (
        Vec<(PathBuf, String)>,
        Vec<FileMeta>,
        bool,
        Option<PathBuf>,
    ) = if compress {
        let _ = app.emit(
            "hash-progress",
            HashProgress {
                transfer_id: transfer_id.to_string(),
                hashed: total_files,
                total: total_files,
                file_name: "Compressing…".to_string(),
            },
        );
        let zip_path = std::env::temp_dir().join(format!("beam_{}.zip", Uuid::new_v4()));
        let files_for_zip = files.clone();
        let zp = zip_path.clone();
        let zip_result = tokio::task::spawn_blocking(move || zip_files(&zp, &files_for_zip))
            .await
            .map_err(|e| format!("zip panicked: {e}"));
        match zip_result {
            Ok(Ok(())) => {
                let zip_size = std::fs::metadata(&zip_path).map(|m| m.len()).unwrap_or(0);
                let zip_sha = sha256_file_sync(&zip_path).unwrap_or_default();
                let zip_meta = FileMeta {
                    name: "beam_archive.zip".to_string(),
                    size: zip_size,
                    sha256: zip_sha,
                };
                (
                    vec![(zip_path.clone(), "beam_archive.zip".to_string())],
                    vec![zip_meta],
                    true,
                    Some(zip_path),
                )
            }
            _ => (files.clone(), metas.clone(), false, None),
        }
    } else {
        (files.clone(), metas.clone(), false, None)
    };

    // -----------------------------------------------------------------------
    // Phase 3: Connect and send the offer.
    // -----------------------------------------------------------------------
    let mut stream = match TcpStream::connect(addr).await {
        Ok(s) => s,
        Err(e) => {
            cleanup_temp_files(&sender_temp_zips);
            drop_zip(&tmp_zip);
            return (Err(format!("Could not reach peer ({addr}): {e}")), total_files);
        }
    };
    let _ = stream.set_nodelay(true);

    if let Err(e) = write_control(
        &mut stream,
        &Control::Offer {
            transfer_id: transfer_id.to_string(),
            device_name: device_name.to_string(),
            device_id: our_id.to_string(),
            files: offer_metas.clone(),
            compressed,
            note,
        },
    )
    .await {
        cleanup_temp_files(&sender_temp_zips);
        drop_zip(&tmp_zip);
        return (Err(format!("Could not send offer: {e}")), total_files);
    }

    match read_control(&mut stream).await {
        Ok(Control::Response { accept: true }) => {}
        Ok(Control::Response { accept: false }) => {
            cleanup_temp_files(&sender_temp_zips);
            drop_zip(&tmp_zip);
            return (Err("Declined by receiver".to_string()), total_files);
        }
        Ok(_) => {
            cleanup_temp_files(&sender_temp_zips);
            drop_zip(&tmp_zip);
            return (Err("Unexpected reply from receiver".to_string()), total_files);
        }
        Err(e) => {
            cleanup_temp_files(&sender_temp_zips);
            drop_zip(&tmp_zip);
            return (Err(format!("Peer closed before responding: {e}")), total_files);
        }
    }

    // -----------------------------------------------------------------------
    // Phase 4: Stream file bytes.
    // -----------------------------------------------------------------------
    let mut meter = SpeedMeter::new();
    let mut total_bytes: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut buf = vec![0u8; CHUNK];

    for (file_index, (abs, _)) in offer_files.iter().enumerate() {
        let meta = &offer_metas[file_index];
        let mut file = match File::open(abs).await {
            Ok(f) => f,
            Err(e) => {
                cleanup_temp_files(&sender_temp_zips);
                drop_zip(&tmp_zip);
                return (Err(format!("Could not open {}: {e}", meta.name)), total_files);
            }
        };
        let mut remaining = meta.size;
        let mut file_bytes: u64 = 0;

        while remaining > 0 {
            if cancel.load(Ordering::Relaxed) {
                cleanup_temp_files(&sender_temp_zips);
                drop_zip(&tmp_zip);
                return (Err("Transfer cancelled".to_string()), total_files);
            }

            let chunk_start = Instant::now();
            let want = remaining.min(CHUNK as u64) as usize;
            let n = match file.read(&mut buf[..want]).await {
                Ok(n) => n,
                Err(e) => {
                    cleanup_temp_files(&sender_temp_zips);
                    drop_zip(&tmp_zip);
                    return (Err(format!("Read error: {e}")), total_files);
                }
            };
            if n == 0 {
                cleanup_temp_files(&sender_temp_zips);
                drop_zip(&tmp_zip);
                return (Err(format!("{} ended sooner than expected", meta.name)), total_files);
            }
            if let Err(e) = stream.write_all(&buf[..n]).await {
                cleanup_temp_files(&sender_temp_zips);
                drop_zip(&tmp_zip);
                return (Err(format!("Send failed: {e}")), total_files);
            }

            if let Some(limit) = bandwidth_limit {
                let expected = Duration::from_secs_f64(n as f64 / limit as f64);
                let elapsed = chunk_start.elapsed();
                if expected > elapsed {
                    tokio::time::sleep(expected - elapsed).await;
                }
            }

            remaining -= n as u64;
            file_bytes += n as u64;
            total_bytes += n as u64;

            let now = Instant::now();
            meter.record(now, total_bytes);
            if now.duration_since(last_emit) >= PROGRESS_INTERVAL {
                emit_progress(
                    app, transfer_id, DIRECTION_SEND, file_index, meta,
                    file_bytes, total_bytes, total_size, &meter, now,
                );
                last_emit = now;
            }
        }

        emit_progress(
            app, transfer_id, DIRECTION_SEND, file_index, meta,
            file_bytes, total_bytes, total_size, &meter, Instant::now(),
        );
    }

    stream.flush().await.ok();
    cleanup_temp_files(&sender_temp_zips);
    drop_zip(&tmp_zip);

    let msg = if compressed {
        format!("Sent {} file(s) as compressed archive", total_files)
    } else {
        format!("Sent {} file(s)", total_files)
    };
    (Ok((msg, None, total_size)), total_files)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Emit the terminal `transfer-done`, drop the cancel flag, and record history.
fn finish(
    app: &AppHandle,
    state: &AppState,
    transfer_id: &str,
    direction: &str,
    peer_name: &str,
    file_count: usize,
    outcome: Outcome,
    note: Option<String>,
    first_file_name: Option<String>,
) {
    state.clear_cancel_flag(transfer_id);

    let (ok, message, save_dir, total_bytes) = match outcome {
        Ok((msg, sd, tb)) => (true, msg, sd, tb),
        Err(msg) => (false, msg, None, 0),
    };

    // Record to history (best-effort).
    let status = if ok {
        "done"
    } else if message.to_lowercase().contains("cancel") {
        "cancelled"
    } else {
        "failed"
    };
    history::append(
        &state.inner.history_path,
        HistoryEntry {
            id: transfer_id.to_string(),
            direction: direction.to_string(),
            peer_name: peer_name.to_string(),
            file_count,
            total_bytes,
            status: status.to_string(),
            message: message.clone(),
            save_dir: save_dir.clone(),
            timestamp_ms: history::now_ms(),
            note,
            file_name: first_file_name,
        },
    );

    let _ = app.emit(
        "transfer-done",
        TransferDone {
            transfer_id: transfer_id.to_string(),
            direction: direction.to_string(),
            ok,
            message,
            save_dir,
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn emit_progress(
    app: &AppHandle,
    transfer_id: &str,
    direction: &str,
    file_index: usize,
    meta: &FileMeta,
    file_bytes: u64,
    total_bytes: u64,
    total_size: u64,
    meter: &SpeedMeter,
    now: Instant,
) {
    let bytes_per_sec = meter.bytes_per_sec(now);
    let remaining = total_size.saturating_sub(total_bytes);
    let eta_secs = if bytes_per_sec > 1.0 {
        Some(remaining as f64 / bytes_per_sec)
    } else {
        None
    };

    let _ = app.emit(
        "transfer-progress",
        ProgressEvent {
            transfer_id: transfer_id.to_string(),
            direction: direction.to_string(),
            file_index,
            file_name: meta.name.clone(),
            file_bytes,
            file_size: meta.size,
            total_bytes,
            total_size,
            bytes_per_sec,
            eta_secs,
        },
    );
}

/// Best-effort removal of partially-written files after a cancel/failure.
fn cleanup(paths: &[PathBuf]) {
    for p in paths {
        let _ = std::fs::remove_file(p);
    }
}

/// Reject path-traversal and absolute components, returning a safe relative path.
fn sanitize_rel(name: &str) -> Result<PathBuf, String> {
    let normalized = name.replace('\\', "/");
    let mut out = PathBuf::new();
    for comp in normalized.split('/') {
        if comp.is_empty() || comp == "." {
            continue;
        }
        if comp == ".." || comp.contains(':') {
            return Err(format!("Refusing unsafe file path: {name}"));
        }
        out.push(comp);
    }
    if out.as_os_str().is_empty() {
        return Err("Received an empty file name".to_string());
    }
    Ok(out)
}


fn walk_dir(dir: &Path, base: &Path, out: &mut Vec<(PathBuf, String)>) -> Result<(), String> {
    // Silently skip directories we can't open (system folders, junctions with
    // restricted targets, etc.) so one bad entry doesn't abort the whole walk.
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // Use file_type() — it does NOT follow symlinks — so we can detect and
        // skip symlinks before ever touching their targets. On Windows, NTFS
        // junctions appear as is_dir() here and we'll recurse into them only
        // if they're accessible, which is usually fine.
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            walk_dir(&path, base, out)?;
        } else if ft.is_file() {
            let rel = path.strip_prefix(base).unwrap_or(&path);
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            out.push((path.clone(), rel_str));
        }
    }
    Ok(())
}

/// Synchronous (rayon-friendly) SHA-256: reads the file in chunks.
fn sha256_file_sync(path: &Path) -> Result<String, String> {
    use std::io::Read as _;
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(to_hex(&hasher.finalize()))
}

/// Zip `files` (vec of (abs_path, rel_name)) into a zip archive at `dest`.
/// Runs synchronously — call via `spawn_blocking`.
fn zip_files(dest: &Path, files: &[(PathBuf, String)]) -> Result<(), String> {
    use std::io::{Read as _, Write as _};
    use zip::write::SimpleFileOptions;
    let out = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(out);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut buf = vec![0u8; CHUNK];
    for (abs, rel) in files {
        zip.start_file(rel, opts).map_err(|e| e.to_string())?;
        let mut f = std::fs::File::open(abs).map_err(|e| e.to_string())?;
        loop {
            let n = f.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            zip.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Zip a single directory recursively into a zip archive at `dest_zip`.
/// Runs synchronously — call via `spawn_blocking`.
fn zip_directory(src_dir: &Path, dest_zip: &Path) -> Result<(), String> {
    use std::io::{Read as _, Write as _};
    use zip::write::SimpleFileOptions;

    let base = src_dir.parent().unwrap_or(src_dir);
    let mut files = Vec::new();
    walk_dir(src_dir, base, &mut files)?;

    let out_file = std::fs::File::create(dest_zip).map_err(|e| format!("create zip: {e}"))?;
    let mut zip = zip::ZipWriter::new(out_file);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut buf = vec![0u8; CHUNK];

    for (abs, rel) in files {
        zip.start_file(rel, opts).map_err(|e| format!("zip start_file: {e}"))?;
        let mut f = std::fs::File::open(abs).map_err(|e| format!("open file: {e}"))?;
        loop {
            let n = f.read(&mut buf).map_err(|e| format!("read file: {e}"))?;
            if n == 0 {
                break;
            }
            zip.write_all(&buf[..n]).map_err(|e| format!("write zip: {e}"))?;
        }
    }
    zip.finish().map_err(|e| format!("finish zip: {e}"))?;
    Ok(())
}

/// Extract all files ending with `.beam.zip` directly in `dest_dir`.
/// Runs synchronously — call via `spawn_blocking`.
fn extract_all_beam_zips(dest_dir: &str) -> Result<(), String> {
    let path = Path::new(dest_dir);
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(filename) = entry_path.file_name() {
                let name = filename.to_string_lossy();
                if name.ends_with(".beam.zip") {
                    unzip_archive(&entry_path, dest_dir)?;
                }
            }
        }
    }
    Ok(())
}

/// Helper to clean up temporary sender-side directory zip files.
fn cleanup_temp_files(paths: &[PathBuf]) {
    for p in paths {
        let _ = std::fs::remove_file(p);
    }
}

/// Extract a zip archive into `dest_dir`. Runs synchronously.
fn unzip_archive(archive: &Path, dest_dir: &str) -> Result<(), String> {
    use std::io::Read as _;
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let dest = Path::new(dest_dir);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let rel = entry.name().replace('\\', "/");
        // Reject path-traversal entries.
        if rel.contains("../") || rel.starts_with('/') {
            continue;
        }
        let out_path = dest.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; CHUNK];
            loop {
                let n = entry.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                use std::io::Write as _;
                out_file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            }
        }
    }
    // Delete the archive now that extraction succeeded.
    let _ = std::fs::remove_file(archive);
    Ok(())
}

/// Remove a temp zip file (best-effort, silences errors).
fn drop_zip(path: &Option<PathBuf>) {
    if let Some(p) = path {
        let _ = std::fs::remove_file(p);
    }
}


/// Drain `size` bytes from the stream into the reusable `buf`, respecting the
/// cancel flag. Used to keep the stream in sync when skipping a conflicting file.
async fn drain_bytes(
    stream: &mut TcpStream,
    mut remaining: u64,
    buf: &mut [u8],
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    while remaining > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Err("Transfer cancelled".to_string());
        }
        let want = remaining.min(buf.len() as u64) as usize;
        let n = match stream.read(&mut buf[..want]).await {
            Ok(0) => return Err("Connection lost during transfer".to_string()),
            Ok(n) => n,
            Err(e) => return Err(format!("Read error: {e}")),
        };
        remaining -= n as u64;
    }
    Ok(())
}

/// Find a non-conflicting path by appending ` (2)`, ` (3)`, … to the stem.
fn renamed_path(dest: &Path) -> PathBuf {
    if !dest.exists() {
        return dest.to_path_buf();
    }
    let stem = dest
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = dest
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let parent = dest.parent().unwrap_or(Path::new(""));
    for i in 2u32.. {
        let candidate = parent.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dest.to_path_buf()
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// Rolling-average throughput meter. Keeps `(timestamp, cumulative bytes)`
/// samples over a short window so the reported speed doesn't jitter with every
/// chunk while still reacting to real changes.
struct SpeedMeter {
    samples: VecDeque<(Instant, u64)>,
    window: Duration,
}

impl SpeedMeter {
    fn new() -> Self {
        SpeedMeter {
            samples: VecDeque::new(),
            window: Duration::from_millis(1500),
        }
    }

    fn record(&mut self, now: Instant, total_bytes: u64) {
        self.samples.push_back((now, total_bytes));
        while let Some(&(t, _)) = self.samples.front() {
            if now.duration_since(t) > self.window {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    fn bytes_per_sec(&self, _now: Instant) -> f64 {
        if self.samples.len() < 2 {
            return 0.0;
        }
        let (t0, b0) = *self.samples.front().unwrap();
        let (t1, b1) = *self.samples.back().unwrap();
        let dt = t1.duration_since(t0).as_secs_f64();
        if dt <= 0.0 {
            return 0.0;
        }
        (b1.saturating_sub(b0)) as f64 / dt
    }
}
