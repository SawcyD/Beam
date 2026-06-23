import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Settings2, Folder, Check, RefreshCw } from "lucide-react";
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

export function Settings() {
  const deviceName = useBeamStore((s) => s.deviceName);
  const defaultSaveDir = useBeamStore((s) => s.defaultSaveDir);
  const setDeviceName = useBeamStore((s) => s.setDeviceName);
  const setDefaultSaveDir = useBeamStore((s) => s.setDefaultSaveDir);

  const checkForUpdates = useBeamStore((s) => s.checkForUpdates);
  const updateAvailable = useBeamStore((s) => s.updateAvailable);

  const [open_, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(deviceName);
  const [savedFlash, setSavedFlash] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  async function doCheckUpdates() {
    setChecking(true);
    setCheckResult(null);
    try {
      await checkForUpdates();
      // The store's `updateAvailable` is set via the "update-available" event.
      setCheckResult(
        useBeamStore.getState().updateAvailable
          ? null
          : "You're on the latest version.",
      );
    } catch (e) {
      setCheckResult(String(e));
    } finally {
      setChecking(false);
    }
  }

  // Keep the draft in sync when the dialog (re)opens.
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
            How this machine appears to peers and where received files land.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-5 pr-3">
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
                  placeholder="Emmanuel's MacBook"
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

            {/* Default save directory */}
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

            <div className="h-px bg-border" />

            {/* Watch folders */}
            <WatchFolders />

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
