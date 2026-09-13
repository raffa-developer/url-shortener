export const SHORT_CODE_MIN_LENGTH = 3;
export const SHORT_CODE_MAX_LENGTH = 32;

export const CUSTOM_ALIAS_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Aliases that would collide with application routes or static assets.
 * Custom aliases matching any of these are rejected before hitting the DB.
 */
export const RESERVED_SHORT_CODES: ReadonlySet<string> = new Set([
  "api",
  "health",
  "healthz",
  "ready",
  "metrics",
  "admin",
  "login",
  "logout",
  "register",
  "signup",
  "dashboard",
  "analytics",
  "links",
  "static",
  "assets",
  "favicon.ico",
  "robots.txt",
]);

export function isValidCustomAlias(alias: string): boolean {
  return (
    alias.length >= SHORT_CODE_MIN_LENGTH &&
    alias.length <= SHORT_CODE_MAX_LENGTH &&
    CUSTOM_ALIAS_PATTERN.test(alias)
  );
}

export function isReservedShortCode(code: string): boolean {
  return RESERVED_SHORT_CODES.has(code.toLowerCase());
}
