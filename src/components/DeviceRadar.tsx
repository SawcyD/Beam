import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Laptop, MonitorSmartphone } from "lucide-react";
import { useBeamStore } from "@/store";
import { cn } from "@/lib/utils";
import type { Transfer } from "@/types";

const SIZE = 300; // square radar canvas in px
const CENTER = SIZE / 2;
const NODE_RADIUS = CENTER - 40; // distance of device nodes from center

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
 */
export function DeviceRadar() {
  const devices = useBeamStore((s) => s.devices);
  const selectedId = useBeamStore((s) => s.selectedDeviceId);
  const selectDevice = useBeamStore((s) => s.selectDevice);
  const transfers = useBeamStore((s) => s.transfers);
  const reduce = useReducedMotion();

  const scanning = devices.length === 0;

  // Lay devices out evenly around the ring, first one at the top.
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

  // Active transfers whose peer we can locate on the radar, so we can draw flow.
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
            animationDelay: `${i * 1.3}s`,
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

      {/* Flow lines (packet stream) drawn under the nodes */}
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
        className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center"
        style={{ left: CENTER, top: CENTER }}
      >
        <div className="grid size-12 place-items-center rounded-xl border border-accent/40 bg-accent/10 text-accent shadow-[0_0_24px_rgba(255,182,39,0.25)]">
          <MonitorSmartphone className="size-6" />
        </div>
      </div>

      {/* Device nodes */}
      {placed.map((p) => {
        const selected = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => selectDevice(selected ? null : p.id)}
            title={p.name}
            aria-hidden="false"
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 focus-visible:outline-none"
            style={{ left: p.x, top: p.y }}
          >
            <span
              className={cn(
                "grid size-11 place-items-center rounded-xl border transition-colors",
                selected
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-panel text-muted hover:border-muted",
              )}
            >
              <Laptop className="size-5" />
            </span>
            <span className="max-w-[80px] truncate text-[11px] text-muted">
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One animated packet-stream line between center and a device node. */
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
  // Flow speed loosely tracks throughput: faster transfer → shorter loop.
  const mbps = bytesPerSec / (1024 * 1024);
  const duration = Math.max(0.4, Math.min(2.5, 2.5 - mbps * 0.1));
  // Send flows outward (center → node), receive flows inward.
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
