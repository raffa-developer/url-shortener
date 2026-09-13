import type { preHandlerHookHandler } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { errorResponseSchema } from "../../schemas";
import { getAuthenticatedUser } from "../auth/auth.middleware";
import { shortCodeParamsSchema } from "../links/link.schemas";
import { analyticsQuerySchema, analyticsResponseSchema } from "./analytics.schemas";
import type { AnalyticsService } from "./analytics.service";

export function analyticsRoutes(
  service: AnalyticsService,
  guard: preHandlerHookHandler,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/links/:shortCode/analytics",
      {
        preHandler: guard,
        schema: {
          params: shortCodeParamsSchema,
          querystring: analyticsQuerySchema,
          response: {
            200: analyticsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request) =>
        service.getLinkAnalytics(
          request.params.shortCode,
          getAuthenticatedUser(request).id,
          request.query,
        ),
    );
  };
}
