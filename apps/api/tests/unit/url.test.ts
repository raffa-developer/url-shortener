import { describe, expect, it } from "vitest";
import { isValidHttpUrl, normalizeUrl } from "@url-shortener/shared";

describe("normalizeUrl", () => {
  it("prepends https when no scheme is present", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("example.com/path?x=1")).toBe("https://example.com/path?x=1");
  });

  it("keeps existing http(s) schemes", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  https://example.com  ")).toBe("https://example.com/");
  });

  it("rejects unsupported schemes", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow(RangeError);
    expect(() => normalizeUrl("javascript://alert(1)")).toThrow(RangeError);
  });

  it("rejects empty input", () => {
    expect(() => normalizeUrl("   ")).toThrow(RangeError);
  });
});

describe("isValidHttpUrl", () => {
  it("returns a boolean instead of throwing", () => {
    expect(isValidHttpUrl("example.com")).toBe(true);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
  });
});
