import { describe, expect, it } from "vitest";
import type { LinkDTO } from "@url-shortener/shared";
import { AnalyticsService } from "../../src/modules/analytics/analytics.service";
import { startOfUtcDay } from "../../src/modules/analytics/analytics.utils";
import type {
  ClickRepository,
  CreateClickInput,
  GroupCount,
} from "../../src/modules/analytics/click.repository";
import type { LinkService } from "../../src/modules/links/link.service";

const LINK: LinkDTO = {
  id: "link-1",
  shortCode: "abc123",
  shortUrl: "https://sho.rt/abc123",
  destinationUrl: "https://example.com/",
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: null,
  clickCount: 0,
};

class FakeClickRepository {
  created: CreateClickInput[] = [];
  total = 0;
  uniqueVisitors = 0;
  today = 0;
  yesterday = 0;
  daily: { date: string; count: number }[] = [];
  countries: GroupCount[] = [];
  devices: GroupCount[] = [];
  browsers: GroupCount[] = [];
  referrers: GroupCount[] = [];
  private eventIds = new Set<string>();

  async create(input: CreateClickInput) {
    if (input.eventId) {
      if (this.eventIds.has(input.eventId)) {
        const error = new Error("Unique constraint failed") as Error & { code: string };
        error.code = "P2002";
        throw error;
      }
      this.eventIds.add(input.eventId);
    }
    this.created.push(input);
    return { id: "click-1", timestamp: new Date(), ...input };
  }

  async countTotal(): Promise<number> {
    return this.total;
  }

  async countUniqueVisitors(): Promise<number> {
    return this.uniqueVisitors;
  }

  async countBetween(_linkId: string, from: Date): Promise<number> {
    const startOfToday = startOfUtcDay(new Date());
    return from.getTime() === startOfToday.getTime() ? this.today : this.yesterday;
  }

  async countByDay(): Promise<{ date: string; count: number }[]> {
    return this.daily;
  }

  async countByCountry(): Promise<GroupCount[]> {
    return this.countries;
  }

  async countByDevice(): Promise<GroupCount[]> {
    return this.devices;
  }

  async countByBrowser(): Promise<GroupCount[]> {
    return this.browsers;
  }

  async countByReferrer(): Promise<GroupCount[]> {
    return this.referrers;
  }
}

class FakeLinkService {
  async getByShortCode(): Promise<LinkDTO> {
    return LINK;
  }
}

function createService(repository: FakeClickRepository) {
  return new AnalyticsService(
    repository as unknown as ClickRepository,
    new FakeLinkService() as unknown as LinkService,
  );
}

describe("AnalyticsService.recordClick", () => {
  it("derives device and browser from the user agent", async () => {
    const repository = new FakeClickRepository();
    const service = createService(repository);

    await service.recordClick({
      linkId: LINK.id,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      referrer: "  https://www.google.com/search  ",
      country: "pt",
    });

    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]).toMatchObject({
      linkId: LINK.id,
      device: "mobile",
      browser: "Chrome",
      country: "PT",
      referrer: "https://www.google.com/search",
    });
  });

  it("stores null country and referrer when absent", async () => {
    const repository = new FakeClickRepository();
    const service = createService(repository);

    await service.recordClick({ linkId: LINK.id });

    expect(repository.created[0]).toMatchObject({
      country: null,
      referrer: null,
      device: "other",
      browser: "Unknown",
    });
  });

  it("treats a redelivered event as a no-op", async () => {
    const repository = new FakeClickRepository();
    const service = createService(repository);

    await service.recordClick({ linkId: LINK.id, eventId: "1700000000-0" });
    await service.recordClick({ linkId: LINK.id, eventId: "1700000000-0" });

    expect(repository.created).toHaveLength(1);
  });
});

describe("AnalyticsService.getLinkAnalytics", () => {
  it("aggregates totals, dimensions and a dense daily series", async () => {
    const repository = new FakeClickRepository();
    repository.total = 12;
    repository.uniqueVisitors = 7;
    repository.today = 3;
    repository.yesterday = 2;
    repository.daily = [
      { date: "2026-09-12", count: 4 },
      { date: "2026-09-13", count: 3 },
    ];
    repository.countries = [
      { value: "PT", count: 7 },
      { value: null, count: 5 },
    ];
    repository.devices = [{ value: "mobile", count: 8 }];
    repository.browsers = [{ value: "Chrome", count: 9 }];
    repository.referrers = [
      { value: "https://www.google.com/search", count: 5 },
      { value: null, count: 3 },
    ];

    const service = createService(repository);
    const analytics = await service.getLinkAnalytics("abc123", "user-1", { days: 7 });

    expect(analytics.link).toEqual({
      id: LINK.id,
      shortCode: LINK.shortCode,
      shortUrl: LINK.shortUrl,
      destinationUrl: LINK.destinationUrl,
      expiresAt: null,
    });
    expect(analytics.range.days).toBe(7);
    expect(analytics.totalClicks).toBe(12);
    expect(analytics.uniqueVisitors).toBe(7);
    expect(analytics.today).toBe(3);
    expect(analytics.yesterday).toBe(2);
    expect(analytics.clicksPerDay).toHaveLength(7);
    expect(analytics.clicksPerDay.at(-1)).toEqual({ date: "2026-09-13", count: 3 });
    expect(analytics.countries).toEqual([
      { country: "PT", count: 7 },
      { country: "Unknown", count: 5 },
    ]);
    expect(analytics.devices).toEqual([{ device: "mobile", count: 8 }]);
    expect(analytics.browsers).toEqual([{ browser: "Chrome", count: 9 }]);
    expect(analytics.referrers).toEqual([
      { source: "google.com", count: 5 },
      { source: "direct", count: 3 },
    ]);
  });
});
