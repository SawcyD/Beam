import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Folder,
  Check,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  ShieldOff,
  Users,
  Trash2,
  Plus,
  Wifi,
  Zap,
  Info,
  Eye,
  Network,
  Settings2,
} from "lucide-react";
import { useBeamStore } from "@/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WatchFolders } from "./WatchFolders";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light" | "system";
type Section = "general" | "transfers" | "devices" | "network" | "updates" | "about";

const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "general",   label: "General",   icon: <Settings2 className="size-3.5" /> },
  { id: "transfers", label: "Transfers", icon: <Zap className="size-3.5" /> },
  { id: "devices",   label: "Devices",   icon: <Users className="size-3.5" /> },
  { id: "network",   label: "Network",   icon: <Network className="size-3.5" /> },
  { id: "updates",   label: "Updates",   icon: <RefreshCw className="size-3.5" /> },
  { id: "about",     label: "About",     icon: <Info className="size-3.5" /> },
];

export function SettingsPage() {
  const [section, setSection] = useState<Section>("general");

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* ── Left sidebar nav ───────────────────────────────────── */}
      <nav
        className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border p-3"
        style={{ background: "var(--surface)" }}
      >
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
          Settings
        </p>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all duration-100",
              section === item.id
                ? "bg-accent/12 text-accent"
                : "text-muted hover:bg-white/[0.05] hover:text-text",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── Right content pane ─────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {section === "general"   && <GeneralSection />}
        {section === "transfers" && <TransfersSection />}
        {section === "devices"   && <DevicesSection />}
        {section === "network"   && <NetworkSection />}
        {section === "updates"   && <UpdatesSection />}
        {section === "about"     && <AboutSection />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   GENERAL
══════════════════════════════════════════════════════════════════ */

function GeneralSection() {
  const deviceName    = useBeamStore((s) => s.deviceName);
  const setDeviceName = useBeamStore((s) => s.setDeviceName);
  const theme         = useBeamStore((s) => s.theme);
  const setTheme      = useBeamStore((s) => s.setTheme);

  const [nameDraft, setNameDraft] = useState(deviceName);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => { setNameDraft(deviceName); }, [deviceName]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === deviceName) return;
    await setDeviceName(trimmed);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  const themeOpts: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: "dark",   icon: <Moon className="size-3.5" />,    label: "Dark" },
    { value: "light",  icon: <Sun className="size-3.5" />,     label: "Light" },
    { value: "system", icon: <Monitor className="size-3.5" />, label: "System" },
  ];

  return (
    <SectionShell title="General" description="Appearance and device identity.">
      <Row label="Appearance" description="Choose how Beam looks.">
        <div className="flex gap-1 rounded-lg border border-border p-1" style={{ background: "var(--bg)" }}>
          {themeOpts.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                theme === opt.value ? "bg-accent/20 text-accent" : "text-muted hover:text-text",
              )}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </Row>

      <Divider />

      <Row label="Device name" description="How this machine appears to others on the network.">
        <div className="flex gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void saveName()}
            maxLength={48}
            placeholder="My Laptop"
            className="h-9 flex-1 rounded-md border border-border px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ background: "var(--bg)" }}
          />
          <Button
            variant="secondary"
            onClick={() => void saveName()}
            disabled={!nameDraft.trim() || nameDraft.trim() === deviceName}
          >
            {savedFlash ? <Check className="size-3.5 text-ok" /> : "Save"}
          </Button>
        </div>
      </Row>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TRANSFERS
══════════════════════════════════════════════════════════════════ */

function TransfersSection() {
  const defaultSaveDir    = useBeamStore((s) => s.defaultSaveDir);
  const setDefaultSaveDir = useBeamStore((s) => s.setDefaultSaveDir);
  const conflictPolicy    = useBeamStore((s) => s.conflictPolicy);
  const setConflictPolicy = useBeamStore((s) => s.setConflictPolicy);
  const bandwidthLimit    = useBeamStore((s) => s.bandwidthLimit);
  const setBandwidthLimit = useBeamStore((s) => s.setBandwidthLimit);

  async function chooseFolder() {
    const picked = await open({ directory: true, multiple: false, defaultPath: defaultSaveDir || undefined });
    if (typeof picked === "string") await setDefaultSaveDir(picked);
  }

  return (
    <SectionShell title="Transfers" description="Where files are saved and how conflicts are resolved.">
      <Row label="Default save folder" description="Received files go here unless changed at transfer time.">
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2" style={{ background: "var(--bg)" }}>
          <div className="flex min-w-0 items-center gap-2">
            <Folder className="size-4 shrink-0 text-muted" />
            <span className="truncate font-mono text-xs text-muted" title={defaultSaveDir}>
              {defaultSaveDir || "Not set"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void chooseFolder()}>
            Change…
          </Button>
        </div>
      </Row>

      <Divider />

      <Row
        label="When a file already exists"
        description={
          conflictPolicy === "rename"    ? "Adds (2), (3), … to keep both copies." :
          conflictPolicy === "overwrite" ? "Replaces the existing file without asking." :
                                          "Skips the file silently."
        }
      >
        <div className="flex gap-1 rounded-lg border border-border p-1" style={{ background: "var(--bg)" }}>
          {(["rename", "overwrite", "skip"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setConflictPolicy(v)}
              className={cn(
                "flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-medium capitalize transition-colors",
                conflictPolicy === v ? "bg-accent/20 text-accent" : "text-muted hover:text-text",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </Row>

      <Divider />

      <Row label="Send bandwidth limit" description="Cap outbound speed to avoid saturating your network.">
        <div className="flex flex-wrap gap-1.5">
          {([
            { label: "Unlimited", value: null },
            { label: "50 MB/s",   value: 50 * 1024 * 1024 },
            { label: "20 MB/s",   value: 20 * 1024 * 1024 },
            { label: "10 MB/s",   value: 10 * 1024 * 1024 },
            { label: "5 MB/s",    value:  5 * 1024 * 1024 },
            { label: "1 MB/s",    value:  1 * 1024 * 1024 },
          ] as { label: string; value: number | null }[]).map((opt) => (
            <button
              key={opt.label}
              onClick={() => setBandwidthLimit(opt.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                bandwidthLimit === opt.value
                  ? "bg-accent/20 text-accent"
                  : "border border-border text-muted hover:text-text",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Row>

      <Divider />

      <Row label="Watch folders" description="Automatically send new files to a peer when they appear in a folder.">
        <WatchFolders />
      </Row>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DEVICES
══════════════════════════════════════════════════════════════════ */

function DevicesSection() {
  const trustedDevices      = useBeamStore((s) => s.trustedDevices);
  const removeTrustedDevice = useBeamStore((s) => s.removeTrustedDevice);
  const groups              = useBeamStore((s) => s.groups);
  const devices             = useBeamStore((s) => s.devices);
  const createGroup         = useBeamStore((s) => s.createGroup);
  const deleteGroup         = useBeamStore((s) => s.deleteGroup);

  const [groupName, setGroupName]   = useState("");
  const [groupSel, setGroupSel]     = useState<string[]>([]);

  return (
    <SectionShell title="Devices" description="Trusted devices and groups.">
      {/* Trusted devices */}
      <Row
        label="Trusted devices"
        description='Auto-accept incoming transfers from these. Add via "Always auto-accept" in the incoming prompt.'
        icon={<ShieldCheck className="size-3.5 text-ok" />}
      >
        {trustedDevices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted">
            No trusted devices yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {trustedDevices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                style={{ background: "var(--bg)" }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-ok" />
                  <span className="text-sm text-text">{d.name}</span>
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="text-muted hover:text-err"
                  onClick={() => removeTrustedDevice(d.id)}
                  aria-label={`Remove trust for ${d.name}`}
                >
                  <ShieldOff className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Row>

      <Divider />

      {/* Device groups */}
      <Row
        label="Device groups"
        description="Send to multiple devices at once by grouping them."
        icon={<Users className="size-3.5 text-muted" />}
      >
        {groups.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                style={{ background: "var(--bg)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm text-text">{g.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted">
                    {g.device_names.join(", ")}
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="shrink-0 text-muted hover:text-err"
                  onClick={() => deleteGroup(g.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div
          className="flex flex-col gap-2 rounded-md border border-border p-3"
          style={{ background: "var(--bg)" }}
        >
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name…"
            className="h-8 rounded-md border border-border px-2.5 text-xs text-text outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ background: "var(--panel)" }}
          />
          <div className="flex flex-wrap gap-1">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() =>
                  setGroupSel((prev) =>
                    prev.includes(d.name) ? prev.filter((n) => n !== d.name) : [...prev, d.name],
                  )
                }
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                  groupSel.includes(d.name)
                    ? "bg-accent/20 text-accent"
                    : "border border-border text-muted hover:text-text",
                )}
              >
                {d.name}
              </button>
            ))}
            {devices.length === 0 && (
              <p className="text-[11px] text-muted">No devices visible right now.</p>
            )}
          </div>
          <Button
            variant="secondary" size="sm" className="self-start"
            disabled={!groupName.trim() || groupSel.length === 0}
            onClick={async () => {
              await createGroup(groupName.trim(), groupSel);
              setGroupName("");
              setGroupSel([]);
            }}
          >
            <Plus className="size-3.5" /> Create group
          </Button>
        </div>
      </Row>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   NETWORK
══════════════════════════════════════════════════════════════════ */

function NetworkSection() {
  return (
    <SectionShell title="Network" description="Discovery and connection diagnostics.">
      <Row
        label="mDNS Discovery"
        description="Devices announce themselves on your local network using mDNS (_beam._tcp)."
        icon={<Wifi className="size-3.5 text-ok" />}
      >
        <div className="flex items-center gap-2 rounded-md border border-ok/20 bg-ok/8 px-3 py-2">
          <span className="size-1.5 rounded-full bg-ok" />
          <span className="text-xs text-ok">Active — scanning local network</span>
        </div>
      </Row>

      <Divider />

      <Row
        label="Transfer protocol"
        description="Files are transferred over direct TCP connections at full local network speed."
        icon={<Zap className="size-3.5 text-muted" />}
      >
        <div
          className="rounded-md border border-border px-3 py-2 font-mono text-xs text-muted"
          style={{ background: "var(--bg)" }}
        >
          Direct TCP · Port assigned by OS · LAN-only
        </div>
      </Row>

      <Divider />

      <PlaceholderRow
        label="Preferred network interface"
        description="Pin transfers to a specific network adapter."
        badge="Coming soon"
      />

      <Divider />

      <PlaceholderRow
        label="Connection diagnostics"
        description="Run a quick test to verify discovery and transfer are working."
        badge="Coming soon"
      />
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   UPDATES
══════════════════════════════════════════════════════════════════ */

function UpdatesSection() {
  const updateAvailable = useBeamStore((s) => s.updateAvailable);
  const checkForUpdates = useBeamStore((s) => s.checkForUpdates);
  const installUpdate   = useBeamStore((s) => s.installUpdate);

  const [checking, setChecking]   = useState(false);
  const [checkResult, setResult]  = useState<string | null>(null);

  async function doCheck() {
    console.log("[updater] check triggered");
    setChecking(true);
    setResult(null);
    try {
      await checkForUpdates();
      const available = useBeamStore.getState().updateAvailable;
      console.log("[updater] check complete — updateAvailable:", available);
      setResult(available ? null : "You're on the latest version.");
    } catch (err) {
      console.error("[updater] check failed:", err);
      setResult("Could not reach update server.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <SectionShell title="Updates" description="Beam updates automatically via GitHub releases.">
      <Row label="Current version">
        <div
          className="flex items-center justify-between rounded-md border border-border px-3 py-2"
          style={{ background: "var(--bg)" }}
        >
          <span className="font-mono text-sm text-text">v0.1.4</span>
          {updateAvailable ? (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-medium text-accent">
              v{updateAvailable.version} available
            </span>
          ) : (
            <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok">
              Up to date
            </span>
          )}
        </div>
      </Row>

      <Divider />

      <Row label="Check for updates" description={checkResult ?? "Checks the GitHub releases endpoint."}>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void doCheck()}
            disabled={checking}
          >
            <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />
            {checking ? "Checking…" : "Check now"}
          </Button>
          {updateAvailable && (
            <Button variant="ok" onClick={() => void installUpdate()}>
              Install v{updateAvailable.version}
            </Button>
          )}
        </div>
      </Row>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ABOUT
══════════════════════════════════════════════════════════════════ */

function AboutSection() {
  return (
    <SectionShell title="About" description="Beam — cross-platform local P2P file transfer.">
      <div
        className="flex flex-col gap-4 rounded-xl border border-border p-5"
        style={{ background: "var(--panel)" }}
      >
        {/* Logo + name */}
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-xl"
            style={{
              background: "rgba(120, 230, 75, 0.12)",
              border: "1px solid rgba(120, 230, 75, 0.25)",
            }}
          >
            <Eye className="size-5 text-accent" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">Beam</p>
            <p className="text-xs text-muted">v0.1.4 · MIT License</p>
          </div>
        </div>

        <div className="h-px bg-border" />

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
          <dt className="text-muted">Built with</dt>
          <dd className="font-mono text-text">Tauri v2 · Rust · React · TypeScript</dd>

          <dt className="text-muted">Discovery</dt>
          <dd className="font-mono text-text">mDNS (_beam._tcp)</dd>

          <dt className="text-muted">Transfer</dt>
          <dd className="font-mono text-text">Direct TCP · SHA-256 verified</dd>

          <dt className="text-muted">Platforms</dt>
          <dd className="font-mono text-text">Windows · macOS · Linux</dd>

          <dt className="text-muted">Source</dt>
          <dd>
            <a
              href="https://github.com/SawcyD/Beam"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent underline-offset-2 hover:underline"
            >
              github.com/SawcyD/Beam
            </a>
          </dd>
        </dl>
      </div>
    </SectionShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SHARED PRIMITIVES
══════════════════════════════════════════════════════════════════ */

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Section header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0 divide-y divide-border px-6 py-2">
          {children}
        </div>
        <div className="h-6" />
      </ScrollArea>
    </div>
  );
}

function Row({
  label,
  description,
  icon,
  children,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4">
      <div>
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[13px] font-medium text-text">{label}</span>
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function PlaceholderRow({
  label,
  description,
  badge,
}: {
  label: string;
  description: string;
  badge: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 opacity-60">
      <div>
        <p className="text-[13px] font-medium text-text">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
        {badge}
      </span>
    </div>
  );
}

function Divider() {
  return null; // rows already divided by parent divide-y
}
