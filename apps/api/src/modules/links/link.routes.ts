import type { preHandlerHookHandler } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema } from "../../schemas";
import { getAuthenticatedUser } from "../auth/auth.middleware";
import type { LinkService } from "./link.service";
import {
  createLinkBodySchema,
  linkSchema,
  listLinksQuerySchema,
  shortCodeParamsSchema,
} from "./link.schemas";

export function linkRoutes(
  service: LinkService,
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
  };
}
