import { Laptop } from "lucide-react";
import { useBeamStore } from "@/store";
import { cn } from "@/lib/utils";

/**
 * Flat, selectable list of discovered peers. Rendered alongside the radar;
 * this is the reliable, accessible way to actually choose a target.
 */
export function DeviceList() {
  const devices = useBeamStore((s) => s.devices);
  const selectedId = useBeamStore((s) => s.selectedDeviceId);
  const selectDevice = useBeamStore((s) => s.selectDevice);

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted">
        No devices found yet.
        <br />
        <span className="mt-1 block opacity-60">
          Make sure both machines are on the same network with Beam open.
        </span>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1" role="listbox" aria-label="Discovered devices">
      {devices.map((device) => {
        const selected = device.id === selectedId;
        return (
          <li key={device.id}>
            <button
              role="option"
              aria-selected={selected}
              onClick={() => selectDevice(selected ? null : device.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-100",
                selected
                  ? "border-accent/40 bg-accent-dim shadow-sm"
                  : "border-transparent hover:border-border hover:bg-white/[0.05]",
              )}
            >
              {/* Device icon — amber when selected, neutral otherwise */}
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                  selected
                    ? "bg-accent/20 text-accent"
                    : "bg-white/[0.07] text-muted group-hover:text-text",
                )}
              >
                <Laptop className="size-[15px]" />
              </span>

              {/* Name + address */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-text">
                  {device.name}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted">
                  {device.addr}
                </span>
              </span>

              {/* Selected amber dot */}
              {selected && (
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
