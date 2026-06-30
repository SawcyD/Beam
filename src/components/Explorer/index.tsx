import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBeamStore } from "@/store";
import type { FsEntry, Drive, SpecialDirs } from "@/types";
import { ExplorerToolbar } from "./Toolbar";
import { ExplorerSidebar } from "./Sidebar";
import { ExplorerFileList } from "./FileList";
import { ExplorerContextMenu } from "./ContextMenu";
import { parentPath, formatBytes } from "./utils";

type SortKey = "name" | "date" | "size" | "type";
type ViewMode = "list" | "grid";

export function Explorer() {
  // ── Navigation state ─────────────────────────────────────────────────────
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History kept in a ref so navigate() closure never goes stale.
  const navRef = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });

  // ── Selection & UI state ─────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; paths: string[];
  } | null>(null);
  const [clipboard, setClipboard] = useState<{
    paths: string[]; op: "copy" | "cut";
  } | null>(null);

  // ── External data ────────────────────────────────────────────────────────
  const [drives, setDrives] = useState<Drive[]>([]);
  const [specialDirs, setSpecialDirs] = useState<SpecialDirs | null>(null);

  const sendFiles     = useBeamStore((s) => s.sendFiles);
  const addStaged     = useBeamStore((s) => s.addStaged);
  const selectedDevId = useBeamStore((s) => s.selectedDeviceId);
  const devices       = useBeamStore((s) => s.devices);
  const beamDownloads = useBeamStore((s) => s.defaultSaveDir);
  const selectedDevice = devices.find((d) => d.id === selectedDevId);

  // ── Core navigation ──────────────────────────────────────────────────────

  const loadDir = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setSearchQuery("");
    setRenaming(null);
    invoke<FsEntry[]>("list_dir", { path })
      .then((e) => {
        setEntries(e);
        setCurrentPath(path);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const navigate = useCallback(
    (path: string, replace = false) => {
      const nav = navRef.current;
      if (replace) {
        nav.stack = [path];
        nav.idx = 0;
      } else {
        // Trim forward history when branching.
        nav.stack = nav.stack.slice(0, nav.idx + 1);
        nav.stack.push(path);
        nav.idx = nav.stack.length - 1;
      }
      loadDir(path);
    },
    [loadDir],
  );

  const goBack = () => {
    const nav = navRef.current;
    if (nav.idx > 0) { nav.idx--; loadDir(nav.stack[nav.idx]); }
  };

  const goForward = () => {
    const nav = navRef.current;
    if (nav.idx < nav.stack.length - 1) { nav.idx++; loadDir(nav.stack[nav.idx]); }
  };

  const goUp = () => {
    const parent = parentPath(currentPath);
    if (parent !== currentPath) navigate(parent);
  };

  const refresh = () => loadDir(currentPath);

  // ── Init: drives + special dirs ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      invoke<Drive[]>("get_drives"),
      invoke<SpecialDirs>("get_special_dirs"),
    ]).then(([d, s]) => {
      setDrives(d);
      setSpecialDirs(s);
      const start = s.downloads || (d[0]?.path ?? "");
      if (start) navigate(start, true);
    });
  }, [navigate]);

  // ── Sorted + filtered entries ─────────────────────────────────────────────
  const sortedEntries = useMemo(() => {
    const filtered = searchQuery
      ? entries.filter((e) =>
          e.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : entries;

    return [...filtered].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      switch (sortBy) {
        case "name": cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase()); break;
        case "date": cmp = a.modified - b.modified; break;
        case "size": cmp = a.size - b.size; break;
        case "type": cmp = a.extension.localeCompare(b.extension); break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [entries, sortBy, sortAsc, searchQuery]);

  // ── Click handlers ────────────────────────────────────────────────────────

  const handleEntryClick = (entry: FsEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
        return next;
      });
    } else if (e.shiftKey && selected.size > 0) {
      const paths = sortedEntries.map((e) => e.path);
      const last = [...selected].at(-1) ?? "";
      const a = paths.indexOf(last);
      const b = paths.indexOf(entry.path);
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      setSelected(new Set(paths.slice(lo, hi + 1)));
    } else {
      setSelected(new Set([entry.path]));
    }
  };

  const handleEntryDoubleClick = (entry: FsEntry) => {
    if (entry.is_dir) {
      navigate(entry.path);
    } else {
      openPath(entry.path).catch(() => {});
    }
  };

  const handleContextMenu = (e: React.MouseEvent, paths: string[]) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, paths });
  };

  const handleBackgroundClick = () => setSelected(new Set());
  const handleBackgroundCtx = (e: React.MouseEvent) => handleContextMenu(e, []);

  // ── File operations ───────────────────────────────────────────────────────

  const handleRename = async (path: string, newName: string) => {
    try {
      await invoke<string>("rename_fs_entry", { path, newName });
      await refresh();
    } catch (e) { setError(String(e)); }
    setRenaming(null);
  };

  const handleDelete = async (paths: string[]) => {
    try {
      await Promise.all(paths.map((p) => invoke("delete_fs_entry", { path: p })));
      setSelected(new Set());
      await refresh();
    } catch (e) { setError(String(e)); }
  };

  const handleNewFolder = async () => {
    const folderPath = currentPath.replace(/[/\\]+$/, "") + "\\New folder";
    try {
      await invoke("create_folder", { path: folderPath });
      await refresh();
      setRenaming(folderPath);
    } catch (e) { setError(String(e)); }
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    try {
      const dest = currentPath.replace(/[/\\]+$/, "");
      for (const src of clipboard.paths) {
        const name = src.split(/[/\\]/).pop() ?? "";
        const target = dest + "\\" + name;
        if (clipboard.op === "cut") {
          await invoke("move_fs_entry", { src, dest: target });
        } else {
          await invoke("copy_fs_entry", { src, dest: target });
        }
      }
      if (clipboard.op === "cut") setClipboard(null);
      await refresh();
    } catch (e) { setError(String(e)); }
  };

  const handleSendWithBeam = (paths: string[]) => {
    if (!selectedDevice) return;
    void sendFiles(selectedDevice, paths);
  };

  // Quick-send a folder: if a device is selected, send immediately; otherwise stage it.
  const handleSendFolder = (path: string) => {
    if (selectedDevice) {
      void sendFiles(selectedDevice, [path]);
    } else {
      addStaged([path]);
    }
  };

  const hasSelectedFolders = sortedEntries
    .filter((e) => selected.has(e.path))
    .some((e) => e.is_dir);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const focused = document.activeElement?.tagName;
      if (focused === "INPUT" || focused === "TEXTAREA") return;

      if (e.key === "F2" && selected.size === 1) {
        setRenaming([...selected][0]);
      }
      if (e.key === "Delete" && selected.size > 0) {
        void handleDelete([...selected]);
      }
      if (e.key === "Backspace") {
        goUp();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelected(new Set(sortedEntries.map((e) => e.path)));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selected.size > 0) {
        setClipboard({ paths: [...selected], op: "copy" });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "x" && selected.size > 0) {
        setClipboard({ paths: [...selected], op: "cut" });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboard) {
        void handlePaste();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, sortedEntries, clipboard, goUp]); // eslint-disable-line

  // ── Render ────────────────────────────────────────────────────────────────

  const canBack    = navRef.current.idx > 0;
  const canForward = navRef.current.idx < navRef.current.stack.length - 1;

  const selectionBytes = sortedEntries
    .filter((e) => selected.has(e.path))
    .reduce((s, e) => s + e.size, 0);

  return (
    <div
      className="flex h-full overflow-hidden"
      onClick={handleBackgroundClick}
      onContextMenu={handleBackgroundCtx}
    >
      {/* Sidebar */}
      <ExplorerSidebar
        drives={drives}
        specialDirs={specialDirs}
        beamDownloads={beamDownloads}
        currentPath={currentPath}
        onNavigate={navigate}
      />

      {/* Main pane */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ExplorerToolbar
          currentPath={currentPath}
          canBack={canBack}
          canForward={canForward}
          viewMode={viewMode}
          sortBy={sortBy}
          sortAsc={sortAsc}
          selectedPaths={[...selected]}
          selectedDevice={selectedDevice}
          searchQuery={searchQuery}
          onBack={goBack}
          onForward={goForward}
          onUp={goUp}
          onRefresh={refresh}
          onNavigate={navigate}
          onViewMode={setViewMode}
          onNewFolder={handleNewFolder}
          onSearch={setSearchQuery}
          onSendWithBeam={handleSendWithBeam}
          hasSelectedFolders={hasSelectedFolders}
        />

        {error && (
          <div className="shrink-0 border-b border-err/20 bg-err/10 px-4 py-1.5 text-[12px] text-err">
            {error}
          </div>
        )}

        <ExplorerFileList
          entries={sortedEntries}
          selected={selected}
          viewMode={viewMode}
          sortBy={sortBy}
          sortAsc={sortAsc}
          renaming={renaming}
          loading={loading}
          onEntryClick={handleEntryClick}
          onEntryDoubleClick={handleEntryDoubleClick}
          onContextMenu={handleContextMenu}
          onRename={handleRename}
          onRenameCancel={() => setRenaming(null)}
          onSendFolder={handleSendFolder}
          onSort={(key) => {
            if (sortBy === key) setSortAsc((a) => !a);
            else { setSortBy(key); setSortAsc(true); }
          }}
        />

        {/* Status bar */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface/60 px-4 py-1 text-[11px] text-muted">
          <span>
            {sortedEntries.length} item{sortedEntries.length !== 1 ? "s" : ""}
            {selected.size > 0 && (
              <span className="ml-2 text-text">
                {selected.size} selected
              </span>
            )}
          </span>
          {selected.size > 0 && selectionBytes > 0 && (
            <span className="font-mono">{formatBytes(selectionBytes)}</span>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ExplorerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          paths={contextMenu.paths}
          currentPath={currentPath}
          selectedDevice={selectedDevice}
          clipboard={clipboard}
          onClose={() => setContextMenu(null)}
          onOpen={(paths) => paths.forEach((p) => openPath(p).catch(() => {}))}
          onRename={(path) => setRenaming(path)}
          onDelete={handleDelete}
          onNewFolder={handleNewFolder}
          onSendWithBeam={handleSendWithBeam}
          onCopy={(paths) => setClipboard({ paths, op: "copy" })}
          onCut={(paths) => setClipboard({ paths, op: "cut" })}
          onPaste={handlePaste}
        />
      )}
    </div>
  );
}
