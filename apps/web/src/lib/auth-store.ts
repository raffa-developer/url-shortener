import { useSyncExternalStore } from "react";
import type { AuthSession, AuthTokens, AuthUser } from "./types";

const REFRESH_TOKEN_KEY = "url-shortener.refresh-token";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
}

function readStoredRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

let state: AuthState = {
  status: readStoredRefreshToken() ? "loading" : "anonymous",
  user: null,
  accessToken: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

export function getStoredRefreshToken(): string | null {
  return readStoredRefreshToken();
}

export function setSession(session: AuthSession): void {
  window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  state = {
    status: "authenticated",
    user: session.user,
    accessToken: session.accessToken,
  };
  emit();
}

export function updateTokens(tokens: AuthTokens): void {
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  state = { ...state, accessToken: tokens.accessToken };
  emit();
}

export function setUser(user: AuthUser): void {
  state = { ...state, status: "authenticated", user };
  emit();
}

export function clearSession(): void {
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  state = { status: "anonymous", user: null, accessToken: null };
  emit();
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}
