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
  files: FileMeta[];
  total_bytes: number;
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

// Frontend-only view model: the running record the UI keeps per transfer.
export type TransferStatus = "active" | "done" | "failed" | "cancelled";

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
}
