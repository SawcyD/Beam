import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { FilePlus2, FolderPlus, Send, X, UploadCloud } from "lucide-react";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";
import { baseName } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Drop target + staging area. Files dropped onto the window (or picked via the
 * dialog) are staged here; the user selects a target device, then sends.
 *
 * We rely on Tauri's native drag-drop event rather than the HTML5 DataTransfer
 * API because only the native event exposes real absolute file paths.
 */
export function SendDropzone() {
  const staged = useBeamStore((s) => s.stagedPaths);
  const addStaged = useBeamStore((s) => s.addStaged);
  const removeStaged = useBeamStore((s) => s.removeStaged);
  const clearStaged = useBeamStore((s) => s.clearStaged);
  const devices = useBeamStore((s) => s.devices);
  const selectedId = useBeamStore((s) => s.selectedDeviceId);
  const sendFiles = useBeamStore((s) => s.sendFiles);

  const [dragging, setDragging] = useState(false);
  const selectedDevice = devices.find((d) => d.id === selectedId) ?? null;

  // Subscribe to the window-global native drag-drop event for its lifetime.
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") {
        setDragging(true);
      } else if (p.type === "leave") {
        setDragging(false);
      } else if (p.type === "drop") {
        setDragging(false);
        if (p.paths.length > 0) addStaged(p.paths);
      }
    });
    return () => {
      void unlistenPromise.then((u) => u());
    };
  }, [addStaged]);

  async function browse(directory: boolean) {
    const selection = await open({ multiple: true, directory });
    if (!selection) return;
    const paths = Array.isArray(selection) ? selection : [selection];
    addStaged(paths);
  }

  async function doSend() {
    if (!selectedDevice || staged.length === 0) return;
    await sendFiles(selectedDevice, staged);
    clearStaged();
  }

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors",
        dragging ? "border-accent bg-accent/10" : "border-border bg-panel/40",
      )}
    >
      {/* Full-window drop hint while a drag is in progress */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-accent">
            <UploadCloud className="size-12" />
            <p className="text-lg font-medium">Drop to stage files</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted">
          <UploadCloud className="size-4" />
          <span>
            {staged.length === 0
              ? "Drop files or folders here to send"
              : `${staged.length} item${staged.length === 1 ? "" : "s"} staged`}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => browse(false)}>
            <FilePlus2 /> Files
          </Button>
          <Button variant="secondary" size="sm" onClick={() => browse(true)}>
            <FolderPlus /> Folder
          </Button>
        </div>
      </div>

      {staged.length > 0 && (
        <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
          {staged.map((path) => (
            <li
              key={path}
              className="flex items-center justify-between gap-2 rounded-md bg-panel px-2.5 py-1.5"
            >
              <span className="truncate font-mono text-xs text-text" title={path}>
                {baseName(path.replace(/\\/g, "/"))}
              </span>
              <button
                onClick={() => removeStaged(path)}
                className="shrink-0 rounded p-0.5 text-muted hover:text-err"
                aria-label={`Remove ${path}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {selectedDevice ? (
            <>
              Target: <span className="text-text">{selectedDevice.name}</span>
            </>
          ) : (
            "Select a device to send to"
          )}
        </span>
        <div className="flex gap-2">
          {staged.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearStaged}>
              Clear
            </Button>
          )}
          <Button
            size="sm"
            onClick={doSend}
            disabled={!selectedDevice || staged.length === 0}
          >
            <Send /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
