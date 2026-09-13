export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DailyCount {
  date: string;
  count: number;
}

/**
 * Expands sparse per-day counts into a dense series covering the whole range,
 * so charts render a continuous axis with explicit zero days.
 */
export function fillDailyGaps(
  counts: ReadonlyMap<string, number>,
  from: Date,
  to: Date,
): DailyCount[] {
  const series: DailyCount[] = [];
  for (
    let cursor = startOfUtcDay(from);
    cursor.getTime() <= to.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    const key = toUtcDateKey(cursor);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

export function normalizeCountry(country: string | null | undefined): string | null {
  if (!country) {
    return null;
  }
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function normalizeReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) {
    return null;
  }
  const trimmed = referrer.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2048) : null;
}

/**
 * Collapses a raw referrer URL into a display source. Anything that is not a
 * parsable http(s) URL falls back to "other"; an absent referrer is "direct".
 */
export function referrerSource(referrer: string | null | undefined): string {
  if (!referrer) {
    return "direct";
  }
  try {
    const host = new URL(referrer).hostname.replace(/^www\./i, "").toLowerCase();
    return host.length > 0 ? host : "other";
  } catch {
    return "other";
  }
}

export function aggregateReferrers(
  rows: { value: string | null; count: number }[],
  take: number,
): { source: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const source = referrerSource(row.value);
    totals.set(source, (totals.get(source) ?? 0) + row.count);
  }

  return [...totals.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
    .slice(0, take);
}
