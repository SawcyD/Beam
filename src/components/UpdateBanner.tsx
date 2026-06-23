import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";

/**
 * Slim banner shown when a new Beam version is available. Installing downloads
 * and applies the update (the app then needs a restart to run the new version).
 */
export function UpdateBanner() {
  const updateAvailable = useBeamStore((s) => s.updateAvailable);
  const installUpdate = useBeamStore((s) => s.installUpdate);

  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!updateAvailable || dismissed) return null;

  async function doInstall() {
    setInstalling(true);
    setError(null);
    try {
      await installUpdate();
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="flex items-center justify-between gap-3 border-b border-accent/30 bg-accent/10 px-5 py-2"
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Download className="size-4 shrink-0 text-accent" />
          <span className="truncate text-text">
            {error ? (
              <span className="text-err">{error}</span>
            ) : (
              <>
                Beam{" "}
                <span className="font-mono">{updateAvailable.version}</span> is
                available.
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={doInstall} disabled={installing}>
            {installing ? "Installing…" : "Update & restart"}
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded p-1 text-muted hover:text-text"
            aria-label="Dismiss update banner"
          >
            <X className="size-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
