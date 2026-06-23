//! Wire protocol shared by sender and receiver.
//!
//! Control messages are framed as a `u32` big-endian length prefix followed by
//! a JSON body. File payloads are *not* framed — they are raw bytes streamed in
//! offer order, with each file's length known from the `Offer`. Keeping every
//! control type in one place means both sides serialise/deserialise identically.

use serde::{Deserialize, Serialize};
use tokio::io::{self, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// A control frame larger than this almost certainly means a desync or a
/// malicious peer, so we refuse to allocate for it.
const MAX_CONTROL_FRAME: usize = 16 * 1024 * 1024;

/// Metadata for a single file in a transfer. `name` may contain forward-slash
/// separated path segments when a folder is sent (e.g. `photos/2024/img.jpg`);
/// the receiver is responsible for sanitising it before touching disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

/// Control messages exchanged over the TCP control channel. The `type` tag makes
/// the JSON self-describing and mirrors the discriminated union on the TS side.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Control {
    /// Sender announces what it wants to send. Receiver replies with `Response`.
    Offer {
        transfer_id: String,
        device_name: String,
        files: Vec<FileMeta>,
    },
    /// Receiver's accept/reject decision.
    Response { accept: bool },
}

/// A peer discovered on the LAN via mDNS. `addr` is a dialable `ip:port`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub addr: String,
}

/// Whether a transfer event is about an outgoing ("send") or incoming
/// ("receive") transfer, from the perspective of the emitting instance.
pub const DIRECTION_SEND: &str = "send";
pub const DIRECTION_RECEIVE: &str = "receive";

/// Live progress for an in-flight transfer, emitted by both sides.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub transfer_id: String,
    pub direction: String,
    /// Index of the file currently streaming, within the offer's file list.
    pub file_index: usize,
    pub file_name: String,
    /// Bytes transferred for the current file so far.
    pub file_bytes: u64,
    pub file_size: u64,
    /// Bytes transferred across the whole batch so far.
    pub total_bytes: u64,
    pub total_size: u64,
    /// Smoothed throughput (rolling average) so the readout does not jitter.
    pub bytes_per_sec: f64,
    /// Estimated seconds remaining for the whole batch, or null if unknown.
    pub eta_secs: Option<f64>,
}

/// Pushed to the receiver UI when an offer arrives. The UI shows an accept/
/// reject prompt and replies via the `respond_to_offer` command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingOffer {
    pub transfer_id: String,
    pub device_name: String,
    pub files: Vec<FileMeta>,
    pub total_bytes: u64,
}

/// Terminal event for a transfer on either side.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferDone {
    pub transfer_id: String,
    pub direction: String,
    pub ok: bool,
    pub message: String,
    /// Where files landed (receiver side), so the UI can offer Open / Show.
    pub save_dir: Option<String>,
}

/// Write a control message as `u32` length prefix + JSON body, then flush.
pub async fn write_control<W>(w: &mut W, msg: &Control) -> io::Result<()>
where
    W: AsyncWrite + Unpin,
{
    let body = serde_json::to_vec(msg).map_err(io::Error::other)?;
    let len = u32::try_from(body.len())
        .map_err(|_| io::Error::other("control frame too large"))?;
    w.write_all(&len.to_be_bytes()).await?;
    w.write_all(&body).await?;
    w.flush().await?;
    Ok(())
}

/// Read one length-prefixed control message. Returns an error on EOF or if the
/// advertised length is implausibly large.
pub async fn read_control<R>(r: &mut R) -> io::Result<Control>
where
    R: AsyncRead + Unpin,
{
    let mut len_buf = [0u8; 4];
    r.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > MAX_CONTROL_FRAME {
        return Err(io::Error::other("control frame exceeds maximum size"));
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).await?;
    serde_json::from_slice(&body).map_err(io::Error::other)
}
