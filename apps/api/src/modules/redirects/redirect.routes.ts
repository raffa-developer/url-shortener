import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { hashVisitor } from "../../lib/visitor-hash";
import type { ClickEventPublisher } from "../../queue/click-events";
import { errorResponseSchema } from "../../schemas";
import type { AnalyticsService } from "../analytics/analytics.service";
import { resolveCountry } from "../analytics/geo";
import { shortCodeParamsSchema } from "../links/link.schemas";
import { recordClickEvent } from "./click-recorder";
import type { RedirectService } from "./redirect.service";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Public redirect endpoint: GET /:shortCode
 *
 * Registered as a child plugin with no prefix, so it must not shadow the
 * `/api/*` or `/health*` routes. Fastify prioritises static routes over
 * parametric ones, so those keep working.
 *
 * Resolution goes through the cache-aside `RedirectService`, and the click is
 * published as an event for the analytics worker (V5). If the queue is
 * unavailable, the click is inserted synchronously instead.
 */
export interface RedirectRouteOptions {
  geoipFallbackCountry?: string;
  visitorHashSecret: string;
}

export function redirectRoutes(
  redirects: RedirectService,
  analytics: AnalyticsService,
  publisher: ClickEventPublisher | null,
  options: RedirectRouteOptions,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/:shortCode",
      {
        schema: {
          params: shortCodeParamsSchema,
          response: {
            404: errorResponseSchema,
            410: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const resolved = await redirects.resolve(request.params.shortCode);
        const userAgent = firstHeader(request.headers["user-agent"]) ?? null;

        await recordClickEvent({
          publisher,
          analytics,
          event: {
            linkId: resolved.linkId,
            timestamp: new Date().toISOString(),
            userAgent,
            referrer:
              firstHeader(request.headers.referer ?? request.headers.referrer) ?? null,
            country: resolveCountry({
              headers: request.headers,
              ip: request.ip,
              fallbackCountry: options.geoipFallbackCountry,
            }),
            visitorHash: hashVisitor({
              ip: request.ip,
              userAgent,
              linkId: resolved.linkId,
              secret: options.visitorHashSecret,
            }),
          },
          onError: (error, context) =>
            request.log.error(
              { err: error, context, shortCode: request.params.shortCode },
              "Failed to record click",
            ),
        });

        reply.header("X-Cache", resolved.cache.toUpperCase());
        reply.header("Cache-Control", "no-store");
        return reply.redirect(resolved.destinationUrl, 302);
      },
    );
  };
}
