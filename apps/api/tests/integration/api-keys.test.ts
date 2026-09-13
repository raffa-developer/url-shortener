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

describeWithDb("API keys (integration)", () => {
  let ctx: TestContext;
  let owner: AuthSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx);
    owner = await registerUser(ctx.app, "keys-owner@example.com");
  });

  afterAll(async () => {
    if (ctx) {
      await resetDatabase(ctx);
      await ctx.app.close();
      await ctx.db.$disconnect();
    }
  });

  async function createKey(name: string): Promise<{ id: string; key: string }> {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/keys",
      headers: bearer(owner.accessToken),
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    return { id: body.apiKey.id, key: body.key };
  }

  it("creates a key and returns the secret exactly once", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/keys",
      headers: bearer(owner.accessToken),
      payload: { name: "CI deploy" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.key.startsWith("sk_")).toBe(true);
    expect(body.apiKey.name).toBe("CI deploy");
    expect(body.apiKey.prefix).toBe(body.key.slice(0, 11));
    expect(body.apiKey.revokedAt).toBeNull();

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/keys",
      headers: bearer(owner.accessToken),
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json().data.find(
      (key: { id: string }) => key.id === body.apiKey.id,
    );
    expect(listed.key).toBeUndefined();
    expect(listed.prefix).toBe(body.key.slice(0, 11));
  });

  it("authenticates with X-API-Key and records last use", async () => {
    const { id, key } = await createKey("analytics job");

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/links",
      headers: { "x-api-key": key },
    });
    expect(list.statusCode).toBe(200);

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/links",
      headers: { "x-api-key": key },
      payload: { destinationUrl: "https://api-key.example" },
    });
    expect(created.statusCode).toBe(201);

    const keys = await ctx.app.inject({
      method: "GET",
      url: "/api/keys",
      headers: bearer(owner.accessToken),
    });
    const used = keys.json().data.find((candidate: { id: string }) => candidate.id === id);
    expect(used.lastUsedAt).not.toBeNull();
  });

  it("does not let API keys manage API keys", async () => {
    const { key } = await createKey("low privilege");

    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/keys",
      headers: { "x-api-key": key },
      payload: { name: "privilege escalation" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("rejects revoked keys", async () => {
    const { id, key } = await createKey("to be revoked");

    const revoke = await ctx.app.inject({
      method: "DELETE",
      url: `/api/keys/${id}`,
      headers: bearer(owner.accessToken),
    });
    expect(revoke.statusCode).toBe(204);

    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/links",
      headers: { "x-api-key": key },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects invalid keys", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/links",
      headers: { "x-api-key": "sk_not-a-real-key" },
    });
    expect(response.statusCode).toBe(401);
  });
});
