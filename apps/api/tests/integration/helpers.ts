import type { FastifyInstance } from "fastify";
import Redis from "ioredis";
import { buildApp } from "../../src/app";
import { REDIRECT_CACHE_PREFIX } from "../../src/cache/redirect-cache";
import { loadConfig, type AppConfig } from "../../src/config";
import { createDatabase, type Database } from "../../src/db";
import { AnalyticsService } from "../../src/modules/analytics/analytics.service";
import { ClickRepository } from "../../src/modules/analytics/click.repository";
import { LinkRepository } from "../../src/modules/links/link.repository";
import { LinkService } from "../../src/modules/links/link.service";
import {
  createRedisClickEventConsumer,
} from "../../src/queue/click-events";

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  config: AppConfig;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    // Keep rate limits out of the way unless a test opts into low limits.
    RATE_LIMIT_MAX: "100000",
    AUTH_RATE_LIMIT_MAX: "100000",
    // A dedicated stream so a real worker on the same Redis never steals
    // test events.
    CLICK_EVENT_STREAM_KEY: "test:clicks:events",
    ...overrides,
  });
  const db = createDatabase(config.databaseUrl);
  const app = await buildApp({ config, db });
  await app.ready();
  return { app, db, config };
}

/**
 * Deletes users (cascading to links, clicks and refresh tokens) and clears the
 * redirect cache and click stream, so tests never observe state from a previous
 * run or from a link that no longer exists.
 */
export async function resetDatabase(ctx: TestContext): Promise<void> {
  await ctx.db.user.deleteMany();
  await clearRedirectCache();
  await clearClickStream(ctx.config.clickEventStreamKey);
}

export async function clearRedirectCache(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return;
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await client.connect();
    let cursor = "0";
    do {
      const [next, keys] = await client.scan(
        cursor,
        "MATCH",
        `${REDIRECT_CACHE_PREFIX}*`,
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // The API falls back to Postgres when Redis is unavailable.
  } finally {
    client.disconnect();
  }
}

export async function clearClickStream(streamKey: string): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return;
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  try {
    await client.connect();
    await client.del(streamKey, `${streamKey}:dead`, `${streamKey}:attempts`);
  } catch {
    // Redis is optional: without it clicks are recorded synchronously.
  } finally {
    client.disconnect();
  }
}

/**
 * Consumes and processes every pending click event once, the same way the
 * worker would, so tests can assert on analytics deterministically. No-op when
 * Redis is unavailable (clicks were recorded synchronously instead).
 */
export async function drainClickEvents(ctx: TestContext): Promise<number> {
  if (!ctx.config.redisUrl) {
    return 0;
  }

  const analytics = new AnalyticsService(
    new ClickRepository(ctx.db),
    new LinkService(new LinkRepository(ctx.db), ctx.config),
  );

  const consumer = createRedisClickEventConsumer(ctx.config.redisUrl, {
    streamKey: ctx.config.clickEventStreamKey,
    consumerName: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    onEvent: (event, metadata) =>
      analytics.recordClick({
        linkId: event.linkId,
        userAgent: event.userAgent,
        referrer: event.referrer,
        country: event.country,
        timestamp: new Date(event.timestamp),
        eventId: metadata.id,
      }),
  });

  try {
    return await consumer.drainOnce();
  } catch {
    return 0;
  } finally {
    await consumer.close();
  }
}

export interface AuthSession {
  user: { id: string; email: string; createdAt: string };
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export async function registerUser(
  app: FastifyInstance,
  email = "user@example.com",
  password = "super-secret-password",
): Promise<AuthSession> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Failed to register test user: ${response.statusCode} ${response.body}`);
  }
  return response.json() as AuthSession;
}

export function bearer(accessToken: string): { authorization: string } {
  return { authorization: `Bearer ${accessToken}` };
}
