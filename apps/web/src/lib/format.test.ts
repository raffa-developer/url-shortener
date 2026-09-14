import { describe, expect, it } from "vitest";
import {
  computeExpiresAt,
  formatCompactNumber,
  formatDayLabel,
  formatExpiry,
  formatNumber,
  formatRelative,
  getExpiryStatus,
  percentage,
} from "./format";

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1482)).toBe("1,482");
  });
});

describe("formatCompactNumber", () => {
  it("shortens large values for chart axes", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1234)).toBe("1.2K");
    expect(formatCompactNumber(1_500_000)).toBe("1.5M");
  });
});

describe("formatRelative", () => {
  // Built with local-time constructors so the assertions hold in any timezone.
  const now = new Date(2026, 8, 13, 12, 0, 0);

  it("labels today and yesterday", () => {
    expect(formatRelative(new Date(2026, 8, 13, 8, 0, 0).toISOString(), now)).toBe("Today");
    expect(formatRelative(new Date(2026, 8, 12, 23, 0, 0).toISOString(), now)).toBe(
      "Yesterday",
    );
  });

  it("counts whole days", () => {
    expect(formatRelative(new Date(2026, 8, 10, 12, 0, 0).toISOString(), now)).toBe(
      "3 days ago",
    );
  });

  it("falls back to a date after a month", () => {
    expect(formatRelative(new Date(2026, 5, 1, 12, 0, 0).toISOString(), now)).toMatch(/Jun/);
  });
});

describe("percentage", () => {
  it("rounds to whole percent", () => {
    expect(percentage(31, 50)).toBe("62%");
  });

  it("handles an empty total", () => {
    expect(percentage(0, 0)).toBe("0%");
  });
});

describe("formatDayLabel", () => {
  it("formats a UTC date key without timezone drift", () => {
    expect(formatDayLabel("2026-09-13")).toBe("Sep 13");
  });

  it("returns the input when malformed", () => {
    expect(formatDayLabel("not-a-date")).toBe("not-a-date");
  });
});

describe("computeExpiresAt", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");

  it("returns null for never", () => {
    expect(computeExpiresAt("never", now)).toBeNull();
  });

  it("adds the preset duration", () => {
    expect(computeExpiresAt("1h", now)).toBe("2026-09-13T13:00:00.000Z");
    expect(computeExpiresAt("7d", now)).toBe("2026-09-20T12:00:00.000Z");
    expect(computeExpiresAt("30d", now)).toBe("2026-10-13T12:00:00.000Z");
  });
});

describe("formatExpiry", () => {
  const now = new Date(2026, 8, 13, 12, 0, 0);

  it("returns Never and Expired", () => {
    expect(formatExpiry(null, now)).toBe("Never");
    expect(formatExpiry(new Date(2026, 8, 13, 11, 0, 0).toISOString(), now)).toBe(
      "Expired",
    );
  });

  it("shows minutes under an hour", () => {
    expect(formatExpiry(new Date(2026, 8, 13, 12, 45, 0).toISOString(), now)).toBe(
      "in 45m",
    );
    expect(formatExpiry(new Date(2026, 8, 13, 12, 0, 30).toISOString(), now)).toBe(
      "in <1m",
    );
  });

  it("shows hours under 24 hours", () => {
    expect(formatExpiry(new Date(2026, 8, 13, 15, 0, 0).toISOString(), now)).toBe(
      "in 3h",
    );
    expect(formatExpiry(new Date(2026, 8, 14, 11, 0, 0).toISOString(), now)).toBe(
      "in 23h",
    );
  });

  it("shows a date from 24 hours out", () => {
    expect(formatExpiry(new Date(2026, 8, 15, 12, 0, 0).toISOString(), now)).toMatch(
      /Sep/,
    );
  });
});

describe("getExpiryStatus", () => {
  const now = new Date(2026, 8, 13, 12, 0, 0);

  it("classifies never and expired", () => {
    expect(getExpiryStatus(null, now)).toBe("never");
    expect(getExpiryStatus(new Date(2026, 8, 13, 11, 0, 0).toISOString(), now)).toBe(
      "expired",
    );
  });

  it("classifies under 24 hours as soon", () => {
    expect(getExpiryStatus(new Date(2026, 8, 13, 18, 0, 0).toISOString(), now)).toBe(
      "soon",
    );
    expect(getExpiryStatus(new Date(2026, 8, 14, 11, 0, 0).toISOString(), now)).toBe(
      "soon",
    );
  });

  it("classifies under 7 days as upcoming", () => {
    expect(getExpiryStatus(new Date(2026, 8, 15, 12, 0, 0).toISOString(), now)).toBe(
      "upcoming",
    );
    expect(getExpiryStatus(new Date(2026, 8, 19, 11, 59, 0).toISOString(), now)).toBe(
      "upcoming",
    );
  });

  it("classifies a week or more as far", () => {
    expect(getExpiryStatus(new Date(2026, 8, 20, 12, 0, 0).toISOString(), now)).toBe(
      "far",
    );
  });
});
