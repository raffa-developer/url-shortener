import type { Database } from "../../db";

export const VERIFICATION_TYPE_EMAIL = "email_verification";
export const VERIFICATION_TYPE_PASSWORD_RESET = "password_reset";

export type VerificationType =
  | typeof VERIFICATION_TYPE_EMAIL
  | typeof VERIFICATION_TYPE_PASSWORD_RESET;

export interface VerificationTokenRecord {
  id: string;
  userId: string;
  type: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IssueTokenInput {
  userId: string;
  type: VerificationType;
  tokenHash: string;
  expiresAt: Date;
}

export class VerificationTokenRepository {
  constructor(private readonly db: Database) {}

  /**
   * Issues a token after invalidating any unused tokens of the same type, so
   * only the most recent link (verification or reset) can be used.
   */
  async issue(input: IssueTokenInput): Promise<VerificationTokenRecord> {
    await this.db.verificationToken.deleteMany({
      where: { userId: input.userId, type: input.type, usedAt: null },
    });
    return this.db.verificationToken.create({ data: input });
  }

  findByTokenHash(tokenHash: string): Promise<VerificationTokenRecord | null> {
    return this.db.verificationToken.findUnique({ where: { tokenHash } });
  }

  async markUsed(id: string): Promise<void> {
    await this.db.verificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
