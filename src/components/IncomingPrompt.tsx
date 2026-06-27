import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Folder, FileIcon, ShieldCheck, MessageSquare } from "lucide-react";
import { useBeamStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { baseName, formatBytes } from "@/lib/format";

export function IncomingPrompt() {
  const incoming = useBeamStore((s) => s.incoming);
  const defaultSaveDir = useBeamStore((s) => s.defaultSaveDir);
  const respondToOfferWithTrust = useBeamStore((s) => s.respondToOfferWithTrust);

  const [saveDir, setSaveDir] = useState(defaultSaveDir);
  const [trust, setTrust] = useState(false);

  useEffect(() => {
    if (incoming) {
      setSaveDir(defaultSaveDir);
      setTrust(false);
    }
  }, [incoming, defaultSaveDir]);

  if (!incoming) return null;

  async function chooseFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: saveDir || undefined,
    });
    if (typeof picked === "string") setSaveDir(picked);
  }

  return (
    <Dialog
      open={!!incoming}
      onOpenChange={(o) => {
        if (!o) void respondToOfferWithTrust(false, null, false);
      }}
    >
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>Incoming transfer</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-text">{incoming.device_name}</span>{" "}
            wants to send you {incoming.files.length} file
            {incoming.files.length === 1 ? "" : "s"} (
            <span className="font-mono">{formatBytes(incoming.total_bytes)}</span>
            ).
          </DialogDescription>
        </DialogHeader>

        {/* Sender note */}
        {incoming.note && (
          <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5">
            <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <p className="text-sm text-text">{incoming.note}</p>
          </div>
        )}

        <ScrollArea className="max-h-44 rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {incoming.files.map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 px-3 py-2">
                <FileIcon className="size-4 shrink-0 text-muted" />
                <span
                  className="min-w-0 flex-1 truncate text-sm text-text"
                  title={f.name}
                >
                  {baseName(f.name)}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {formatBytes(f.size)}
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>

        {/* Destination folder */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel/60 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Folder className="size-4 shrink-0 text-muted" />
            <span
              className="truncate font-mono text-xs text-muted"
              title={saveDir}
            >
              {saveDir || "Choose a folder…"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={chooseFolder}>
            Change…
          </Button>
        </div>

        {/* Trust toggle */}
        {incoming.device_id && (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5">
            <ShieldCheck className="size-4 shrink-0 text-muted" />
            <span className="flex-1 text-xs text-text">
              Always auto-accept from{" "}
              <span className="font-medium">{incoming.device_name}</span>
            </span>
            <Switch checked={trust} onCheckedChange={setTrust} />
          </label>
        )}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => respondToOfferWithTrust(false, null, false)}
          >
            Reject
          </Button>
          <Button
            onClick={() => respondToOfferWithTrust(true, saveDir, trust)}
            disabled={!saveDir}
          >
            <Download /> Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
