import {
  Home, Monitor, FileText, Download, Image, Music,
  HardDrive, Zap,
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
    !!path && (
      currentPath === path ||
      currentPath.startsWith(path + "\\") ||
      currentPath.startsWith(path + "/")
    );

  return (
    <aside
      className="flex w-[190px] shrink-0 flex-col overflow-y-auto border-r border-border py-2"
      style={{ background: "var(--surface)" }}
    >
      {/* Quick access */}
      <SidebarSection label="Quick access">
        {specialDirs?.home && (
          <SidebarItem icon={<Home />} label="Home"
            path={specialDirs.home} active={isActive(specialDirs.home)} onNavigate={onNavigate} />
        )}
        {specialDirs?.desktop && (
          <SidebarItem icon={<Monitor />} label="Desktop"
            path={specialDirs.desktop} active={isActive(specialDirs.desktop)} onNavigate={onNavigate} />
        )}
        {specialDirs?.documents && (
          <SidebarItem icon={<FileText />} label="Documents"
            path={specialDirs.documents} active={isActive(specialDirs.documents)} onNavigate={onNavigate} />
        )}
        {specialDirs?.downloads && (
          <SidebarItem icon={<Download />} label="Downloads"
            path={specialDirs.downloads} active={isActive(specialDirs.downloads)} onNavigate={onNavigate} />
        )}
        {specialDirs?.pictures && (
          <SidebarItem icon={<Image />} label="Pictures"
            path={specialDirs.pictures} active={isActive(specialDirs.pictures)} onNavigate={onNavigate} />
        )}
        {specialDirs?.music && (
          <SidebarItem icon={<Music />} label="Music"
            path={specialDirs.music} active={isActive(specialDirs.music)} onNavigate={onNavigate} />
        )}
      </SidebarSection>

      {beamDownloads && (
        <SidebarSection label="Beam">
          <SidebarItem
            icon={<Zap />}
            label="Downloads"
            path={beamDownloads}
            active={isActive(beamDownloads)}
            onNavigate={onNavigate}
            accent
          />
        </SidebarSection>
      )}

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
    <div className="mb-2 px-2">
      <p className="mb-0.5 px-2 pt-3 pb-1 text-[9.5px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
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
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-[5px] text-left text-[12px] font-medium transition-colors",
        active
          ? accent
            ? "bg-accent/15 text-accent"
            : "bg-white/[0.09] text-text"
          : accent
            ? "text-accent/70 hover:bg-accent/10 hover:text-accent"
            : "text-muted hover:bg-white/[0.06] hover:text-text",
      )}
    >
      <span className={cn(
        "size-3.5 shrink-0 [&>svg]:size-3.5",
        active ? (accent ? "text-accent" : "text-text") : accent ? "text-accent/70" : "text-muted",
      )}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
