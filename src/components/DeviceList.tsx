import { Laptop, Check } from "lucide-react";
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
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
        No devices found yet — make sure both machines are on the same network
        and have Beam open.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" role="listbox" aria-label="Discovered devices">
      {devices.map((device) => {
        const selected = device.id === selectedId;
        return (
          <li key={device.id}>
            <button
              role="option"
              aria-selected={selected}
              onClick={() => selectDevice(selected ? null : device.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-accent/60 bg-accent/10"
                  : "border-border bg-panel hover:border-muted/50",
              )}
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-md",
                  selected ? "bg-accent/20 text-accent" : "bg-border/50 text-muted",
                )}
              >
                <Laptop className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">
                  {device.name}
                </span>
                <span className="block truncate font-mono text-xs text-muted">
                  {device.addr}
                </span>
              </span>
              {selected && <Check className="size-4 shrink-0 text-accent" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
