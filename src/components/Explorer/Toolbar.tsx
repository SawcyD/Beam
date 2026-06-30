import { useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, ChevronUp,
  LayoutList, LayoutGrid, Search, X, FolderPlus,
  Zap, RefreshCw, FolderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pathSegments } from "./utils";
import type { Device } from "@/types";

type SortKey = "name" | "date" | "size" | "type";

interface Props {
  currentPath: string;
  canBack: boolean;
  canForward: boolean;
  viewMode: "list" | "grid";
  sortBy: SortKey;
  sortAsc: boolean;
  selectedPaths: string[];
  hasSelectedFolders: boolean;
  selectedDevice: Device | undefined;
  searchQuery: string;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
  onViewMode: (v: "list" | "grid") => void;
  onNewFolder: () => void;
  onSearch: (q: string) => void;
  onSendWithBeam: (paths: string[]) => void;
}

export function ExplorerToolbar({
  currentPath, canBack, canForward, viewMode,
  selectedPaths, hasSelectedFolders, selectedDevice, searchQuery,
  onBack, onForward, onUp, onRefresh, onNavigate,
  onViewMode, onNewFolder, onSearch, onSendWithBeam,
}: Props) {
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const pathInputRef = useRef<HTMLInputElement>(null);

  const segments = pathSegments(currentPath);

  function startEditPath() {
    setPathDraft(currentPath);
    setEditingPath(true);
    setTimeout(() => pathInputRef.current?.select(), 0);
  }

  function commitPath() {
    setEditingPath(false);
    if (pathDraft.trim() && pathDraft !== currentPath) {
      onNavigate(pathDraft.trim());
    }
  }

  return (
    <div
      className="flex shrink-0 flex-col border-b border-border bg-surface/70"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
    >
      {/* Row 1: nav buttons + breadcrumb + actions */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Navigation */}
        <Button variant="ghost" size="icon" onClick={onBack} disabled={!canBack} className="size-7">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onForward} disabled={!canForward} className="size-7">
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onUp} className="size-7">
          <ChevronUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRefresh} className="size-7">
          <RefreshCw className="size-3.5" />
        </Button>

        <div className="mx-1 h-4 w-px bg-border-mid" />

        {/* Breadcrumb / path bar */}
        <div className="min-w-0 flex-1">
          {editingPath ? (
            <input
              ref={pathInputRef}
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={commitPath}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitPath();
                if (e.key === "Escape") setEditingPath(false);
              }}
              className="w-full rounded-md border border-accent bg-panel-2/80 px-2 py-0.5 font-mono text-[12px] text-text outline-none"
              spellCheck={false}
            />
          ) : (
            <button
              onClick={startEditPath}
              className="flex min-w-0 items-center gap-0 rounded-md px-1.5 py-0.5 text-left hover:bg-white/[0.05]"
            >
              {segments.map((seg, i) => (
                <span key={seg.path} className="flex shrink-0 items-center">
                  {i > 0 && (
                    <ChevronRight className="mx-0.5 size-3 text-muted/50" />
                  )}
                  <span
                    onClick={(e) => { e.stopPropagation(); onNavigate(seg.path); }}
                    className={cn(
                      "rounded px-1 py-0.5 text-[12px] transition-colors hover:bg-white/[0.08] hover:text-text",
                      i === segments.length - 1 ? "font-medium text-text" : "text-muted",
                    )}
                  >
                    {seg.label}
                  </span>
                </span>
              ))}
            </button>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-border-mid" />

        {/* Send with Beam */}
        {selectedPaths.length > 0 ? (
          <Button
            size="sm"
            onClick={() => onSendWithBeam(selectedPaths)}
            disabled={!selectedDevice}
            title={selectedDevice ? `Send to ${selectedDevice.name}` : "Select a device in the Transfer tab first"}
            className="h-7 gap-1.5 px-3 text-[12px]"
          >
            {hasSelectedFolders ? <FolderIcon className="size-3.5" /> : <Zap className="size-3.5" />}
            {selectedDevice
              ? `Send${hasSelectedFolders ? " folder" : ""} to ${selectedDevice.name}${selectedPaths.length > 1 ? ` (${selectedPaths.length})` : ""}`
              : `Send (${selectedPaths.length})`}
          </Button>
        ) : selectedDevice ? (
          <span className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted">
            <Zap className="size-3" />
            {selectedDevice.name}
          </span>
        ) : null}

        {/* New folder */}
        <Button variant="ghost" size="icon" onClick={onNewFolder} className="size-7" title="New folder">
          <FolderPlus className="size-4" />
        </Button>

        {/* View toggle */}
        <div className="flex rounded-lg border border-border bg-panel-2/60 p-0.5">
          <button
            onClick={() => onViewMode("list")}
            className={cn(
              "rounded-md p-1 transition-colors",
              viewMode === "list" ? "bg-accent/20 text-accent" : "text-muted hover:text-text",
            )}
          >
            <LayoutList className="size-3.5" />
          </button>
          <button
            onClick={() => onViewMode("grid")}
            className={cn(
              "rounded-md p-1 transition-colors",
              viewMode === "grid" ? "bg-accent/20 text-accent" : "text-muted hover:text-text",
            )}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter…"
            className="h-7 w-36 rounded-lg border border-border bg-panel-2/70 pl-6 pr-6 text-[12px] text-text placeholder:text-muted/60 outline-none focus:border-accent/60 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => onSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-text">
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
