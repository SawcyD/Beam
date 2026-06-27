import type { FsEntry } from "@/types";

// ── File-type icon names (lucide) ─────────────────────────────────────────

export type IconName =
  | "Folder" | "FolderOpen"
  | "Image" | "Video" | "Music"
  | "FileText" | "FileCode" | "FileArchive"
  | "Terminal" | "File";

export function fileIconName(entry: FsEntry): IconName {
  if (entry.is_dir) return "Folder";
  const ext = entry.extension.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","ico","bmp","tiff"].includes(ext)) return "Image";
  if (["mp4","mkv","avi","mov","wmv","flv","webm"].includes(ext)) return "Video";
  if (["mp3","wav","flac","aac","ogg","m4a","wma"].includes(ext)) return "Music";
  if (["zip","rar","7z","tar","gz","bz2","xz","zst"].includes(ext)) return "FileArchive";
  if (["js","ts","jsx","tsx","py","rs","go","java","cs","cpp","c","h","php","rb","swift","kt","dart","lua","r","m","ex","elm","hs","ml","clj","scala","vue","svelte"].includes(ext)) return "FileCode";
  if (["pdf","doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","txt","md","rtf","csv"].includes(ext)) return "FileText";
  if (["exe","msi","dmg","pkg","deb","rpm","appimage"].includes(ext)) return "Terminal";
  return "File";
}

// Icon colour tint by category
export function fileIconColor(entry: FsEntry): string {
  if (entry.is_dir) return "text-accent";
  const name = fileIconName(entry);
  switch (name) {
    case "Image":       return "text-purple-400";
    case "Video":       return "text-blue-400";
    case "Music":       return "text-pink-400";
    case "FileArchive": return "text-yellow-500";
    case "FileCode":    return "text-emerald-400";
    case "FileText":    return "text-sky-400";
    case "Terminal":    return "text-red-400";
    default:            return "text-muted";
  }
}

// ── Path helpers ──────────────────────────────────────────────────────────

export function parentPath(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const clean = path.replace(/[/\\]+$/, "");
  const idx = clean.lastIndexOf(sep);
  if (idx <= 0) return sep;
  const parent = clean.slice(0, idx);
  // Windows: "C:" → "C:\"
  if (/^[A-Za-z]:$/.test(parent)) return parent + "\\";
  return parent;
}

export function pathSegments(path: string): { label: string; path: string }[] {
  const sep = path.includes("\\") ? "\\" : "/";
  const clean = path.replace(/[/\\]+$/, "");
  const parts = clean.split(/[/\\]/).filter(Boolean);
  const segments: { label: string; path: string }[] = [];
  let built = "";
  for (const part of parts) {
    built = built ? built + sep + part : part;
    // Windows root: "C:" → "C:\"
    const p = /^[A-Za-z]:$/.test(built) ? built + "\\" : built;
    segments.push({ label: part, path: p });
  }
  return segments;
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export function fileTypeName(entry: FsEntry): string {
  if (entry.is_dir) return "Folder";
  if (!entry.extension) return "File";
  const ext = entry.extension.toLowerCase();
  const map: Record<string, string> = {
    pdf: "PDF", doc: "Word", docx: "Word",
    xls: "Excel", xlsx: "Excel",
    ppt: "PowerPoint", pptx: "PowerPoint",
    txt: "Text", md: "Markdown", rtf: "RTF", csv: "CSV",
    jpg: "JPEG", jpeg: "JPEG", png: "PNG", gif: "GIF",
    webp: "WebP", svg: "SVG", ico: "Icon", bmp: "Bitmap",
    mp4: "MP4 Video", mkv: "MKV Video", avi: "AVI Video", mov: "QuickTime",
    mp3: "MP3 Audio", wav: "WAV Audio", flac: "FLAC Audio", aac: "AAC Audio",
    zip: "ZIP Archive", rar: "RAR Archive", "7z": "7-Zip Archive",
    tar: "TAR Archive", gz: "GZ Archive",
    js: "JavaScript", ts: "TypeScript", jsx: "React JSX", tsx: "React TSX",
    py: "Python", rs: "Rust", go: "Go", java: "Java",
    cs: "C#", cpp: "C++", c: "C Source", h: "C Header",
    html: "HTML", css: "CSS", json: "JSON", xml: "XML",
    exe: "Application", msi: "Installer", bat: "Batch Script", sh: "Shell Script",
    dll: "DLL Library",
  };
  return map[ext] ? `${map[ext]} File` : `${ext.toUpperCase()} File`;
}
