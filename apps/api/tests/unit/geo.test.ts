import { describe, expect, it } from "vitest";
import {
  isPrivateIp,
  resolveCountry,
  resolveCountryFromHeaders,
} from "../../src/modules/analytics/geo";

describe("resolveCountryFromHeaders", () => {
  it("reads the Cloudflare header", () => {
    expect(resolveCountryFromHeaders({ "cf-ipcountry": "pt" })).toBe("PT");
  });

  it("falls back to Vercel and generic headers", () => {
    expect(resolveCountryFromHeaders({ "x-vercel-ip-country": "US" })).toBe("US");
    expect(resolveCountryFromHeaders({ "x-geo-country": "gb" })).toBe("GB");
    expect(resolveCountryFromHeaders({ "x-country-code": "DE" })).toBe("DE");
  });

  it("prefers the first present header", () => {
    expect(
      resolveCountryFromHeaders({ "cf-ipcountry": "PT", "x-vercel-ip-country": "US" }),
    ).toBe("PT");
  });

  it("uses the first value when the header is repeated", () => {
    expect(resolveCountryFromHeaders({ "cf-ipcountry": ["FR", "US"] })).toBe("FR");
  });

  it("ignores unknown sentinel codes", () => {
    expect(resolveCountryFromHeaders({ "cf-ipcountry": "XX" })).toBeNull();
    expect(resolveCountryFromHeaders({ "cf-ipcountry": "T1" })).toBeNull();
  });

  it("ignores malformed values and tries the next header", () => {
    expect(
      resolveCountryFromHeaders({ "cf-ipcountry": "Portugal", "x-vercel-ip-country": "ES" }),
    ).toBe("ES");
  });

  it("returns null when no header is present", () => {
    expect(resolveCountryFromHeaders({})).toBeNull();
  });
});

describe("isPrivateIp", () => {
  it("detects loopback and private ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.10.10")).toBe(true);
    expect(isPrivateIp(null)).toBe(true);
  });

  it("treats public addresses as public", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });
});

describe("resolveCountry", () => {
  it("prefers a CDN header over everything else", () => {
    expect(
      resolveCountry({
        headers: { "cf-ipcountry": "PT" },
        ip: "8.8.8.8",
        fallbackCountry: "FR",
      }),
    ).toBe("PT");
  });

  it("resolves a public IP through the local GeoIP database", () => {
    expect(resolveCountry({ headers: {}, ip: "8.8.8.8" })).toBe("US");
  });

  it("uses the fallback only for private IPs", () => {
    expect(
      resolveCountry({ headers: {}, ip: "127.0.0.1", fallbackCountry: "PT" }),
    ).toBe("PT");
  });

  it("does not use the fallback for public IPs that GeoIP cannot resolve", () => {
    // 203.0.113.0/24 is TEST-NET-3, never present in the database.
    expect(
      resolveCountry({ headers: {}, ip: "203.0.113.7", fallbackCountry: "PT" }),
    ).toBeNull();
  });

  it("returns null when nothing is available", () => {
    expect(resolveCountry({ headers: {}, ip: "127.0.0.1" })).toBeNull();
  });
});
