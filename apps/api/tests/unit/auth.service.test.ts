import { describe, expect, it } from "vitest";
import { ConflictError, UnauthorizedError } from "@url-shortener/shared";
import { loadConfig } from "../../src/config";
import { AuthService } from "../../src/modules/auth/auth.service";
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from "../../src/modules/auth/refresh-token.repository";
import type { TokenService } from "../../src/modules/auth/token.service";
import { TokenService as RealTokenService } from "../../src/modules/auth/token.service";
import type {
  CreateUserInput,
  UserRecord,
  UserRepository,
  UserWithPasswordRecord,
} from "../../src/modules/users/user.repository";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/test",
  JWT_ACCESS_SECRET: "test-secret-that-is-at-least-32-characters",
});

class FakeUserRepository {
  users: UserWithPasswordRecord[] = [];
  private sequence = 0;

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.users.find((candidate) => candidate.id === id);
    return user ? { id: user.id, email: user.email, createdAt: user.createdAt } : null;
  }

  async findByEmailWithPassword(email: string): Promise<UserWithPasswordRecord | null> {
    return this.users.find((candidate) => candidate.email === email) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    this.sequence += 1;
    const record: UserWithPasswordRecord = {
      id: `user-${this.sequence}`,
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    };
    this.users.push(record);
    return { id: record.id, email: record.email, createdAt: record.createdAt };
  }
}

class FakeRefreshTokenRepository {
  records: RefreshTokenRecord[] = [];
  private sequence = 0;

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    this.sequence += 1;
    const record: RefreshTokenRecord = {
      id: `rt-${this.sequence}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedByTokenHash: null,
      createdAt: new Date(),
    };
    this.records.push(record);
    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.records.find((record) => record.tokenHash === tokenHash) ?? null;
  }

  async rotate(
    oldTokenId: string,
    input: CreateRefreshTokenInput,
  ): Promise<RefreshTokenRecord> {
    const old = this.records.find((record) => record.id === oldTokenId);
    if (old) {
      old.revokedAt = new Date();
      old.replacedByTokenHash = input.tokenHash;
    }
    return this.create(input);
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    for (const record of this.records) {
      if (record.tokenHash === tokenHash && !record.revokedAt) {
        record.revokedAt = new Date();
      }
    }
  }
}

function createService(): {
  service: AuthService;
  refreshTokens: FakeRefreshTokenRepository;
} {
  const users = new FakeUserRepository();
  const refreshTokens = new FakeRefreshTokenRepository();
  const tokens = new RealTokenService(config) as unknown as TokenService;
  const service = new AuthService(
    users as unknown as UserRepository,
    refreshTokens as unknown as RefreshTokenRepository,
    tokens,
    config,
  );
  return { service, refreshTokens };
}

const CREDENTIALS = { email: "User@Example.com", password: "super-secret-password" };

describe("AuthService.register", () => {
  it("creates a user and returns a session", async () => {
    const { service } = createService();
    const session = await service.register(CREDENTIALS);

    expect(session.user.email).toBe("user@example.com");
    expect(session.tokenType).toBe("Bearer");
    expect(session.accessToken).not.toHaveLength(0);
    expect(session.refreshToken).not.toHaveLength(0);
  });

  it("rejects a duplicate email (case-insensitive)", async () => {
    const { service } = createService();
    await service.register(CREDENTIALS);
    await expect(
      service.register({ ...CREDENTIALS, email: "user@example.com" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("AuthService.login", () => {
  it("returns a session for valid credentials", async () => {
    const { service } = createService();
    await service.register(CREDENTIALS);
    const session = await service.login({
      email: "user@example.com",
      password: CREDENTIALS.password,
    });
    expect(session.accessToken).not.toHaveLength(0);
  });

  it("rejects a wrong password", async () => {
    const { service } = createService();
    await service.register(CREDENTIALS);
    await expect(
      service.login({ email: "user@example.com", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects an unknown email", async () => {
    const { service } = createService();
    await expect(
      service.login({ email: "nobody@example.com", password: "whatever" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("AuthService.refresh", () => {
  it("rotates the refresh token and revokes the old one", async () => {
    const { service } = createService();
    const first = await service.register(CREDENTIALS);

    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it("rejects unknown refresh tokens", async () => {
    const { service } = createService();
    await expect(
      service.refresh("this-token-does-not-exist-anywhere"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("AuthService.logout", () => {
  it("revokes the refresh token", async () => {
    const { service } = createService();
    const session = await service.register(CREDENTIALS);

    await service.logout(session.refreshToken);
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("is idempotent for unknown tokens", async () => {
    const { service } = createService();
    await expect(service.logout("unknown-token-value-here")).resolves.toBeUndefined();
  });
});
