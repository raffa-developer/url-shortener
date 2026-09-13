import { GoneError } from "@url-shortener/shared";
import type { CachedRedirect, RedirectCache } from "../../cache/redirect-cache";
import type { AppConfig } from "../../config";
import type { LinkService } from "../links/link.service";

export type CacheStatus = "hit" | "miss" | "bypass";

export interface ResolvedRedirect {
  linkId: string;
  destinationUrl: string;
  cache: CacheStatus;
}

export interface RedirectServiceOptions {
  onCacheError?: (error: unknown) => void;
}

/**
 * Cache-aside resolver for the public redirect endpoint.
 *
 * 1. Look up the short code in Redis.
 * 2. On a hit, use the cached destination (still honouring expiry).
 * 3. On a miss, read PostgreSQL, populate the cache and redirect.
 *
 * Cache failures are best-effort: they degrade to a database read rather than
 * failing the redirect.
 */
export class RedirectService {
  constructor(
    private readonly links: LinkService,
    private readonly cache: RedirectCache | null,
    private readonly config: AppConfig,
    private readonly options: RedirectServiceOptions = {},
  ) {}

  async resolve(shortCode: string): Promise<ResolvedRedirect> {
    if (!this.cache) {
      const link = await this.links.resolveLink(shortCode);
      return {
        linkId: link.id,
        destinationUrl: link.destinationUrl,
        cache: "bypass",
      };
    }

    const cached = await this.read(shortCode);
    if (cached) {
      if (cached.expiresAt && new Date(cached.expiresAt).getTime() <= Date.now()) {
        await this.remove(shortCode);
        throw new GoneError("This link has expired");
      }
      return {
        linkId: cached.linkId,
        destinationUrl: cached.destinationUrl,
        cache: "hit",
      };
    }

    const link = await this.links.resolveLink(shortCode);
    await this.write(shortCode, {
      linkId: link.id,
      destinationUrl: link.destinationUrl,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    });

    return {
      linkId: link.id,
      destinationUrl: link.destinationUrl,
      cache: "miss",
    };
  }

  private async read(shortCode: string): Promise<CachedRedirect | null> {
    try {
      return await this.cache!.get(shortCode);
    } catch (error) {
      this.options.onCacheError?.(error);
      return null;
    }
  }

  private async write(shortCode: string, value: CachedRedirect): Promise<void> {
    try {
      await this.cache!.set(shortCode, value, this.ttlSeconds(value));
    } catch (error) {
      this.options.onCacheError?.(error);
    }
  }

  private async remove(shortCode: string): Promise<void> {
    try {
      await this.cache!.delete(shortCode);
    } catch (error) {
      this.options.onCacheError?.(error);
    }
  }

  /** Never outlive the link's own expiry, and never cache for longer than the TTL. */
  private ttlSeconds(value: CachedRedirect): number {
    const base = this.config.redirectCacheTtlSeconds;
    if (!value.expiresAt) {
      return base;
    }
    const remaining = Math.floor(
      (new Date(value.expiresAt).getTime() - Date.now()) / 1000,
    );
    return Math.max(1, Math.min(base, remaining));
  }
}
