import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  Ban,
  FolderOpen,
  FolderIcon,
  ExternalLink,
  X,
  ChevronDown,
  RefreshCw,
  FileIcon,
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
  const totalPct = t.totalSize > 0 ? t.totalBytes / t.totalSize : isActive ? 0 : 1;

  // Detect a folder transfer: a single file whose name ends with .beam.zip
  const isFolderTransfer =
    (t.files.length === 1 && t.files[0].name.endsWith(".beam.zip")) ||
    (t.files.length === 0 && t.fileName.endsWith(".beam.zip"));

  function cleanFolderName(name: string): string {
    return baseName(name.replace(/\.beam\.zip$/, ""));
  }

  const headline = isFolderTransfer
    ? cleanFolderName(t.files[0]?.name || t.fileName)
    : t.files.length === 1
    ? baseName(t.files[0].name || t.fileName)
    : t.files.length > 1
    ? `${t.files.length} files`
    : baseName(t.fileName) || "Transfer";

  const subline = [
    t.direction === "send" ? "→" : "←",
    t.peerName || "device",
    t.totalSize > 0 ? formatBytes(t.totalSize) : null,
    t.message && t.status !== "active" ? t.message : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  // For folder transfers: open the extracted folder, not the .beam.zip.
  const firstFilePath = isFolderTransfer && t.saveDir
    ? joinPath(t.saveDir, cleanFolderName(t.files[0]?.name || t.fileName))
    : t.saveDir && t.files[0]
    ? joinPath(t.saveDir, t.files[0].name)
    : t.saveDir;

  const canRetry =
    t.status === "failed" && t.direction === "send" && !!t.originalPaths && !!t.peerAddr;

  const duration =
    t.completedAt && !isActive
      ? formatDuration(t.completedAt - t.startedAt)
      : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-panel/80 p-4 backdrop-blur-fluent"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* ── Row 1: icon + headline + right action ───────────────── */}
      <div className="flex items-center gap-3">
        <StatusBadge transfer={t} isFolder={isFolderTransfer} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-text">
            {headline}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{subline}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isActive && (
            <span className="tabular font-mono text-sm font-semibold text-accent">
              {formatPercent(totalPct)}
            </span>
          )}
          {duration && !isActive && (
            <span className="font-mono text-[10px] text-muted">{duration}</span>
          )}
          {!isActive && (
            <button
              onClick={() => dismissTransfer(t.id)}
              className="rounded p-1 text-muted transition-colors hover:text-text"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: progress bar ──────────────────────────────────── */}
      {(isActive || t.status === "done") && (
        <Progress
          value={totalPct * 100}
          className="h-[3px]"
          indicatorClassName={barColor(t)}
        />
      )}

      {/* ── Row 3: telemetry + cancel ────────────────────────────── */}
      {isActive && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-5 font-mono text-xs">
            <Metric icon="↑" value={formatSpeed(t.bytesPerSec)} />
            <Metric icon="ETA" value={formatEta(t.etaSecs)} />
            {t.files.length > 1 && (
              <Metric
                icon="file"
                value={`${Math.min(t.fileIndex + 1, t.files.length)} / ${t.files.length}`}
              />
            )}
          </div>
          <Button variant="danger" size="sm" onClick={() => cancelTransfer(t.id)}>
            <Ban className="size-3.5" /> Cancel
          </Button>
        </div>
      )}

      {/* ── Row 4: completion actions ────────────────────────────── */}
      {(t.status === "done" || canRetry) && (
        <div className="flex flex-wrap gap-2">
          {t.status === "done" && t.direction === "receive" && t.saveDir && (
            <>
              <Button
                variant="ok"
                size="sm"
                onClick={() => void (firstFilePath && openPath(firstFilePath))}
              >
                <ExternalLink className="size-3.5" /> Open
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void (firstFilePath
                    ? revealItemInDir(firstFilePath)
                    : t.saveDir && openPath(t.saveDir))
                }
              >
                <FolderOpen className="size-3.5" /> Show in folder
              </Button>
            </>
          )}
          {canRetry && (
            <Button variant="secondary" size="sm" onClick={() => retryTransfer(t.id)}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          )}
        </div>
      )}

      {/* ── Row 5: expandable file list ──────────────────────────── */}
      {t.files.length > 1 && (
        <div>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-text"
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-180")}
            />
            <FileIcon className="size-3 opacity-60" />
            {t.files.length} files
            {t.totalSize > 0 && (
              <span className="font-mono text-muted/60">— {formatBytes(t.totalSize)}</span>
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
                    <span className="shrink-0 font-mono text-[10px]">{formatBytes(f.size)}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({ transfer: t, isFolder }: { transfer: Transfer; isFolder: boolean }) {
  const base = "grid size-8 place-items-center rounded-lg shrink-0";
  if (t.status === "done")
    return <span className={cn(base, "bg-ok/15 text-ok")}>{isFolder ? <FolderIcon className="size-4" /> : <CheckCircle2 className="size-4" />}</span>;
  if (t.status === "failed")
    return <span className={cn(base, "bg-err/15 text-err")}><XCircle className="size-4" /></span>;
  if (t.status === "cancelled")
    return <span className={cn(base, "bg-border text-muted")}><Ban className="size-4" /></span>;
  return (
    <span className={cn(base, "bg-accent/15 text-accent")}>
      {isFolder
        ? <FolderIcon className="size-4" />
        : t.direction === "send"
        ? <ArrowUpFromLine className="size-4" />
        : <ArrowDownToLine className="size-4" />}
    </span>
  );
}

function Metric({ icon, value }: { icon: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted">{icon}</span>
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
  return `${m}m ${Math.round(s % 60)}s`;
}

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}
