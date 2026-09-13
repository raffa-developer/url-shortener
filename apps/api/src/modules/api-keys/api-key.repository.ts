import type { Database } from "../../db";

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
}

export class ApiKeyRepository {
  constructor(private readonly db: Database) {}

  create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    return this.db.apiKey.create({ data: input });
  }

  findByKeyHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.db.apiKey.findUnique({ where: { keyHash } });
  }

  listByUser(userId: string): Promise<ApiKeyRecord[]> {
    return this.db.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  findByIdForUser(id: string, userId: string): Promise<ApiKeyRecord | null> {
    return this.db.apiKey.findFirst({ where: { id, userId } });
  }

  async revoke(id: string): Promise<void> {
    await this.db.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.db.apiKey.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}
