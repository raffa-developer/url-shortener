import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOfUtcDay, toUtcDateKey } from "../../src/modules/analytics/analytics.utils";
import {
  bearer,
  createTestContext,
  drainClickEvents,
  hasDatabase,
  registerUser,
  resetDatabase,
  type AuthSession,
  type TestContext,
} from "./helpers";

const describeWithDb = hasDatabase() ? describe : describe.skip;
const DAY_MS = 24 * 60 * 60 * 1000;

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

describeWithDb("analytics API (integration)", () => {
  let ctx: TestContext;
  let owner: AuthSession;
  let other: AuthSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx);
    owner = await registerUser(ctx.app, "analytics-owner@example.com");
    other = await registerUser(ctx.app, "analytics-other@example.com");
  });

  afterAll(async () => {
    if (ctx) {
      await resetDatabase(ctx);
      await ctx.app.close();
      await ctx.db.$disconnect();
    }
  });

  async function createLink(alias: string): Promise<string> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://target.example", customAlias: alias },
    });
    expect(response.statusCode).toBe(201);
    return response.json().shortCode;
  }

  it("requires authentication and ownership", async () => {
    const shortCode = await createLink("analytics-auth");

    const unauthenticated = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
    });
    expect(unauthenticated.statusCode).toBe(401);

    const forbidden = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(other.accessToken),
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("records a click from a redirect and reports every dimension", async () => {
    const shortCode = await createLink("analytics-click");

    const redirect = await ctx.app.inject({
      method: "GET",
      url: `/${shortCode}`,
      headers: {
        "user-agent": ANDROID_CHROME,
        referer: "https://www.google.com/search?q=test",
        "cf-ipcountry": "pt",
      },
    });
    expect(redirect.statusCode).toBe(302);

    await drainClickEvents(ctx);

    const response = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(owner.accessToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.link.shortCode).toBe(shortCode);
    expect(body.totalClicks).toBe(1);
    expect(body.today).toBe(1);
    expect(body.yesterday).toBe(0);
    expect(body.countries).toEqual([{ country: "PT", count: 1 }]);
    expect(body.devices).toEqual([{ device: "mobile", count: 1 }]);
    expect(body.browsers).toEqual([{ browser: "Chrome", count: 1 }]);
    expect(body.referrers).toEqual([{ source: "google.com", count: 1 }]);
    expect(body.clicksPerDay.at(-1)).toEqual({
      date: toUtcDateKey(startOfUtcDay(new Date())),
      count: 1,
    });
  });

  it("does not record clicks for unknown or expired links", async () => {
    const shortCode = await createLink("analytics-none");

    const unknown = await ctx.app.inject({ method: "GET", url: "/missing-code" });
    expect(unknown.statusCode).toBe(404);

    const response = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(owner.accessToken),
    });
    expect(response.json().totalClicks).toBe(0);
    expect(response.json().clicksPerDay.at(-1)).toEqual({
      date: toUtcDateKey(startOfUtcDay(new Date())),
      count: 0,
    });
  });

  it("buckets clicks by UTC day and returns a dense series", async () => {
    const shortCode = await createLink("analytics-days");
    const link = await ctx.db.link.findUniqueOrThrow({ where: { shortCode } });
    const now = new Date();

    await ctx.db.click.createMany({
      data: [
        {
          linkId: link.id,
          device: "desktop",
          browser: "Chrome",
          country: "US",
          referrer: null,
          timestamp: new Date(now.getTime() - 1 * DAY_MS),
        },
        {
          linkId: link.id,
          device: "desktop",
          browser: "Chrome",
          country: "US",
          referrer: null,
          timestamp: new Date(now.getTime() - 2 * DAY_MS),
        },
        {
          linkId: link.id,
          device: "mobile",
          browser: "Safari",
          country: "PT",
          referrer: null,
          timestamp: new Date(now.getTime() - 2 * DAY_MS),
        },
      ],
    });

    const response = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics?days=5`,
      headers: bearer(owner.accessToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.range.days).toBe(5);
    expect(body.totalClicks).toBe(3);
    expect(body.today).toBe(0);
    expect(body.yesterday).toBe(1);
    expect(body.clicksPerDay).toHaveLength(5);

    const yesterdayKey = toUtcDateKey(new Date(startOfUtcDay(now).getTime() - DAY_MS));
    const twoDaysAgoKey = toUtcDateKey(new Date(startOfUtcDay(now).getTime() - 2 * DAY_MS));
    expect(body.clicksPerDay.find((day: { date: string }) => day.date === yesterdayKey).count).toBe(1);
    expect(body.clicksPerDay.find((day: { date: string }) => day.date === twoDaysAgoKey).count).toBe(2);
  });

  it("classifies bot traffic", async () => {
    const shortCode = await createLink("analytics-bot");

    await ctx.app.inject({
      method: "GET",
      url: `/${shortCode}`,
      headers: { "user-agent": "curl/8.4.0" },
    });

    await drainClickEvents(ctx);

    const response = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(owner.accessToken),
    });
    expect(response.json().devices).toEqual([{ device: "bot", count: 1 }]);
  });

  it("validates the days query parameter", async () => {
    const shortCode = await createLink("analytics-days-query");

    for (const days of ["0", "366", "abc"]) {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/api/links/${shortCode}/analytics?days=${days}`,
        headers: bearer(owner.accessToken),
      });
      expect(response.statusCode).toBe(400);
    }
  });
});
