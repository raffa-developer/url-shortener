import { ForbiddenError } from "@url-shortener/shared";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema } from "../../schemas";
import { getAuthenticatedUser, type AuthenticatedUser } from "../auth/auth.middleware";
import {
  apiKeyParamsSchema,
  apiKeySchema,
  createApiKeyBodySchema,
  createApiKeyResponseSchema,
} from "./api-key.schemas";
import type { ApiKeyRecord } from "./api-key.repository";
import type { ApiKeyService } from "./api-key.service";

function requireJwtSession(request: FastifyRequest): AuthenticatedUser {
  const user = getAuthenticatedUser(request);
  if (user.authType !== "jwt") {
    throw new ForbiddenError(
      "API keys cannot manage API keys — sign in with a session",
    );
  }
  return user;
}

function toDTO(apiKey: ApiKeyRecord) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    createdAt: apiKey.createdAt.toISOString(),
    lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
    revokedAt: apiKey.revokedAt ? apiKey.revokedAt.toISOString() : null,
  };
}

export function apiKeyRoutes(
  service: ApiKeyService,
  guard: preHandlerHookHandler,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("preHandler", guard);

    app.post(
      "/keys",
      {
        schema: {
          body: createApiKeyBodySchema,
          response: {
            201: createApiKeyResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = requireJwtSession(request);
        const created = await service.create(user.id, request.body.name);
        return reply.code(201).send({
          apiKey: toDTO(created.apiKey),
          key: created.plaintext,
        });
      },
    );

    app.get(
      "/keys",
      {
        schema: {
          response: {
            200: z.object({ data: z.array(apiKeySchema) }),
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = requireJwtSession(request);
        const keys = await service.list(user.id);
        return { data: keys.map(toDTO) };
      },
    );

    app.delete(
      "/keys/:id",
      {
        schema: {
          params: apiKeyParamsSchema,
          response: {
            204: z.undefined(),
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = requireJwtSession(request);
        await service.revoke(user.id, request.params.id);
        return reply.code(204).send();
      },
    );
  };
}
