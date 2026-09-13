import { afterEach, describe, expect, it, vi } from "vitest";
import { GoneError } from "@url-shortener/shared";
import type { CachedRedirect, RedirectCache } from "../../src/cache/redirect-cache";
import { loadConfig } from "../../src/config";
import type { LinkRecord } from "../../src/modules/links/link.repository";
import type { LinkService } from "../../src/modules/links/link.service";
import { RedirectService } from "../../src/modules/redirects/redirect.service";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/test",
  JWT_ACCESS_SECRET: "test-secret-that-is-at-least-32-characters",
  REDIRECT_CACHE_TTL_SECONDS: "3600",
});

class FakeRedirectCache implements RedirectCache {
  entries = new Map<string, CachedRedirect>();
  setCalls: { shortCode: string; value: CachedRedirect; ttlSeconds: number }[] = [];
  deleteCalls: string[] = [];
  failOnGet = false;
  failOnSet = false;

  async get(shortCode: string): Promise<CachedRedirect | null> {
    if (this.failOnGet) {
      throw new Error("redis unavailable");
    }
    return this.entries.get(shortCode) ?? null;
  }

  async set(
    shortCode: string,
    value: CachedRedirect,
    ttlSeconds: number,
  ): Promise<void> {
    if (this.failOnSet) {
      throw new Error("redis unavailable");
    }
    this.setCalls.push({ shortCode, value, ttlSeconds });
    this.entries.set(shortCode, value);
  }

  async delete(shortCode: string): Promise<void> {
    this.deleteCalls.push(shortCode);
    this.entries.delete(shortCode);
  }

  async clear(): Promise<number> {
    const count = this.entries.size;
    this.entries.clear();
    return count;
  }

  async close(): Promise<void> {}
}

function createLinkService(
  overrides: { destinationUrl?: string; expiresAt?: Date | null } = {},
) {
  const resolveLink = vi.fn(
    async (): Promise<LinkRecord> => ({
      id: "link-1",
      userId: "user-1",
      shortCode: "abc123",
      destinationUrl: overrides.destinationUrl ?? "https://example.com/",
      createdAt: new Date(),
      expiresAt: overrides.expiresAt ?? null,
      clickCount: 0,
    }),
  );
  return { service: { resolveLink } as unknown as LinkService, resolveLink };
}

describe("RedirectService cache-aside", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves a cache hit without touching the database", async () => {
    const cache = new FakeRedirectCache();
    cache.entries.set("abc123", {
      linkId: "link-1",
      destinationUrl: "https://cached.example/",
      expiresAt: null,
    });
    const { service: links, resolveLink } = createLinkService();
    const redirects = new RedirectService(links, cache, config);

    const resolved = await redirects.resolve("abc123");

    expect(resolved).toEqual({
      linkId: "link-1",
      destinationUrl: "https://cached.example/",
      cache: "hit",
    });
    expect(resolveLink).not.toHaveBeenCalled();
  });

  it("loads from the database on a miss and populates the cache", async () => {
    const cache = new FakeRedirectCache();
    const { service: links, resolveLink } = createLinkService();
    const redirects = new RedirectService(links, cache, config);

    const resolved = await redirects.resolve("abc123");

    expect(resolved.cache).toBe("miss");
    expect(resolved.destinationUrl).toBe("https://example.com/");
    expect(resolveLink).toHaveBeenCalledWith("abc123");
    expect(cache.setCalls).toHaveLength(1);
    expect(cache.setCalls[0]).toMatchObject({
      shortCode: "abc123",
      ttlSeconds: 3600,
    });
  });

  it("caps the cache TTL at the link's remaining lifetime", async () => {
    const cache = new FakeRedirectCache();
    const expiresAt = new Date(Date.now() + 120_000);
    const { service: links } = createLinkService({ expiresAt });
    const redirects = new RedirectService(links, cache, config);

    await redirects.resolve("abc123");

    expect(cache.setCalls[0]?.ttlSeconds).toBeGreaterThan(110);
    expect(cache.setCalls[0]?.ttlSeconds).toBeLessThanOrEqual(120);
    expect(cache.setCalls[0]?.ttlSeconds).toBeLessThan(3600);
  });

  it("rejects an expired cached entry with 410 and evicts it", async () => {
    const cache = new FakeRedirectCache();
    cache.entries.set("abc123", {
      linkId: "link-1",
      destinationUrl: "https://expired.example/",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const { service: links, resolveLink } = createLinkService();
    const redirects = new RedirectService(links, cache, config);

    await expect(redirects.resolve("abc123")).rejects.toBeInstanceOf(GoneError);
    expect(cache.deleteCalls).toContain("abc123");
    expect(resolveLink).not.toHaveBeenCalled();
  });

  it("bypasses the cache entirely when disabled", async () => {
    const { service: links, resolveLink } = createLinkService();
    const redirects = new RedirectService(links, null, config);

    const resolved = await redirects.resolve("abc123");

    expect(resolved.cache).toBe("bypass");
    expect(resolveLink).toHaveBeenCalledOnce();
  });

  it("falls back to the database when the cache read fails", async () => {
    const cache = new FakeRedirectCache();
    cache.failOnGet = true;
    const { service: links, resolveLink } = createLinkService();
    const onCacheError = vi.fn();
    const redirects = new RedirectService(links, cache, config, { onCacheError });

    const resolved = await redirects.resolve("abc123");

    expect(resolved.cache).toBe("miss");
    expect(resolveLink).toHaveBeenCalledOnce();
    expect(onCacheError).toHaveBeenCalled();
  });

  it("still redirects when the cache write fails", async () => {
    const cache = new FakeRedirectCache();
    cache.failOnSet = true;
    const { service: links } = createLinkService();
    const onCacheError = vi.fn();
    const redirects = new RedirectService(links, cache, config, { onCacheError });

    const resolved = await redirects.resolve("abc123");

    expect(resolved.cache).toBe("miss");
    expect(onCacheError).toHaveBeenCalled();
  });
});
