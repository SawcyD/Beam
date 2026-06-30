import { Laptop, Monitor, Terminal, Smartphone } from "lucide-react";
import { useBeamStore } from "@/store";
import { cn } from "@/lib/utils";

export function DeviceList() {
  const devices    = useBeamStore((s) => s.devices);
  const selectedId = useBeamStore((s) => s.selectedDeviceId);
  const selectDevice = useBeamStore((s) => s.selectDevice);

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
        <p className="text-[12px] text-muted">No devices found yet.</p>
        <p className="text-[11px] text-muted/60">
          Make sure both machines are on the same network with Beam open.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1" role="listbox" aria-label="Discovered devices">
      {devices.map((device) => {
        const selected = device.id === selectedId;
        const ip       = device.addr.split(":")[0];
        const os       = detectOS(device.name);
        return (
          <li key={device.id}>
            <button
              role="option"
              aria-selected={selected}
              onClick={() => selectDevice(selected ? null : device.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-100",
                selected
                  ? "border-accent/35 bg-accent/8 shadow-sm"
                  : "border-transparent hover:border-border hover:bg-white/[0.04]",
              )}
            >
              {/* OS icon badge */}
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                  selected
                    ? "bg-accent/20 text-accent"
                    : "bg-white/[0.06] text-muted group-hover:text-text",
                )}
              >
                <OSIcon os={os} />
              </span>

              {/* Name + IP */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-text">
                  {device.name}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                  {ip}
                </span>
              </span>

              {/* Online dot + selected indicator */}
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-ok" title="Online" />
                {selected && (
                  <span className="size-1.5 rounded-full bg-accent" />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type OS = "mac" | "windows" | "linux" | "mobile" | "unknown";

function detectOS(name: string): OS {
  const n = name.toLowerCase();
  if (n.includes("macbook") || n.includes("imac") || n.includes("mac pro") || n.includes("mac mini") || n.includes("macmini"))
    return "mac";
  if (n.includes("iphone") || n.includes("ipad") || n.includes("android") || n.includes("pixel") || n.includes("samsung"))
    return "mobile";
  if (n.includes("linux") || n.includes("ubuntu") || n.includes("fedora") || n.includes("arch") || n.includes("debian"))
    return "linux";
  if (n.includes("windows") || n.includes("desktop") || n.match(/\bpc\b/))
    return "windows";
  return "unknown";
}

function OSIcon({ os }: { os: OS }) {
  const cls = "size-[15px]";
  switch (os) {
    case "mac":     return <Monitor className={cls} />;
    case "windows": return <Monitor className={cls} />;
    case "linux":   return <Terminal className={cls} />;
    case "mobile":  return <Smartphone className={cls} />;
    default:        return <Laptop className={cls} />;
  }
}
