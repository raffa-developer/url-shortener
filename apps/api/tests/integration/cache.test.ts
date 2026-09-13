import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describeWithDb("redirect cache (integration)", () => {
  let ctx: TestContext;
  let owner: AuthSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx);
    owner = await registerUser(ctx.app, "cache-owner@example.com");
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
      payload: { destinationUrl: "https://cached-target.example", customAlias: alias },
    });
    expect(response.statusCode).toBe(201);
    return response.json().shortCode;
  }

  it("reports MISS then HIT and keeps recording every click", async () => {
    const shortCode = await createLink("cache-hit");

    const first = await ctx.app.inject({ method: "GET", url: `/${shortCode}` });
    expect(first.statusCode).toBe(302);
    expect(first.headers["x-cache"]).toBe("MISS");
    expect(first.headers.location).toBe("https://cached-target.example/");

    const second = await ctx.app.inject({ method: "GET", url: `/${shortCode}` });
    expect(second.statusCode).toBe(302);
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.headers.location).toBe(first.headers.location);

    await drainClickEvents(ctx);

    const analytics = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(owner.accessToken),
    });
    expect(analytics.json().totalClicks).toBe(2);
  });

  it("caps the cached TTL at the link expiry and returns 410 after it passes", async () => {
    const expiresAt = new Date(Date.now() + 1500).toISOString();
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: {
        destinationUrl: "https://short-lived.example",
        customAlias: "cache-expiring",
        expiresAt,
      },
    });
    expect(created.statusCode).toBe(201);
    const shortCode = created.json().shortCode;

    const first = await ctx.app.inject({ method: "GET", url: `/${shortCode}` });
    expect(first.statusCode).toBe(302);

    // The cache entry must not outlive the link itself; once the link expires,
    // either Redis has evicted the key or the expiry check rejects the hit.
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const expired = await ctx.app.inject({ method: "GET", url: `/${shortCode}` });
    expect(expired.statusCode).toBe(410);
  });

  it("handles concurrent redirects through the cache", async () => {
    const shortCode = await createLink("cache-concurrent");

    // Warm the cache, then fire 25 concurrent redirects.
    await ctx.app.inject({ method: "GET", url: `/${shortCode}` });
    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        ctx.app.inject({ method: "GET", url: `/${shortCode}` }),
      ),
    );

    expect(responses.every((response) => response.statusCode === 302)).toBe(true);
    expect(
      responses.every((response) => response.headers["x-cache"] === "HIT"),
    ).toBe(true);

    await drainClickEvents(ctx);

    const analytics = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}/analytics`,
      headers: bearer(owner.accessToken),
    });
    expect(analytics.json().totalClicks).toBe(26);
  });

  it("does not cache unknown short codes", async () => {
    const first = await ctx.app.inject({ method: "GET", url: "/never-existed" });
    expect(first.statusCode).toBe(404);
    expect(first.headers["x-cache"]).toBeUndefined();

    const second = await ctx.app.inject({ method: "GET", url: "/never-existed" });
    expect(second.statusCode).toBe(404);
  });
});
