import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/modules/analytics/analytics.service";
import { ClickRepository } from "../../src/modules/analytics/click.repository";
import { LinkRepository } from "../../src/modules/links/link.repository";
import { LinkService } from "../../src/modules/links/link.service";
import { CLICK_EVENT_GROUP } from "../../src/queue/click-events";
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

const describeWithEvents =
  hasDatabase() && process.env.REDIS_URL ? describe : describe.skip;

describeWithEvents("click events (integration)", () => {
  let ctx: TestContext;
  let owner: AuthSession;
  let redis: Redis;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx);
    owner = await registerUser(ctx.app, "events-owner@example.com");

    redis = new Redis(ctx.config.redisUrl!, { maxRetriesPerRequest: 1 });
    await redis.ping();
  });

  afterAll(async () => {
    if (ctx) {
      await resetDatabase(ctx);
      redis.disconnect();
      await ctx.app.close();
      await ctx.db.$disconnect();
    }
  });

  async function createLink(alias: string): Promise<string> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://events.example", customAlias: alias },
    });
    expect(response.statusCode).toBe(201);
    return response.json().shortCode;
  }

  it("publishes a redirect as a stream event and processes it once", async () => {
    const stream = ctx.config.clickEventStreamKey;
    const shortCode = await createLink("events-publish");
    const before = await redis.xlen(stream);

    await ctx.app.inject({ method: "GET", url: `/${shortCode}` });

    expect(await redis.xlen(stream)).toBe(before + 1);

    const processed = await drainClickEvents(ctx);
    expect(processed).toBe(1);

    const analytics = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(owner.accessToken),
    });
    expect(analytics.json().totalClicks).toBe(1);

    // Nothing left unacknowledged.
    const pending = (await redis.xpending(
      stream,
      CLICK_EVENT_GROUP,
    )) as [number, string | null, string | null, unknown[]];
    expect(Number(pending[0])).toBe(0);
  });

  it("moves an unparseable event to the dead-letter stream", async () => {
    const stream = ctx.config.clickEventStreamKey;
    await redis.xadd(
      stream,
      "*",
      "linkId",
      "link-without-timestamp",
    );

    await drainClickEvents(ctx);

    expect(await redis.xlen(`${stream}:dead`)).toBe(1);
  });

  it("treats a redelivered event id as idempotent", async () => {
    const shortCode = await createLink("events-idempotent");
    const link = await ctx.db.link.findUniqueOrThrow({ where: { shortCode } });

    const analytics = new AnalyticsService(
      new ClickRepository(ctx.db),
      new LinkService(new LinkRepository(ctx.db), ctx.config),
    );

    const eventId = `1700000000000-${Math.floor(Math.random() * 1e6)}`;
    await analytics.recordClick({ linkId: link.id, eventId });
    await analytics.recordClick({ linkId: link.id, eventId });

    expect(await ctx.db.click.count({ where: { linkId: link.id } })).toBe(1);
  });
});
