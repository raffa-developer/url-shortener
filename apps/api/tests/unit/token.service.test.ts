import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config";
import { TokenService, hashToken } from "../../src/modules/auth/token.service";

function createConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://localhost:5432/test",
    JWT_ACCESS_SECRET: "test-secret-that-is-at-least-32-characters",
    ...overrides,
  });
}

describe("TokenService access tokens", () => {
  it("signs and verifies an access token", async () => {
    const service = new TokenService(createConfig());
    const token = await service.signAccessToken("user-123");
    await expect(service.verifyAccessToken(token)).resolves.toBe("user-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const signer = new TokenService(createConfig());
    const verifier = new TokenService(
      createConfig({ JWT_ACCESS_SECRET: "a-completely-different-secret-value-1234" }),
    );

    const token = await signer.signAccessToken("user-123");
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const config = createConfig();
    const service = new TokenService(config);
    const key = new TextEncoder().encode(config.jwtAccessSecret);

    const expired = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuer("url-shortener")
      .setAudience("url-shortener-api")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);

    await expect(service.verifyAccessToken(expired)).rejects.toThrow();
  });

  it("rejects a token with the wrong audience", async () => {
    const config = createConfig();
    const service = new TokenService(config);
    const key = new TextEncoder().encode(config.jwtAccessSecret);

    const token = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuer("url-shortener")
      .setAudience("some-other-api")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });
});

describe("TokenService refresh tokens", () => {
  it("generates an opaque token whose hash matches", () => {
    const service = new TokenService(createConfig({ REFRESH_TOKEN_TTL_DAYS: "30" }));
    const generated = service.generateRefreshToken();

    expect(generated.token.length).toBeGreaterThanOrEqual(40);
    expect(generated.tokenHash).toBe(hashToken(generated.token));

    const daysUntilExpiry = (generated.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(daysUntilExpiry).toBeGreaterThan(29);
  });

  it("never repeats a refresh token", () => {
    const service = new TokenService(createConfig());
    const first = service.generateRefreshToken();
    const second = service.generateRefreshToken();
    expect(first.token).not.toBe(second.token);
  });
});
