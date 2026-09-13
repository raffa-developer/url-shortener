import { sha256Hex } from "./hash";

export interface VisitorHashInput {
  ip: string | null | undefined;
  userAgent: string | null | undefined;
  linkId: string;
  secret: string;
}

/**
 * Pseudonymous visitor id: salted hash of IP + user agent, scoped to a link.
 *
 * No raw IP is stored, hashes cannot be joined across links, and rotating
 * `VISITOR_HASH_SECRET` invalidates all historical linkage.
 */
export function hashVisitor(input: VisitorHashInput): string {
  return sha256Hex(
    [input.secret, input.linkId, input.ip ?? "", input.userAgent ?? ""].join("|"),
  ).slice(0, 32);
}
