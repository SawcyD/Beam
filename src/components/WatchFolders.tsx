import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderSync, Trash2, Plus, ArrowRight } from "lucide-react";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * Manage watch-folder rules: each rule auto-sends any new file dropped into a
 * folder to a chosen peer. Lives inside Settings.
 */
export function WatchFolders() {
  const watches = useBeamStore((s) => s.watches);
  const devices = useBeamStore((s) => s.devices);
  const addWatch = useBeamStore((s) => s.addWatch);
  const removeWatch = useBeamStore((s) => s.removeWatch);
  const toggleWatch = useBeamStore((s) => s.toggleWatch);

  const [adding, setAdding] = useState(false);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [pickedPeer, setPickedPeer] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setPickedPath(picked);
  }

  async function confirmAdd() {
    const peer = devices.find((d) => d.id === pickedPeer);
    if (!pickedPath || !peer) return;
    setBusy(true);
    try {
      await addWatch(pickedPath, peer.id, peer.name);
      // Reset the add form.
      setAdding(false);
      setPickedPath(null);
      setPickedPeer("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">Watch folders</span>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={devices.length === 0}
          >
            <Plus /> Add
          </Button>
        )}
      </div>

      <p className="text-xs text-muted">
        Auto-send any new file added to a folder straight to a device.
      </p>

      {/* Existing rules */}
      {watches.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {watches.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2"
            >
              <FolderSync className="size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className="truncate font-mono text-muted"
                    title={w.path}
                  >
                    {shortenPath(w.path)}
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-muted" />
                  <span className="shrink-0 text-text">{w.peer_name}</span>
                </div>
              </div>
              <Switch
                checked={w.enabled}
                onCheckedChange={(v) => toggleWatch(w.id, v)}
                aria-label="Toggle watch"
              />
              <button
                onClick={() => removeWatch(w.id)}
                className="shrink-0 rounded p-1 text-muted hover:text-err"
                aria-label="Remove watch"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {watches.length === 0 && !adding && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted">
          {devices.length === 0
            ? "No devices online — a peer must be discovered before adding a watch."
            : "No watch folders yet."}
        </p>
      )}

      {/* Add form */}
      {adding && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
          <button
            onClick={pickFolder}
            className="truncate rounded border border-border px-2.5 py-1.5 text-left font-mono text-xs text-muted hover:border-muted"
          >
            {pickedPath ? shortenPath(pickedPath) : "Choose folder to watch…"}
          </button>

          <select
            value={pickedPeer}
            onChange={(e) => setPickedPeer(e.target.value)}
            className="h-8 rounded border border-border bg-bg px-2 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">Send to…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setPickedPath(null);
                setPickedPeer("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmAdd}
              disabled={!pickedPath || !pickedPeer || busy}
            >
              Add watch
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Show the last two path segments so long paths stay readable. */
function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return "…/" + parts.slice(-2).join("/");
}
