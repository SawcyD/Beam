import {
  Home, Monitor, FileText, Download, Image, Music,
  HardDrive, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Drive, SpecialDirs } from "@/types";

interface Props {
  drives: Drive[];
  specialDirs: SpecialDirs | null;
  beamDownloads: string;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function ExplorerSidebar({
  drives, specialDirs, beamDownloads, currentPath, onNavigate,
}: Props) {
  const isActive = (path: string) =>
    !!path && (currentPath === path || currentPath.startsWith(path + "\\") || currentPath.startsWith(path + "/"));

  return (
    <aside className="flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/50 py-2">
      {/* Quick access */}
      <SidebarSection label="Quick access">
        {specialDirs?.home && (
          <SidebarItem icon={<Home />} label="Home" path={specialDirs.home} active={isActive(specialDirs.home)} onNavigate={onNavigate} />
        )}
        {specialDirs?.desktop && (
          <SidebarItem icon={<Monitor />} label="Desktop" path={specialDirs.desktop} active={isActive(specialDirs.desktop)} onNavigate={onNavigate} />
        )}
        {specialDirs?.documents && (
          <SidebarItem icon={<FileText />} label="Documents" path={specialDirs.documents} active={isActive(specialDirs.documents)} onNavigate={onNavigate} />
        )}
        {specialDirs?.downloads && (
          <SidebarItem icon={<Download />} label="Downloads" path={specialDirs.downloads} active={isActive(specialDirs.downloads)} onNavigate={onNavigate} />
        )}
        {specialDirs?.pictures && (
          <SidebarItem icon={<Image />} label="Pictures" path={specialDirs.pictures} active={isActive(specialDirs.pictures)} onNavigate={onNavigate} />
        )}
        {specialDirs?.music && (
          <SidebarItem icon={<Music />} label="Music" path={specialDirs.music} active={isActive(specialDirs.music)} onNavigate={onNavigate} />
        )}
        {beamDownloads && (
          <SidebarItem
            icon={<FolderOpen className="text-accent" />}
            label="Beam Downloads"
            path={beamDownloads}
            active={isActive(beamDownloads)}
            onNavigate={onNavigate}
            accent
          />
        )}
      </SidebarSection>

      {/* Drives */}
      {drives.length > 0 && (
        <SidebarSection label="This PC">
          {drives.map((d) => (
            <SidebarItem
              key={d.path}
              icon={<HardDrive />}
              label={d.name}
              path={d.path}
              active={isActive(d.path)}
              onNavigate={onNavigate}
            />
          ))}
        </SidebarSection>
      )}
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function SidebarItem({
  icon, label, path, active, onNavigate, accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  path: string;
  active: boolean;
  onNavigate: (p: string) => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={() => onNavigate(path)}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-[5px] text-left text-[12px] transition-colors",
        active
          ? "bg-accent-dim text-accent font-medium"
          : "text-muted hover:bg-white/[0.05] hover:text-text",
      )}
    >
      <span className={cn("size-[14px] shrink-0 [&>svg]:size-[14px]", accent && "text-accent")}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
