import { z } from "zod";

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(64),
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeySchema,
  key: z.string(),
});

export const apiKeyParamsSchema = z.object({
  id: z.string().min(1).max(64),
});

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
