import type { preHandlerHookHandler } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { errorResponseSchema } from "../../schemas";
import { getAuthenticatedUser } from "./auth.middleware";
import {
  authResponseSchema,
  authTokensSchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  userSchema,
} from "./auth.schemas";
import type { AuthService } from "./auth.service";

export interface AuthRateLimitOptions {
  max: number;
  timeWindow: number;
}

export function authRoutes(
  service: AuthService,
  guard: preHandlerHookHandler,
  rateLimits?: AuthRateLimitOptions,
): FastifyPluginAsyncZod {
  const routeConfig = rateLimits ? { rateLimit: rateLimits } : undefined;

  return async (app) => {
    app.post(
      "/auth/register",
      {
        config: routeConfig,
        schema: {
          body: registerBodySchema,
          response: {
            201: authResponseSchema,
            400: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await service.register(request.body);
        return reply.code(201).send(session);
      },
    );

    app.post(
      "/auth/login",
      {
        config: routeConfig,
        schema: {
          body: loginBodySchema,
          response: {
            200: authResponseSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request) => service.login(request.body),
    );

    app.post(
      "/auth/refresh",
      {
        config: routeConfig,
        schema: {
          body: refreshBodySchema,
          response: {
            200: authTokensSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request) => service.refresh(request.body.refreshToken),
    );

    app.post(
      "/auth/logout",
      {
        schema: {
          body: refreshBodySchema,
          response: {
            204: z.undefined().describe("Refresh token revoked"),
          },
        },
      },
      async (request, reply) => {
        await service.logout(request.body.refreshToken);
        return reply.code(204).send();
      },
    );

    app.get(
      "/auth/me",
      {
        preHandler: guard,
        schema: {
          response: {
            200: userSchema,
            401: errorResponseSchema,
          },
        },
      },
      async (request) => service.getUser(getAuthenticatedUser(request).id),
    );
  };
}
