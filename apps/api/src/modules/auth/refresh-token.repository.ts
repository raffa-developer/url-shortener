import type { Database } from "../../db";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
  createdAt: Date;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export class RefreshTokenRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    return this.db.refreshToken.create({ data: input });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Atomically revokes the used token and stores its replacement, so a
   * refresh token can only ever be exchanged once.
   */
  async rotate(
    oldTokenId: string,
    input: CreateRefreshTokenInput,
  ): Promise<RefreshTokenRecord> {
    const [revoked, created] = await this.db.$transaction([
      this.db.refreshToken.update({
        where: { id: oldTokenId },
        data: { revokedAt: new Date(), replacedByTokenHash: input.tokenHash },
      }),
      this.db.refreshToken.create({ data: input }),
    ]);

    void revoked;
    return created;
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
