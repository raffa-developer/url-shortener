export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffDays = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(then)) / (24 * 60 * 60 * 1000),
  );

  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }
  return formatDate(iso);
}

export function formatExpiry(expiresAt: string | null, now: Date = new Date()): string {
  if (!expiresAt) {
    return "Never";
  }

  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  if (diffMs <= 0) {
    return "Expired";
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return minutes <= 0 ? "in <1m" : `in ${minutes}m`;
  }

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    return `in ${hours}h`;
  }

  return formatDate(expiresAt);
}

export type ExpiryStatus = "never" | "expired" | "soon" | "upcoming" | "far";

const SOON_MS = 24 * 60 * 60 * 1000;
const UPCOMING_MS = 7 * 24 * 60 * 60 * 1000;

/** Classifies an expiry for colour coding: expired, <24h, <7d, further out, or never. */
export function getExpiryStatus(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpiryStatus {
  if (!expiresAt) {
    return "never";
  }

  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  if (diffMs <= 0) {
    return "expired";
  }
  if (diffMs < SOON_MS) {
    return "soon";
  }
  if (diffMs < UPCOMING_MS) {
    return "upcoming";
  }
  return "far";
}

export function percentage(part: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }
  return `${Math.round((part / total) * 100)}%`;
}

/** Formats a `YYYY-MM-DD` bucket key without timezone drift. */
export function formatDayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    return date;
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export type ExpiryPreset = "never" | "1h" | "1d" | "7d" | "30d";

export const EXPIRY_PRESETS: { value: ExpiryPreset; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const PRESET_DURATIONS: Record<Exclude<ExpiryPreset, "never">, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function computeExpiresAt(
  preset: ExpiryPreset,
  now: Date = new Date(),
): string | null {
  if (preset === "never") {
    return null;
  }
  return new Date(now.getTime() + PRESET_DURATIONS[preset]).toISOString();
}
