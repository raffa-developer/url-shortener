import { hash, verify } from "@node-rs/argon2";

/**
 * OWASP-recommended Argon2id parameters. `@node-rs/argon2` defaults to the
 * Argon2id algorithm; these options set the cost factors explicitly.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
