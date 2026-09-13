import { describe, expect, it } from "vitest";
import { ConflictError, UnauthorizedError, ValidationError } from "@url-shortener/shared";
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
  IssueTokenInput,
  VerificationTokenRecord,
  VerificationTokenRepository,
} from "../../src/modules/auth/verification-token.repository";
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
    return user
      ? {
          id: user.id,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
        }
      : null;
  }

  async findByEmailWithPassword(email: string): Promise<UserWithPasswordRecord | null> {
    return this.users.find((candidate) => candidate.email === email) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    this.sequence += 1;
    const record: UserWithPasswordRecord = {
      id: `user-${this.sequence}`,
      email: input.email,
      emailVerifiedAt: null,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    };
    this.users.push(record);
    return {
      id: record.id,
      email: record.email,
      emailVerifiedAt: record.emailVerifiedAt,
      createdAt: record.createdAt,
    };
  }

  async markEmailVerified(id: string, at: Date): Promise<void> {
    const user = this.users.find((candidate) => candidate.id === id);
    if (user) {
      user.emailVerifiedAt = at;
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    const user = this.users.find((candidate) => candidate.id === id);
    if (user) {
      user.passwordHash = passwordHash;
    }
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

  async revokeAllForUser(userId: string): Promise<void> {
    for (const record of this.records) {
      if (record.userId === userId && !record.revokedAt) {
        record.revokedAt = new Date();
      }
    }
  }
}

class FakeVerificationTokenRepository {
  records: VerificationTokenRecord[] = [];
  private sequence = 0;

  async issue(input: IssueTokenInput): Promise<VerificationTokenRecord> {
    this.records = this.records.filter(
      (record) => !(record.userId === input.userId && record.type === input.type && !record.usedAt),
    );
    this.sequence += 1;
    const record: VerificationTokenRecord = {
      id: `vt-${this.sequence}`,
      userId: input.userId,
      type: input.type,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
    this.records.push(record);
    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<VerificationTokenRecord | null> {
    return this.records.find((record) => record.tokenHash === tokenHash) ?? null;
  }

  async markUsed(id: string): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record) {
      record.usedAt = new Date();
    }
  }
}

class FakeMailer {
  messages: { to: string; subject: string; text: string }[] = [];

  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.messages.push(message);
  }

  tokenFromLastMessage(): string {
    const text = this.messages.at(-1)?.text ?? "";
    const match = text.match(/token=([A-Za-z0-9_-]+)/);
    if (!match?.[1]) {
      throw new Error("No token found in the last email");
    }
    return match[1];
  }
}

function createService(): {
  service: AuthService;
  refreshTokens: FakeRefreshTokenRepository;
  verificationTokens: FakeVerificationTokenRepository;
  users: FakeUserRepository;
  mailer: FakeMailer;
} {
  const users = new FakeUserRepository();
  const refreshTokens = new FakeRefreshTokenRepository();
  const verificationTokens = new FakeVerificationTokenRepository();
  const mailer = new FakeMailer();
  const tokens = new RealTokenService(config) as unknown as TokenService;
  const service = new AuthService(
    users as unknown as UserRepository,
    refreshTokens as unknown as RefreshTokenRepository,
    verificationTokens as unknown as VerificationTokenRepository,
    tokens,
    mailer,
    config,
  );
  return { service, refreshTokens, verificationTokens, users, mailer };
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

describe("AuthService email verification", () => {
  it("sends a verification email on register", async () => {
    const { service, mailer } = createService();

    await service.register(CREDENTIALS);

    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0]?.subject).toContain("Verify");
    expect(mailer.messages[0]?.text).toContain("/verify-email?token=");
  });

  it("verifies the email with a valid token", async () => {
    const { service, mailer, users } = createService();
    const session = await service.register(CREDENTIALS);

    await service.verifyEmail(mailer.tokenFromLastMessage());

    expect(users.users[0]?.emailVerifiedAt).toBeInstanceOf(Date);
    const user = await service.getUser(session.user.id);
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("rejects unknown or reused tokens", async () => {
    const { service, mailer } = createService();
    await service.register(CREDENTIALS);
    const token = mailer.tokenFromLastMessage();

    await service.verifyEmail(token);

    await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.verifyEmail("unknown-token-that-is-long-enough"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not send a new email when already verified", async () => {
    const { service, mailer } = createService();
    const session = await service.register(CREDENTIALS);
    await service.verifyEmail(mailer.tokenFromLastMessage());
    const sent = mailer.messages.length;

    await service.resendVerificationEmail(session.user.id);

    expect(mailer.messages).toHaveLength(sent);
  });
});

describe("AuthService password reset", () => {
  it("does nothing (and leaks nothing) for unknown emails", async () => {
    const { service, mailer, verificationTokens } = createService();

    await expect(service.forgotPassword("nobody@example.com")).resolves.toBeUndefined();

    expect(mailer.messages).toHaveLength(0);
    expect(verificationTokens.records).toHaveLength(0);
  });

  it("resets the password, invalidates sessions and consumes the token", async () => {
    const { service, mailer } = createService();
    const session = await service.register(CREDENTIALS);

    await service.forgotPassword("user@example.com");
    const token = mailer.tokenFromLastMessage();

    await service.resetPassword(token, "brand-new-password");

    await expect(
      service.login({ email: "user@example.com", password: CREDENTIALS.password }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      service.login({ email: "user@example.com", password: "brand-new-password" }),
    ).resolves.toBeDefined();
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(service.resetPassword(token, "another-password")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("invalidates the previous link when a new reset is requested", async () => {
    const { service, mailer } = createService();
    await service.register(CREDENTIALS);

    await service.forgotPassword("user@example.com");
    const first = mailer.tokenFromLastMessage();
    await service.forgotPassword("user@example.com");
    const second = mailer.tokenFromLastMessage();

    expect(second).not.toBe(first);
    await expect(service.resetPassword(first, "new-password-123")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.resetPassword(second, "new-password-123")).resolves.toBeUndefined();
  });
});
