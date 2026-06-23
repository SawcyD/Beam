import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Folder, FileIcon } from "lucide-react";
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
import { baseName, formatBytes } from "@/lib/format";

/**
 * Modal shown when a peer offers files. The receiver sees who's sending, the
 * full file list, and the total size *before* anything touches disk, and picks
 * where files land (defaulting to the remembered save dir).
 */
export function IncomingPrompt() {
  const incoming = useBeamStore((s) => s.incoming);
  const defaultSaveDir = useBeamStore((s) => s.defaultSaveDir);
  const respondToOffer = useBeamStore((s) => s.respondToOffer);

  const [saveDir, setSaveDir] = useState(defaultSaveDir);

  // Reset the chosen folder to the default each time a new offer arrives.
  useEffect(() => {
    if (incoming) setSaveDir(defaultSaveDir);
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
        // Closing via overlay/escape counts as a reject.
        if (!o) void respondToOffer(false, null);
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

        <ScrollArea className="max-h-44 rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {incoming.files.map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 px-3 py-2">
                <FileIcon className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-text" title={f.name}>
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
            <span className="truncate font-mono text-xs text-muted" title={saveDir}>
              {saveDir || "Choose a folder…"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={chooseFolder}>
            Change…
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => respondToOffer(false, null)}
          >
            Reject
          </Button>
          <Button
            onClick={() => respondToOffer(true, saveDir)}
            disabled={!saveDir}
          >
            <Download /> Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
