import { useEffect, useState } from "react";
import { Send, FolderOpen, History as HistoryIcon, Settings2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useBeamStore } from "./store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeviceRadar } from "@/components/DeviceRadar";
import { DeviceList } from "@/components/DeviceList";
import { SendDropzone } from "@/components/SendDropzone";
import { TransferList } from "@/components/TransferList";
import { IncomingPrompt } from "@/components/IncomingPrompt";
import { UpdateBanner } from "@/components/UpdateBanner";
import { Explorer } from "@/components/Explorer";
import { HistoryPage } from "@/components/HistoryPage";
import { SettingsPage } from "@/components/SettingsPage";
import { WindowControls } from "@/components/WindowControls";
import { BeamLogo } from "@/components/BeamLogo";
import { cn } from "@/lib/utils";

type Tab = "transfer" | "explorer" | "history" | "settings";

export default function App() {
  const init            = useBeamStore((s) => s.init);
  const checkForUpdates = useBeamStore((s) => s.checkForUpdates);
  const deviceName      = useBeamStore((s) => s.deviceName);
  const deviceCount     = useBeamStore((s) => s.devices.length);

  const [tab, setTab] = useState<Tab>("transfer");

  useEffect(() => {
    void init().then(() => {
      const stored = useBeamStore.getState().launchTab;
      if (stored && ["transfer", "explorer", "history", "settings"].includes(stored)) {
        setTab(stored as Tab);
      }
      void checkForUpdates().catch(() => {});
    });
  }, [init, checkForUpdates]);

  // Switch tab from tray menu
  useEffect(() => {
    const unlisten = listen<Tab>("beam-tab", (e) => setTab(e.payload));
    return () => { void unlisten.then((u) => u()); };
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden text-text">
        <UpdateBanner />

        {/* ── Top navigation / Custom titlebar ─────────────── */}
        <header
          data-tauri-drag-region
          className="relative z-10 flex shrink-0 items-center gap-3 border-b border-border bg-surface/90 pl-4 pr-0 py-0 backdrop-blur-fluent"
          style={{ boxShadow: "var(--shadow-xs)", minHeight: "44px" }}
        >
          {/* Beam wordmark */}
          <div className="flex items-center gap-2.5 select-none py-2">
            <span
              className="grid size-[30px] shrink-0 place-items-center rounded-lg"
              style={{
                background: "rgba(120, 230, 75, 0.12)",
                border: "1px solid rgba(120, 230, 75, 0.25)",
                boxShadow: "0 1px 6px rgba(120,230,75,0.15)",
              }}
            >
              <BeamLogo size={18} />
            </span>
            <div className="leading-none">
              <div className="text-sm font-semibold tracking-[-0.01em] text-text">Beam</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">{deviceName || "…"}</div>
            </div>
          </div>

          <div className="mx-1 h-5 w-px bg-border-mid" />

          {/* Tab pills */}
          <nav className="flex gap-0.5" data-tauri-drag-region="false">
            <TabButton active={tab === "transfer"} onClick={() => setTab("transfer")}>
              <Send className="size-3.5" />
              Transfer
            </TabButton>
            <TabButton active={tab === "explorer"} onClick={() => setTab("explorer")}>
              <FolderOpen className="size-3.5" />
              Explorer
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              <HistoryIcon className="size-3.5" />
              History
            </TabButton>
            <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
              <Settings2 className="size-3.5" />
              Settings
            </TabButton>
          </nav>

          {/* Device count badge — right of tabs */}
          {deviceCount > 0 && tab === "transfer" && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
              }}
            >
              {deviceCount} nearby
            </span>
          )}

          <div className="flex-1" data-tauri-drag-region />

          {/* Window controls — flush right, full header height */}
          <WindowControls />
        </header>

        {/* ── Main content ─────────────────────────────────── */}
        <main className="flex min-h-0 flex-1 overflow-hidden">

          {tab === "transfer" && (
            <>
              {/* Left sidebar — devices */}
              <aside className="flex w-[300px] shrink-0 flex-col gap-3 border-r border-border bg-surface/60 p-4 backdrop-blur-fluent">
                <div
                  className="rounded-2xl border border-border bg-panel/60 py-3"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  <DeviceRadar />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    Nearby
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
                    style={{
                      background: deviceCount > 0 ? "var(--accent-dim)" : "var(--panel-2)",
                      color: deviceCount > 0 ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    {deviceCount}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <DeviceList />
                </div>
              </aside>

              {/* Right — send + transfers */}
              <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <SendDropzone />
                <TransferList />
              </section>
            </>
          )}

          {tab === "explorer" && <Explorer />}

          {tab === "history" && <HistoryPage />}

          {tab === "settings" && <SettingsPage />}
        </main>
      </div>

      <IncomingPrompt />
    </TooltipProvider>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-100",
        active
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-white/[0.06] hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
