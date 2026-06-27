import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Inbox, Zap } from "lucide-react";
import { useBeamStore } from "@/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TransferItem } from "./TransferItem";
import { formatBytes, formatSpeed } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "done" | "failed";

export function TransferList() {
  const transfers      = useBeamStore((s) => s.transfers);
  const sessionStats   = useBeamStore((s) => s.sessionStats);
  const clearCompleted = useBeamStore((s) => s.clearCompleted);
  const [filter, setFilter] = useState<Filter>("all");

  const all    = Object.values(transfers).sort((a, b) => b.startedAt - a.startedAt);
  const active = all.filter((t) => t.status === "active");
  const done   = all.filter((t) => t.status === "done");
  const failed = all.filter((t) => t.status === "failed" || t.status === "cancelled");

  const visible =
    filter === "active" ? active :
    filter === "done"   ? done   :
    filter === "failed" ? failed : all;

  const aggregateSpeed = active.reduce((s, t) => s + t.bytesPerSec, 0);
  const hasEnded = done.length + failed.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tab pills */}
        <div className="flex gap-0.5 rounded-lg bg-panel/60 p-0.5">
          {([ ["all", "All", all.length], ["active", "Active", active.length],
              ["done", "Done", done.length], ["failed", "Failed", failed.length],
            ] as [Filter, string, number][]).map(([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === tab ? "bg-surface text-text" : "text-muted hover:text-text",
              )}
            >
              {label}
              {count > 0 && (
                <span
                  className={cn(
                    "min-w-[16px] rounded-full px-1 font-mono text-[9px] tabular-nums leading-4",
                    filter === tab
                      ? tab === "active" ? "bg-accent/20 text-accent"
                        : tab === "failed" ? "bg-err/20 text-err"
                        : "bg-ok/20 text-ok"
                      : "bg-panel-2 text-muted",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {aggregateSpeed > 0 && (
          <span className="flex items-center gap-1 font-mono text-[11px] text-accent">
            <Zap className="size-3" />
            {formatSpeed(aggregateSpeed)}
          </span>
        )}

        {(sessionStats.sent > 0 || sessionStats.received > 0) && (
          <span className="font-mono text-[11px] text-muted">
            {sessionStats.sent > 0 && `↑ ${formatBytes(sessionStats.sent)}`}
            {sessionStats.sent > 0 && sessionStats.received > 0 && "  "}
            {sessionStats.received > 0 && `↓ ${formatBytes(sessionStats.received)}`}
          </span>
        )}

        {hasEnded && (
          <button
            onClick={clearCompleted}
            className="rounded px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            Clear done
          </button>
        )}
      </div>

      {/* ── List ─────────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
          <Inbox className="size-8 text-muted" />
          <p className="text-sm text-muted">
            {filter === "all"
              ? "No transfers yet. Drop files and pick a device to get started."
              : filter === "active"
              ? "No active transfers."
              : filter === "done"
              ? "No completed transfers yet."
              : "No failed transfers."}
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2.5 pr-2">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <TransferItem key={t.id} transfer={t} />
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
