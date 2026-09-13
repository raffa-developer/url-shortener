import { describe, expect, it } from "vitest";
import { NotFoundError, UnauthorizedError } from "@url-shortener/shared";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  CreateApiKeyInput,
} from "../../src/modules/api-keys/api-key.repository";
import { ApiKeyService } from "../../src/modules/api-keys/api-key.service";

class FakeApiKeyRepository {
  records: ApiKeyRecord[] = [];
  private sequence = 0;

  async create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    this.sequence += 1;
    const record: ApiKeyRecord = {
      id: `key-${this.sequence}`,
      userId: input.userId,
      name: input.name,
      prefix: input.prefix,
      keyHash: input.keyHash,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    };
    this.records.push(record);
    return record;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.records.find((record) => record.keyHash === keyHash) ?? null;
  }

  async listByUser(userId: string): Promise<ApiKeyRecord[]> {
    return this.records.filter((record) => record.userId === userId);
  }

  async findByIdForUser(id: string, userId: string): Promise<ApiKeyRecord | null> {
    return (
      this.records.find((record) => record.id === id && record.userId === userId) ?? null
    );
  }

  async revoke(id: string): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record) {
      record.revokedAt = new Date();
    }
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record) {
      record.lastUsedAt = at;
    }
  }
}

function createService() {
  const repository = new FakeApiKeyRepository();
  return { service: new ApiKeyService(repository as unknown as ApiKeyRepository), repository };
}

describe("ApiKeyService.create", () => {
  it("returns the plaintext key once and stores only its hash", async () => {
    const { service } = createService();

    const { apiKey, plaintext } = await service.create("user-1", "CI deploy");

    expect(plaintext.startsWith("sk_")).toBe(true);
    expect(apiKey.prefix).toBe(plaintext.slice(0, 11));
    expect(apiKey.keyHash).not.toBe(plaintext);
    expect(apiKey.keyHash).toHaveLength(64);
  });

  it("generates unique keys", async () => {
    const { service } = createService();
    const first = await service.create("user-1", "one");
    const second = await service.create("user-1", "two");
    expect(first.plaintext).not.toBe(second.plaintext);
  });
});

describe("ApiKeyService.authenticate", () => {
  it("returns the owning user for a valid key", async () => {
    const { service } = createService();
    const { plaintext } = await service.create("user-1", "test");

    await expect(service.authenticate(plaintext)).resolves.toEqual({
      userId: "user-1",
      apiKeyId: expect.any(String),
    });
  });

  it("records lastUsedAt", async () => {
    const { service, repository } = createService();
    const { plaintext, apiKey } = await service.create("user-1", "test");

    await service.authenticate(plaintext);

    expect(repository.records.find((record) => record.id === apiKey.id)?.lastUsedAt).toBeInstanceOf(
      Date,
    );
  });

  it("rejects unknown keys", async () => {
    const { service } = createService();
    await expect(service.authenticate("sk_not-a-real-key")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects revoked keys", async () => {
    const { service } = createService();
    const { plaintext, apiKey } = await service.create("user-1", "test");
    await service.revoke("user-1", apiKey.id);

    await expect(service.authenticate(plaintext)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe("ApiKeyService.revoke", () => {
  it("cannot revoke another user's key", async () => {
    const { service } = createService();
    const { apiKey } = await service.create("user-1", "test");

    await expect(service.revoke("user-2", apiKey.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("is idempotent for the owner", async () => {
    const { service } = createService();
    const { apiKey } = await service.create("user-1", "test");

    await service.revoke("user-1", apiKey.id);
    await expect(service.revoke("user-1", apiKey.id)).resolves.toBeUndefined();
  });
});
