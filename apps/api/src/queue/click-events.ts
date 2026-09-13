import Redis from "ioredis";
import { z } from "zod";

export const CLICK_EVENT_STREAM = "clicks:events";
export const CLICK_EVENT_GROUP = "analytics-workers";

export const clickEventSchema = z.object({
  linkId: z.string().min(1).max(64),
  timestamp: z.iso.datetime(),
  userAgent: z
    .string()
    .max(4096)
    .nullish()
    .transform((value) => value ?? null),
  referrer: z
    .string()
    .max(4096)
    .nullish()
    .transform((value) => value ?? null),
  country: z
    .string()
    .max(8)
    .nullish()
    .transform((value) => value ?? null),
});

export type ClickEvent = z.infer<typeof clickEventSchema>;

export function clickEventToFields(event: ClickEvent): string[] {
  const fields = ["linkId", event.linkId, "timestamp", event.timestamp];
  if (event.userAgent !== null) {
    fields.push("userAgent", event.userAgent);
  }
  if (event.referrer !== null) {
    fields.push("referrer", event.referrer);
  }
  if (event.country !== null) {
    fields.push("country", event.country);
  }
  return fields;
}

export function parseClickEventFields(fields: string[]): ClickEvent | null {
  const record: Record<string, string> = {};
  for (let index = 0; index + 1 < fields.length; index += 2) {
    record[fields[index]!] = fields[index + 1]!;
  }
  const parsed = clickEventSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export interface ClickEventPublisher {
  publish(event: ClickEvent): Promise<void>;
  close(): Promise<void>;
}

export interface RedisClickEventPublisherOptions {
  onError?: (error: unknown) => void;
  streamKey?: string;
  maxLength?: number;
}

export class RedisClickEventPublisher implements ClickEventPublisher {
  private readonly streamKey: string;
  private readonly maxLength: number;

  constructor(
    private readonly client: Redis,
    private readonly options: RedisClickEventPublisherOptions = {},
  ) {
    this.streamKey = options.streamKey ?? CLICK_EVENT_STREAM;
    this.maxLength = options.maxLength ?? 10_000;
  }

  async publish(event: ClickEvent): Promise<void> {
    await this.client.xadd(
      this.streamKey,
      "MAXLEN",
      "~",
      this.maxLength,
      "*",
      ...clickEventToFields(event),
    );
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

export interface ClickEventMetadata {
  /** Redis stream entry id — stable across redeliveries, used as an idempotency key. */
  id: string;
  attempts: number;
}

export interface ClickEventConsumerOptions {
  onEvent: (event: ClickEvent, metadata: ClickEventMetadata) => Promise<void>;
  onError?: (error: unknown, context: { operation: string; eventId?: string }) => void;
  streamKey?: string;
  deadLetterStreamKey?: string;
  groupName?: string;
  consumerName?: string;
  batchSize?: number;
  blockMs?: number;
  /** How long a pending entry must be idle before another worker may claim it. */
  minIdleMs?: number;
  maxAttempts?: number;
}

type StreamEntry = [id: string, fields: string[] | null];

function isBusyGroupError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("BUSYGROUP");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Consumer-group worker over a Redis stream.
 *
 * Delivery is at-least-once: entries are only acknowledged after `onEvent`
 * succeeds. Failures are counted in a Redis hash and, once `maxAttempts` is
 * reached, moved to a dead-letter stream so a poison message cannot loop
 * forever. Processing is made effectively-once by passing the stable stream
 * entry id to consumers as an idempotency key.
 */
export class RedisClickEventConsumer {
  private readonly streamKey: string;
  private readonly deadLetterStreamKey: string;
  private readonly attemptsKey: string;
  private readonly groupName: string;
  private readonly consumerName: string;
  private readonly batchSize: number;
  private readonly blockMs: number;
  private readonly minIdleMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly client: Redis,
    private readonly options: ClickEventConsumerOptions,
  ) {
    this.streamKey = options.streamKey ?? CLICK_EVENT_STREAM;
    this.deadLetterStreamKey =
      options.deadLetterStreamKey ?? `${this.streamKey}:dead`;
    this.attemptsKey = `${this.streamKey}:attempts`;
    this.groupName = options.groupName ?? CLICK_EVENT_GROUP;
    this.consumerName = options.consumerName ?? `worker-${process.pid}`;
    this.batchSize = options.batchSize ?? 50;
    this.blockMs = options.blockMs ?? 2000;
    this.minIdleMs = options.minIdleMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  async ensureGroup(): Promise<void> {
    try {
      // "0" so events published before the worker first started are not missed.
      await this.client.xgroup("CREATE", this.streamKey, this.groupName, "0", "MKSTREAM");
    } catch (error) {
      if (!isBusyGroupError(error)) {
        throw error;
      }
    }
  }

  /** Processes every currently-available message once (used by tests/tools). */
  async drainOnce(): Promise<number> {
    await this.ensureGroup();
    let processed = 0;

    for (;;) {
      const entries = await this.readNew();
      if (entries.length === 0) {
        break;
      }
      for (const [id, fields] of entries) {
        await this.handle(id, fields);
        processed += 1;
      }
      if (entries.length < this.batchSize) {
        break;
      }
    }

    return processed;
  }

  async run(shouldStop: () => boolean): Promise<void> {
    await this.ensureGroup();

    while (!shouldStop()) {
      try {
        const entries = await this.readNew(this.blockMs);
        for (const [id, fields] of entries) {
          await this.handle(id, fields);
        }
        await this.reclaimStale();
      } catch (error) {
        this.options.onError?.(error, { operation: "run" });
        await sleep(1000);
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private async readNew(blockMs?: number): Promise<StreamEntry[]> {
    const args: (string | number)[] = [
      "GROUP",
      this.groupName,
      this.consumerName,
      "COUNT",
      this.batchSize,
    ];
    if (blockMs !== undefined) {
      args.push("BLOCK", blockMs);
    }
    args.push("STREAMS", this.streamKey, ">");

    // `call` avoids the strict overloads of the typed helper for dynamic args.
    const response = (await this.client.call("XREADGROUP", ...args)) as unknown;
    if (!response) {
      return [];
    }

    // ioredis returns [key, entries] for a single stream and
    // [[key, entries], ...] when several streams are read.
    if (Array.isArray(response) && typeof response[0] === "string") {
      const entries = response[1];
      return Array.isArray(entries) ? (entries as StreamEntry[]) : [];
    }
    if (Array.isArray(response)) {
      return response.flatMap((pair) =>
        Array.isArray(pair) && Array.isArray(pair[1])
          ? (pair[1] as StreamEntry[])
          : [],
      );
    }
    return [];
  }

  /** Re-reads entries abandoned by crashed consumers or left after a failure. */
  private async reclaimStale(): Promise<number> {
    const pending = (await this.client.xpending(
      this.streamKey,
      this.groupName,
      "-",
      "+",
      this.batchSize,
    )) as [string, string, number, number][];

    if (!Array.isArray(pending) || pending.length === 0) {
      return 0;
    }

    const ids = pending
      .filter(([, , idle]) => idle >= this.minIdleMs)
      .map(([id]) => id);

    if (ids.length === 0) {
      return 0;
    }

    const claimed = (await this.client.xclaim(
      this.streamKey,
      this.groupName,
      this.consumerName,
      this.minIdleMs,
      ...ids,
    )) as unknown;

    const entries: StreamEntry[] =
      Array.isArray(claimed) && typeof claimed[0] === "string"
        ? [claimed as StreamEntry]
        : (claimed as StreamEntry[]);

    for (const [id, fields] of entries) {
      await this.handle(id, fields);
    }
    return entries.length;
  }

  private async handle(id: string, fields: string[] | null): Promise<void> {
    if (!fields) {
      await this.acknowledge(id);
      return;
    }

    const event = parseClickEventFields(fields);
    if (!event) {
      await this.deadLetter(id, fields, "invalid-payload", 1);
      return;
    }

    const attempts = await this.currentAttempts(id);
    try {
      await this.options.onEvent(event, { id, attempts: attempts + 1 });
      await this.acknowledge(id);
    } catch (error) {
      const nextAttempt = await this.client.hincrby(this.attemptsKey, id, 1);
      this.options.onError?.(error, { operation: "process", eventId: id });

      if (nextAttempt >= this.maxAttempts) {
        await this.deadLetter(
          id,
          fields,
          error instanceof Error ? error.message : String(error),
          nextAttempt,
        );
      }
      // Otherwise leave the entry pending; reclaimStale redelivers it.
    }
  }

  private async currentAttempts(id: string): Promise<number> {
    const value = await this.client.hget(this.attemptsKey, id);
    return value ? Number(value) : 0;
  }

  private async acknowledge(id: string): Promise<void> {
    await this.client.xack(this.streamKey, this.groupName, id);
    await this.client.hdel(this.attemptsKey, id);
  }

  private async deadLetter(
    id: string,
    fields: string[],
    reason: string,
    attempts: number,
  ): Promise<void> {
    await this.client.xadd(
      this.deadLetterStreamKey,
      "*",
      ...fields,
      "error",
      reason,
      "attempts",
      String(attempts),
    );
    await this.acknowledge(id);
  }
}

export function createRedisClickEventConsumer(
  redisUrl: string,
  options: ClickEventConsumerOptions,
): RedisClickEventConsumer {
  const client = new Redis(redisUrl, {
    // Blocking XREADGROUP requires unlimited retries per request.
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    connectTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 250, 3000),
  });
  client.on("error", (error) => options.onError?.(error, { operation: "redis" }));
  return new RedisClickEventConsumer(client, options);
}

export function createRedisClickEventPublisher(
  redisUrl: string,
  options: RedisClickEventPublisherOptions = {},
): RedisClickEventPublisher {
  const client = new Redis(redisUrl, {
    // Fail fast so the redirect can fall back to a synchronous insert.
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on("error", (error) => options.onError?.(error));
  return new RedisClickEventPublisher(client, options);
}
