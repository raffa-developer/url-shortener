import type { preHandlerHookHandler } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema } from "../../schemas";
import { getAuthenticatedUser } from "../auth/auth.middleware";
import type { LinkPreviewService } from "./link-preview.service";
import type { LinkService } from "./link.service";
import {
  createLinkBodySchema,
  linkPreviewSchema,
  linkSchema,
  listLinksQuerySchema,
  shortCodeParamsSchema,
  updateLinkBodySchema,
} from "./link.schemas";

export function linkRoutes(
  service: LinkService,
  previewService: LinkPreviewService,
  guard: preHandlerHookHandler,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("preHandler", guard);

    app.post(
      "/links",
      {
        schema: {
          body: createLinkBodySchema,
          response: {
            201: linkSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = getAuthenticatedUser(request);
        const link = await service.create(request.body, user.id);
        return reply.code(201).send(link);
      },
    );

    app.get(
      "/links",
      {
        schema: {
          querystring: listLinksQuerySchema,
          response: {
            200: z.object({
              data: z.array(linkSchema),
              nextCursor: z.string().nullable(),
            }),
            401: errorResponseSchema,
          },
        },
      },
      async (request) => service.list(getAuthenticatedUser(request).id, request.query),
    );

    app.get(
      "/links/:shortCode",
      {
        schema: {
          params: shortCodeParamsSchema,
          response: {
            200: linkSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request) =>
        service.getByShortCode(
          request.params.shortCode,
          getAuthenticatedUser(request).id,
        ),
    );

    app.patch(
      "/links/:shortCode",
      {
        schema: {
          params: shortCodeParamsSchema,
          body: updateLinkBodySchema,
          response: {
            200: linkSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request) =>
        service.update(
          request.params.shortCode,
          getAuthenticatedUser(request).id,
          request.body,
        ),
    );

    app.delete(
      "/links/:shortCode",
      {
        schema: {
          params: shortCodeParamsSchema,
          response: {
            204: z.undefined(),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await service.delete(
          request.params.shortCode,
          getAuthenticatedUser(request).id,
        );
        return reply.code(204).send();
      },
    );

    // Fetching a preview makes the server call the destination, so it gets a
    // stricter rate limit than the rest of the API.
    app.get(
      "/links/:shortCode/preview",
      {
        config: { rateLimit: { max: 30, timeWindow: 60_000 } },
        schema: {
          params: shortCodeParamsSchema,
          response: {
            200: linkPreviewSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const link = await service.getByShortCode(
          request.params.shortCode,
          getAuthenticatedUser(request).id,
        );
        return previewService.getPreview(link.shortCode, link.destinationUrl);
      },
    );
  };
}
