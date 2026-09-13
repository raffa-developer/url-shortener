import { UAParser } from "ua-parser-js";

export type DeviceType = "desktop" | "mobile" | "tablet" | "bot" | "other";

export interface ParsedUserAgent {
  device: DeviceType;
  browser: string;
}

const BOT_PATTERN =
  /\b(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|curl|wget|python-requests|axios|headlesschrome)\b/i;

function normalizeBrowser(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "Other";
  }
  // ua-parser-js reports "Mobile Chrome" / "Mobile Safari"; collapse to the
  // canonical browser name so device and browser stay independent dimensions.
  return trimmed.replace(/^Mobile\s+/i, "");
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (!userAgent || userAgent.trim().length === 0) {
    return { device: "other", browser: "Unknown" };
  }

  const parser = new UAParser(userAgent);
  const browser = normalizeBrowser(parser.getBrowser().name);

  if (BOT_PATTERN.test(userAgent)) {
    return { device: "bot", browser };
  }

  switch (parser.getDevice().type) {
    case "tablet":
      return { device: "tablet", browser };
    case "mobile":
      return { device: "mobile", browser };
    case "smarttv":
    case "console":
    case "wearable":
    case "xr":
    case "embedded":
      return { device: "other", browser };
    default:
      return { device: "desktop", browser };
  }
}
