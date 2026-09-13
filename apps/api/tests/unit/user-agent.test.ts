import { describe, expect, it } from "vitest";
import { parseUserAgent } from "../../src/modules/analytics/user-agent";

const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

describe("parseUserAgent", () => {
  it("classifies a desktop browser", () => {
    expect(parseUserAgent(DESKTOP_CHROME)).toEqual({
      device: "desktop",
      browser: "Chrome",
    });
  });

  it("classifies an Android phone as mobile", () => {
    const parsed = parseUserAgent(ANDROID_PHONE);
    expect(parsed.device).toBe("mobile");
    expect(parsed.browser).toBe("Chrome");
  });

  it("classifies an iPhone as mobile", () => {
    const parsed = parseUserAgent(IPHONE);
    expect(parsed.device).toBe("mobile");
    expect(parsed.browser.length).toBeGreaterThan(0);
  });

  it("classifies an iPad as tablet", () => {
    const parsed = parseUserAgent(IPAD);
    expect(parsed.device).toBe("tablet");
  });

  it("classifies common bots", () => {
    expect(parseUserAgent("curl/8.4.0").device).toBe("bot");
    expect(parseUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)").device).toBe(
      "bot",
    );
    expect(
      parseUserAgent("Mozilla/5.0 HeadlessChrome/120.0.0.0 Safari/537.36").device,
    ).toBe("bot");
  });

  it("treats a missing user agent as other", () => {
    expect(parseUserAgent(null)).toEqual({ device: "other", browser: "Unknown" });
    expect(parseUserAgent("  ")).toEqual({ device: "other", browser: "Unknown" });
  });

  it("falls back to desktop/Other for unrecognised agents", () => {
    expect(parseUserAgent("something-weird/1.0")).toEqual({
      device: "desktop",
      browser: "Other",
    });
  });
});
