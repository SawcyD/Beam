import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Download,
  Folder,
  FileIcon,
  ShieldCheck,
  MessageSquare,
  X,
  Laptop,
} from "lucide-react";
import { useBeamStore } from "@/store";
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

  const fileWord = incoming.files.length === 1 ? "file" : "files";

  return (
    /* Full-screen overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Card */}
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">

        {/* Dismiss (reject) X button */}
        <button
          className="absolute right-3.5 top-3.5 rounded-md p-1 text-muted hover:bg-white/[0.07] hover:text-text transition-colors"
          onClick={() => void respondToOfferWithTrust(false, null, false)}
          aria-label="Reject"
        >
          <X className="size-4" />
        </button>

        {/* Sender info */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
            <Laptop className="size-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {incoming.device_name}
            </p>
            <p className="text-xs text-muted">
              wants to send {incoming.files.length} {fileWord} (
              {formatBytes(incoming.total_bytes)})
            </p>
          </div>
        </div>

        {/* Sender note */}
        {incoming.note && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
            <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <p className="text-xs leading-relaxed text-text">{incoming.note}</p>
          </div>
        )}

        {/* File list */}
        <ScrollArea className="mb-3 max-h-36 overflow-auto rounded-xl border border-border/60 bg-panel/40">
          <ul className="divide-y divide-border/40">
            {incoming.files.map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 px-3 py-2">
                <FileIcon className="size-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-xs text-text" title={f.name}>
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
        <button
          className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-panel/40 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
          onClick={chooseFolder}
          title="Change save folder"
        >
          <Folder className="size-3.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
            {saveDir || "Choose a folder…"}
          </span>
          <span className="shrink-0 text-xs text-muted">Change</span>
        </button>

        {/* Trust toggle */}
        {incoming.device_id && (
          <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
            <ShieldCheck className="size-3.5 shrink-0 text-muted" />
            <span className="flex-1 text-xs text-text">
              Always trust{" "}
              <span className="font-medium">{incoming.device_name}</span>
            </span>
            <Switch checked={trust} onCheckedChange={setTrust} />
          </label>
        )}

        {/* Action buttons */}
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => void respondToOfferWithTrust(false, null, false)}
          >
            Decline
          </Button>
          <Button
            className="flex-1"
            onClick={() => void respondToOfferWithTrust(true, saveDir, trust)}
            disabled={!saveDir}
          >
            <Download className="size-3.5" />
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
