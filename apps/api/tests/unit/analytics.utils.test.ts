import { describe, expect, it } from "vitest";
import {
  addUtcDays,
  aggregateReferrers,
  fillDailyGaps,
  normalizeCountry,
  normalizeReferrer,
  referrerSource,
  startOfUtcDay,
  toUtcDateKey,
} from "../../src/modules/analytics/analytics.utils";

describe("UTC day helpers", () => {
  it("truncates to the start of the UTC day", () => {
    const date = new Date("2026-09-13T15:42:11.123Z");
    expect(startOfUtcDay(date).toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });

  it("adds and subtracts UTC days across month boundaries", () => {
    const date = new Date("2026-09-01T00:00:00.000Z");
    expect(toUtcDateKey(addUtcDays(date, -1))).toBe("2026-08-31");
    expect(toUtcDateKey(addUtcDays(date, 30))).toBe("2026-10-01");
  });
});

describe("fillDailyGaps", () => {
  it("produces a dense series with explicit zero days", () => {
    const from = new Date("2026-09-10T00:00:00.000Z");
    const to = new Date("2026-09-13T15:00:00.000Z");
    const counts = new Map([
      ["2026-09-10", 5],
      ["2026-09-12", 2],
    ]);

    expect(fillDailyGaps(counts, from, to)).toEqual([
      { date: "2026-09-10", count: 5 },
      { date: "2026-09-11", count: 0 },
      { date: "2026-09-12", count: 2 },
      { date: "2026-09-13", count: 0 },
    ]);
  });
});

describe("referrerSource", () => {
  it("maps an absent referrer to direct", () => {
    expect(referrerSource(null)).toBe("direct");
    expect(referrerSource("")).toBe("direct");
  });

  it("strips www and lowercases the host", () => {
    expect(referrerSource("https://www.Google.com/search?q=test")).toBe("google.com");
    expect(referrerSource("https://instagram.com/p/abc")).toBe("instagram.com");
  });

  it("keeps subdomains", () => {
    expect(referrerSource("https://news.ycombinator.com/item?id=1")).toBe(
      "news.ycombinator.com",
    );
  });

  it("maps unparseable referrers to other", () => {
    expect(referrerSource("not a url")).toBe("other");
  });
});

describe("aggregateReferrers", () => {
  it("merges equivalent hosts and ranks by count", () => {
    const result = aggregateReferrers(
      [
        { value: "https://www.google.com/search", count: 4 },
        { value: "https://google.com/", count: 3 },
        { value: null, count: 2 },
        { value: "https://instagram.com/p/1", count: 6 },
      ],
      10,
    );

    expect(result).toEqual([
      { source: "google.com", count: 7 },
      { source: "instagram.com", count: 6 },
      { source: "direct", count: 2 },
    ]);
  });

  it("limits the number of sources", () => {
    const result = aggregateReferrers(
      [
        { value: "https://a.com", count: 3 },
        { value: "https://b.com", count: 2 },
        { value: "https://c.com", count: 1 },
      ],
      2,
    );
    expect(result).toHaveLength(2);
  });
});

describe("normalization", () => {
  it("normalizes country codes", () => {
    expect(normalizeCountry("pt")).toBe("PT");
    expect(normalizeCountry("Portugal")).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });

  it("trims referrers and caps their length", () => {
    expect(normalizeReferrer("  https://google.com  ")).toBe("https://google.com");
    expect(normalizeReferrer("   ")).toBeNull();
    expect(normalizeReferrer("x".repeat(3000))?.length).toBe(2048);
  });
});
