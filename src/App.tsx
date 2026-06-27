import { useEffect, useState } from "react";
import { History as HistoryIcon, Send, FolderOpen } from "lucide-react";
import { useBeamStore } from "./store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DeviceRadar } from "@/components/DeviceRadar";
import { DeviceList } from "@/components/DeviceList";
import { SendDropzone } from "@/components/SendDropzone";
import { TransferList } from "@/components/TransferList";
import { IncomingPrompt } from "@/components/IncomingPrompt";
import { Settings } from "@/components/Settings";
import { UpdateBanner } from "@/components/UpdateBanner";
import { History } from "@/components/History";
import { Explorer } from "@/components/Explorer";
import { WindowControls } from "@/components/WindowControls";
import { cn } from "@/lib/utils";

type Tab = "transfer" | "explorer";

export default function App() {
  const init            = useBeamStore((s) => s.init);
  const checkForUpdates = useBeamStore((s) => s.checkForUpdates);
  const deviceName      = useBeamStore((s) => s.deviceName);
  const deviceCount     = useBeamStore((s) => s.devices.length);

  const [tab, setTab]               = useState<Tab>("transfer");
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    void init().then(() => void checkForUpdates().catch(() => {}));
  }, [init, checkForUpdates]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden text-text">
        <UpdateBanner />

        {/* ── Command bar / Custom titlebar ───────────────────── */}
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
                background: "linear-gradient(135deg, #ffb627 0%, #ff8a00 100%)",
                boxShadow: "0 1px 6px rgba(255,182,39,0.45)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M2 5.5C2 4.67 2.67 4 3.5 4H7l1.5 1.5H14.5C15.33 5.5 16 6.17 16 7V13.5C16 14.33 15.33 15 14.5 15H3.5C2.67 15 2 14.33 2 13.5V5.5Z"
                  fill="rgba(255,255,255,0.25)"
                />
                <path
                  d="M10.5 7.5L8 11h2.5L7.5 14.5"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="leading-none">
              <div className="text-sm font-semibold tracking-[-0.01em] text-text">Beam</div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">{deviceName || "…"}</div>
            </div>
          </div>

          <div className="mx-1 h-5 w-px bg-border-mid" />

          {/* Tab pills */}
          <nav className="flex gap-0.5">
            <TabButton active={tab === "transfer"} onClick={() => setTab("transfer")}>
              <Send className="size-3.5" />
              Transfer
            </TabButton>
            <TabButton active={tab === "explorer"} onClick={() => setTab("explorer")}>
              <FolderOpen className="size-3.5" />
              Explorer
            </TabButton>
          </nav>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-0.5 py-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Transfer history"
              onClick={() => setHistoryOpen(true)}
              className="rounded-lg"
            >
              <HistoryIcon className="size-4" />
            </Button>
            <Settings />
          </div>

          {/* Window controls — flush right, full header height */}
          <WindowControls />
        </header>

        {/* ── Main content ─────────────────────────────────────── */}
        <main className="flex min-h-0 flex-1 overflow-hidden">

          {tab === "transfer" && (
            <>
              {/* Left — devices */}
              <aside className="flex w-[320px] shrink-0 flex-col gap-3 border-r border-border bg-surface/60 p-4 backdrop-blur-fluent">
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
        </main>
      </div>

      <IncomingPrompt />
      <History open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </TooltipProvider>
  );
}

function TabButton({
  active, onClick, children,
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
