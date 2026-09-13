import {
  clearSession,
  getAccessToken,
  getStoredRefreshToken,
  setUser,
  updateTokens,
} from "./auth-store";
import type { AuthSession, AuthTokens, AuthUser } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiRequestOptions extends RequestInit {
  /** Skips the Authorization header and the refresh-and-retry flow. */
  skipAuth?: boolean;
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "INTERNAL";
  let message = `Request failed with status ${response.status}`;
  let details: unknown;

  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (payload.error) {
      code = payload.error.code ?? code;
      message = payload.error.message ?? message;
      details = payload.error.details;
    }
  } catch {
    // Response had no JSON body; keep the fallback message.
  }

  return new ApiError(response.status, code, message, details);
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      return false;
    }
    updateTokens((await response.json()) as AuthTokens);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
  canRetry = true,
): Promise<T> {
  const { skipAuth = false, headers: rawHeaders, ...rest } = options;
  const headers = new Headers(rawHeaders);

  if (!skipAuth) {
    const accessToken = getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (response.status === 401 && canRetry && !skipAuth && getStoredRefreshToken()) {
    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    if (await refreshInFlight) {
      return apiFetch<T>(path, options, false);
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function login(email: string, password: string): Promise<AuthSession> {
  return apiFetch<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
}

export function register(email: string, password: string): Promise<AuthSession> {
  return apiFetch<AuthSession>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
}

export function revokeRefreshToken(refreshToken: string): Promise<void> {
  return apiFetch<void>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
    skipAuth: true,
  });
}

let bootstrapInFlight: Promise<void> | null = null;

/**
 * Restores a session on page load: exchanges the stored refresh token for a
 * new access token, then loads the current user. Guarded by a module-level
 * promise so React StrictMode's double effect does not rotate the token twice.
 */
export function bootstrapSession(): Promise<void> {
  bootstrapInFlight ??= (async () => {
    if (!getStoredRefreshToken()) {
      clearSession();
      return;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      clearSession();
      return;
    }

    try {
      setUser(await apiFetch<AuthUser>("/api/auth/me"));
    } catch {
      clearSession();
    }
  })();

  return bootstrapInFlight;
}
