import { useEffect } from "react";
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, Ban, Trash2 } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useBeamStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/format";
import type { HistoryEntry } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function History({ open, onClose }: Props) {
  const history = useBeamStore((s) => s.history);
  const refreshHistory = useBeamStore((s) => s.refreshHistory);
  const clearHistory = useBeamStore((s) => s.clearHistory);

  useEffect(() => {
    if (open) void refreshHistory();
  }, [open, refreshHistory]);

  const sorted = [...history].reverse();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Transfer history</DialogTitle>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted hover:text-err"
                onClick={async () => {
                  await clearHistory();
                }}
              >
                <Trash2 className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </DialogHeader>

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No transfers yet.</p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <ul className="flex flex-col divide-y divide-border">
              {sorted.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const ts = new Date(entry.timestamp_ms);
  const label = ts.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusIcon =
    entry.status === "done" ? (
      <CheckCircle2 className="size-4 text-ok" />
    ) : entry.status === "cancelled" ? (
      <Ban className="size-4 text-muted" />
    ) : (
      <XCircle className="size-4 text-err" />
    );

  const dirIcon =
    entry.direction === "send" ? (
      <ArrowUpRight className="size-4 text-accent" />
    ) : (
      <ArrowDownLeft className="size-4 text-ok" />
    );

  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <div className="flex shrink-0 items-center gap-1">
        {dirIcon}
        {statusIcon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-text">{entry.peer_name}</span>
          <span className="shrink-0 font-mono text-xs text-muted">
            {entry.file_count} file{entry.file_count !== 1 ? "s" : ""}
            {" · "}
            {formatBytes(entry.total_bytes)}
          </span>
        </div>
        <p className="truncate text-xs text-muted" title={entry.message}>
          {label}
          {entry.status !== "done" ? ` · ${entry.message}` : ""}
        </p>
      </div>
      {entry.save_dir && entry.status === "done" && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-xs text-muted"
          onClick={() => void revealItemInDir(entry.save_dir!)}
        >
          Show
        </Button>
      )}
    </li>
  );
}
