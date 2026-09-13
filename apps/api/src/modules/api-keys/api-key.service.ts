import { randomBytes } from "node:crypto";
import { NotFoundError, UnauthorizedError } from "@url-shortener/shared";
import { sha256Hex } from "../../lib/hash";
import type { ApiKeyRecord, ApiKeyRepository } from "./api-key.repository";

const KEY_PREFIX = "sk_";
const PREFIX_DISPLAY_LENGTH = 11;

/** Avoid a database write on every single API request. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export interface AuthenticatedApiKey {
  userId: string;
  apiKeyId: string;
}

export interface CreatedApiKey {
  apiKey: ApiKeyRecord;
  /** Returned exactly once; only the hash is stored. */
  plaintext: string;
}

export class ApiKeyService {
  constructor(private readonly repository: ApiKeyRepository) {}

  async create(userId: string, name: string): Promise<CreatedApiKey> {
    const plaintext = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;

    const apiKey = await this.repository.create({
      userId,
      name,
      prefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH),
      keyHash: sha256Hex(plaintext),
    });

    return { apiKey, plaintext };
  }

  list(userId: string): Promise<ApiKeyRecord[]> {
    return this.repository.listByUser(userId);
  }

  async revoke(userId: string, id: string): Promise<void> {
    const apiKey = await this.repository.findByIdForUser(id, userId);
    if (!apiKey) {
      throw new NotFoundError("API key not found");
    }
    if (!apiKey.revokedAt) {
      await this.repository.revoke(id);
    }
  }

  async authenticate(plaintext: string): Promise<AuthenticatedApiKey> {
    const apiKey = await this.repository.findByKeyHash(sha256Hex(plaintext));
    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedError("Invalid API key");
    }

    const now = Date.now();
    if (
      !apiKey.lastUsedAt ||
      now - apiKey.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
    ) {
      await this.repository.touchLastUsed(apiKey.id, new Date(now));
    }

    return { userId: apiKey.userId, apiKeyId: apiKey.id };
  }
}
