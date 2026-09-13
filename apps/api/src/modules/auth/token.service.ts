import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AppConfig } from "../../config";
import { sha256Hex } from "../../lib/hash";

const TOKEN_ISSUER = "url-shortener";
const TOKEN_AUDIENCE = "url-shortener-api";

export interface GeneratedRefreshToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.key = new TextEncoder().encode(config.jwtAccessSecret);
  }

  async signAccessToken(userId: string): Promise<string> {
    return new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.key, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    if (payload.typ !== "access" || typeof payload.sub !== "string") {
      throw new Error("Invalid access token payload");
    }
    return payload.sub;
  }

  /**
   * Refresh tokens are opaque random strings. Only their SHA-256 hash is
   * persisted, so a database leak does not expose usable tokens.
   */
  generateRefreshToken(): GeneratedRefreshToken {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      tokenHash: hashToken(token),
      expiresAt: new Date(
        Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
      ),
    };
  }
}
