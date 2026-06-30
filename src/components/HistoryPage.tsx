import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  XCircle,
  Trash2,
  ClockIcon,
  Search,
  FolderOpen,
  Send,
} from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/types";

type Filter = "all" | "sent" | "received" | "failed";

export function HistoryPage() {
  const history        = useBeamStore((s) => s.history);
  const refreshHistory = useBeamStore((s) => s.refreshHistory);
  const clearHistory   = useBeamStore((s) => s.clearHistory);
  const addStaged      = useBeamStore((s) => s.addStaged);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery]   = useState("");
  const [stagedId, setStagedId] = useState<string | null>(null);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...history]
      .reverse()
      .filter((e) => {
        if (filter === "sent")     return e.direction === "send";
        if (filter === "received") return e.direction === "receive";
        if (filter === "failed")   return e.status !== "done";
        return true;
      })
      .filter((e) => !q || e.peer_name.toLowerCase().includes(q));
  }, [history, filter, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  function handleSendAgain(entry: HistoryEntry) {
    if (!entry.save_dir) return;
    addStaged([entry.save_dir]);
    setStagedId(entry.id);
    setTimeout(() => setStagedId(null), 2000);
  }

  const counts = useMemo(() => ({
    all:      history.length,
    sent:     history.filter((e) => e.direction === "send").length,
    received: history.filter((e) => e.direction === "receive").length,
    failed:   history.filter((e) => e.status !== "done").length,
  }), [history]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-5 py-3">
        {/* Search + clear */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by device name…"
              className="h-8 w-full rounded-lg border border-border bg-panel/60 pl-8 pr-3 text-xs text-text outline-none placeholder:text-muted focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted hover:text-err"
              onClick={() => void clearHistory()}
            >
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          )}
        </div>

        {/* Filter pills */}
        <div className="mt-2.5 flex gap-0.5">
          {(["all", "sent", "received", "failed"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                filter === f ? "bg-accent/15 text-accent" : "text-muted hover:text-text",
              )}
            >
              {f}
              {counts[f] > 0 && (
                <span
                  className={cn(
                    "min-w-[16px] rounded-full px-1 font-mono text-[9px] leading-4",
                    filter === f ? "bg-accent/20 text-accent" : "bg-panel-2 text-muted",
                  )}
                >
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState query={query} filter={filter} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-6 px-5 py-4">
            {groups.map(({ label, entries }) => (
              <section key={label}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {label}
                </p>
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden"
                  style={{ background: "var(--panel)" }}>
                  {entries.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      entry={entry}
                      staged={stagedId === entry.id}
                      onSendAgain={() => handleSendAgain(entry)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ── Row ───────────────────────────────────────────────────────────── */

function HistoryRow({
  entry,
  staged,
  onSendAgain,
}: {
  entry: HistoryEntry;
  staged: boolean;
  onSendAgain: () => void;
}) {
  const ts   = new Date(entry.timestamp_ms);
  const time = ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const dirLabel = entry.direction === "send" ? "Sent to" : "Received from";

  const statusColor =
    entry.status === "done"      ? "text-ok"  :
    entry.status === "cancelled" ? "text-muted" : "text-err";

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
      {/* Icon */}
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          entry.status === "done"
            ? entry.direction === "send"
              ? "bg-accent/10 text-accent"
              : "bg-ok/10 text-ok"
            : "bg-err/10 text-err",
        )}
      >
        {entry.status !== "done" ? (
          <XCircle className="size-4" />
        ) : entry.direction === "send" ? (
          <ArrowUpRight className="size-4" />
        ) : (
          <ArrowDownLeft className="size-4" />
        )}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-text">
            {entry.peer_name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            {entry.file_count} file{entry.file_count !== 1 ? "s" : ""}
            {" · "}
            {formatBytes(entry.total_bytes)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          <span>{dirLabel}</span>
          {entry.status !== "done" && (
            <span className={cn("ml-1.5", statusColor)}>
              · {entry.status}
            </span>
          )}
        </p>
      </div>

      {/* Time + actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {entry.direction === "receive" && entry.status === "done" && entry.save_dir && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-[11px] text-muted hover:text-text"
              onClick={() => void openPath(entry.save_dir!)}
              title="Open folder"
            >
              <FolderOpen className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1 text-[11px] transition-colors",
                staged ? "text-ok" : "text-muted hover:text-text",
              )}
              onClick={onSendAgain}
              title="Stage for sending"
            >
              <Send className="size-3.5" />
              {staged ? "Staged" : ""}
            </Button>
          </>
        )}
      </div>

      <span className="shrink-0 font-mono text-[10px] text-muted">{time}</span>
    </li>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */

function EmptyState({
  query,
  filter,
}: {
  query: string;
  filter: Filter;
}) {
  const msg = query
    ? `No transfers matching "${query}"`
    : filter !== "all"
    ? `No ${filter} transfers`
    : "No transfers yet";

  const sub = query
    ? "Try a different search term."
    : filter !== "all"
    ? "Try switching to All."
    : "Files you send and receive will appear here.";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div
        className="grid size-12 place-items-center rounded-2xl border border-border"
        style={{ background: "var(--panel)" }}
      >
        <ClockIcon className="size-5 text-muted" />
      </div>
      <p className="text-sm font-medium text-text">{msg}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

/* ── Date grouping ─────────────────────────────────────────────────── */

interface Group { label: string; entries: HistoryEntry[] }

function groupByDate(entries: HistoryEntry[]): Group[] {
  const now       = new Date();
  const startOf   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayMs   = startOf(now).getTime();
  const ystdMs    = todayMs - 86_400_000;
  const week7Ms   = todayMs - 6 * 86_400_000;

  const buckets: Record<string, HistoryEntry[]> = {
    Today: [],
    Yesterday: [],
    "Last 7 days": [],
    Older: [],
  };

  for (const e of entries) {
    const d = startOf(new Date(e.timestamp_ms)).getTime();
    if (d >= todayMs)      buckets["Today"].push(e);
    else if (d >= ystdMs)  buckets["Yesterday"].push(e);
    else if (d >= week7Ms) buckets["Last 7 days"].push(e);
    else                   buckets["Older"].push(e);
  }

  return Object.entries(buckets)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, entries: arr }));
}
