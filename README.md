# Beam — LAN File Transfer

Fast, frictionless file transfer for your local network. Send files, text, and messages between computers on the same WiFi with zero setup.

![Built with Tauri 2 + React 18](https://img.shields.io/badge/Built%20with-Tauri%202%20%2B%20React%2018-blue?logo=tauri) ![License: MIT](https://img.shields.io/badge/License-MIT-green)

## Features

🚀 **Performance**
- Parallel SHA-256 hashing (all CPU cores via rayon)
- Auto-compression for 10+ files (zips before send, auto-unzips on receive)
- Live telemetry: speed, ETA, per-file and overall progress

💬 **Communication**
- Transfer notes — attach messages to any send
- Incoming transfer prompt with sender name, file list, size
- Device groups — send to multiple devices in one click

🎯 **Control**
- Bandwidth throttling (1–50 MB/s or unlimited)
- Transfer filters: All / Active / Done / Failed with live badges
- Trusted devices — auto-accept from known peers
- Watch folders — auto-send new files to a target device
- Cancelable transfers with partial cleanup

🎨 **UI/UX**
- Windows 11 Fluent design (Mica blur, Segoe UI Variable, amber accent)
- System tray — minimize to background, receives while hidden
- File explorer with list/grid views, inline rename, keyboard shortcuts
- Session stats: aggregate speed, bytes sent/received

🔄 **Reliability**
- SHA-256 integrity verification (both ends)
- Conflict handling: rename / overwrite / skip
- Auto-update from GitHub releases
- Transfer history and replay
- Cross-platform: Windows, macOS, Linux

## Download

**[→ Get Beam from Releases](https://github.com/SawcyD/Beam/releases)**

- **Windows**: `.msi` installer or portable `.exe`
- **macOS**: Universal `.dmg` (arm64 + x86)
- **Linux**: `.AppImage` or `.deb`

Auto-updates when new versions are available.

## Quick Start

1. **Install Beam** on 2+ machines on the same local network
2. **Open Beam** — nearby devices appear automatically
3. **Drag files** onto the send panel or use the file explorer
4. **Pick a device** (or group) and hit Send
5. **Receiver accepts** → files land in Downloads/Beam

## Usage Guide

### Sending Files

**Drag & drop:** Drag files/folders onto the send panel.  
**File browser:** Click the **Explorer** tab, browse folders, right-click → **Send with Beam**.  
**Watch folder:** Settings → Watch Folders → pick a folder and target device. Auto-sends new files.

### Transfer Notes

Before sending, click "Add note for recipient" and type a message (max 280 chars). The recipient sees it in the accept prompt.

### Device Groups

**Create a group:** Settings → Device Groups → type a name, select devices, click "Create group".  
**Send to group:** In the send panel, click "+ Add device", select your group. All online members are added.

### Bandwidth Control

Settings → Send bandwidth limit: cap upload speed to avoid network congestion.

### Trusted Devices

When receiving a transfer, toggle "Always auto-accept from [device]". They'll never prompt again—transfers auto-accept to your default save folder.

### System Tray

Close the window → Beam keeps running in the background ready to receive. Left-click the tray icon to toggle the window.

### Transfer Management

- **Filter transfers:** All / Active / Done / Failed tabs with live counts
- **View file list:** Expand any transfer card to see all files + sizes
- **Retry failed sends:** Click the Retry button on failed transfers
- **Clear completed:** Bulk-dismiss done/failed transfers with one click
- **Session stats:** See aggregate speed (Zap icon) and total bytes sent/received

## Building from Source

**Requirements:**
- Node.js 18+ (LTS recommended)
- Rust 1.70+
- Platform-specific:
  - **Windows**: Microsoft Visual C++ Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

**Setup:**

```bash
git clone https://github.com/SawcyD/Beam.git
cd Beam
npm install

# Development (hot reload)
npm run dev

# Production build
npm run build

# Package installer
npm run tauri build
```

Installers appear in `src-tauri/target/release/bundle/`.

## Project Structure

```
src/
  ├── components/              UI components
  │   ├── Explorer/            File browser (list, grid, context menu, sidebar)
  │   ├── DeviceList.tsx       Nearby devices
  │   ├── TransferList.tsx     Transfer filtering + stats
  │   ├── TransferItem.tsx     Per-transfer progress (expandable file list, retry)
  │   ├── SendDropzone.tsx     File staging + device/group picker + note field
  │   ├── IncomingPrompt.tsx   Accept/reject with note display
  │   ├── Settings.tsx         Device name, save dir, theme, bandwidth, groups
  │   └── ui/                  Primitives (button, dialog, progress, etc.)
  ├── store.ts                 Zustand state, device groups, bandwidth limit
  └── types.ts                 Protocol types, DeviceGroup, FsEntry, etc.

src-tauri/src/
  ├── lib.rs                   Setup, tray menu, command handlers, bandwidth/groups
  ├── transfer.rs              Send/receive, hashing, compression, bandwidth throttle
  ├── discovery.rs             mDNS peer discovery
  ├── protocol.rs              Wire format (Control, Offer with note, etc.)
  ├── state.rs                 AppState, Settings (bandwidth_limit, groups)
  ├── explorer.rs              File browser commands
  ├── watch.rs                 Folder monitoring + auto-send
  ├── updater.rs               Update check/install
  └── history.rs               Transfer log

.github/workflows/
  ├── release.yml              Build & sign on git tag, create GitHub release
  └── ci.yml                   Type-check & cargo check on push
```

## How It Works

**Discovery:**
- mDNS advertises `_beam._tcp` service with device name + ID + port
- Peers resolved via DNS-SD, shown in Nearby list

**Transfer Protocol:**
1. Sender → Receiver: TCP connection, sends `Offer` (files, SHA-256, optional note, compress flag)
2. Receiver → Sender: `Response { accept: bool }`
3. If accepted: Sender streams file bytes in order, receiver hashes & writes
4. Both emit `transfer-progress` (speed/ETA) and `transfer-done` (status)
5. If compressed: receiver unzips archive and cleans up

**Bandwidth Throttle:**
- Per-chunk sleep: if limit is 10 MB/s, sleeps to stay within that rate

**Device Groups:**
- Stored in `settings.json` as `{ id, name, device_names: ["Device A", "Device B"] }`
- Matched by device name (stable for LAN peers)
- When sent to, resolves group names → online devices with those names

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand, Framer Motion, Lucide icons
- **Backend**: Tauri 2, Rust, Tokio async
- **Protocols**: mDNS (mdns-sd), TCP with length-framed JSON (serde), SHA-256 (sha2), ZIP (zip v2)
- **Utilities**: Rayon (parallel hashing), Trash (safe deletes), Window Vibrancy (Mica), Notify (watch folders)
- **CI/CD**: GitHub Actions (auto-release on git tag)

## Roadmap

- Clipboard sync (live bidirectional sharing)
- Screenshot → send (global hotkey, auto-stage PNG)
- File request (ask peer for a file)
- Transfer queue reordering (drag to prioritize)
- Bidirectional folder sync
- Beam Link (temporary HTTP download URL for non-Beam clients)

## Troubleshooting

**Devices not appearing?**
- Both machines must be on the same local network/subnet
- Check firewall (mDNS port 5353, your listening port)
- Restart Beam on both sides

**Transfer stalls or is slow?**
- Check network congestion/WiFi signal
- Enable bandwidth throttling in Settings
- Try a smaller file to isolate the issue

**Update check fails?**
- Repo must be public (auto-update requires no auth)
- Check internet connection
- Manually download from Releases if needed

## Contributing

**Report issues:** [GitHub Issues](https://github.com/SawcyD/Beam/issues)

**Submit code:**
1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-idea`)
3. Test locally
4. Open a pull request

## License

[MIT License](LICENSE) — free to use, modify, distribute.

---

Made with ❤️ for frictionless local file transfer.  
[GitHub](https://github.com/SawcyD/Beam) · [Issues](https://github.com/SawcyD/Beam/issues) · [Releases](https://github.com/SawcyD/Beam/releases)
