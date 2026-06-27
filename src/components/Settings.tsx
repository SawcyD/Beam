import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Settings2,
  Folder,
  Check,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  ShieldOff,
  Gauge,
  Users,
  Trash2,
  Plus,
} from "lucide-react";
import { useBeamStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WatchFolders } from "./WatchFolders";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light" | "system";

export function Settings() {
  const deviceName = useBeamStore((s) => s.deviceName);
  const defaultSaveDir = useBeamStore((s) => s.defaultSaveDir);
  const setDeviceName = useBeamStore((s) => s.setDeviceName);
  const setDefaultSaveDir = useBeamStore((s) => s.setDefaultSaveDir);
  const theme = useBeamStore((s) => s.theme);
  const setTheme = useBeamStore((s) => s.setTheme);
  const conflictPolicy = useBeamStore((s) => s.conflictPolicy);
  const setConflictPolicy = useBeamStore((s) => s.setConflictPolicy);
  const trustedDevices = useBeamStore((s) => s.trustedDevices);
  const removeTrustedDevice = useBeamStore((s) => s.removeTrustedDevice);
  const checkForUpdates = useBeamStore((s) => s.checkForUpdates);
  const updateAvailable = useBeamStore((s) => s.updateAvailable);
  const bandwidthLimit = useBeamStore((s) => s.bandwidthLimit);
  const setBandwidthLimit = useBeamStore((s) => s.setBandwidthLimit);
  const groups = useBeamStore((s) => s.groups);
  const devices = useBeamStore((s) => s.devices);
  const createGroup = useBeamStore((s) => s.createGroup);
  const deleteGroup = useBeamStore((s) => s.deleteGroup);

  const [open_, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(deviceName);
  const [savedFlash, setSavedFlash] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupDevicesSel, setGroupDevicesSel] = useState<string[]>([]);

  async function doCheckUpdates() {
    setChecking(true);
    setCheckResult(null);
    try {
      await checkForUpdates();
      setCheckResult(
        useBeamStore.getState().updateAvailable
          ? null
          : "You're on the latest version.",
      );
    } catch {
      setCheckResult("Could not reach update server.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (open_) setNameDraft(deviceName);
  }, [open_, deviceName]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === deviceName) return;
    await setDeviceName(trimmed);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  async function chooseDefaultFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultSaveDir || undefined,
    });
    if (typeof picked === "string") await setDefaultSaveDir(picked);
  }

  const themeOptions: { value: Theme; icon: React.ReactNode; label: string }[] =
    [
      { value: "dark", icon: <Moon className="size-3.5" />, label: "Dark" },
      { value: "light", icon: <Sun className="size-3.5" />, label: "Light" },
      { value: "system", icon: <Monitor className="size-3.5" />, label: "System" },
    ];

  return (
    <Dialog open={open_} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Appearance, device identity, receive behaviour.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="flex flex-col gap-5 pr-3">
            {/* Theme */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">Appearance</span>
              <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                      theme === opt.value
                        ? "bg-accent/20 text-accent"
                        : "text-muted hover:text-text",
                    )}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Device name */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">Device name</span>
              <div className="flex gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  maxLength={48}
                  className="h-9 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="My Laptop"
                />
                <Button
                  variant="secondary"
                  onClick={saveName}
                  disabled={!nameDraft.trim() || nameDraft.trim() === deviceName}
                >
                  {savedFlash ? <Check className="text-ok" /> : "Save"}
                </Button>
              </div>
            </label>

            {/* Default save dir */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">
                Default save folder
              </span>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Folder className="size-4 shrink-0 text-muted" />
                  <span
                    className="truncate font-mono text-xs text-muted"
                    title={defaultSaveDir}
                  >
                    {defaultSaveDir || "Not set"}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={chooseDefaultFolder}>
                  Change…
                </Button>
              </div>
            </div>

            {/* Conflict policy */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">
                When a file already exists
              </span>
              <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
                {(
                  [
                    { value: "rename", label: "Rename" },
                    { value: "overwrite", label: "Overwrite" },
                    { value: "skip", label: "Skip" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setConflictPolicy(opt.value)}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-medium transition-colors",
                      conflictPolicy === opt.value
                        ? "bg-accent/20 text-accent"
                        : "text-muted hover:text-text",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                {conflictPolicy === "rename"
                  ? "Adds (2), (3), … to keep both copies."
                  : conflictPolicy === "overwrite"
                    ? "Replaces the existing file without asking."
                    : "Skips the file silently."}
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Trusted devices */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text">
                Trusted devices
              </span>
              {trustedDevices.length === 0 ? (
                <p className="text-xs text-muted">
                  No trusted devices yet. Toggle "Always auto-accept" in the
                  incoming transfer prompt to add one.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {trustedDevices.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2"
                    >
                      <span className="text-sm text-text">{d.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted hover:text-err"
                        onClick={() => removeTrustedDevice(d.id)}
                        aria-label={`Remove trust for ${d.name}`}
                      >
                        <ShieldOff className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Watch folders */}
            <WatchFolders />

            <div className="h-px bg-border" />

            {/* Bandwidth limit */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Gauge className="size-3.5 text-muted" />
                <span className="text-sm font-medium text-text">Send bandwidth limit</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {([
                  { label: "Unlimited", value: null },
                  { label: "50 MB/s", value: 50 * 1024 * 1024 },
                  { label: "20 MB/s", value: 20 * 1024 * 1024 },
                  { label: "10 MB/s", value: 10 * 1024 * 1024 },
                  { label: "5 MB/s",  value: 5  * 1024 * 1024 },
                  { label: "1 MB/s",  value: 1  * 1024 * 1024 },
                ] as { label: string; value: number | null }[]).map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setBandwidthLimit(opt.value)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                      bandwidthLimit === opt.value
                        ? "bg-accent/20 text-accent"
                        : "border border-border text-muted hover:text-text",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Device groups */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <Users className="size-3.5 text-muted" />
                <span className="text-sm font-medium text-text">Device groups</span>
              </div>
              {groups.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {groups.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-text">{g.name}</p>
                        <p className="truncate font-mono text-[10px] text-muted">
                          {g.device_names.join(", ")}
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="shrink-0 text-muted hover:text-err"
                        onClick={() => deleteGroup(g.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Create group */}
              <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg p-3">
                <input
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  placeholder="Group name…"
                  className="h-8 rounded-md border border-border bg-panel px-2.5 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <div className="flex flex-wrap gap-1">
                  {devices.map((d) => (
                    <button
                      key={d.id}
                      onClick={() =>
                        setGroupDevicesSel((prev) =>
                          prev.includes(d.name)
                            ? prev.filter((n) => n !== d.name)
                            : [...prev, d.name],
                        )
                      }
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                        groupDevicesSel.includes(d.name)
                          ? "bg-accent/20 text-accent"
                          : "border border-border text-muted hover:text-text",
                      )}
                    >
                      {d.name}
                    </button>
                  ))}
                  {devices.length === 0 && (
                    <p className="text-[11px] text-muted">No devices visible right now — they'll be here when online.</p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  disabled={!groupNameDraft.trim() || groupDevicesSel.length === 0}
                  onClick={async () => {
                    await createGroup(groupNameDraft.trim(), groupDevicesSel);
                    setGroupNameDraft("");
                    setGroupDevicesSel([]);
                  }}
                >
                  <Plus className="size-3.5" /> Create group
                </Button>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Updates */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text">Updates</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={doCheckUpdates}
                  disabled={checking}
                >
                  <RefreshCw className={checking ? "animate-spin" : ""} />
                  {checking ? "Checking…" : "Check now"}
                </Button>
              </div>
              {updateAvailable ? (
                <p className="text-xs text-accent">
                  Version {updateAvailable.version} is available — see the banner
                  to install.
                </p>
              ) : (
                checkResult && (
                  <p className="text-xs text-muted">{checkResult}</p>
                )
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
