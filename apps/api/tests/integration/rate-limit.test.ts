import { describe, expect, it } from "vitest";
import { createTestContext, hasDatabase, type TestContext } from "./helpers";

const describeWithDb = hasDatabase() ? describe : describe.skip;

async function closeContext(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.db.$disconnect();
}

describeWithDb("rate limiting (integration)", () => {
  it("returns 429 with the error envelope once the global limit is exceeded", async () => {
    const ctx = await createTestContext({
      RATE_LIMIT_MAX: "3",
      RATE_LIMIT_NAMESPACE: `rl-global-${Date.now()}:`,
    });

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await ctx.app.inject({ method: "GET", url: "/api/links" });
        expect(response.statusCode).toBe(401);
      }

      const limited = await ctx.app.inject({ method: "GET", url: "/api/links" });
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe("RATE_LIMITED");
      expect(limited.headers["retry-after"]).toBeDefined();
    } finally {
      await closeContext(ctx);
    }
  });

  it("applies a stricter limit to auth endpoints", async () => {
    const ctx = await createTestContext({
      RATE_LIMIT_MAX: "100000",
      AUTH_RATE_LIMIT_MAX: "2",
      RATE_LIMIT_NAMESPACE: `rl-auth-${Date.now()}:`,
    });

    const attemptLogin = () =>
      ctx.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });

    try {
      expect((await attemptLogin()).statusCode).toBe(401);
      expect((await attemptLogin()).statusCode).toBe(401);

      const limited = await attemptLogin();
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.message).toContain("Too many requests");
    } finally {
      await closeContext(ctx);
    }
  });

  it("never rate limits health checks", async () => {
    const ctx = await createTestContext({
      RATE_LIMIT_MAX: "1",
      RATE_LIMIT_NAMESPACE: `rl-health-${Date.now()}:`,
    });

    try {
      await ctx.app.inject({ method: "GET", url: "/api/links" });
      const blocked = await ctx.app.inject({ method: "GET", url: "/api/links" });
      expect(blocked.statusCode).toBe(429);

      const health = await ctx.app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
    } finally {
      await closeContext(ctx);
    }
  });
});
