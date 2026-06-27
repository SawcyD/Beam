import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const appWindow = getCurrentWindow();

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    let unlisten: (() => void) | undefined;
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    }).then((u) => { unlisten = u; });
    return () => unlisten?.();
  }, []);

  return (
    <div className="ml-2 flex h-full items-stretch">
      {/* Separator */}
      <div className="my-2 mr-1 w-px bg-border-mid" />

      <WinBtn onClick={() => appWindow.minimize()} label="Minimize">
        <Minus className="size-3.5" />
      </WinBtn>

      <WinBtn onClick={() => appWindow.toggleMaximize()} label={maximized ? "Restore" : "Maximize"}>
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </WinBtn>

      <WinBtn onClick={() => appWindow.close()} label="Close" danger>
        <X className="size-3.5" />
      </WinBtn>
    </div>
  );
}

function WinBtn({
  children,
  onClick,
  label,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-full w-[46px] items-center justify-center text-muted transition-colors duration-100",
        danger
          ? "hover:bg-red-500/90 hover:text-white last:rounded-tr-xl"
          : "hover:bg-white/[0.08] hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function MaximizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="0.75" y="0.75" width="9.5" height="9.5" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="3" y="0.75" width="7.25" height="7.25" rx="0.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M0.75 3.5V10.25H7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
