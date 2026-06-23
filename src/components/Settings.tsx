import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Settings2, Folder, Check } from "lucide-react";
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

export function Settings() {
  const deviceName = useBeamStore((s) => s.deviceName);
  const defaultSaveDir = useBeamStore((s) => s.defaultSaveDir);
  const setDeviceName = useBeamStore((s) => s.setDeviceName);
  const setDefaultSaveDir = useBeamStore((s) => s.setDefaultSaveDir);

  const [open_, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(deviceName);
  const [savedFlash, setSavedFlash] = useState(false);

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
      </DialogContent>
    </Dialog>
  );
}
