import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestContext,
  hasDatabase,
  registerUser,
  resetDatabase,
  type AuthSession,
  type TestContext,
} from "./helpers";

const describeWithDb = hasDatabase() ? describe : describe.skip;

describeWithDb("links API (integration)", () => {
  let ctx: TestContext;
  let owner: AuthSession;
  let other: AuthSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx);
    owner = await registerUser(ctx.app, "owner@example.com");
    other = await registerUser(ctx.app, "other@example.com");
  });

  afterAll(async () => {
    if (ctx) {
      await resetDatabase(ctx);
      await ctx.app.close();
      await ctx.db.$disconnect();
    }
  });

  it("requires authentication to manage links", async () => {
    const create = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      payload: { destinationUrl: "https://example.com" },
    });
    expect(create.statusCode).toBe(401);

    const list = await ctx.app.inject({ method: "GET", url: "/api/links" });
    expect(list.statusCode).toBe(401);
  });

  it("creates a short link for the authenticated user", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "example.com/path?campaign=summer" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.destinationUrl).toBe("https://example.com/path?campaign=summer");
    expect(body.shortCode).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(body.shortUrl).toBe(`http://localhost:3000/${body.shortCode}`);
    expect(body.clickCount).toBe(0);
  });

  it("lists only the caller's links", async () => {
    const ownerList = await ctx.app.inject({
      method: "GET",
      url: "/api/links",
      headers: bearer(owner.accessToken),
    });
    expect(ownerList.statusCode).toBe(200);
    expect(ownerList.json().data.length).toBeGreaterThanOrEqual(1);

    const otherList = await ctx.app.inject({
      method: "GET",
      url: "/api/links",
      headers: bearer(other.accessToken),
    });
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().data).toHaveLength(0);
  });

  it("returns 409 for a duplicate custom alias across accounts", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://a.example", customAlias: "taken-alias" },
    });

    const duplicate = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(other.accessToken),
      payload: { destinationUrl: "https://b.example", customAlias: "taken-alias" },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("CONFLICT");
  });

  it("forbids reading another user's link metadata", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://private.example", customAlias: "owners-only" },
    });
    const { shortCode } = created.json();

    const forbidden = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}`,
      headers: bearer(other.accessToken),
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await ctx.app.inject({
      method: "GET",
      url: `/api/links/${shortCode}`,
      headers: bearer(owner.accessToken),
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("redirects publicly without authentication", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://target.example", customAlias: "go-here" },
    });

    const redirect = await ctx.app.inject({ method: "GET", url: "/go-here" });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe("https://target.example/");
  });

  it("returns 410 for an expired link", async () => {
    await ctx.db.link.create({
      data: {
        userId: owner.user.id,
        shortCode: "expired1",
        destinationUrl: "https://expired.example/",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const response = await ctx.app.inject({ method: "GET", url: "/expired1" });
    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe("GONE");
  });

  it("returns 404 for an unknown short code", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });

  it("reports readiness", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", database: "up" });
  });
});
