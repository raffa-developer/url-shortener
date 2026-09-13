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

  it("updates a link and invalidates the cached redirect", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://before.example", customAlias: "crud-edit" },
    });

    const first = await ctx.app.inject({ method: "GET", url: "/crud-edit" });
    expect(first.headers.location).toBe("https://before.example/");
    expect(first.headers["x-cache"]).toBe("MISS");

    const cached = await ctx.app.inject({ method: "GET", url: "/crud-edit" });
    expect(cached.headers["x-cache"]).toBe("HIT");

    const updated = await ctx.app.inject({
      method: "PATCH",
      url: "/api/links/crud-edit",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "after.example/promo" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().destinationUrl).toBe("https://after.example/promo");

    // The stale cache entry must be gone: MISS and the new destination.
    const after = await ctx.app.inject({ method: "GET", url: "/crud-edit" });
    expect(after.headers["x-cache"]).toBe("MISS");
    expect(after.headers.location).toBe("https://after.example/promo");
  });

  it("validates updates and enforces ownership", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://owned.example", customAlias: "crud-owned" },
    });

    const forbidden = await ctx.app.inject({
      method: "PATCH",
      url: "/api/links/crud-owned",
      headers: bearer(other.accessToken),
      payload: { destinationUrl: "https://hijack.example" },
    });
    expect(forbidden.statusCode).toBe(403);

    const invalid = await ctx.app.inject({
      method: "PATCH",
      url: "/api/links/crud-owned",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "ftp://example.com" },
    });
    expect(invalid.statusCode).toBe(400);

    const empty = await ctx.app.inject({
      method: "PATCH",
      url: "/api/links/crud-owned",
      headers: bearer(owner.accessToken),
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    const unknown = await ctx.app.inject({
      method: "PATCH",
      url: "/api/links/does-not-exist",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://example.com" },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("deletes a link and stops redirecting it", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "https://delete.example", customAlias: "crud-delete" },
    });

    // Warm the redirect cache to prove deletion invalidates it.
    await ctx.app.inject({ method: "GET", url: "/crud-delete" });

    const deleted = await ctx.app.inject({
      method: "DELETE",
      url: "/api/links/crud-delete",
      headers: bearer(owner.accessToken),
    });
    expect(deleted.statusCode).toBe(204);

    const redirect = await ctx.app.inject({ method: "GET", url: "/crud-delete" });
    expect(redirect.statusCode).toBe(404);

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/links",
      headers: bearer(owner.accessToken),
    });
    expect(
      list
        .json()
        .data.some((link: { shortCode: string }) => link.shortCode === "crud-delete"),
    ).toBe(false);
  });

  it("never fetches private addresses for a preview", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: bearer(owner.accessToken),
      payload: { destinationUrl: "http://127.0.0.1/secret", customAlias: "crud-preview" },
    });

    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/links/crud-preview/preview",
      headers: bearer(owner.accessToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      url: "http://127.0.0.1/secret",
      title: null,
      description: null,
      image: null,
      siteName: null,
    });

    const forbidden = await ctx.app.inject({
      method: "GET",
      url: "/api/links/crud-preview/preview",
      headers: bearer(other.accessToken),
    });
    expect(forbidden.statusCode).toBe(403);
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
