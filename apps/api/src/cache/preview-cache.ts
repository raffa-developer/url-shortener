import Redis from "ioredis";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface PreviewCache {
  get(shortCode: string): Promise<LinkPreview | null>;
  set(shortCode: string, value: LinkPreview, ttlSeconds: number): Promise<void>;
  delete(shortCode: string): Promise<void>;
  close(): Promise<void>;
}

export const PREVIEW_CACHE_PREFIX = "preview:";
export const PREVIEW_CACHE_TTL_SECONDS = 24 * 60 * 60;

export interface RedisPreviewCacheOptions {
  onError?: (error: unknown) => void;
}

export class RedisPreviewCache implements PreviewCache {
  constructor(
    private readonly client: Redis,
    private readonly options: RedisPreviewCacheOptions = {},
  ) {}

  async get(shortCode: string): Promise<LinkPreview | null> {
    const raw = await this.client.get(PREVIEW_CACHE_PREFIX + shortCode);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as LinkPreview;
      if (typeof parsed.url !== "string") {
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
    value: LinkPreview,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      PREVIEW_CACHE_PREFIX + shortCode,
      JSON.stringify(value),
      "EX",
      Math.max(1, Math.floor(ttlSeconds)),
    );
  }

  async delete(shortCode: string): Promise<void> {
    await this.client.del(PREVIEW_CACHE_PREFIX + shortCode);
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export function createRedisPreviewCache(
  redisUrl: string,
  options: RedisPreviewCacheOptions = {},
): RedisPreviewCache {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on("error", (error) => {
    options.onError?.(error);
  });

  return new RedisPreviewCache(client, options);
}
