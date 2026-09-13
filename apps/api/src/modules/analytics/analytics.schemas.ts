import { z } from "zod";

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const analyticsResponseSchema = z.object({
  link: z.object({
    id: z.string(),
    shortCode: z.string(),
    shortUrl: z.url(),
    destinationUrl: z.url(),
  }),
  range: z.object({
    days: z.number().int(),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
  totalClicks: z.number().int(),
  today: z.number().int(),
  yesterday: z.number().int(),
  clicksPerDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
  countries: z.array(z.object({ country: z.string(), count: z.number().int() })),
  devices: z.array(z.object({ device: z.string(), count: z.number().int() })),
  browsers: z.array(z.object({ browser: z.string(), count: z.number().int() })),
  referrers: z.array(z.object({ source: z.string(), count: z.number().int() })),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
