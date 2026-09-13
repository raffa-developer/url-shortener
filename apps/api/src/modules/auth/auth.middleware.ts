import { UnauthorizedError } from "@url-shortener/shared";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { TokenService } from "./token.service";

const BEARER_PREFIX = "bearer ";

export interface AuthenticatedUser {
  id: string;
  authType: "jwt" | "api_key";
  apiKeyId?: string;
}

/** Structural interface so this module does not depend on the API key module. */
export interface ApiKeyAuthenticator {
  authenticate(plaintext: string): Promise<{ userId: string; apiKeyId: string }>;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createAuthGuard(
  tokens: TokenService,
  apiKeys?: ApiKeyAuthenticator,
): preHandlerHookHandler {
  return async (request) => {
    const providedApiKey = firstHeader(request.headers["x-api-key"]);
    if (providedApiKey) {
      if (!apiKeys) {
        throw new UnauthorizedError("API key authentication is not enabled");
      }
      try {
        const result = await apiKeys.authenticate(providedApiKey);
        request.user = {
          id: result.userId,
          authType: "api_key",
          apiKeyId: result.apiKeyId,
        };
        return;
      } catch {
        throw new UnauthorizedError("Invalid API key");
      }
    }

    const header = request.headers.authorization;
    if (!header || !header.toLowerCase().startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedError("Missing credentials");
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    try {
      request.user = {
        id: await tokens.verifyAccessToken(token),
        authType: "jwt",
      };
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
  };
}

export function getAuthenticatedUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) {
    throw new UnauthorizedError();
  }
  return request.user;
}
