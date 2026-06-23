// Human-readable formatters for the data readouts. All return strings sized to
// pair with a mono font so widths stay stable as values change.

/** Bytes → "1.4 GB" style. Uses binary units but labels them simply. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  // One decimal under 100, none above, so the readout stays compact.
  const decimals = value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

/** Bytes-per-second → "12.3 MB/s". */
export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

/** Seconds → "3m 20s" / "45s" / "1h 2m". Null/0 → an em dash. */
export function formatEta(secs: number | null): string {
  if (secs === null || !Number.isFinite(secs) || secs <= 0) return "—";
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Elapsed milliseconds → "1m 04s" duration. */
export function formatDuration(ms: number): string {
  return formatEta(ms / 1000);
}

/** 0–1 fraction → integer percentage string, clamped. */
export function formatPercent(fraction: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return `${pct}%`;
}

/** Strip any folder prefix from a transfer file name for compact display. */
export function baseName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] || name;
}
