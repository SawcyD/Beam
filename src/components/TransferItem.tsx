import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  Ban,
  FolderOpen,
  ExternalLink,
  X,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { motion, AnimatePresence } from "framer-motion";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  baseName,
  formatBytes,
  formatEta,
  formatPercent,
  formatSpeed,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transfer } from "@/types";

export function TransferItem({ transfer: t }: { transfer: Transfer }) {
  const cancelTransfer  = useBeamStore((s) => s.cancelTransfer);
  const dismissTransfer = useBeamStore((s) => s.dismissTransfer);
  const retryTransfer   = useBeamStore((s) => s.retryTransfer);
  const [expanded, setExpanded] = useState(false);

  const isActive = t.status === "active";
  const filePct  = t.fileSize > 0 ? t.fileBytes / t.fileSize : 0;
  const totalPct = t.totalSize > 0 ? t.totalBytes / t.totalSize : isActive ? 0 : 1;

  const firstFilePath =
    t.saveDir && t.files[0] ? joinPath(t.saveDir, t.files[0].name) : t.saveDir;

  const duration =
    t.completedAt && !isActive
      ? formatDuration(t.completedAt - t.startedAt)
      : null;

  const canRetry =
    t.status === "failed" && t.direction === "send" && !!t.originalPaths && !!t.peerAddr;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-panel/80 p-4 backdrop-blur-fluent"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusBadge transfer={t} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {t.direction === "send" ? "Sending to" : "Receiving from"}{" "}
              <span className="text-text">{t.peerName || "device"}</span>
            </p>
            <p className="truncate font-mono text-xs text-muted">
              {isActive ? baseName(t.fileName) || "…" : t.message}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {duration && (
            <span className="font-mono text-[10px] text-muted">{duration}</span>
          )}
          {!isActive && (
            <button
              onClick={() => dismissTransfer(t.id)}
              className="rounded p-1 text-muted hover:text-text"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bars ────────────────────────────────────────── */}
      {(isActive || t.status === "done") && (
        <div className="flex flex-col gap-2">
          {t.files.length > 1 && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-muted">
                <span>
                  File {Math.min(t.fileIndex + 1, t.files.length)} of{" "}
                  {t.files.length}
                </span>
                <span className="tabular font-mono">{formatPercent(filePct)}</span>
              </div>
              <Progress value={filePct * 100} indicatorClassName={barColor(t)} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-muted">
              <span>Overall</span>
              <span className="tabular font-mono">
                {formatBytes(t.totalBytes)}
                {t.totalSize > 0 && ` / ${formatBytes(t.totalSize)}`}
              </span>
            </div>
            <Progress value={totalPct * 100} indicatorClassName={barColor(t)} />
          </div>
        </div>
      )}

      {/* ── Live telemetry ───────────────────────────────────────── */}
      {isActive && (
        <div className="flex items-center justify-between gap-2 font-mono text-xs">
          <div className="flex gap-4">
            <Metric label="speed" value={formatSpeed(t.bytesPerSec)} />
            <Metric label="eta"   value={formatEta(t.etaSecs)} />
            <Metric label="done"  value={formatPercent(totalPct)} />
          </div>
          <Button variant="danger" size="sm" onClick={() => cancelTransfer(t.id)}>
            <Ban /> Cancel
          </Button>
        </div>
      )}

      {/* ── File list (expandable) ───────────────────────────────── */}
      {t.files.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
            />
            {t.files.length} file{t.files.length !== 1 ? "s" : ""}
            {t.totalSize > 0 && (
              <span className="font-mono">— {formatBytes(t.totalSize)}</span>
            )}
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="mt-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto overflow-x-hidden"
              >
                {t.files.map((f, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md px-2.5 py-1",
                      isActive && t.fileIndex === i
                        ? "bg-accent/10 text-accent"
                        : "bg-panel text-muted",
                    )}
                  >
                    <span className="truncate font-mono text-[11px]">{f.name}</span>
                    <span className="shrink-0 font-mono text-[10px]">
                      {formatBytes(f.size)}
                    </span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Completion actions ───────────────────────────────────── */}
      {(t.status === "done" || canRetry) && (
        <div className="flex flex-wrap gap-2">
          {t.status === "done" && t.direction === "receive" && t.saveDir && (
            <>
              <Button
                variant="ok"
                size="sm"
                onClick={() => firstFilePath && openPath(firstFilePath)}
              >
                <ExternalLink /> Open
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  firstFilePath
                    ? revealItemInDir(firstFilePath)
                    : t.saveDir && openPath(t.saveDir)
                }
              >
                <FolderOpen /> Show in folder
              </Button>
            </>
          )}
          {canRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => retryTransfer(t.id)}
            >
              <RefreshCw /> Retry
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({ transfer: t }: { transfer: Transfer }) {
  const base = "grid size-9 place-items-center rounded-lg shrink-0";
  if (t.status === "done")
    return <span className={cn(base, "bg-ok/15 text-ok")}><CheckCircle2 className="size-5" /></span>;
  if (t.status === "failed")
    return <span className={cn(base, "bg-err/15 text-err")}><XCircle className="size-5" /></span>;
  if (t.status === "cancelled")
    return <span className={cn(base, "bg-border text-muted")}><Ban className="size-5" /></span>;
  return (
    <span className={cn(base, "bg-accent/15 text-accent")}>
      {t.direction === "send"
        ? <ArrowUpFromLine className="size-5" />
        : <ArrowDownToLine className="size-5" />}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="tabular text-text">{value}</span>
    </span>
  );
}

function barColor(t: Transfer): string {
  if (t.status === "done") return "bg-ok";
  if (t.status === "failed" || t.status === "cancelled") return "bg-err";
  return "bg-accent";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const cleanName = name.replace(/\//g, sep);
  return dir.endsWith(sep) ? dir + cleanName : dir + sep + cleanName;
}
