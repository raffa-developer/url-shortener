import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../db";

export function healthRoutes(db: Database): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/health",
      {
        schema: {
          response: {
            200: z.object({
              status: z.literal("ok"),
              uptime: z.number(),
            }),
          },
        },
      },
      async () => ({ status: "ok" as const, uptime: process.uptime() }),
    );

    app.get(
      "/health/ready",
      {
        schema: {
          response: {
            200: z.object({ status: z.literal("ready"), database: z.literal("up") }),
            503: z.object({ status: z.literal("unavailable"), database: z.literal("down") }),
          },
        },
      },
      async (_request, reply) => {
        try {
          await db.$queryRaw`SELECT 1`;
          return { status: "ready" as const, database: "up" as const };
        } catch {
          return reply
            .code(503)
            .send({ status: "unavailable" as const, database: "down" as const });
        }
      },
    );
  };
}
