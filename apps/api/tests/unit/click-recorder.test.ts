import { describe, expect, it, vi } from "vitest";
import type { ClickEvent, ClickEventPublisher } from "../../src/queue/click-events";
import { recordClickEvent } from "../../src/modules/redirects/click-recorder";
import type { AnalyticsService, RecordClickInput } from "../../src/modules/analytics/analytics.service";

const EVENT: ClickEvent = {
  linkId: "link-1",
  timestamp: "2026-09-13T15:42:11.000Z",
  userAgent: "curl/8.4.0",
  referrer: null,
  country: "PT",
};

class FakePublisher implements ClickEventPublisher {
  published: ClickEvent[] = [];
  fail = false;

  async publish(event: ClickEvent): Promise<void> {
    if (this.fail) {
      throw new Error("redis unavailable");
    }
    this.published.push(event);
  }

  async close(): Promise<void> {}
}

class FakeAnalytics {
  recorded: RecordClickInput[] = [];
  fail = false;

  async recordClick(input: RecordClickInput): Promise<void> {
    if (this.fail) {
      throw new Error("database unavailable");
    }
    this.recorded.push(input);
  }
}

function createDeps(publisher: FakePublisher | null, analytics = new FakeAnalytics()) {
  return {
    analytics,
    deps: {
      publisher,
      analytics: analytics as unknown as AnalyticsService,
      event: EVENT,
      onError: vi.fn(),
    },
  };
}

describe("recordClickEvent", () => {
  it("publishes to the queue instead of writing to the database", async () => {
    const publisher = new FakePublisher();
    const { analytics, deps } = createDeps(publisher);

    await recordClickEvent(deps);

    expect(publisher.published).toEqual([EVENT]);
    expect(analytics.recorded).toHaveLength(0);
  });

  it("falls back to a synchronous insert when publishing fails", async () => {
    const publisher = new FakePublisher();
    publisher.fail = true;
    const { analytics, deps } = createDeps(publisher);

    await recordClickEvent(deps);

    expect(analytics.recorded).toHaveLength(1);
    expect(analytics.recorded[0]).toMatchObject({
      linkId: "link-1",
      country: "PT",
      timestamp: new Date(EVENT.timestamp),
    });
    expect(deps.onError).toHaveBeenCalledWith(expect.any(Error), "publish");
  });

  it("records synchronously when no publisher is configured", async () => {
    const { analytics, deps } = createDeps(null);

    await recordClickEvent(deps);

    expect(analytics.recorded).toHaveLength(1);
  });

  it("never throws when the synchronous fallback also fails", async () => {
    const publisher = new FakePublisher();
    publisher.fail = true;
    const analytics = new FakeAnalytics();
    analytics.fail = true;
    const { deps } = createDeps(publisher, analytics);

    await expect(recordClickEvent(deps)).resolves.toBeUndefined();
    expect(deps.onError).toHaveBeenCalledWith(expect.any(Error), "publish");
    expect(deps.onError).toHaveBeenCalledWith(expect.any(Error), "record");
  });
});
