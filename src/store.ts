import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type {
  Device,
  IncomingOffer,
  ProgressEvent,
  Transfer,
  TransferDone,
  WatchConfig,
} from "./types";

interface BeamState {
  // --- discovery / settings ---
  devices: Device[];
  deviceName: string;
  defaultSaveDir: string;
  selectedDeviceId: string | null;

  // --- transfers ---
  transfers: Record<string, Transfer>;
  incoming: IncomingOffer | null;

  // --- send staging (files dropped/picked, awaiting a target device) ---
  stagedPaths: string[];
  addStaged: (paths: string[]) => void;
  removeStaged: (path: string) => void;
  clearStaged: () => void;

  // --- watch folders ---
  watches: WatchConfig[];
  addWatch: (path: string, peerId: string, peerName: string) => Promise<void>;
  removeWatch: (watchId: string) => Promise<void>;
  toggleWatch: (watchId: string, enabled: boolean) => Promise<void>;
  refreshWatches: () => Promise<void>;

  // --- update checker ---
  updateAvailable: { version: string; body: string } | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;

  // --- lifecycle ---
  initialized: boolean;
  init: () => Promise<void>;

  // --- actions ---
  selectDevice: (id: string | null) => void;
  setDeviceName: (name: string) => Promise<void>;
  setDefaultSaveDir: (path: string) => Promise<void>;
  sendFiles: (device: Device, paths: string[]) => Promise<void>;
  respondToOffer: (accept: boolean, saveDir: string | null) => Promise<void>;
  cancelTransfer: (id: string) => Promise<void>;
  dismissTransfer: (id: string) => void;
}

export const useBeamStore = create<BeamState>((set, get) => ({
  devices: [],
  deviceName: "",
  defaultSaveDir: "",
  selectedDeviceId: null,
  transfers: {},
  incoming: null,
  stagedPaths: [],
  watches: [],
  updateAvailable: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    // Pull initial settings + any peers already discovered.
    const [deviceName, defaultSaveDir, devices] = await Promise.all([
      invoke<string>("get_device_name"),
      invoke<string>("get_default_save_dir"),
      invoke<Device[]>("list_devices"),
    ]);
    set({ deviceName, defaultSaveDir, devices });

    // Ask for notification permission once, up front.
    if (!(await isPermissionGranted())) {
      await requestPermission();
    }

    // Wire backend events. These listeners live for the app's lifetime.
    const unlisten: UnlistenFn[] = [];
    unlisten.push(
      await listen<Device[]>("devices-changed", (e) => {
        set({ devices: e.payload });
      }),
    );
    unlisten.push(
      await listen<IncomingOffer>("incoming-offer", (e) => {
        set({ incoming: e.payload });
      }),
    );
    unlisten.push(
      await listen<ProgressEvent>("transfer-progress", (e) => {
        applyProgress(set, get, e.payload);
      }),
    );
    unlisten.push(
      await listen<TransferDone>("transfer-done", (e) => {
        applyDone(set, get, e.payload);
      }),
    );
    unlisten.push(
      await listen<{ version: string; body: string }>("update-available", (e) => {
        set({ updateAvailable: e.payload });
      }),
    );

    // Load initial watches list.
    await get().refreshWatches();

    // Best-effort cleanup if the window ever tears down.
    window.addEventListener("beforeunload", () => unlisten.forEach((u) => u()));
  },

  selectDevice: (id) => set({ selectedDeviceId: id }),

  addStaged: (paths) =>
    set((s) => ({
      // De-dupe so dropping the same file twice doesn't stack it.
      stagedPaths: Array.from(new Set([...s.stagedPaths, ...paths])),
    })),
  removeStaged: (path) =>
    set((s) => ({ stagedPaths: s.stagedPaths.filter((p) => p !== path) })),
  clearStaged: () => set({ stagedPaths: [] }),

  setDeviceName: async (name) => {
    await invoke("set_device_name", { name });
    set({ deviceName: name });
  },

  setDefaultSaveDir: async (path) => {
    await invoke("set_default_save_dir", { path });
    set({ defaultSaveDir: path });
  },

  sendFiles: async (device, paths) => {
    if (paths.length === 0) return;
    const transferId = await invoke<string>("send_files", {
      addr: device.addr,
      paths,
    });
    // Show the transfer immediately as "preparing" — the sender hashes files
    // before any progress events fire, which can take a moment for big files.
    set((s) => ({
      transfers: {
        ...s.transfers,
        [transferId]: {
          id: transferId,
          direction: "send",
          peerName: device.name,
          files: [],
          status: "active",
          fileIndex: 0,
          fileName: "",
          fileBytes: 0,
          fileSize: 0,
          totalBytes: 0,
          totalSize: 0,
          bytesPerSec: 0,
          etaSecs: null,
          message: "Preparing…",
          saveDir: null,
          startedAt: Date.now(),
        },
      },
    }));
  },

  respondToOffer: async (accept, saveDir) => {
    const offer = get().incoming;
    if (!offer) return;
    set({ incoming: null });
    await invoke("respond_to_offer", {
      transferId: offer.transfer_id,
      accept,
      saveDir,
    });
    if (accept) {
      // Seed a receive transfer record so the UI shows it right away.
      set((s) => ({
        transfers: {
          ...s.transfers,
          [offer.transfer_id]: {
            id: offer.transfer_id,
            direction: "receive",
            peerName: offer.device_name,
            files: offer.files,
            status: "active",
            fileIndex: 0,
            fileName: offer.files[0]?.name ?? "",
            fileBytes: 0,
            fileSize: offer.files[0]?.size ?? 0,
            totalBytes: 0,
            totalSize: offer.total_bytes,
            bytesPerSec: 0,
            etaSecs: null,
            message: "Receiving…",
            saveDir,
            startedAt: Date.now(),
          },
        },
      }));
    }
  },

  cancelTransfer: async (id) => {
    await invoke("cancel_transfer", { transferId: id });
  },

  dismissTransfer: (id) =>
    set((s) => {
      const next = { ...s.transfers };
      delete next[id];
      return { transfers: next };
    }),

  refreshWatches: async () => {
    const watches = await invoke<WatchConfig[]>("list_watches");
    set({ watches });
  },

  addWatch: async (path, peerId, peerName) => {
    await invoke("add_watch", { path, peerId, peerName });
    await get().refreshWatches();
  },

  removeWatch: async (watchId) => {
    await invoke("remove_watch", { watchId });
    await get().refreshWatches();
  },

  toggleWatch: async (watchId, enabled) => {
    await invoke("toggle_watch", { watchId, enabled });
    await get().refreshWatches();
  },

  checkForUpdates: async () => {
    await invoke<boolean>("check_for_updates");
  },

  installUpdate: async () => {
    await invoke("install_update");
    set({ updateAvailable: null });
  },
}));

// --- event reducers (kept outside the store object for readability) ---

type SetFn = (
  partial: Partial<BeamState> | ((s: BeamState) => Partial<BeamState>),
) => void;
type GetFn = () => BeamState;

function applyProgress(set: SetFn, get: GetFn, p: ProgressEvent) {
  const existing = get().transfers[p.transfer_id];
  set((s) => ({
    transfers: {
      ...s.transfers,
      [p.transfer_id]: {
        // Start from the existing record so we keep peerName/files/startedAt.
        ...(existing ?? {
          id: p.transfer_id,
          direction: p.direction,
          peerName: "",
          files: [],
          status: "active" as const,
          saveDir: null,
          startedAt: Date.now(),
          message: "",
        }),
        id: p.transfer_id,
        direction: p.direction,
        status: "active",
        fileIndex: p.file_index,
        fileName: p.file_name,
        fileBytes: p.file_bytes,
        fileSize: p.file_size,
        totalBytes: p.total_bytes,
        totalSize: p.total_size,
        bytesPerSec: p.bytes_per_sec,
        etaSecs: p.eta_secs,
        message: existing?.message === "Preparing…" ? "" : existing?.message ?? "",
      } as Transfer,
    },
  }));
}

function applyDone(set: SetFn, get: GetFn, d: TransferDone) {
  const existing = get().transfers[d.transfer_id];
  const status = d.ok
    ? "done"
    : /cancel/i.test(d.message)
      ? "cancelled"
      : "failed";

  set((s) => ({
    transfers: {
      ...s.transfers,
      [d.transfer_id]: {
        ...(existing ?? {
          id: d.transfer_id,
          direction: d.direction,
          peerName: "",
          files: [],
          fileIndex: 0,
          fileName: "",
          fileBytes: 0,
          fileSize: 0,
          totalBytes: 0,
          totalSize: 0,
          startedAt: Date.now(),
        }),
        id: d.transfer_id,
        direction: d.direction,
        status,
        bytesPerSec: 0,
        etaSecs: null,
        message: d.message,
        saveDir: d.save_dir ?? existing?.saveDir ?? null,
      } as Transfer,
    },
  }));

  // Native completion notification (success or failure).
  void fireNotification(d);
}

async function fireNotification(d: TransferDone) {
  const verb = d.direction === "send" ? "Sent" : "Received";
  const title = d.ok ? `Beam — ${verb}` : "Beam — Transfer failed";
  try {
    if (await isPermissionGranted()) {
      sendNotification({ title, body: d.message });
    }
  } catch {
    // Notifications are non-critical; never let them break a transfer.
  }
}
