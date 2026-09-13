import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bearer,
  createTestContext,
  hasDatabase,
  registerUser,
  resetDatabase,
  type TestContext,
} from "./helpers";

const describeWithDb = hasDatabase() ? describe : describe.skip;

describeWithDb("auth API (integration)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx);
  });

  afterAll(async () => {
    if (ctx) {
      await resetDatabase(ctx);
      await ctx.app.close();
      await ctx.db.$disconnect();
    }
  });

  it("registers a user and returns a token pair", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "new-user@example.com", password: "super-secret-password" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.email).toBe("new-user@example.com");
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.refreshToken).toBeTypeOf("string");
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser(ctx.app, "dupe@example.com");
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "dupe@example.com", password: "super-secret-password" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONFLICT");
  });

  it("rejects an invalid payload with 400", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "short" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in and returns the current user", async () => {
    await registerUser(ctx.app, "login-user@example.com", "super-secret-password");

    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login-user@example.com", password: "super-secret-password" },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken } = login.json();

    const me = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: bearer(accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("login-user@example.com");
  });

  it("rejects invalid credentials with a generic message", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login-user@example.com", password: "wrong-password" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toBe("Invalid email or password");
  });

  it("requires a valid bearer token for /auth/me", async () => {
    const missing = await ctx.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(missing.statusCode).toBe(401);

    const invalid = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: bearer("not.a.real.token"),
    });
    expect(invalid.statusCode).toBe(401);
  });

  it("rotates refresh tokens and rejects reuse", async () => {
    const session = await registerUser(ctx.app, "rotate@example.com");

    const first = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json();
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    const reuse = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
  });

  it("revokes the refresh token on logout", async () => {
    const session = await registerUser(ctx.app, "logout@example.com");

    const logout = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken: session.refreshToken },
    });
    expect(logout.statusCode).toBe(204);

    const refresh = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });
});
