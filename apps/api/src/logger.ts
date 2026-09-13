import type { FastifyBaseLogger } from "fastify";
import pino from "pino";
import type { AppConfig } from "./config";

/**
 * Structured logger shared by the API and the worker. Secrets are redacted so
 * they can never leak into logs.
 */
export function createLogger(
  config: AppConfig,
  service: "api" | "worker",
): FastifyBaseLogger {
  // Fastify's FastifyBaseLogger is structurally compatible with pino's logger
  // but its published types omit pino's `msgPrefix`, hence the cast.
  return pino({
    name: service,
    base: { service },
    level: config.nodeEnv === "production" ? "info" : "debug",
    redact: {
      paths: [
        "req.headers.authorization",
        'req.headers["x-api-key"]',
        'req.headers["cookie"]',
        'res.headers["set-cookie"]',
        "headers.authorization",
        'headers["x-api-key"]',
        "password",
        "refreshToken",
        "accessToken",
        "key",
      ],
      censor: "[redacted]",
    },
    ...(config.nodeEnv === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : {}),
  }) as unknown as FastifyBaseLogger;
}
