import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readText as clipboardRead } from "@tauri-apps/plugin-clipboard-manager";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type {
  Device,
  DeviceGroup,
  HashProgress,
  HistoryEntry,
  IncomingOffer,
  ProgressEvent,
  Transfer,
  TransferDone,
  TrustedDevice,
  WatchConfig,
} from "./types";

type Theme = "dark" | "light" | "system";

interface BeamState {
  // --- discovery / settings ---
  devices: Device[];
  deviceName: string;
  defaultSaveDir: string;
  selectedDeviceId: string | null;
  theme: Theme;
  conflictPolicy: string;

  // --- transfers ---
  transfers: Record<string, Transfer>;
  incoming: IncomingOffer | null;

  // --- bandwidth + groups ---
  bandwidthLimit: number | null;
  setBandwidthLimit: (bps: number | null) => Promise<void>;
  groups: DeviceGroup[];
  createGroup: (name: string, deviceNames: string[]) => Promise<string>;
  deleteGroup: (id: string) => Promise<void>;

  // --- send staging ---
  stagedPaths: string[];
  addStaged: (paths: string[]) => void;
  removeStaged: (path: string) => void;
  clearStaged: () => void;

  // --- text / clipboard send ---
  sendText: (device: Device, content: string) => Promise<void>;
  readClipboard: () => Promise<string>;

  // --- trusted devices ---
  trustedDevices: TrustedDevice[];
  addTrustedDevice: (id: string, name: string) => Promise<void>;
  removeTrustedDevice: (id: string) => Promise<void>;
  refreshTrustedDevices: () => Promise<void>;

  // --- history ---
  history: HistoryEntry[];
  refreshHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;

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
  setTheme: (theme: Theme) => Promise<void>;
  setConflictPolicy: (policy: string) => Promise<void>;
  sendFiles: (device: Device, paths: string[], note?: string) => Promise<void>;
  respondToOffer: (accept: boolean, saveDir: string | null) => Promise<void>;
  respondToOfferWithTrust: (
    accept: boolean,
    saveDir: string | null,
    trust: boolean,
  ) => Promise<void>;
  cancelTransfer: (id: string) => Promise<void>;
  dismissTransfer: (id: string) => void;
  retryTransfer: (id: string) => Promise<void>;
  clearCompleted: () => void;
  sessionStats: { sent: number; received: number };
}

export const useBeamStore = create<BeamState>((set, get) => ({
  devices: [],
  deviceName: "",
  defaultSaveDir: "",
  selectedDeviceId: null,
  theme: "dark",
  conflictPolicy: "rename",
  transfers: {},
  incoming: null,
  sessionStats: { sent: 0, received: 0 },
  bandwidthLimit: null,
  groups: [],
  stagedPaths: [],
  watches: [],
  trustedDevices: [],
  history: [],
  updateAvailable: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });

    const [deviceName, defaultSaveDir, devices, theme, conflictPolicy, trustedDevices, bandwidthLimit, groups] =
      await Promise.all([
        invoke<string>("get_device_name"),
        invoke<string>("get_default_save_dir"),
        invoke<Device[]>("list_devices"),
        invoke<string>("get_theme"),
        invoke<string>("get_conflict_policy"),
        invoke<TrustedDevice[]>("list_trusted_devices"),
        invoke<number | null>("get_bandwidth_limit"),
        invoke<DeviceGroup[]>("get_groups"),
      ]);
    set({
      deviceName,
      defaultSaveDir,
      devices,
      theme: theme as Theme,
      conflictPolicy,
      trustedDevices,
      bandwidthLimit,
      groups,
    });
    applyTheme(theme as Theme);

    if (!(await isPermissionGranted())) {
      await requestPermission();
    }

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
    unlisten.push(
      await listen<HashProgress>("hash-progress", (e) => {
        applyHashProgress(set, e.payload);
      }),
    );

    await get().refreshWatches();

    window.addEventListener("beforeunload", () => unlisten.forEach((u) => u()));
  },

  selectDevice: (id) => set({ selectedDeviceId: id }),

  addStaged: (paths) =>
    set((s) => ({
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

  setTheme: async (theme) => {
    await invoke("set_theme", { theme });
    set({ theme });
    applyTheme(theme);
  },

  setConflictPolicy: async (policy) => {
    await invoke("set_conflict_policy", { policy });
    set({ conflictPolicy: policy });
  },

  setBandwidthLimit: async (bps) => {
    await invoke("set_bandwidth_limit", { bytesPerSec: bps });
    set({ bandwidthLimit: bps });
  },

  createGroup: async (name, deviceNames) => {
    const id = await invoke<string>("add_group", { name, deviceNames });
    set((s) => ({ groups: [...s.groups, { id, name, device_names: deviceNames }] }));
    return id;
  },

  deleteGroup: async (id) => {
    await invoke("remove_group", { id });
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },

  sendFiles: async (device, paths, note) => {
    if (paths.length === 0) return;
    let transferId: string;
    try {
      transferId = await invoke<string>("send_files", {
        addr: device.addr,
        peerName: device.name,
        paths,
        note: note ?? null,
      });
    } catch (e) {
      console.error("send_files error:", e);
      return;
    }
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
          originalPaths: paths,
          peerAddr: device.addr,
        },
      },
    }));
  },

  sendText: async (device, content) => {
    if (!content.trim()) return;
    let transferId: string;
    try {
      transferId = await invoke<string>("send_text", {
        addr: device.addr,
        peerName: device.name,
        content,
      });
    } catch (e) {
      console.error("send_text error:", e);
      return;
    }
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
          fileName: "clipboard.txt",
          fileBytes: 0,
          fileSize: new TextEncoder().encode(content).length,
          totalBytes: 0,
          totalSize: new TextEncoder().encode(content).length,
          bytesPerSec: 0,
          etaSecs: null,
          message: "Sending text…",
          saveDir: null,
          startedAt: Date.now(),
        },
      },
    }));
  },

  readClipboard: async () => {
    try {
      return (await clipboardRead()) ?? "";
    } catch {
      return "";
    }
  },

  respondToOffer: async (accept, saveDir) => {
    await get().respondToOfferWithTrust(accept, saveDir, false);
  },

  respondToOfferWithTrust: async (accept, saveDir, trust) => {
    const offer = get().incoming;
    if (!offer) return;
    set({ incoming: null });

    if (trust && offer.device_id) {
      await invoke("add_trusted_device", {
        id: offer.device_id,
        name: offer.device_name,
      });
      set((s) => ({
        trustedDevices: s.trustedDevices.some((d) => d.id === offer.device_id)
          ? s.trustedDevices
          : [...s.trustedDevices, { id: offer.device_id, name: offer.device_name }],
      }));
    }

    await invoke("respond_to_offer", {
      transferId: offer.transfer_id,
      accept,
      saveDir,
    });

    if (accept) {
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

  retryTransfer: async (id) => {
    const t = get().transfers[id];
    if (!t || t.direction !== "send" || !t.originalPaths || !t.peerAddr) return;
    const device = { id: "", name: t.peerName, addr: t.peerAddr };
    await get().sendFiles(device, t.originalPaths);
  },

  clearCompleted: () =>
    set((s) => {
      const next: typeof s.transfers = {};
      for (const [k, v] of Object.entries(s.transfers)) {
        if (v.status === "active") next[k] = v;
      }
      return { transfers: next };
    }),

  // --- Trusted devices ---
  refreshTrustedDevices: async () => {
    const trustedDevices = await invoke<TrustedDevice[]>("list_trusted_devices");
    set({ trustedDevices });
  },
  addTrustedDevice: async (id, name) => {
    await invoke("add_trusted_device", { id, name });
    await get().refreshTrustedDevices();
  },
  removeTrustedDevice: async (id) => {
    await invoke("remove_trusted_device", { id });
    await get().refreshTrustedDevices();
  },

  // --- History ---
  refreshHistory: async () => {
    const history = await invoke<HistoryEntry[]>("get_history");
    set({ history });
  },
  clearHistory: async () => {
    await invoke("clear_history");
    set({ history: [] });
  },

  // --- Watches ---
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

  // --- Updates ---
  checkForUpdates: async () => {
    console.log("[updater] invoking check_for_updates");
    const result = await invoke<boolean>("check_for_updates");
    console.log("[updater] invoke result:", result);
  },
  installUpdate: async () => {
    await invoke("install_update");
    set({ updateAvailable: null });
  },
}));

// --- Theme application ---

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("light", !isDark);
}

// --- Event reducers ---

type SetFn = (
  partial: Partial<BeamState> | ((s: BeamState) => Partial<BeamState>),
) => void;
type GetFn = () => BeamState;

function applyHashProgress(set: SetFn, p: HashProgress) {
  set((s) => {
    const existing = s.transfers[p.transfer_id];
    if (!existing) return {};
    return {
      transfers: {
        ...s.transfers,
        [p.transfer_id]: {
          ...existing,
          message: `Hashing ${p.hashed + 1} / ${p.total} files…`,
        },
      },
    };
  });
}

function applyProgress(set: SetFn, get: GetFn, p: ProgressEvent) {
  const existing = get().transfers[p.transfer_id];
  set((s) => ({
    transfers: {
      ...s.transfers,
      [p.transfer_id]: {
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
        message: "",
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

  const completedAt = Date.now();
  const finalBytes = existing?.totalSize ?? 0;

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
        completedAt,
      } as Transfer,
    },
    sessionStats: d.ok
      ? {
          sent: s.sessionStats.sent + (d.direction === "send" ? finalBytes : 0),
          received: s.sessionStats.received + (d.direction === "receive" ? finalBytes : 0),
        }
      : s.sessionStats,
  }));

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
    // Never let notification failures break a transfer.
  }
}
