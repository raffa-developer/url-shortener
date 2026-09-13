import Redis from "ioredis";
import { buildApp } from "../src/app";
import { createRedisRedirectCache, type RedirectCache } from "../src/cache/redirect-cache";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db";
import { LinkRepository } from "../src/modules/links/link.repository";
import { LinkService } from "../src/modules/links/link.service";
import { RedirectService } from "../src/modules/redirects/redirect.service";

const ITERATIONS = 300;

interface Stats {
  avg: number;
  p50: number;
  p95: number;
}

function computeStats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const percentile = (p: number): number => {
    const index = Math.min(
      sorted.length - 1,
      Math.ceil((p / 100) * sorted.length) - 1,
    );
    return sorted[index] ?? 0;
  };
  return { avg, p50: percentile(50), p95: percentile(95) };
}

async function measure(
  iterations: number,
  operation: () => Promise<unknown>,
): Promise<Stats> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    await operation();
    samples.push(Number(process.hrtime.bigint() - start) / 1_000_000);
  }
  return computeStats(samples);
}

function format(value: number): string {
  return value.toFixed(2);
}

async function main(): Promise<void> {
  // Silence request logging so it does not distort the measurements.
  const config = { ...loadConfig(), nodeEnv: "test" as const };
  if (!config.redisUrl) {
    console.error("REDIS_URL must be set to benchmark the cache and event queue.");
    process.exit(1);
  }

  const db = createDatabase(config.databaseUrl);
  const cachedApp = await buildApp({ config, db });
  const uncachedApp = await buildApp({
    config: { ...config, redirectCacheEnabled: false },
    db,
  });
  const syncApp = await buildApp({
    config: { ...config, clickEventsEnabled: false },
    db,
  });
  const cache: RedirectCache = createRedisRedirectCache(config.redisUrl);
  const cleanupRedis = new Redis(config.redisUrl);

  const email = `benchmark-${Date.now()}@example.com`;
  const alias = `bench-${Date.now().toString(36)}`;

  try {
    const registration = await cachedApp.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "benchmark-password" },
    });
    const { accessToken } = registration.json() as { accessToken: string };

    const created = await cachedApp.inject({
      method: "POST",
      url: "/api/links",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        destinationUrl: "https://example.com/benchmark",
        customAlias: alias,
      },
    });
    const { shortCode } = created.json() as { shortCode: string };

    const linkService = new LinkService(new LinkRepository(db), config);
    const redirectService = new RedirectService(linkService, cache, config);

    // Warm every cache so measured redirects are hits.
    await redirectService.resolve(shortCode);
    await cachedApp.inject({ method: "GET", url: `/${shortCode}` });
    await syncApp.inject({ method: "GET", url: `/${shortCode}` });

    console.log(
      `\nRedirect benchmark — ${ITERATIONS} iterations per phase (Node ${process.version})\n`,
    );

    const postgresOnly = await measure(ITERATIONS, () =>
      linkService.resolveLink(shortCode),
    );
    const cacheHit = await measure(ITERATIONS, () => redirectService.resolve(shortCode));
    const httpSync = await measure(ITERATIONS, () =>
      syncApp.inject({ method: "GET", url: `/${shortCode}` }),
    );
    const httpEvents = await measure(ITERATIONS, () =>
      cachedApp.inject({ method: "GET", url: `/${shortCode}` }),
    );
    const httpEventsNoCache = await measure(ITERATIONS, () =>
      uncachedApp.inject({ method: "GET", url: `/${shortCode}` }),
    );

    const rows: [string, Stats][] = [
      ["Postgres lookup only", postgresOnly],
      ["Cache hit (Redis only)", cacheHit],
      ["HTTP redirect · cache on · sync analytics (V3/V4)", httpSync],
      ["HTTP redirect · cache on · events (V5)", httpEvents],
      ["HTTP redirect · cache off · events (V5)", httpEventsNoCache],
    ];

    console.log("| Phase | avg (ms) | p50 (ms) | p95 (ms) |");
    console.log("| ----- | -------- | -------- | -------- |");
    for (const [label, stats] of rows) {
      console.log(
        `| ${label} | ${format(stats.avg)} | ${format(stats.p50)} | ${format(stats.p95)} |`,
      );
    }
    console.log(
      `\nCache hit speedup vs Postgres: ${(postgresOnly.avg / cacheHit.avg).toFixed(1)}x`,
    );
    console.log(
      `Decoupling analytics cut redirect latency by ${format(
        httpSync.avg - httpEvents.avg,
      )} ms (${(httpSync.avg / httpEvents.avg).toFixed(1)}x faster)\n`,
    );
  } finally {
    const streamKey = config.clickEventStreamKey;
    await cleanupRedis.del(streamKey, `${streamKey}:dead`, `${streamKey}:attempts`);
    cleanupRedis.disconnect();
    await db.user.deleteMany({ where: { email } });
    await cache.close();
    await cachedApp.close();
    await uncachedApp.close();
    await syncApp.close();
    await db.$disconnect();
  }
}

void main();
