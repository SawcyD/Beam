import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Laptop, MonitorSmartphone } from "lucide-react";
import { useBeamStore } from "@/store";
import { cn } from "@/lib/utils";
import type { Transfer } from "@/types";

const SIZE = 300;
const CENTER = SIZE / 2;
const NODE_RADIUS = CENTER - 40;

// SVG ring constants
const RING_R = 26;
const RING_CIRC = 2 * Math.PI * RING_R;

interface PlacedDevice {
  id: string;
  name: string;
  x: number;
  y: number;
}

/**
 * The signature visual: discovered devices orbit concentric, slowly-pulsing
 * rings. While nothing is found we run a sweep (actively scanning); once peers
 * appear the rings settle to a calm pulse. Active transfers draw a flowing
 * dashed "packet stream" between this machine (center) and the peer node.
 *
 * Devices can receive files by dragging directly onto their bubble.
 * An SVG arc shows live transfer progress on each device node.
 */
export function DeviceRadar() {
  const devices            = useBeamStore((s) => s.devices);
  const selectedId         = useBeamStore((s) => s.selectedDeviceId);
  const selectDevice       = useBeamStore((s) => s.selectDevice);
  const transfers          = useBeamStore((s) => s.transfers);
  const stagedPaths        = useBeamStore((s) => s.stagedPaths);
  const sendFiles          = useBeamStore((s) => s.sendFiles);
  const clearStaged        = useBeamStore((s) => s.clearStaged);
  const dropTargetDeviceId = useBeamStore((s) => s.dropTargetDeviceId);
  const setDropTarget      = useBeamStore((s) => s.setDropTargetDeviceId);
  const reduce             = useReducedMotion();

  const scanning = devices.length === 0;

  const placed: PlacedDevice[] = useMemo(() => {
    const n = devices.length;
    return devices.map((d, i) => {
      const theta = (-90 + (360 / Math.max(n, 1)) * i) * (Math.PI / 180);
      return {
        id: d.id,
        name: d.name,
        x: CENTER + NODE_RADIUS * Math.cos(theta),
        y: CENTER + NODE_RADIUS * Math.sin(theta),
      };
    });
  }, [devices]);

  const flows = useMemo(() => {
    const active = Object.values(transfers).filter(
      (t) => t.status === "active",
    );
    return active
      .map((t) => {
        const node = placed.find((p) => p.name === t.peerName);
        return node ? { transfer: t, node } : null;
      })
      .filter((f): f is { transfer: Transfer; node: PlacedDevice } => f !== null);
  }, [transfers, placed]);

  // Map device name → active transfer for progress rings
  const transferByDeviceName = useMemo(() => {
    const m: Record<string, Transfer> = {};
    for (const t of Object.values(transfers)) {
      if (t.status === "active") m[t.peerName] = t;
    }
    return m;
  }, [transfers]);

  function handleBubbleClick(deviceId: string) {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;
    if (stagedPaths.length > 0) {
      // Files are staged — send them immediately to this device
      void sendFiles(device, stagedPaths);
      clearStaged();
    } else {
      selectDevice(selectedId === deviceId ? null : deviceId);
    }
  }

  return (
    <div
      className="relative mx-auto"
      style={{ width: SIZE, height: SIZE }}
      aria-hidden="true"
    >
      {/* Concentric rings */}
      {[0.45, 0.7, 1].map((scale, i) => (
        <div
          key={i}
          className={cn(
            "absolute inset-0 rounded-full radar-ring-gpu",
            reduce
              ? "bg-accent/5 border border-accent/15 opacity-40 blur-[2px] shadow-[0_0_15px_rgba(255,182,39,0.15)]"
              : "border border-border",
            !reduce && !scanning && "animate-radar-pulse",
          )}
          style={{
            "--base-scale": scale,
            transform: `translate3d(0, 0, 0) scale(${scale})`,
          } as React.CSSProperties}
        />
      ))}

      {/* Scanning sweep */}
      {scanning && !reduce && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, var(--accent) 30deg, transparent 60deg)",
            opacity: 0.18,
            maskImage: "radial-gradient(circle, black 60%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 60%, transparent 70%)",
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
        />
      )}

      {/* Flow lines (drawn under nodes) */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        {flows.map(({ transfer, node }) => (
          <FlowLine
            key={transfer.id}
            x={node.x}
            y={node.y}
            direction={transfer.direction}
            bytesPerSec={transfer.bytesPerSec}
            reduce={!!reduce}
          />
        ))}
      </svg>

      {/* Center node = this machine */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
        style={{ left: CENTER, top: CENTER }}
      >
        <div className="grid size-12 place-items-center rounded-xl border border-accent/40 bg-accent/10 text-accent shadow-[0_0_24px_rgba(255,182,39,0.25)]">
          <MonitorSmartphone className="size-6" />
        </div>
        {stagedPaths.length > 0 && (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[9px] text-accent">
            {stagedPaths.length} staged · tap to send
          </span>
        )}
      </div>

      {/* Device nodes */}
      {placed.map((p) => {
        const selected     = p.id === selectedId;
        const isDropTarget = p.id === dropTargetDeviceId;
        const activeTx     = transferByDeviceName[p.name];
        const progress     = activeTx && activeTx.totalSize > 0
          ? activeTx.totalBytes / activeTx.totalSize
          : null;
        const ringOffset   = progress !== null ? RING_CIRC * (1 - progress) : RING_CIRC;
        const showRing     = progress !== null || isDropTarget;

        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: p.x, top: p.y }}
          >
            {/* Progress / drop-hint ring */}
            {showRing && (
              <svg
                className="pointer-events-none absolute"
                style={{
                  width: "60px",
                  height: "60px",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -58%)", // offset for label below
                }}
                viewBox="0 0 60 60"
              >
                <circle
                  cx={30} cy={30} r={RING_R}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={2}
                />
                <circle
                  cx={30} cy={30} r={RING_R}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={isDropTarget ? 0 : ringOffset}
                  transform="rotate(-90 30 30)"
                  style={{ transition: isDropTarget ? "none" : "stroke-dashoffset 0.3s ease" }}
                />
              </svg>
            )}

            <button
              onClick={() => handleBubbleClick(p.id)}
              title={
                stagedPaths.length > 0
                  ? `Send ${stagedPaths.length} file${stagedPaths.length !== 1 ? "s" : ""} to ${p.name}`
                  : isDropTarget
                  ? `Drop to send to ${p.name}`
                  : p.name
              }
              aria-label={p.name}
              onDragEnter={(e) => { e.preventDefault(); setDropTarget(p.id); }}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(p.id); }}
              onDragLeave={() => setDropTarget(null)}
              className={cn(
                "flex flex-col items-center gap-1 transition-transform duration-150 focus-visible:outline-none",
                isDropTarget && "scale-110",
              )}
            >
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-xl border transition-all duration-150",
                  isDropTarget
                    ? "border-accent bg-accent/30 text-accent shadow-[0_0_20px_rgba(255,182,39,0.5)]"
                    : selected
                    ? "border-accent bg-accent/20 text-accent"
                    : stagedPaths.length > 0
                    ? "border-accent/40 bg-panel text-accent/80 hover:border-accent hover:bg-accent/15"
                    : "border-border bg-panel text-muted hover:border-muted",
                )}
              >
                <Laptop className="size-5" />
              </span>
              <span className="max-w-[80px] truncate text-[11px] text-muted">
                {p.name}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FlowLine({
  x,
  y,
  direction,
  bytesPerSec,
  reduce,
}: {
  x: number;
  y: number;
  direction: "send" | "receive";
  bytesPerSec: number;
  reduce: boolean;
}) {
  const mbps = bytesPerSec / (1024 * 1024);
  const duration = Math.max(0.4, Math.min(2.5, 2.5 - mbps * 0.1));
  const offset = direction === "send" ? -24 : 24;

  return (
    <motion.line
      x1={CENTER}
      y1={CENTER}
      x2={x}
      y2={y}
      stroke="var(--accent)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray="3 9"
      animate={reduce ? undefined : { strokeDashoffset: [0, offset] }}
      transition={
        reduce
          ? undefined
          : { repeat: Infinity, duration, ease: "linear" }
      }
    />
  );
}
