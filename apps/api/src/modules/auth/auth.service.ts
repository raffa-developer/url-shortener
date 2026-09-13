import { ConflictError, UnauthorizedError } from "@url-shortener/shared";
import type { AppConfig } from "../../config";
import type { UserRecord, UserRepository } from "../users/user.repository";
import { hashPassword, verifyPassword } from "./password";
import type { RefreshTokenRepository } from "./refresh-token.repository";
import type { LoginBody, RegisterBody, UserDTO } from "./auth.schemas";
import { hashToken, type TokenService } from "./token.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: UserDTO;
}

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
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
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
