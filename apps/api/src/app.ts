import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { RateLimitedError } from "@url-shortener/shared";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import Redis from "ioredis";
import { createRedisRedirectCache } from "./cache/redirect-cache";
import type { AppConfig } from "./config";
import type { Database } from "./db";
import { createLogger } from "./logger";
import { sha256Hex } from "./lib/hash";
import { createAuthGuard } from "./modules/auth/auth.middleware";
import { authRoutes } from "./modules/auth/auth.routes";
import { AuthService } from "./modules/auth/auth.service";
import { RefreshTokenRepository } from "./modules/auth/refresh-token.repository";
import { TokenService } from "./modules/auth/token.service";
import { apiKeyRoutes } from "./modules/api-keys/api-key.routes";
import { ApiKeyRepository } from "./modules/api-keys/api-key.repository";
import { ApiKeyService } from "./modules/api-keys/api-key.service";
import { analyticsRoutes } from "./modules/analytics/analytics.routes";
import { AnalyticsService } from "./modules/analytics/analytics.service";
import { ClickRepository } from "./modules/analytics/click.repository";
import { LinkRepository } from "./modules/links/link.repository";
import { linkRoutes } from "./modules/links/link.routes";
import { LinkService } from "./modules/links/link.service";
import { redirectRoutes } from "./modules/redirects/redirect.routes";
import { RedirectService } from "./modules/redirects/redirect.service";
import { UserRepository } from "./modules/users/user.repository";
import { registerErrorHandler } from "./plugins/error-handler";
import { healthRoutes } from "./plugins/health";
import { createRedisClickEventPublisher } from "./queue/click-events";

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
}

export async function buildApp({ config, db }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    ...(config.nodeEnv === "test"
      ? { logger: false as const }
      : { loggerInstance: createLogger(config, "api") }),
    trustProxy: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(cors, { origin: true });

  if (config.apiDocsEnabled) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "URL Shortener & Analytics API",
          description:
            "Shorten links, manage them and explore click analytics. " +
            "Authenticated endpoints accept either `Authorization: Bearer <access token>` " +
            "or `X-API-Key: sk_...`.",
          version: "0.1.0",
        },
        servers: [{ url: config.baseUrl }],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: { docExpansion: "list", deepLinking: true },
    });
  }

  if (config.rateLimitEnabled) {
    const rateLimitRedis = new Redis(config.redisUrl ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    rateLimitRedis.on("error", (error) =>
      app.log.warn({ err: error }, "Rate limit store error"),
    );
    app.addHook("onClose", async () => {
      rateLimitRedis.disconnect();
    });

    await app.register(rateLimit, {
      global: true,
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindowSeconds * 1000,
      redis: rateLimitRedis,
      nameSpace: config.rateLimitNamespace,
      // If Redis is unavailable, allow requests rather than failing closed.
      skipOnError: true,
      allowList: (request) =>
        request.url.startsWith("/health") || request.url.startsWith("/docs"),
      keyGenerator: (request) => {
        const apiKeyHeader = request.headers["x-api-key"];
        const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
        if (apiKey) {
          // Never store raw credentials in Redis keys.
          return `apikey:${sha256Hex(apiKey).slice(0, 16)}`;
        }
        return `ip:${request.ip}`;
      },
      errorResponseBuilder: (_request, context) =>
        new RateLimitedError("Too many requests — please slow down", {
          limit: context.max,
          retryAfterMs: context.ttl,
        }),
    });
  }

  const userRepository = new UserRepository(db);
  const refreshTokenRepository = new RefreshTokenRepository(db);
  const apiKeyRepository = new ApiKeyRepository(db);
  const tokenService = new TokenService(config);
  const authService = new AuthService(
    userRepository,
    refreshTokenRepository,
    tokenService,
    config,
  );
  const apiKeyService = new ApiKeyService(apiKeyRepository);
  const guard = createAuthGuard(tokenService, apiKeyService);

  const linkRepository = new LinkRepository(db);
  const linkService = new LinkService(linkRepository, config);

  const clickRepository = new ClickRepository(db);
  const analyticsService = new AnalyticsService(clickRepository, linkService);

  const redirectCache =
    config.redirectCacheEnabled && config.redisUrl
      ? createRedisRedirectCache(config.redisUrl, {
          onError: (error) => app.log.warn({ err: error }, "Redirect cache error"),
        })
      : null;

  if (redirectCache) {
    app.addHook("onClose", async () => {
      await redirectCache.close();
    });
  }

  const redirectService = new RedirectService(linkService, redirectCache, config, {
    onCacheError: (error) => app.log.warn({ err: error }, "Redirect cache unavailable"),
  });

  const clickEventPublisher =
    config.clickEventsEnabled && config.redisUrl
      ? createRedisClickEventPublisher(config.redisUrl, {
          streamKey: config.clickEventStreamKey,
          onError: (error) => app.log.warn({ err: error }, "Click event publisher error"),
        })
      : null;

  if (clickEventPublisher) {
    app.addHook("onClose", async () => {
      await clickEventPublisher.close();
    });
  }

  await app.register(healthRoutes(db));
  await app.register(
    authRoutes(authService, guard, {
      max: config.authRateLimitMax,
      timeWindow: config.rateLimitWindowSeconds * 1000,
    }),
    { prefix: "/api" },
  );
  await app.register(apiKeyRoutes(apiKeyService, guard), { prefix: "/api" });
  await app.register(linkRoutes(linkService, guard), { prefix: "/api" });
  await app.register(analyticsRoutes(analyticsService, guard), { prefix: "/api" });
  await app.register(redirectRoutes(
    redirectService,
    analyticsService,
    clickEventPublisher,
    config.geoipFallbackCountry,
  ));

  return app;
}
