import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createLogger } from "./logger";
import { AnalyticsService } from "./modules/analytics/analytics.service";
import { ClickRepository } from "./modules/analytics/click.repository";
import { LinkRepository } from "./modules/links/link.repository";
import { LinkService } from "./modules/links/link.service";
import {
  CLICK_EVENT_GROUP,
  CLICK_EVENT_STREAM,
  createRedisClickEventConsumer,
} from "./queue/click-events";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.redisUrl) {
    throw new Error("REDIS_URL is required to run the analytics worker");
  }

  const logger = createLogger(config, "worker");
  const db = createDatabase(config.databaseUrl);
  const analytics = new AnalyticsService(
    new ClickRepository(db),
    new LinkService(new LinkRepository(db), config),
  );

  let stopping = false;
  const stop = (signal: string): void => {
    logger.info({ signal }, "shutdown requested, finishing the current batch");
    stopping = true;
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const consumer = createRedisClickEventConsumer(config.redisUrl, {
    streamKey: config.clickEventStreamKey,
    onEvent: (event, metadata) =>
      analytics.recordClick({
        linkId: event.linkId,
        userAgent: event.userAgent,
        referrer: event.referrer,
        country: event.country,
        visitorHash: event.visitorHash,
        timestamp: new Date(event.timestamp),
        eventId: metadata.id,
      }),
    onError: (error, context) =>
      logger.warn({ err: error, ...context }, "event processing failed"),
  });

  logger.info({ stream: CLICK_EVENT_STREAM, group: CLICK_EVENT_GROUP }, "worker started");

  try {
    await consumer.run(() => stopping);
  } finally {
    await consumer.close();
    await db.$disconnect();
    logger.info("worker stopped");
  }
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
