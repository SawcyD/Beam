import { useRef, useState, useEffect } from "react";
import {
  Folder, FolderOpen, Image, Video, Music,
  FileText, FileCode, Archive, Terminal, File,
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fileIconName, fileIconColor,
  formatBytes, formatDate, fileTypeName,
} from "./utils";
import type { FsEntry } from "@/types";

type SortKey = "name" | "date" | "size" | "type";

interface Props {
  entries: FsEntry[];
  selected: Set<string>;
  viewMode: "list" | "grid";
  sortBy: SortKey;
  sortAsc: boolean;
  renaming: string | null;
  loading: boolean;
  onEntryClick: (entry: FsEntry, e: React.MouseEvent) => void;
  onEntryDoubleClick: (entry: FsEntry) => void;
  onContextMenu: (e: React.MouseEvent, paths: string[]) => void;
  onRename: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  onSort: (key: SortKey) => void;
}

export function ExplorerFileList({
  entries, selected, viewMode, sortBy, sortAsc, renaming, loading,
  onEntryClick, onEntryDoubleClick, onContextMenu,
  onRename, onRenameCancel, onSort,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-xs">Loading…</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div
          className="grid size-12 place-items-center rounded-2xl border border-border"
          style={{ background: "var(--panel)" }}
        >
          <FolderOpen className="size-5 text-muted" />
        </div>
        <p className="text-sm text-muted">This folder is empty</p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div
        className="flex-1 overflow-y-auto p-3"
        onContextMenu={(e) => onContextMenu(e, [...selected])}
        onClick={(e) => {
          if ((e.target as Element).closest("[data-entry]") === null) {
            // clicked background — deselect handled in parent
          }
        }}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1">
          {entries.map((entry) => (
            <GridEntry
              key={entry.path}
              entry={entry}
              selected={selected.has(entry.path)}
              renaming={renaming === entry.path}
              onClick={(e) => onEntryClick(entry, e)}
              onDoubleClick={() => onEntryDoubleClick(entry)}
              onContextMenu={(e) => {
                if (!selected.has(entry.path)) onEntryClick(entry, e);
                onContextMenu(e, selected.has(entry.path) ? [...selected] : [entry.path]);
              }}
              onRename={(name) => onRename(entry.path, name)}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onContextMenu={(e) => {
        if ((e.target as Element).closest("[data-entry]") === null) {
          onContextMenu(e, []);
        }
      }}
    >
      {/* Column header */}
      <div className="flex shrink-0 border-b border-border text-[11px] text-muted" style={{ background: "var(--surface)" }}>
        <SortHeader label="Name"     col="name" sortBy={sortBy} sortAsc={sortAsc} onSort={onSort} flex="flex-1" />
        <SortHeader label="Date"     col="date" sortBy={sortBy} sortAsc={sortAsc} onSort={onSort} width="w-40" />
        <SortHeader label="Type"     col="type" sortBy={sortBy} sortAsc={sortAsc} onSort={onSort} width="w-32" />
        <SortHeader label="Size"     col="size" sortBy={sortBy} sortAsc={sortAsc} onSort={onSort} width="w-24" right />
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <ListEntry
            key={entry.path}
            entry={entry}
            selected={selected.has(entry.path)}
            renaming={renaming === entry.path}
            onClick={(e) => onEntryClick(entry, e)}
            onDoubleClick={() => onEntryDoubleClick(entry)}
            onContextMenu={(e) => {
              if (!selected.has(entry.path)) onEntryClick(entry, e);
              onContextMenu(e, selected.has(entry.path) ? [...selected] : [entry.path]);
            }}
            onRename={(name) => onRename(entry.path, name)}
            onRenameCancel={onRenameCancel}
          />
        ))}
      </div>
    </div>
  );
}

// ── List row ──────────────────────────────────────────────────────────────

function ListEntry({
  entry, selected, renaming, onClick, onDoubleClick, onContextMenu, onRename, onRenameCancel,
}: {
  entry: FsEntry;
  selected: boolean;
  renaming: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
}) {
  return (
    <div
      data-entry
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={cn(
        "group flex cursor-default items-center border-b border-border/30 px-3 py-[5px] text-[12px] transition-colors",
        selected
          ? "bg-accent/[0.12] text-text"
          : "hover:bg-white/[0.04] text-text",
      )}
    >
      {/* Icon + Name */}
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        <EntryIcon entry={entry} open={false} size={16} />
        {renaming ? (
          <InlineRename
            initialName={entry.name}
            onCommit={onRename}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate">{entry.name}</span>
        )}
      </div>
      {/* Date */}
      <span className="w-40 shrink-0 text-muted font-mono text-[11px]">
        {formatDate(entry.modified)}
      </span>
      {/* Type */}
      <span className="w-32 shrink-0 truncate text-muted">
        {fileTypeName(entry)}
      </span>
      {/* Size */}
      <span className="w-24 shrink-0 text-right font-mono text-muted">
        {entry.is_dir ? "—" : formatBytes(entry.size)}
      </span>
    </div>
  );
}

// ── Grid cell ─────────────────────────────────────────────────────────────

function GridEntry({
  entry, selected, renaming, onClick, onDoubleClick, onContextMenu, onRename, onRenameCancel,
}: {
  entry: FsEntry;
  selected: boolean;
  renaming: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
}) {
  return (
    <div
      data-entry
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl p-2 text-center cursor-default transition-all duration-100",
        selected
          ? "bg-accent/[0.15] ring-1 ring-accent/30"
          : "hover:bg-white/[0.05]",
      )}
    >
      <EntryIcon entry={entry} open={selected && entry.is_dir} size={36} />
      {renaming ? (
        <InlineRename
          initialName={entry.name}
          onCommit={onRename}
          onCancel={onRenameCancel}
          center
        />
      ) : (
        <span className="line-clamp-2 w-full text-[11px] text-text leading-tight">
          {entry.name}
        </span>
      )}
    </div>
  );
}

// ── Shared icon ───────────────────────────────────────────────────────────

function EntryIcon({ entry, open, size }: { entry: FsEntry; open: boolean; size: number }) {
  const colorClass = fileIconColor(entry);
  const iconName = fileIconName(entry);
  const cls = cn("shrink-0", colorClass);
  const style = { width: size, height: size };

  if (entry.is_dir) {
    return open
      ? <FolderOpen style={style} className={cn(cls, "text-accent")} />
      : <Folder     style={style} className={cn(cls, "text-accent")} />;
  }
  switch (iconName) {
    case "Image":       return <Image      style={style} className={cls} />;
    case "Video":       return <Video      style={style} className={cls} />;
    case "Music":       return <Music      style={style} className={cls} />;
    case "FileArchive": return <Archive    style={style} className={cls} />;
    case "FileCode":    return <FileCode   style={style} className={cls} />;
    case "FileText":    return <FileText   style={style} className={cls} />;
    case "Terminal":    return <Terminal   style={style} className={cls} />;
    default:            return <File       style={style} className={cls} />;
  }
}

// ── Inline rename input ───────────────────────────────────────────────────

function InlineRename({
  initialName, onCommit, onCancel, center = false,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  center?: boolean;
}) {
  const [draft, setDraft] = useState(initialName);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      // Select stem only (before the extension)
      const dot = initialName.lastIndexOf(".");
      ref.current.setSelectionRange(0, dot > 0 ? dot : initialName.length);
    }
  }, [initialName]);

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() ? onCommit(draft.trim()) : onCancel()}
      onKeyDown={(e) => {
        if (e.key === "Enter") draft.trim() ? onCommit(draft.trim()) : onCancel();
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "w-full rounded border border-accent bg-panel px-1.5 py-0.5 text-[12px] text-text outline-none",
        center && "text-center",
      )}
    />
  );
}

// ── Sort column header ────────────────────────────────────────────────────

function SortHeader({
  label, col, sortBy, sortAsc, onSort, flex, width, right = false,
}: {
  label: string;
  col: SortKey;
  sortBy: SortKey;
  sortAsc: boolean;
  onSort: (k: SortKey) => void;
  flex?: string;
  width?: string;
  right?: boolean;
}) {
  const active = sortBy === col;
  return (
    <button
      onClick={() => onSort(col)}
      className={cn(
        "flex shrink-0 items-center gap-1 px-3 py-1.5 hover:text-text transition-colors",
        flex, width,
        active ? "text-text" : "text-muted",
        right && "justify-end",
      )}
    >
      {right && <span>{label}</span>}
      {active ? (
        sortAsc
          ? <ChevronUp className="size-3" />
          : <ChevronDown className="size-3" />
      ) : (
        <ChevronsUpDown className="size-3 opacity-30" />
      )}
      {!right && <span>{label}</span>}
    </button>
  );
}
