import { randomBytes } from "node:crypto";
import { sha256Hex } from "./hash";

export interface GeneratedToken {
  token: string;
  tokenHash: string;
}

/** Opaque single-use token; only its SHA-256 hash is persisted. */
export function generateOpaqueToken(): GeneratedToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256Hex(token) };
}
