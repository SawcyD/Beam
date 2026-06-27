import { useEffect, useRef } from "react";
import {
  ExternalLink, Pencil, Trash2, FolderPlus, Copy, Scissors,
  Clipboard, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Device } from "@/types";

interface Props {
  x: number;
  y: number;
  paths: string[];          // selected paths
  currentPath: string;
  selectedDevice: Device | undefined;
  clipboard: { paths: string[]; op: "copy" | "cut" } | null;
  onClose: () => void;
  onOpen: (paths: string[]) => void;
  onRename: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onNewFolder: () => void;
  onSendWithBeam: (paths: string[]) => void;
  onCopy: (paths: string[]) => void;
  onCut: (paths: string[]) => void;
  onPaste: () => void;
}

export function ExplorerContextMenu({
  x, y, paths, selectedDevice, clipboard,
  onClose, onOpen, onRename, onDelete, onNewFolder,
  onSendWithBeam, onCopy, onCut, onPaste,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Adjust position so menu doesn't overflow the viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 200;
  const menuH = 260;
  const left = x + menuW > vw ? vw - menuW - 8 : x;
  const top  = y + menuH > vh ? vh - menuH - 8 : y;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const hasSelection = paths.length > 0;
  const singleFile = paths.length === 1;

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-xl border border-border bg-panel/95 py-1 shadow-lg backdrop-blur-fluent"
      style={{ left, top, boxShadow: "var(--shadow-lg)" }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {hasSelection && (
        <>
          <Item icon={<ExternalLink />} label="Open" onClick={() => { onOpen(paths); onClose(); }} />
          <Divider />
          <Item icon={<Zap className="text-accent" />} label={`Send with Beam${paths.length > 1 ? ` (${paths.length})` : ""}`}
            onClick={() => { onSendWithBeam(paths); onClose(); }}
            disabled={!selectedDevice}
            accent
          />
          <Divider />
          <Item icon={<Copy />} label="Copy" onClick={() => { onCopy(paths); onClose(); }} shortcut="Ctrl+C" />
          <Item icon={<Scissors />} label="Cut"  onClick={() => { onCut(paths); onClose(); }}  shortcut="Ctrl+X" />
        </>
      )}

      {clipboard && (
        <Item
          icon={<Clipboard />}
          label={`Paste${clipboard.op === "cut" ? " (move)" : ""}`}
          onClick={() => { onPaste(); onClose(); }}
          shortcut="Ctrl+V"
        />
      )}

      {hasSelection && (
        <>
          <Divider />
          {singleFile && (
            <Item icon={<Pencil />} label="Rename" onClick={() => { onRename(paths[0]); onClose(); }} shortcut="F2" />
          )}
          <Item
            icon={<Trash2 />}
            label={`Delete${paths.length > 1 ? ` (${paths.length} items)` : ""}`}
            onClick={() => { onDelete(paths); onClose(); }}
            shortcut="Del"
            danger
          />
        </>
      )}

      {!hasSelection && (
        <>
          <Item icon={<FolderPlus />} label="New folder" onClick={() => { onNewFolder(); onClose(); }} />
          {clipboard && (
            <Item
              icon={<Clipboard />}
              label={`Paste${clipboard.op === "cut" ? " (move)" : ""}`}
              onClick={() => { onPaste(); onClose(); }}
              shortcut="Ctrl+V"
            />
          )}
        </>
      )}
    </div>
  );
}

function Item({
  icon, label, shortcut, onClick, disabled = false, danger = false, accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-[5px] text-left text-[12px] transition-colors disabled:pointer-events-none disabled:opacity-40",
        danger  ? "text-err hover:bg-err/10"   :
        accent  ? "font-medium text-accent hover:bg-accent/10" :
                  "text-text hover:bg-white/[0.07]",
      )}
    >
      <span className="size-[14px] shrink-0 [&>svg]:size-[14px]">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-muted">{shortcut}</span>
      )}
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-border" />;
}
