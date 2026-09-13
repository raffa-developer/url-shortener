import { z } from "zod";
import {
  CUSTOM_ALIAS_PATTERN,
  SHORT_CODE_MAX_LENGTH,
  SHORT_CODE_MIN_LENGTH,
} from "@url-shortener/shared";

export const linkSchema = z.object({
  id: z.string(),
  shortCode: z.string(),
  shortUrl: z.url(),
  destinationUrl: z.url(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  clickCount: z.number().int(),
});

export const createLinkBodySchema = z.object({
  destinationUrl: z.string().trim().min(1).max(2048),
  customAlias: z
    .string()
    .trim()
    .min(SHORT_CODE_MIN_LENGTH)
    .max(SHORT_CODE_MAX_LENGTH)
    .regex(
      CUSTOM_ALIAS_PATTERN,
      "Custom alias may only contain letters, numbers, hyphens and underscores",
    )
    .optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const linkStatusFilterSchema = z
  .enum(["all", "active", "expiring", "expired"])
  .default("all");

export const linkSortSchema = z
  .enum(["newest", "oldest", "clicks", "expires"])
  .default("newest");

export const listLinksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  status: linkStatusFilterSchema,
  sort: linkSortSchema,
});

export const updateLinkBodySchema = z
  .object({
    destinationUrl: z.string().trim().min(1).max(2048).optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine(
    (value) => value.destinationUrl !== undefined || value.expiresAt !== undefined,
    { message: "Provide destinationUrl and/or expiresAt" },
  );

export const linkPreviewSchema = z.object({
  url: z.url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  image: z.url().nullable(),
  siteName: z.string().nullable(),
});

export const shortCodeParamsSchema = z.object({
  shortCode: z.string().min(1).max(64),
});

export type LinkResponse = z.infer<typeof linkSchema>;
export type CreateLinkBody = z.infer<typeof createLinkBodySchema>;
export type UpdateLinkBody = z.infer<typeof updateLinkBodySchema>;
export type ListLinksQuery = z.infer<typeof listLinksQuerySchema>;
export type LinkPreviewResponse = z.infer<typeof linkPreviewSchema>;
