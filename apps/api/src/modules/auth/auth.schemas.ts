import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export const loginBodySchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const tokenBodySchema = z.object({
  token: z.string().min(20).max(512),
});

export const forgotPasswordBodySchema = z.object({
  email: z.email().max(254),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(512),
  password: z.string().min(8).max(128),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int(),
});

export const authResponseSchema = authTokensSchema.extend({
  user: userSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type UserDTO = z.infer<typeof userSchema>;
export type AuthTokensDTO = z.infer<typeof authTokensSchema>;
export type AuthResponseDTO = z.infer<typeof authResponseSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
