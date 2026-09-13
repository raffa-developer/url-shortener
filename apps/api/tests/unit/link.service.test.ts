import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  ValidationError,
} from "@url-shortener/shared";
import { loadConfig } from "../../src/config";
import type {
  CreateLinkRecordInput,
  LinkRecord,
  LinkRepository,
} from "../../src/modules/links/link.repository";
import { LinkService } from "../../src/modules/links/link.service";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/test",
  APP_BASE_URL: "https://sho.rt",
  SHORT_CODE_LENGTH: "7",
  JWT_ACCESS_SECRET: "test-secret-that-is-at-least-32-characters",
});

const OWNER = "user-owner";
const OTHER = "user-other";

class FakeLinkRepository {
  records: LinkRecord[] = [];
  private sequence = 0;

  async create(input: CreateLinkRecordInput): Promise<LinkRecord> {
    if (this.records.some((record) => record.shortCode === input.shortCode)) {
      const error = new Error("Unique constraint failed") as Error & { code: string };
      error.code = "P2002";
      throw error;
    }
    this.sequence += 1;
    const record: LinkRecord = {
      id: `id-${this.sequence}`,
      userId: input.userId,
      shortCode: input.shortCode,
      destinationUrl: input.destinationUrl,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      clickCount: 0,
    };
    this.records.push(record);
    return record;
  }

  async findByShortCode(shortCode: string): Promise<LinkRecord | null> {
    return this.records.find((record) => record.shortCode === shortCode) ?? null;
  }

  async update(
    shortCode: string,
    data: { destinationUrl?: string; expiresAt?: Date | null },
  ): Promise<LinkRecord> {
    const record = this.records.find((candidate) => candidate.shortCode === shortCode);
    if (!record) {
      throw new Error("Record not found");
    }
    if (data.destinationUrl !== undefined) {
      record.destinationUrl = data.destinationUrl;
    }
    if (data.expiresAt !== undefined) {
      record.expiresAt = data.expiresAt;
    }
    return record;
  }

  async delete(shortCode: string): Promise<void> {
    this.records = this.records.filter((record) => record.shortCode !== shortCode);
  }

  async list(params: {
    userId: string;
    page: number;
    pageSize: number;
    q?: string;
    status: string;
    sort: string;
  }): Promise<{ data: LinkRecord[]; total: number }> {
    const data = this.records.filter((record) => record.userId === params.userId);
    return { data, total: data.length };
  }
}

function createService(
  repository: FakeLinkRepository,
  options: {
    generateShortCode?: () => string;
    invalidateCache?: (shortCode: string) => Promise<void>;
  } = {},
): LinkService {
  return new LinkService(repository as unknown as LinkRepository, config, options);
}

describe("LinkService.create", () => {
  it("generates a base62 code when no alias is given", async () => {
    const service = createService(new FakeLinkRepository());
    const link = await service.create({ destinationUrl: "example.com/path" }, OWNER);

    expect(link.shortCode).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(link.shortUrl).toBe(`https://sho.rt/${link.shortCode}`);
    expect(link.destinationUrl).toBe("https://example.com/path");
  });

  it("uses a custom alias when provided", async () => {
    const service = createService(new FakeLinkRepository());
    const link = await service.create(
      { destinationUrl: "https://example.com", customAlias: "summer-sale" },
      OWNER,
    );

    expect(link.shortCode).toBe("summer-sale");
  });

  it("rejects invalid destination URLs", async () => {
    const service = createService(new FakeLinkRepository());
    await expect(
      service.create({ destinationUrl: "ftp://example.com" }, OWNER),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns 409 when a custom alias is already taken", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      { destinationUrl: "https://a.example", customAlias: "taken" },
      OWNER,
    );
    await expect(
      service.create({ destinationUrl: "https://b.example", customAlias: "taken" }, OTHER),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects reserved aliases", async () => {
    const service = createService(new FakeLinkRepository());
    await expect(
      service.create({ destinationUrl: "https://example.com", customAlias: "health" }, OWNER),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects an expiresAt in the past", async () => {
    const service = createService(new FakeLinkRepository());
    await expect(
      service.create(
        {
          destinationUrl: "https://example.com",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
        OWNER,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("retries code generation on collision", async () => {
    const repository = new FakeLinkRepository();
    const codes = ["dup", "dup", "fresh"];
    let index = 0;
    const service = createService(repository, {
      generateShortCode: () => codes[index++] ?? "fallback",
    });

    await service.create(
      { destinationUrl: "https://example.com", customAlias: "dup" },
      OWNER,
    );

    const link = await service.create({ destinationUrl: "https://example.com" }, OWNER);
    expect(link.shortCode).toBe("fresh");
  });

  it("gives up after the configured number of attempts", async () => {
    const repository = new FakeLinkRepository();
    const service = createService(repository, { generateShortCode: () => "clash" });

    await service.create(
      { destinationUrl: "https://example.com", customAlias: "clash" },
      OWNER,
    );

    await expect(
      service.create({ destinationUrl: "https://example.com" }, OWNER),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("LinkService ownership", () => {
  it("only lists links owned by the given user", async () => {
    const repository = new FakeLinkRepository();
    const service = createService(repository);

    await service.create({ destinationUrl: "https://a.example" }, OWNER);
    await service.create({ destinationUrl: "https://b.example" }, OTHER);

    const ownerLinks = await service.list(OWNER, {
      page: 1,
      pageSize: 20,
      status: "all",
      sort: "newest",
    });
    expect(ownerLinks.data).toHaveLength(1);
    expect(ownerLinks.data[0]?.destinationUrl).toBe("https://a.example/");
    expect(ownerLinks.total).toBe(1);
  });

  it("returns metadata for the owner", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "mine" },
      OWNER,
    );

    const link = await service.getByShortCode("mine", OWNER);
    expect(link.shortCode).toBe("mine");
  });

  it("forbids access to another user's link metadata", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "mine" },
      OWNER,
    );

    await expect(service.getByShortCode("mine", OTHER)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("LinkService.update", () => {
  it("updates the destination and invalidates the cache", async () => {
    const repository = new FakeLinkRepository();
    const invalidated: string[] = [];
    const service = createService(repository, {
      invalidateCache: async (shortCode) => {
        invalidated.push(shortCode);
      },
    });
    await service.create(
      { destinationUrl: "https://old.example", customAlias: "edit-me" },
      OWNER,
    );

    const updated = await service.update("edit-me", OWNER, {
      destinationUrl: "new.example/path",
    });

    expect(updated.destinationUrl).toBe("https://new.example/path");
    expect(invalidated).toEqual(["edit-me"]);
  });

  it("clears the expiry when null is provided", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      {
        destinationUrl: "https://example.com",
        customAlias: "expiry",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      OWNER,
    );

    const updated = await service.update("expiry", OWNER, { expiresAt: null });
    expect(updated.expiresAt).toBeNull();
  });

  it("rejects an expiry in the past", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "past" },
      OWNER,
    );

    await expect(
      service.update("past", OWNER, {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects another user's link", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "mine" },
      OWNER,
    );

    await expect(
      service.update("mine", OTHER, { destinationUrl: "https://hijack.example" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an unknown link", async () => {
    const service = createService(new FakeLinkRepository());
    await expect(
      service.update("missing", OWNER, { destinationUrl: "https://example.com" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("LinkService.delete", () => {
  it("deletes the link and invalidates the cache", async () => {
    const repository = new FakeLinkRepository();
    const invalidated: string[] = [];
    const service = createService(repository, {
      invalidateCache: async (shortCode) => {
        invalidated.push(shortCode);
      },
    });
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "remove-me" },
      OWNER,
    );

    await service.delete("remove-me", OWNER);

    expect(repository.records).toHaveLength(0);
    expect(invalidated).toEqual(["remove-me"]);
  });

  it("rejects another user's link and keeps it", async () => {
    const repository = new FakeLinkRepository();
    const service = createService(repository);
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "protected" },
      OWNER,
    );

    await expect(service.delete("protected", OTHER)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repository.records).toHaveLength(1);
  });
});

describe("LinkService.resolveLink", () => {
  it("throws NotFoundError for an unknown code", async () => {
    const service = createService(new FakeLinkRepository());
    await expect(service.resolveLink("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws GoneError for an expired link", async () => {
    const repository = new FakeLinkRepository();
    const service = createService(repository);
    await repository.create({
      userId: OWNER,
      shortCode: "oldcode",
      destinationUrl: "https://example.com",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.resolveLink("oldcode")).rejects.toBeInstanceOf(GoneError);
  });

  it("returns the link record for a valid link", async () => {
    const service = createService(new FakeLinkRepository());
    await service.create(
      { destinationUrl: "https://example.com", customAlias: "live" },
      OWNER,
    );

    const link = await service.resolveLink("live");
    expect(link.destinationUrl).toBe("https://example.com/");
    expect(link.userId).toBe(OWNER);
  });
});
