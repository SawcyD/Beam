import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FilePlus2,
  FolderPlus,
  Send,
  X,
  UploadCloud,
  Clipboard,
  Type,
  Plus,
  ChevronDown,
} from "lucide-react";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";
import { baseName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Device } from "@/types";

type Tab = "files" | "text";

export function SendDropzone() {
  const staged       = useBeamStore((s) => s.stagedPaths);
  const addStaged    = useBeamStore((s) => s.addStaged);
  const removeStaged = useBeamStore((s) => s.removeStaged);
  const clearStaged  = useBeamStore((s) => s.clearStaged);
  const devices      = useBeamStore((s) => s.devices);
  const selectedId   = useBeamStore((s) => s.selectedDeviceId);
  const sendFiles    = useBeamStore((s) => s.sendFiles);
  const sendText     = useBeamStore((s) => s.sendText);
  const readClipboard = useBeamStore((s) => s.readClipboard);

  const groups = useBeamStore((s) => s.groups);

  const [dragging, setDragging]     = useState(false);
  const [tab, setTab]               = useState<Tab>("files");
  const [textDraft, setTextDraft]   = useState("");
  const [note, setNote]             = useState("");
  const [noteOpen, setNoteOpen]     = useState(false);
  const [targetIds, setTargetIds]   = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Keep targetIds in sync when the primary selection changes.
  useEffect(() => {
    if (!selectedId) return;
    setTargetIds((prev) => (prev.includes(selectedId) ? prev : [selectedId, ...prev]));
  }, [selectedId]);

  // Close picker on outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") { setDragging(true); setTab("files"); }
      else if (p.type === "leave") { setDragging(false); }
      else if (p.type === "drop") { setDragging(false); if (p.paths.length > 0) addStaged(p.paths); }
    });
    return () => { void unlistenPromise.then((u) => u()); };
  }, [addStaged]);

  async function browse(directory: boolean) {
    const selection = await open({ multiple: true, directory });
    if (!selection) return;
    addStaged(Array.isArray(selection) ? selection : [selection]);
  }

  const targets    = devices.filter((d) => targetIds.includes(d.id));
  const unselected = devices.filter((d) => !targetIds.includes(d.id));

  async function doSend() {
    if (targets.length === 0) return;
    const sendNote = note.trim() || undefined;
    if (tab === "files") {
      if (staged.length === 0) return;
      await Promise.all(targets.map((d) => sendFiles(d, staged, sendNote)));
      clearStaged();
      setNote("");
      setNoteOpen(false);
    } else {
      if (!textDraft.trim()) return;
      await Promise.all(targets.map((d) => sendText(d, textDraft)));
      setTextDraft("");
    }
  }

  async function pasteClipboard() {
    const text = await readClipboard();
    if (text) setTextDraft((d) => d + text);
  }

  function removeTarget(id: string) {
    setTargetIds((prev) => prev.filter((x) => x !== id));
  }

  function addTarget(device: Device) {
    setTargetIds((prev) => [...prev, device.id]);
    setPickerOpen(false);
  }

  const canSend =
    targets.length > 0 &&
    (tab === "files" ? staged.length > 0 : textDraft.trim().length > 0);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors",
        dragging ? "border-accent bg-accent/10" : "border-border bg-panel/40",
      )}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-bg/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-accent">
            <UploadCloud className="size-12" />
            <p className="text-lg font-medium">Drop to stage files</p>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setTab("files")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            tab === "files" ? "bg-accent/15 text-accent" : "text-muted hover:text-text",
          )}
        >
          <UploadCloud className="size-3.5" /> Files
        </button>
        <button
          onClick={() => setTab("text")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            tab === "text" ? "bg-accent/15 text-accent" : "text-muted hover:text-text",
          )}
        >
          <Type className="size-3.5" /> Text
        </button>
      </div>

      {tab === "files" ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted">
              {staged.length === 0
                ? "Drop files or folders here"
                : `${staged.length} item${staged.length === 1 ? "" : "s"} staged`}
            </span>
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

          {/* Optional note for recipient */}
          <div>
            <button
              onClick={() => { setNoteOpen((o) => !o); if (noteOpen) setNote(""); }}
              className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-text"
            >
              <Plus className={cn("size-3 transition-transform", noteOpen && "rotate-45")} />
              {noteOpen ? "Remove note" : "Add note for recipient"}
            </button>
            {noteOpen && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional message shown to the recipient…"
                rows={2}
                maxLength={280}
                className="mt-1.5 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder="Type or paste text to send…"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
            style={{ userSelect: "text" }}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={pasteClipboard}>
              <Clipboard className="size-3.5" /> Paste clipboard
            </Button>
            {textDraft && (
              <button onClick={() => setTextDraft("")} className="text-xs text-muted hover:text-text">
                Clear
              </button>
            )}
            <span className="ml-auto font-mono text-xs text-muted">{textDraft.length} chars</span>
          </div>
        </div>
      )}

      {/* ── Target device(s) + send ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Device chips */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {targets.length === 0 ? (
            <span className="text-xs text-muted">Select a device to send to</span>
          ) : (
            targets.map((d) => (
              <span
                key={d.id}
                className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                {d.name}
                <button
                  onClick={() => removeTarget(d.id)}
                  className="rounded-full p-0.5 text-accent/60 hover:text-accent"
                  aria-label={`Remove ${d.name}`}
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))
          )}

          {/* Add another device picker */}
          {unselected.length > 0 && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                className="flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-text"
              >
                <Plus className="size-3" />
                {targets.length === 0 ? "Pick device" : "Add"}
                <ChevronDown className={cn("size-2.5 transition-transform", pickerOpen && "rotate-180")} />
              </button>

              {pickerOpen && (
                <div
                  className="absolute bottom-full left-0 z-30 mb-1 min-w-[180px] rounded-xl border border-border bg-panel/95 py-1 shadow-lg backdrop-blur-fluent"
                  style={{ boxShadow: "var(--shadow-lg)" }}
                >
                  {/* Individual devices */}
                  {unselected.length > 0 && (
                    <>
                      <p className="px-3 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">
                        Devices
                      </p>
                      {unselected.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => addTarget(d)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-text transition-colors hover:bg-white/[0.07]"
                        >
                          {d.name}
                        </button>
                      ))}
                    </>
                  )}

                  {/* Groups */}
                  {groups.length > 0 && (
                    <>
                      {unselected.length > 0 && <div className="my-1 border-t border-border" />}
                      <p className="px-3 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">
                        Groups
                      </p>
                      {groups.map((g) => {
                        const online = devices.filter((d) => g.device_names.includes(d.name));
                        return (
                          <button
                            key={g.id}
                            onClick={() => {
                              setTargetIds((prev) =>
                                [...new Set([...prev, ...online.map((d) => d.id)])],
                              );
                              setPickerOpen(false);
                            }}
                            disabled={online.length === 0}
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-text transition-colors hover:bg-white/[0.07] disabled:opacity-40"
                          >
                            <span>{g.name}</span>
                            <span className="font-mono text-[10px] text-muted">
                              {online.length}/{g.device_names.length}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Send button */}
        <div className="flex shrink-0 gap-2">
          {tab === "files" && staged.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearStaged}>
              Clear
            </Button>
          )}
          <Button size="sm" onClick={doSend} disabled={!canSend}>
            <Send />
            {targets.length > 1 ? `Send to ${targets.length}` : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
