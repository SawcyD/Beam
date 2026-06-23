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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::protocol::{
    read_control, write_control, Control, FileMeta, IncomingOffer, ProgressEvent, TransferDone,
    DIRECTION_RECEIVE, DIRECTION_SEND,
};
use crate::state::AppState;

/// Payload chunk size. 256 KiB keeps syscall overhead low without making
/// progress updates feel coarse.
const CHUNK: usize = 256 * 1024;

/// Minimum gap between progress emits, so we never flood the UI thread.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// The outcome of a transfer: a human message plus, for receives, where the
/// files landed.
type Outcome = Result<(String, Option<String>), String>;

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
    let (transfer_id, device_name, files) = match read_control(&mut stream).await {
        Ok(Control::Offer {
            transfer_id,
            device_name,
            files,
        }) => (transfer_id, device_name, files),
        _ => return,
    };

    let total_bytes: u64 = files.iter().map(|f| f.size).sum();

    // 2. Park a oneshot the frontend will resolve via `respond_to_offer`.
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
            files: files.clone(),
            total_bytes,
        },
    );

    // 3. Block on the user's decision. If the sender map is dropped, treat as reject.
    let (accept, save_dir) = rx.await.unwrap_or((false, None));
    state
        .inner
        .pending_offers
        .lock()
        .unwrap()
        .remove(&transfer_id);

    // 4. Tell the sender.
    if write_control(&mut stream, &Control::Response { accept })
        .await
        .is_err()
    {
        return;
    }
    if !accept {
        return; // prompt already dismissed on the frontend; nothing written
    }

    // 5. Receive into the chosen (or default) directory.
    let dir = save_dir.unwrap_or_else(|| state.inner.settings.lock().unwrap().default_save_dir.clone());
    let cancel = state.new_cancel_flag(&transfer_id);

    let outcome = receive_files(
        &app,
        &mut stream,
        &transfer_id,
        &files,
        total_bytes,
        &dir,
        cancel,
    )
    .await;

    finish(&app, &state, &transfer_id, DIRECTION_RECEIVE, outcome);
}

/// Stream every offered file to disk, hashing as we go and verifying SHA-256.
async fn receive_files(
    app: &AppHandle,
    stream: &mut TcpStream,
    transfer_id: &str,
    files: &[FileMeta],
    total_size: u64,
    dir: &str,
    cancel: Arc<AtomicBool>,
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
        let dest = Path::new(dir).join(&rel);
        if let Some(parent) = dest.parent() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                cleanup(&written);
                return Err(format!("Could not create folder for {}: {e}", meta.name));
            }
        }

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

    Ok((
        format!("Received {} file(s), all checksums verified", files.len()),
        Some(dir.to_string()),
    ))
}

// ---------------------------------------------------------------------------
// Send side
// ---------------------------------------------------------------------------

/// Kick off a send in the background and return its transfer id immediately.
pub fn spawn_send(
    app: AppHandle,
    state: AppState,
    addr: String,
    paths: Vec<String>,
) -> Result<String, String> {
    let files = expand_paths(&paths)?;
    let transfer_id = Uuid::new_v4().to_string();
    let cancel = state.new_cancel_flag(&transfer_id);
    let device_name = state.inner.settings.lock().unwrap().device_name.clone();

    let app_bg = app.clone();
    let state_bg = state.clone();
    let tid = transfer_id.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = do_send(&app_bg, &addr, &tid, &device_name, files, cancel).await;
        finish(&app_bg, &state_bg, &tid, DIRECTION_SEND, outcome);
    });

    Ok(transfer_id)
}

async fn do_send(
    app: &AppHandle,
    addr: &str,
    transfer_id: &str,
    device_name: &str,
    files: Vec<(PathBuf, String)>,
    cancel: Arc<AtomicBool>,
) -> Outcome {
    // Hash everything up front so the offer carries every checksum.
    let mut metas: Vec<FileMeta> = Vec::with_capacity(files.len());
    let mut total_size: u64 = 0;
    for (abs, rel) in &files {
        let size = tokio::fs::metadata(abs)
            .await
            .map_err(|e| format!("Could not read {}: {e}", rel))?
            .len();
        let sha256 = sha256_file(abs).await.map_err(|e| format!("Hashing {rel} failed: {e}"))?;
        total_size += size;
        metas.push(FileMeta {
            name: rel.clone(),
            size,
            sha256,
        });
    }

    let mut stream = TcpStream::connect(addr)
        .await
        .map_err(|e| format!("Could not reach peer ({addr}): {e}"))?;
    let _ = stream.set_nodelay(true);

    write_control(
        &mut stream,
        &Control::Offer {
            transfer_id: transfer_id.to_string(),
            device_name: device_name.to_string(),
            files: metas.clone(),
        },
    )
    .await
    .map_err(|e| format!("Could not send offer: {e}"))?;

    match read_control(&mut stream).await {
        Ok(Control::Response { accept: true }) => {}
        Ok(Control::Response { accept: false }) => return Err("Declined by receiver".to_string()),
        Ok(_) => return Err("Unexpected reply from receiver".to_string()),
        Err(e) => return Err(format!("Peer closed before responding: {e}")),
    }

    let mut meter = SpeedMeter::new();
    let mut total_bytes: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut buf = vec![0u8; CHUNK];

    for (file_index, (abs, _rel)) in files.iter().enumerate() {
        let meta = &metas[file_index];
        let mut file = File::open(abs)
            .await
            .map_err(|e| format!("Could not open {}: {e}", meta.name))?;
        let mut remaining = meta.size;
        let mut file_bytes: u64 = 0;

        while remaining > 0 {
            if cancel.load(Ordering::Relaxed) {
                // Dropping the stream makes the receiver's read hit EOF and clean up.
                return Err("Transfer cancelled".to_string());
            }

            let want = remaining.min(CHUNK as u64) as usize;
            let n = file
                .read(&mut buf[..want])
                .await
                .map_err(|e| format!("Read error on {}: {e}", meta.name))?;
            if n == 0 {
                return Err(format!("{} ended sooner than expected", meta.name));
            }

            stream
                .write_all(&buf[..n])
                .await
                .map_err(|e| format!("Send failed (peer disappeared?): {e}"))?;

            remaining -= n as u64;
            file_bytes += n as u64;
            total_bytes += n as u64;

            let now = Instant::now();
            meter.record(now, total_bytes);
            if now.duration_since(last_emit) >= PROGRESS_INTERVAL {
                emit_progress(
                    app, transfer_id, DIRECTION_SEND, file_index, meta, file_bytes, total_bytes,
                    total_size, &meter, now,
                );
                last_emit = now;
            }
        }

        emit_progress(
            app, transfer_id, DIRECTION_SEND, file_index, meta, file_bytes, total_bytes,
            total_size, &meter, Instant::now(),
        );
    }

    stream.flush().await.ok();
    Ok((format!("Sent {} file(s)", files.len()), None))
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Emit the terminal `transfer-done` and drop the cancel flag.
fn finish(app: &AppHandle, state: &AppState, transfer_id: &str, direction: &str, outcome: Outcome) {
    state.clear_cancel_flag(transfer_id);
    let done = match outcome {
        Ok((message, save_dir)) => TransferDone {
            transfer_id: transfer_id.to_string(),
            direction: direction.to_string(),
            ok: true,
            message,
            save_dir,
        },
        Err(message) => TransferDone {
            transfer_id: transfer_id.to_string(),
            direction: direction.to_string(),
            ok: false,
            message,
            save_dir: None,
        },
    };
    let _ = app.emit("transfer-done", done);
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

/// Expand the dropped paths into `(absolute, relative-name)` pairs, walking any
/// folders. Relative names keep the dropped folder as their top segment and use
/// forward slashes so they're portable across platforms.
fn expand_paths(paths: &[String]) -> Result<Vec<(PathBuf, String)>, String> {
    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(p);
        let md = std::fs::metadata(&path).map_err(|e| format!("Could not read {p}: {e}"))?;
        if md.is_file() {
            let name = path
                .file_name()
                .ok_or_else(|| format!("Invalid file name: {p}"))?
                .to_string_lossy()
                .to_string();
            out.push((path, name));
        } else if md.is_dir() {
            let base = path.parent().unwrap_or_else(|| Path::new("")).to_path_buf();
            walk_dir(&path, &base, &mut out)?;
        }
    }
    if out.is_empty() {
        return Err("Nothing to send (empty selection or empty folder)".to_string());
    }
    Ok(out)
}

fn walk_dir(dir: &Path, base: &Path, out: &mut Vec<(PathBuf, String)>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("Could not read folder {dir:?}: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Could not read folder entry: {e}"))?;
        let path = entry.path();
        let md = entry
            .metadata()
            .map_err(|e| format!("Could not read {path:?}: {e}"))?;
        if md.is_dir() {
            walk_dir(&path, base, out)?;
        } else if md.is_file() {
            let rel = path.strip_prefix(base).unwrap_or(&path);
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            out.push((path.clone(), rel_str));
        }
    }
    Ok(())
}

/// Stream a file through SHA-256 without loading it all into memory.
async fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(to_hex(&hasher.finalize()))
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
