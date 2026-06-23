import { useEffect } from "react";
import { Zap } from "lucide-react";
import { useBeamStore } from "./store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeviceRadar } from "@/components/DeviceRadar";
import { DeviceList } from "@/components/DeviceList";
import { SendDropzone } from "@/components/SendDropzone";
import { TransferList } from "@/components/TransferList";
import { IncomingPrompt } from "@/components/IncomingPrompt";
import { Settings } from "@/components/Settings";
import { UpdateBanner } from "@/components/UpdateBanner";

export default function App() {
  const init = useBeamStore((s) => s.init);
  const checkForUpdates = useBeamStore((s) => s.checkForUpdates);
  const deviceName = useBeamStore((s) => s.deviceName);
  const deviceCount = useBeamStore((s) => s.devices.length);

  // Load settings + wire backend events once, then quietly check for updates.
  useEffect(() => {
    void init().then(() => {
      // Silent startup check — failures (e.g. no update server configured) are
      // swallowed so they never interrupt the user.
      void checkForUpdates().catch(() => {});
    });
  }, [init, checkForUpdates]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-bg text-text">
        {/* Update banner (only visible when an update is available) */}
        <UpdateBanner />

        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent">
              <Zap className="size-5" />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-none">Beam</h1>
              <p className="mt-0.5 font-mono text-xs text-muted">
                {deviceName || "…"}
              </p>
            </div>
          </div>
          <Settings />
        </header>

        {/* Body: device panel | transfer panel. Stacks on a narrow window. */}
        <main className="flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Device panel */}
          <section className="flex flex-col gap-4 border-b border-border p-5 md:w-[360px] md:shrink-0 md:border-b-0 md:border-r">
            <div className="rounded-2xl border border-border bg-panel/40 py-4">
              <DeviceRadar />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Devices</h2>
              <span className="font-mono text-xs text-muted">
                {deviceCount} found
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DeviceList />
            </div>
          </section>

          {/* Transfer panel */}
          <section className="flex min-h-0 flex-1 flex-col gap-4 p-5">
            <SendDropzone />
            <h2 className="text-sm font-semibold text-text">Transfers</h2>
            <TransferList />
          </section>
        </main>
      </div>

      {/* Global incoming-offer modal */}
      <IncomingPrompt />
    </TooltipProvider>
  );
}
