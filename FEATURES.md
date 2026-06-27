# Beam — Feature List

Current feature set as of v0.1. All features run locally over LAN (Phase 1).

---

## Transfer

| Feature | Details |
|---|---|
| **File & folder send** | Drag-and-drop onto the window, or use the Files / Folder picker buttons. Folders are walked recursively; each file is sent with its relative path preserved. |
| **Text / clipboard send** | Switch to the Text tab in the send panel. Type freely or click "Paste clipboard" to send any text as a `.txt` file to the target device. |
| **Send to one device** | Select a peer from the Devices list (or the radar), stage files, click Send. |
| **SHA-256 integrity** | Sender hashes every file before the offer; receiver verifies streaming as bytes are written. Mismatch = transfer failed + partial files deleted. |
| **Cancel mid-transfer** | Cancel button drops the sender's socket; receiver detects EOF and cleans up all partial files. |
| **Live telemetry** | Rolling-average MB/s, ETA in seconds, per-file progress bar, and overall progress bar — all updated every 100 ms. |
| **Hashing progress** | While the sender computes SHA-256 (can be slow for large folders), the transfer card shows "Hashing N / M files…" instead of a blank spinner. |
| **Large folder support** | `walk_dir` skips symlinks and inaccessible system folders (Windows junctions, OneDrive stubs) instead of aborting the whole walk. |

---

## Discovery

| Feature | Details |
|---|---|
| **mDNS auto-discovery** | Beam advertises `_beam._tcp.local.` and browses for peers. Devices appear by friendly name, not raw IP. No manual IP entry needed. |
| **Device radar** | Signature visual: concentric pulsing rings with device nodes orbiting them and animated "packet stream" SVG flow lines during active transfers. |
| **Live device list** | Peers appear and disappear in real time as they join or leave the network. |
| **Live rename** | Changing your device name in Settings re-advertises the mDNS TXT record instantly — peers see the new name without a restart. |
| **Self-filtering** | Your own machine is never shown as a target device. |

---

## Receive

| Feature | Details |
|---|---|
| **Accept / reject prompt** | Shows sender name, full file list with individual sizes, and total size *before* anything touches disk. |
| **Custom save folder** | Receiver picks a destination per transfer; defaults to `~/Downloads/Beam`. |
| **Conflict resolution** | Configurable in Settings: **Rename** (add ` (2)`, ` (3)`, … to the stem — default), **Overwrite**, or **Skip** (drains bytes from the stream to stay in sync). |
| **Trusted devices** | Toggle "Always auto-accept from X" in the incoming prompt. Trusted devices skip the prompt and deliver to the default save folder automatically. Manage the list in Settings. |
| **Open / Show in folder** | Completion buttons on each transfer card open the file or reveal its folder using native OS openers. |
| **Native notifications** | A system notification fires on send and receive completion (or failure), even when the window is in the background. |

---

## Automation

| Feature | Details |
|---|---|
| **Watch folders** | Point a watch rule at a local folder and a target peer. Any new file created in that folder is automatically sent to the peer. Configure in Settings → Watch Folders. |
| **Watch folder persistence** | Rules survive restarts and resume sending once the target peer is rediscovered on the LAN. |
| **Watch folder toggle** | Each rule has an on/off switch. Disabling a rule stops the watcher without deleting the rule. |
| **500 ms debounce** | Auto-sends wait 500 ms after a file-create event so apps that write-then-rename finish before Beam reads the file. |

---

## History

| Feature | Details |
|---|---|
| **Transfer history** | Every completed transfer (send or receive, success or failure) is logged to `history.json` in the app config directory. |
| **History modal** | Clock icon in the header opens the history panel. Shows direction, peer name, file count, total size, timestamp, and status icon. |
| **Show in folder** | Received transfers in history have a "Show" button that reveals the save directory. |
| **Clear history** | One-click clear button in the history panel. Rolling cap of 500 entries. |

---

## Appearance & Settings

| Feature | Details |
|---|---|
| **Dark / Light / System theme** | Three-button segmented control in Settings. "System" follows the OS preference. The entire palette is CSS-variable driven — switching is instant with no reload. |
| **Device name** | Set your friendly name (shown to peers) in Settings. Updates are broadcast to the network immediately via mDNS re-registration. |
| **Default save folder** | Persisted per-device; pre-fills the save-dir picker in the incoming prompt. |
| **Conflict policy** | Choose rename / overwrite / skip in Settings. Persisted to `settings.json`. |
| **Settings persistence** | Device name, default save folder, theme, conflict policy, and trusted devices are all written to `settings.json` in the app config directory and restored on next launch. |
| **Reduced-motion support** | All animations (radar pulse, packet stream, transfer list transitions) are disabled when `prefers-reduced-motion: reduce` is set. |

---

## Updates

| Feature | Details |
|---|---|
| **Startup update check** | Silently checks the configured release feed on launch. Failures (no network, no server) are swallowed — never interrupts the user. |
| **Update banner** | When a newer version is available, a dismissible amber banner appears at the top with a version number and an "Update & restart" button. |
| **Manual check** | "Check now" button in Settings → Updates. |
| **Signed releases** | Uses `tauri-plugin-updater` with a minisign keypair. Public key committed in `tauri.conf.json`; private key stays off the repo. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 + Radix UI (shadcn-style, hand-authored) |
| Animation | Framer Motion + CSS keyframes |
| State | Zustand |
| Discovery | `mdns-sd` 0.11 (`_beam._tcp.local.`) |
| Transfer | Plain TCP, u32-length-prefixed JSON control frames + raw byte payload |
| Integrity | SHA-256 via `sha2` 0.10 |
| File watching | `notify` 7 |
| Clipboard | `tauri-plugin-clipboard-manager` |
| Notifications | `tauri-plugin-notification` |
| Updates | `tauri-plugin-updater` |

---

## Roadmap (not yet built)

- **Internet transfers** — WebRTC relay, room codes, QR pairing (Phase 2)
- **Send to multiple devices at once** — parallel transfers to a group
- **Pause / resume** — suspend mid-transfer and continue later
- **System tray** — background receive with the window minimized
- **Right-click "Send with Beam"** — Windows Shell Extension
- **Transfer scheduling** — queue a send for off-hours
- **Bandwidth throttle** — cap Beam's network usage
- **Beam API** — programmatic file sends + webhooks
