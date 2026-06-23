# Beam

Cross-platform file transfer for your LAN. Beam auto-discovers other machines
running Beam on the same network, then sends files and folders directly over a
plain TCP connection with live speed/ETA telemetry and SHA-256 integrity
verification on both ends.

Built with **Tauri v2** (Rust) + **React 18 / TypeScript / Vite**, styled with
**Tailwind** + Radix (shadcn-style) components.

## Features (Phase 1 — LAN)

- **mDNS discovery** — peers appear by friendly name, not raw IPs.
- **Drag & drop** files *and folders* onto the window, pick a device, send.
- **Accept/reject prompt** with sender name, file list, and total size shown
  *before* anything touches disk; receiver chooses the destination folder.
- **Live telemetry** — rolling-average MB/s, ETA, per-file and overall progress.
- **SHA-256** computed by the sender, verified by the receiver (clear pass/fail).
- **Cancel** an in-flight transfer; partial files are cleaned up.
- **Open / Show in folder** + native completion notification.
- **Watch folders** — auto-send any new file dropped into a folder to a chosen
  peer (configure in Settings).
- **Update checker** — checks for new releases on startup and shows a banner.

The signature UI is the **device radar** (peers orbiting pulsing rings) with an
animated "packet stream" line during active transfers. Respects
`prefers-reduced-motion`.

## Prerequisites

- **Rust** (stable) + Cargo — https://rustup.rs
- **Node.js** 18+ and npm
- **Platform build deps for Tauri v2** — see
  https://tauri.app/start/prerequisites/
  - **Windows:** Microsoft C++ Build Tools + WebView2 (preinstalled on Win 11).
  - **macOS:** Xcode Command Line Tools.
  - **Linux:** `webkit2gtk`, `librsvg`, `libayatana-appindicator`, etc.

## Run in development

```bash
npm install
npm run tauri dev
```

The first launch compiles the Rust backend (a few minutes); later runs are fast.

## Build a release

```bash
npm run tauri build
```

Installers/binaries land in `src-tauri/target/release/bundle/`. On Windows you
get an `.msi` (under `bundle/msi/`) and a portable `Beam.exe` in
`src-tauri/target/release/`.

## Test a transfer between two instances

1. Run Beam on two machines on the **same network** (or two instances on one
   machine — they'll open separate windows).
2. Each shows up in the other's **Devices** list by name (set yours in
   Settings).
3. Drag a file (or several) onto one window, select the target device, click
   **Send**.
4. The receiver gets an accept/reject prompt; on accept they pick a folder
   (defaults to `~/Downloads/Beam`).
5. Watch live speed + ETA + progress on both ends; the file arrives with a
   verified ✓ checksum and a completion notification.

## Architecture

```
src/                     React frontend
  store.ts               Zustand store + Tauri command/event wiring
  types.ts               TS mirror of the Rust protocol types
  lib/format.ts          bytes / speed / ETA formatters
  components/            DeviceRadar, DeviceList, SendDropzone, TransferList,
                         TransferItem, IncomingPrompt, Settings, WatchFolders,
                         UpdateBanner, ui/* (shadcn-style primitives)
src-tauri/src/
  protocol.rs            Control/FileMeta/Device/Progress/... + framed I/O
  state.rs               AppState: settings, peers, pending offers, cancels, watches
  discovery.rs           mDNS advertise + browse → devices-changed
  transfer.rs            TCP listener (receive) + send_files, progress, sha256
  watch.rs               watch-folder auto-send
  updater.rs             update check / install
  lib.rs                 setup + Tauri command surface
```

See [DECISIONS.md](DECISIONS.md) for non-obvious architectural choices.

## Notes on the update checker

The updater is wired but points at a placeholder release feed
(`tauri.conf.json → plugins.updater.endpoints`). To enable real updates: host a
Tauri update manifest at that endpoint and sign release artifacts with the
private key matching the committed `pubkey` (generate with
`npm run tauri signer generate`). Until then, the startup check simply finds no
update and stays quiet.

## Roadmap

Phase 2 (internet mode via WebRTC + signaling relay, room codes / QR pairing,
connection-quality indicator) and the broader backlog (pause/resume, trusted
devices, conflict handling, transfer history, system tray, theme toggle) are
tracked in the build plan.
