import { ConflictError, UnauthorizedError, ValidationError } from "@url-shortener/shared";
import type { AppConfig } from "../../config";
import { sha256Hex } from "../../lib/hash";
import { generateOpaqueToken } from "../../lib/token";
import type { Mailer } from "../../mail/mailer";
import type { UserRecord, UserRepository } from "../users/user.repository";
import { hashPassword, verifyPassword } from "./password";
import type { RefreshTokenRepository } from "./refresh-token.repository";
import type { LoginBody, RegisterBody, UserDTO } from "./auth.schemas";
import { hashToken, type TokenService } from "./token.service";
import {
  VERIFICATION_TYPE_EMAIL,
  VERIFICATION_TYPE_PASSWORD_RESET,
  type VerificationTokenRecord,
  type VerificationTokenRepository,
  type VerificationType,
} from "./verification-token.repository";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: UserDTO;
}

export interface AuthServiceOptions {
  onError?: (error: unknown, context: string) => void;
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * A pre-computed hash verified when the email does not exist, so login
 * timing does not reveal whether an account exists.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-equalization-dummy-password");
  return dummyHashPromise;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUserDTO(user: UserRecord): UserDTO {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly verificationTokens: VerificationTokenRepository,
    private readonly tokens: TokenService,
    private readonly mailer: Mailer,
    private readonly config: AppConfig,
    private readonly options: AuthServiceOptions = {},
  ) {}

  async register(input: RegisterBody): Promise<AuthSession> {
    const email = normalizeEmail(input.email);

    const existing = await this.users.findByEmailWithPassword(email);
    if (existing) {
      throw new ConflictError("An account with that email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({ email, passwordHash });
    const tokens = await this.issueTokens(user.id);

    await this.sendVerificationEmail(user);

    return { user: toUserDTO(user), ...tokens };
  }

  async login(input: LoginBody): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmailWithPassword(email);

    if (!user) {
      await verifyPassword(await getDummyHash(), input.password);
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordValid = await verifyPassword(user.passwordHash, input.password);
    if (!passwordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const tokens = await this.issueTokens(user.id);
    return { user: toUserDTO(user), ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.refreshTokens.findByTokenHash(tokenHash);

    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const next = this.tokens.generateRefreshToken();
    await this.refreshTokens.rotate(record.id, {
      userId: record.userId,
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    });

    const accessToken = await this.tokens.signAccessToken(record.userId);
    return {
      accessToken,
      refreshToken: next.token,
      tokenType: "Bearer",
      expiresIn: this.config.accessTokenTtlSeconds,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revokeByTokenHash(hashToken(refreshToken));
  }

  async getUser(userId: string): Promise<UserDTO> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError("Account no longer exists");
    }
    return toUserDTO(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.findValidToken(token, VERIFICATION_TYPE_EMAIL);
    await this.users.markEmailVerified(record.userId, new Date());
    await this.verificationTokens.markUsed(record.id);
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError("Account no longer exists");
    }
    if (user.emailVerifiedAt) {
      return;
    }
    await this.sendVerificationEmail(user);
  }

  /** Always resolves, whether or not the email belongs to an account. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmailWithPassword(normalizeEmail(email));
    if (!user) {
      return;
    }

    const { token, tokenHash } = generateOpaqueToken();
    await this.verificationTokens.issue({
      userId: user.id,
      type: VERIFICATION_TYPE_PASSWORD_RESET,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    try {
      await this.mailer.send({
        to: user.email,
        subject: "Reset your Shortly password",
        text: [
          "We received a request to reset your password.",
          "",
          `Reset it here: ${this.config.webBaseUrl}/reset-password?token=${token}`,
          "",
          "This link expires in 1 hour. If you did not request it, you can ignore this email.",
        ].join("\n"),
      });
    } catch (error) {
      this.options.onError?.(error, "password-reset-email");
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.findValidToken(token, VERIFICATION_TYPE_PASSWORD_RESET);

    const passwordHash = await hashPassword(password);
    await this.users.updatePassword(record.userId, passwordHash);
    // A reset invalidates every existing session for the account.
    await this.refreshTokens.revokeAllForUser(record.userId);
    await this.verificationTokens.markUsed(record.id);
  }

  private async findValidToken(
    token: string,
    type: VerificationType,
  ): Promise<VerificationTokenRecord> {
    const record = await this.verificationTokens.findByTokenHash(sha256Hex(token));

    if (
      !record ||
      record.type !== type ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new ValidationError("This link is invalid or has expired");
    }

    return record;
  }

  private async sendVerificationEmail(user: UserRecord): Promise<void> {
    const { token, tokenHash } = generateOpaqueToken();
    await this.verificationTokens.issue({
      userId: user.id,
      type: VERIFICATION_TYPE_EMAIL,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    });

    try {
      await this.mailer.send({
        to: user.email,
        subject: "Verify your email for Shortly",
        text: [
          "Confirm your email address:",
          "",
          `${this.config.webBaseUrl}/verify-email?token=${token}`,
          "",
          "This link expires in 24 hours.",
        ].join("\n"),
      });
    } catch (error) {
      this.options.onError?.(error, "verification-email");
    }
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const accessToken = await this.tokens.signAccessToken(userId);
    const refresh = this.tokens.generateRefreshToken();

    await this.refreshTokens.create({
      userId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: "Bearer",
      expiresIn: this.config.accessTokenTtlSeconds,
    };
  }
}
