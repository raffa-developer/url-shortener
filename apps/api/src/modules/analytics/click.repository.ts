import type { Database } from "../../db";

export interface ClickRecord {
  id: string;
  linkId: string;
  timestamp: Date;
  country: string | null;
  device: string;
  browser: string;
  referrer: string | null;
}

export interface CreateClickInput {
  linkId: string;
  country: string | null;
  device: string;
  browser: string;
  referrer: string | null;
  timestamp?: Date;
  eventId?: string | null;
  visitorHash?: string | null;
}

export interface GroupCount {
  value: string | null;
  count: number;
}

export class ClickRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateClickInput): Promise<ClickRecord> {
    return this.db.click.create({
      data: {
        linkId: input.linkId,
        country: input.country,
        device: input.device,
        browser: input.browser,
        referrer: input.referrer,
        eventId: input.eventId ?? null,
        visitorHash: input.visitorHash ?? null,
        ...(input.timestamp ? { timestamp: input.timestamp } : {}),
      },
    });
  }

  countTotal(linkId: string): Promise<number> {
    return this.db.click.count({ where: { linkId } });
  }

  countBetween(linkId: string, from: Date, to: Date): Promise<number> {
    return this.db.click.count({
      where: { linkId, timestamp: { gte: from, lt: to } },
    });
  }

  async countUniqueVisitors(linkId: string, from: Date): Promise<number> {
    const rows = await this.db.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "visitorHash")::int AS count
      FROM "Click"
      WHERE "linkId" = ${linkId}
        AND "timestamp" >= ${from}
        AND "visitorHash" IS NOT NULL
    `;
    return rows[0]?.count ?? 0;
  }

  async countByDay(linkId: string, from: Date): Promise<{ date: string; count: number }[]> {
    return this.db.$queryRaw<{ date: string; count: number }[]>`
      SELECT to_char(date_trunc('day', "timestamp"), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "Click"
      WHERE "linkId" = ${linkId} AND "timestamp" >= ${from}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  async countByCountry(linkId: string, take: number): Promise<GroupCount[]> {
    return this.db.$queryRaw<GroupCount[]>`
      SELECT "country" AS value, COUNT(*)::int AS count
      FROM "Click"
      WHERE "linkId" = ${linkId}
      GROUP BY "country"
      ORDER BY count DESC, value ASC NULLS LAST
      LIMIT ${take}
    `;
  }

  async countByDevice(linkId: string, take: number): Promise<GroupCount[]> {
    return this.db.$queryRaw<GroupCount[]>`
      SELECT "device" AS value, COUNT(*)::int AS count
      FROM "Click"
      WHERE "linkId" = ${linkId}
      GROUP BY "device"
      ORDER BY count DESC, value ASC NULLS LAST
      LIMIT ${take}
    `;
  }

  async countByBrowser(linkId: string, take: number): Promise<GroupCount[]> {
    return this.db.$queryRaw<GroupCount[]>`
      SELECT "browser" AS value, COUNT(*)::int AS count
      FROM "Click"
      WHERE "linkId" = ${linkId}
      GROUP BY "browser"
      ORDER BY count DESC, value ASC NULLS LAST
      LIMIT ${take}
    `;
  }

  /**
   * Returns raw referrers (more than the final top-N) so the service can
   * collapse e.g. `google.com` and `www.google.com` before ranking sources.
   */
  async countByReferrer(linkId: string, take: number): Promise<GroupCount[]> {
    return this.db.$queryRaw<GroupCount[]>`
      SELECT "referrer" AS value, COUNT(*)::int AS count
      FROM "Click"
      WHERE "linkId" = ${linkId}
      GROUP BY "referrer"
      ORDER BY count DESC, value ASC NULLS LAST
      LIMIT ${take}
    `;
  }
}
