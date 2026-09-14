import { describe, expect, it } from "vitest";
import { domainFromUrl, faviconUrl, normalizeDomain } from "./favicon";
import { countryFlag } from "./flags";

describe("countryFlag", () => {
  it("converts ISO codes to flag emoji", () => {
    expect(countryFlag("PT")).toBe("🇵🇹");
    expect(countryFlag("pt")).toBe("🇵🇹");
    expect(countryFlag("US")).toBe("🇺🇸");
  });

  it("returns null for unknown or malformed values", () => {
    expect(countryFlag("Unknown")).toBeNull();
    expect(countryFlag("USA")).toBeNull();
    expect(countryFlag("")).toBeNull();
    expect(countryFlag(null)).toBeNull();
  });
});

describe("favicon", () => {
  it("builds a favicon URL and strips www", () => {
    expect(faviconUrl("google.com")).toBe(
      "https://icons.duckduckgo.com/ip3/google.com.ico",
    );
    expect(faviconUrl("www.google.com")).toBe(
      "https://icons.duckduckgo.com/ip3/google.com.ico",
    );
  });

  it("rejects non-domain sources such as direct", () => {
    expect(faviconUrl("direct")).toBeNull();
    expect(faviconUrl(null)).toBeNull();
  });

  it("normalises domains", () => {
    expect(normalizeDomain("  News.YCombinator.com ")).toBe("news.ycombinator.com");
    expect(normalizeDomain("no-tld")).toBeNull();
  });

  it("extracts the domain from a URL", () => {
    expect(domainFromUrl("https://news.ycombinator.com/item?id=1")).toBe(
      "news.ycombinator.com",
    );
    expect(domainFromUrl("not a url")).toBeNull();
  });
});
