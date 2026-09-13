import type { FastifyInstance } from "fastify";
import { AppError } from "@url-shortener/shared";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request does not match the schema",
          details: error.validation,
        },
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, "Response serialization failed");
      return reply.code(500).send({
        error: { code: "INTERNAL", message: "Response serialization failed" },
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toPayload());
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    const message = error instanceof Error ? error.message : "Unknown error";
    if (typeof statusCode === "number" && statusCode < 500) {
      return reply.code(statusCode).send({
        error: { code: "VALIDATION_ERROR", message },
      });
    }

    request.log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({
      error: { code: "INTERNAL", message: "Internal server error" },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}
