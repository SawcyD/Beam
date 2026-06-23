# Architecture decisions

A running log of non-obvious choices. Newest at the bottom.

## Stack pinning

- **React 18, not 19.** `create-tauri-app` scaffolds React 19, but the brief
  locks React 18, so `package.json` pins `react@^18.3.1` / `react-dom@^18.3.1`
  and matching `@types`. shadcn/Radix components work the same on 18.
- **Tailwind v3, not v4.** v4 moves config into CSS and changes the PostCSS
  pipeline. v3 with a classic `tailwind.config.js` is the most predictable base
  for a hand-authored theme, so we pinned `tailwindcss@^3.4`.
- **shadcn components authored by hand** (`src/components/ui/*`) instead of
  running `npx shadcn@latest init` / `add`. The CLI is interactive and rewrites
  config; in this environment, writing the same Radix + Tailwind component code
  directly is more reliable and produces equivalent output. The components
  installed: button, progress, dialog, switch, scroll-area, tooltip — exactly
  the set the brief calls for.

## Discovery (mDNS)

- `mdns-sd` 0.11. We advertise `_beam._tcp.local.` with `ServiceInfo` +
  `enable_addr_auto()` so all reachable interface addresses are filled in
  automatically rather than us guessing a local IP.
- The **friendly device name lives in a TXT record** (`name=…`), while the mDNS
  instance/host name is derived from a stable random `id` (`beam-<id8>`). This
  means two machines can share a friendly name without an mDNS collision, and a
  rename only updates TXT — it re-registers live (`set_device_name` →
  `discovery::reregister_name`) without a restart.
- The browse channel is a blocking `flume` receiver, so it runs on a dedicated
  OS thread, not a tokio worker.

## Transfer protocol

- **One TCP connection carries both control and payload.** Control messages are
  `u32` big-endian length-prefixed JSON (`protocol::{read,write}_control`);
  immediately after the receiver's `Response{accept:true}`, the sender streams
  raw file bytes in offer order. Sizes are known from the offer, so payloads
  need no framing.
- **SHA-256 is computed fully on the sender before the offer** (so every
  checksum is in the offer) and **verified streaming on the receiver** as bytes
  are written. A mismatch fails the transfer and the bad file is deleted.
- **Rolling-average speed:** a 1.5s sliding window of `(timestamp, cumulative
  bytes)` samples (`SpeedMeter`) keeps the MB/s and ETA readouts from jittering.
- **Folders** are expanded on the sender by walking the tree; each file is sent
  with a forward-slash relative name that keeps the dropped folder as its top
  segment. The receiver sanitises every name (rejecting `..`, drive letters,
  absolute paths) before joining it onto the save dir.
- **Cancellation** is an `AtomicBool` checked each chunk. On cancel or any
  failure the receiver deletes every file it opened for that transfer, so no
  partial files are left behind. The sender simply drops the socket, which makes
  the receiver's next read hit EOF and clean up.

## Misc

- Default save dir is `<Downloads>/Beam`, resolved via Tauri's `download_dir()`
  path API — no hardcoded paths.
- Settings (device name, default save dir, theme) persist to `settings.json` in
  the Tauri app config dir.
- Notifications are best-effort: permission is requested once at startup and a
  send/receive completion fires a native notification, but a notification
  failure never affects the transfer.
- `theme` is persisted in settings but the toggle UI is left for the backlog;
  the palette is already fully CSS-variable driven so adding it later is cheap.
