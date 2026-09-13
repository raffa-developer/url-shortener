import type { LinkService } from "../links/link.service";
import { isUniqueConstraintError } from "../../db";
import type { AnalyticsResponse } from "./analytics.schemas";
import {
  addUtcDays,
  aggregateReferrers,
  fillDailyGaps,
  normalizeCountry,
  normalizeReferrer,
  startOfUtcDay,
} from "./analytics.utils";
import type { ClickRepository } from "./click.repository";
import { parseUserAgent } from "./user-agent";

const TOP_N = 10;
const REFERRER_FETCH_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordClickInput {
  linkId: string;
  userAgent?: string | null;
  referrer?: string | null;
  country?: string | null;
  timestamp?: Date;
  /** Stream entry id; makes at-least-once redelivery idempotent. */
  eventId?: string | null;
  /** Link-scoped pseudonymous visitor id; no raw IP is stored. */
  visitorHash?: string | null;
}

export class AnalyticsService {
  constructor(
    private readonly clicks: ClickRepository,
    private readonly links: LinkService,
  ) {}

  async recordClick(input: RecordClickInput): Promise<void> {
    const { device, browser } = parseUserAgent(input.userAgent);

    try {
      await this.clicks.create({
        linkId: input.linkId,
        device,
        browser,
        country: normalizeCountry(input.country),
        referrer: normalizeReferrer(input.referrer),
        eventId: input.eventId ?? null,
        visitorHash: input.visitorHash ?? null,
        ...(input.timestamp ? { timestamp: input.timestamp } : {}),
      });
    } catch (error) {
      // The same event redelivered after a crash is a no-op, not a duplicate.
      if (input.eventId && isUniqueConstraintError(error)) {
        return;
      }
      throw error;
    }
  }

  async getLinkAnalytics(
    shortCode: string,
    userId: string,
    options: { days: number },
  ): Promise<AnalyticsResponse> {
    // getByShortCode enforces ownership and throws NotFound/Forbidden.
    const link = await this.links.getByShortCode(shortCode, userId);

    const now = new Date();
    const from = startOfUtcDay(new Date(now.getTime() - (options.days - 1) * DAY_MS));
    const startOfToday = startOfUtcDay(now);
    const startOfYesterday = addUtcDays(startOfToday, -1);

    const [
      totalClicks,
      uniqueVisitors,
      today,
      yesterday,
      dailyRows,
      countries,
      devices,
      browsers,
      referrers,
    ] = await Promise.all([
      this.clicks.countTotal(link.id),
      this.clicks.countUniqueVisitors(link.id, from),
      this.clicks.countBetween(link.id, startOfToday, addUtcDays(startOfToday, 1)),
      this.clicks.countBetween(link.id, startOfYesterday, startOfToday),
      this.clicks.countByDay(link.id, from),
      this.clicks.countByCountry(link.id, TOP_N),
      this.clicks.countByDevice(link.id, TOP_N),
      this.clicks.countByBrowser(link.id, TOP_N),
      this.clicks.countByReferrer(link.id, REFERRER_FETCH_LIMIT),
    ]);

    return {
      link: {
        id: link.id,
        shortCode: link.shortCode,
        shortUrl: link.shortUrl,
        destinationUrl: link.destinationUrl,
        expiresAt: link.expiresAt,
      },
      range: { days: options.days, from: from.toISOString(), to: now.toISOString() },
      totalClicks,
      uniqueVisitors,
      today,
      yesterday,
      clicksPerDay: fillDailyGaps(
        new Map(dailyRows.map((row) => [row.date, row.count])),
        from,
        now,
      ),
      countries: countries.map((row) => ({
        country: row.value ?? "Unknown",
        count: row.count,
      })),
      devices: devices.map((row) => ({ device: row.value ?? "other", count: row.count })),
      browsers: browsers.map((row) => ({
        browser: row.value ?? "Other",
        count: row.count,
      })),
      referrers: aggregateReferrers(referrers, TOP_N),
    };
  }
}
