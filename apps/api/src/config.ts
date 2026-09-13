import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  APP_BASE_URL: z.string().min(1).default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  REDIRECT_CACHE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  REDIRECT_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(3600),
  CLICK_EVENTS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  CLICK_EVENT_STREAM_KEY: z.string().min(1).max(128).default("clicks:events"),
  GEOIP_FALLBACK_COUNTRY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  ),
  RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_NAMESPACE: z.string().min(1).default("rl:"),
  API_DOCS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SHORT_CODE_LENGTH: z.coerce.number().int().min(4).max(16).default(7),
  SHORT_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  baseUrl: string;
  databaseUrl: string;
  redisUrl?: string;
  redirectCacheEnabled: boolean;
  redirectCacheTtlSeconds: number;
  clickEventsEnabled: boolean;
  clickEventStreamKey: string;
  geoipFallbackCountry?: string;
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
  authRateLimitMax: number;
  rateLimitNamespace: string;
  apiDocsEnabled: boolean;
  shortCodeLength: number;
  shortCodeMaxAttempts: number;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration -> ${details}`);
  }

  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    baseUrl: env.APP_BASE_URL.replace(/\/+$/, ""),
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    redirectCacheEnabled: env.REDIRECT_CACHE_ENABLED,
    redirectCacheTtlSeconds: env.REDIRECT_CACHE_TTL_SECONDS,
    clickEventsEnabled: env.CLICK_EVENTS_ENABLED,
    clickEventStreamKey: env.CLICK_EVENT_STREAM_KEY,
    geoipFallbackCountry: env.GEOIP_FALLBACK_COUNTRY,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
    rateLimitNamespace: env.RATE_LIMIT_NAMESPACE,
    apiDocsEnabled: env.API_DOCS_ENABLED,
    shortCodeLength: env.SHORT_CODE_LENGTH,
    shortCodeMaxAttempts: env.SHORT_CODE_MAX_ATTEMPTS,
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  };
}
