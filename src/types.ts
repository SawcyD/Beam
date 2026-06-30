// Mirror of the Rust protocol types in src-tauri/src/protocol.rs.
// Keep these in sync — the field names must match the serialized JSON exactly.

export interface Device {
  id: string;
  name: string;
  addr: string; // "ip:port"
}

export interface FileMeta {
  name: string;
  size: number;
  sha256: string;
}

export type Direction = "send" | "receive";

export interface IncomingOffer {
  transfer_id: string;
  device_name: string;
  device_id: string;
  files: FileMeta[];
  total_bytes: number;
  note?: string;
}

export interface DeviceGroup {
  id: string;
  name: string;
  device_names: string[];
}

export interface TrustedDevice {
  id: string;
  name: string;
}

export interface HistoryEntry {
  id: string;
  direction: Direction;
  peer_name: string;
  file_count: number;
  total_bytes: number;
  status: "done" | "failed" | "cancelled" | "declined";
  message: string;
  save_dir: string | null;
  timestamp_ms: number;
  /** Note the sender attached to the transfer, if any. */
  note?: string;
  /** Name of the first (or only) file. */
  file_name?: string;
}

export interface ProgressEvent {
  transfer_id: string;
  direction: Direction;
  file_index: number;
  file_name: string;
  file_bytes: number;
  file_size: number;
  total_bytes: number;
  total_size: number;
  bytes_per_sec: number;
  eta_secs: number | null;
}

export interface HashProgress {
  transfer_id: string;
  hashed: number;
  total: number;
  file_name: string;
}

export interface TransferDone {
  transfer_id: string;
  direction: Direction;
  ok: boolean;
  message: string;
  save_dir: string | null;
}

// Watch folder configuration (mirrors src-tauri/src/watch.rs).
export interface WatchConfig {
  id: string;
  path: string;
  peer_id: string;
  peer_name: string;
  enabled: boolean;
}

// ── File Explorer ────────────────────────────────────────────────────────────

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;     // 0 for directories
  modified: number; // ms since Unix epoch
  extension: string; // lowercase, no leading dot; empty for dirs
}

export interface Drive {
  name: string; // "C:"
  path: string; // "C:\\"
}

export interface SpecialDirs {
  home: string;
  desktop: string;
  documents: string;
  downloads: string;
  pictures: string;
  music: string;
}

// ── Future: chunked transfer + resume ───────────────────────────────────────
// TODO: implement chunked transfer when we need to reliably handle large files
// (multi-GB) or lossy connections. The shapes below describe the target wire
// protocol so the Rust side and frontend can evolve toward it incrementally.

/** Describes a single chunk within a file being transferred. */
export interface ChunkInfo {
  /** Chunk index (0-based). */
  index: number;
  /** Byte offset within the file. */
  offset: number;
  /** Number of bytes in this chunk. */
  length: number;
  /** SHA-256 of this chunk's bytes — used to verify and skip on resume. */
  sha256: string;
}

/**
 * Per-file manifest sent ahead of data so the receiver can pre-allocate,
 * validate, and resume partial transfers.
 */
export interface TransferManifest {
  transfer_id: string;
  /** Total number of files in this transfer. */
  file_count: number;
  files: TransferManifestFile[];
}

export interface TransferManifestFile {
  name: string;
  size: number;
  /** SHA-256 of the whole file — final integrity check. */
  sha256: string;
  /** Chunk plan. Present only when chunk_size > 0 in the session. */
  chunks?: ChunkInfo[];
}

/**
 * Resume state persisted locally so an interrupted transfer can continue
 * without re-sending already-delivered chunks.
 */
export interface ResumeState {
  transfer_id: string;
  file_index: number;
  /** Indices of chunks that were already received and verified. */
  completed_chunks: number[];
  /** ms timestamp of last progress — used to expire stale resume state. */
  last_progress_ms: number;
}

// ── Path metadata (for folder-aware staging) ─────────────────────────────────

export interface PathStat {
  path: string;
  is_dir: boolean;
  name: string;
  /** Total bytes of files inside (directory) or file size (regular file). */
  total_bytes: number;
  /** Number of files inside a directory; 0 for regular files. */
  file_count: number;
}

// ── App settings (mirrors Rust Settings struct) ──────────────────────────────

export interface AppSettings {
  deviceName: string;
  theme: "dark" | "light" | "system";
  defaultDownloadFolder: string;
  askBeforeReceiving: boolean;
  bandwidthThrottleEnabled: boolean;
  bandwidthThrottleLimitBytesPerSecond: number | null;
  minimizeToTray: boolean;
  startOnLogin: boolean;           // TODO: wire up Tauri auto-start plugin
  keepTransferHistory: boolean;    // TODO: implement retention policy
  launchTab: string | null;
}

// ── Network diagnostics ──────────────────────────────────────────────────────

export interface NetworkInfo {
  tcp_port: number;
  local_ip: string | null;
  peer_count: number;
  device_name: string;
}

// ── Transfer types ───────────────────────────────────────────────────────────

/** All possible states a transfer can be in. */
export type TransferStatus =
  | "queued"
  | "waiting"
  | "active"
  | "receiving"
  | "done"
  | "failed"
  | "cancelled"
  | "declined";

/** What kind of payload was transferred. */
export type TransferType = "file" | "folder" | "text" | "clipboard";

// ── Future: clipboard sync ────────────────────────────────────────────────────
// TODO: implement clipboard sync between trusted devices

export interface ClipboardSyncConfig {
  enabled: boolean;
  trustedDevicesOnly: boolean;
  /** Sync automatically or only when user triggers "Send clipboard". */
  mode: "manual" | "auto";
}

// ── Future: file request / pull mode ─────────────────────────────────────────
// TODO: implement pull-mode file requests

/** Sent by Device A to request a specific file from Device B. */
export interface FileRequestPayload {
  request_id: string;
  requester_device_id: string;
  requester_name: string;
  description: string;
  created_at: number;
}

/** Device B's response — approve and send, or decline. */
export interface FileRequestResponse {
  request_id: string;
  accepted: boolean;
  transfer_id?: string;
}

// ── Future: QR / code pairing ────────────────────────────────────────────────
// TODO: implement local pairing codes / QR pairing for cross-network use

export interface PairingCode {
  code: string;
  expires_at: number;
  local_addr: string;
}

// ── Frontend-only view model: the running record the UI keeps per transfer. ──

export interface Transfer {
  id: string;
  direction: Direction;
  /** The other device's friendly name, when known. */
  peerName: string;
  files: FileMeta[];
  status: TransferStatus;
  /** Index of the file currently moving. */
  fileIndex: number;
  fileName: string;
  fileBytes: number;
  fileSize: number;
  totalBytes: number;
  totalSize: number;
  bytesPerSec: number;
  etaSecs: number | null;
  message: string;
  saveDir: string | null;
  startedAt: number;
  /** ms timestamp when transfer finished (done/failed/cancelled). */
  completedAt?: number;
  /** Original file paths staged for this send — enables retry. */
  originalPaths?: string[];
  /** Peer address at send time — needed for retry if peer reconnects. */
  peerAddr?: string;
}
