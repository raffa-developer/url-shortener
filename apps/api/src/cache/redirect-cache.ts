import Redis from "ioredis";

export interface CachedRedirect {
  linkId: string;
  destinationUrl: string;
  expiresAt: string | null;
}

export interface RedirectCache {
  get(shortCode: string): Promise<CachedRedirect | null>;
  set(shortCode: string, value: CachedRedirect, ttlSeconds: number): Promise<void>;
  delete(shortCode: string): Promise<void>;
  /** Removes every redirect entry (used by tests and tooling). */
  clear(): Promise<number>;
  close(): Promise<void>;
}

export const REDIRECT_CACHE_PREFIX = "redirect:";

export interface RedisRedirectCacheOptions {
  onError?: (error: unknown) => void;
}

export class RedisRedirectCache implements RedirectCache {
  constructor(
    private readonly client: Redis,
    private readonly options: RedisRedirectCacheOptions = {},
  ) {}

  async get(shortCode: string): Promise<CachedRedirect | null> {
    const raw = await this.client.get(REDIRECT_CACHE_PREFIX + shortCode);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as CachedRedirect;
      if (
        typeof parsed.linkId !== "string" ||
        typeof parsed.destinationUrl !== "string"
      ) {
        await this.delete(shortCode);
        return null;
      }
      return parsed;
    } catch (error) {
      this.options.onError?.(error);
      await this.delete(shortCode);
      return null;
    }
  }

  async set(
    shortCode: string,
    value: CachedRedirect,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      REDIRECT_CACHE_PREFIX + shortCode,
      JSON.stringify(value),
      "EX",
      Math.max(1, Math.floor(ttlSeconds)),
    );
  }

  async delete(shortCode: string): Promise<void> {
    await this.client.del(REDIRECT_CACHE_PREFIX + shortCode);
  }

  async clear(): Promise<number> {
    let cursor = "0";
    let removed = 0;

    do {
      const [next, keys] = await this.client.scan(
        cursor,
        "MATCH",
        `${REDIRECT_CACHE_PREFIX}*`,
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        removed += await this.client.del(...keys);
      }
    } while (cursor !== "0");

    return removed;
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export function createRedisRedirectCache(
  redisUrl: string,
  options: RedisRedirectCacheOptions = {},
): RedisRedirectCache {
  const client = new Redis(redisUrl, {
    // Fail fast instead of queueing commands for long while Redis is
    // unreachable; the redirect path treats cache errors as a miss.
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on("error", (error) => {
    options.onError?.(error);
  });

  return new RedisRedirectCache(client, options);
}
