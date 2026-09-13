import { describe, expect, it } from "vitest";
import { hashVisitor } from "../../src/lib/visitor-hash";

const BASE = {
  ip: "203.0.113.10",
  userAgent: "Mozilla/5.0 Chrome/120",
  linkId: "link-1",
  secret: "test-visitor-secret",
};

describe("hashVisitor", () => {
  it("is deterministic for the same input", () => {
    expect(hashVisitor(BASE)).toBe(hashVisitor({ ...BASE }));
  });

  it("changes per link, so hashes cannot be joined across links", () => {
    expect(hashVisitor(BASE)).not.toBe(hashVisitor({ ...BASE, linkId: "link-2" }));
  });

  it("changes with the user agent", () => {
    expect(hashVisitor(BASE)).not.toBe(
      hashVisitor({ ...BASE, userAgent: "Mozilla/5.0 Safari/605" }),
    );
  });

  it("changes when the secret rotates", () => {
    expect(hashVisitor(BASE)).not.toBe(hashVisitor({ ...BASE, secret: "rotated-secret" }));
  });

  it("handles missing ip and user agent", () => {
    const hash = hashVisitor({ ...BASE, ip: null, userAgent: undefined });
    expect(hash).toHaveLength(32);
  });
});
