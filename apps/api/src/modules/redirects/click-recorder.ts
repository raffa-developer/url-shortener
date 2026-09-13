import type { ClickEvent, ClickEventPublisher } from "../../queue/click-events";
import type { AnalyticsService } from "../analytics/analytics.service";

export interface RecordClickDeps {
  publisher: ClickEventPublisher | null;
  analytics: AnalyticsService;
  event: ClickEvent;
  onError?: (error: unknown, context: "publish" | "record") => void;
}

/**
 * Records a click without keeping the redirect on the analytics write path:
 * publish the event to the queue, and only fall back to a direct database
 * insert if the queue is unavailable. Analytics failures never propagate.
 */
export async function recordClickEvent(deps: RecordClickDeps): Promise<void> {
  if (deps.publisher) {
    try {
      await deps.publisher.publish(deps.event);
      return;
    } catch (error) {
      deps.onError?.(error, "publish");
    }
  }

  await recordSynchronously(deps);
}

async function recordSynchronously(deps: RecordClickDeps): Promise<void> {
  try {
    await deps.analytics.recordClick({
      linkId: deps.event.linkId,
      userAgent: deps.event.userAgent,
      referrer: deps.event.referrer,
      country: deps.event.country,
      visitorHash: deps.event.visitorHash,
      timestamp: new Date(deps.event.timestamp),
    });
  } catch (error) {
    deps.onError?.(error, "record");
  }
}
