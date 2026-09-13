import { promises as dns } from "node:dns";
import {
  PREVIEW_CACHE_TTL_SECONDS,
  type LinkPreview,
  type PreviewCache,
} from "../../cache/preview-cache";
import { isPrivateIp } from "../../lib/ip";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const USER_AGENT =
  "ShortlyPreviewBot/0.1 (+https://github.com/raffa-developer/url-shortener)";

export type HostLookup = (hostname: string) => Promise<string[]>;

export interface LinkPreviewServiceOptions {
  fetchImpl?: typeof fetch;
  lookup?: HostLookup;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  cacheTtlSeconds?: number;
  onError?: (error: unknown) => void;
}

const defaultLookup: HostLookup = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

function sanitize(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function truncate(value: string | null, max: number): string | null {
  if (!value) {
    return null;
  }
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ? decodeEntities(match[1]) : null;
}

function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  const metaPattern = /<meta\b[^>]*>/gi;
  const attributePattern =
    /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  for (const tag of html.match(metaPattern) ?? []) {
    const attributes = new Map<string, string>();
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(tag)) !== null) {
      const name = attribute[1]?.toLowerCase();
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
      if (name && !attributes.has(name)) {
        attributes.set(name, value);
      }
    }

    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (key && content !== undefined && !tags.has(key)) {
      tags.set(key, content);
    }
  }

  return tags;
}

function resolveImage(candidate: string | undefined, baseUrl: string): string | null {
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(candidate, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

/** Extracts an Open Graph/Twitter/HTML preview from a fetched document. */
export function parseLinkPreview(html: string, baseUrl: string): LinkPreview {
  const meta = metaTags(html);

  const title = sanitize(
    decodeEntities(
      meta.get("og:title") ??
        meta.get("twitter:title") ??
        firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ??
        "",
    ),
  );
  const description = sanitize(
    decodeEntities(
      meta.get("og:description") ??
        meta.get("twitter:description") ??
        meta.get("description") ??
        "",
    ),
  );

  return {
    url: baseUrl,
    title: truncate(title, 200),
    description: truncate(description, 400),
    image: resolveImage(meta.get("og:image") ?? meta.get("twitter:image"), baseUrl),
    siteName: truncate(sanitize(decodeEntities(meta.get("og:site_name") ?? "")), 100),
  };
}

export class LinkPreviewService {
  private readonly fetchImpl: typeof fetch;
  private readonly lookup: HostLookup;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly cacheTtlSeconds: number;
  private readonly onError?: (error: unknown) => void;

  constructor(
    private readonly cache: PreviewCache | null,
    options: LinkPreviewServiceOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.lookup = options.lookup ?? defaultLookup;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? PREVIEW_CACHE_TTL_SECONDS;
    this.onError = options.onError;
  }

  async getPreview(shortCode: string, destinationUrl: string): Promise<LinkPreview> {
    if (this.cache) {
      try {
        const cached = await this.cache.get(shortCode);
        if (cached) {
          return cached;
        }
      } catch (error) {
        this.onError?.(error);
      }
    }

    const fetched = await this.buildPreview(destinationUrl);
    if (!fetched) {
      return {
        url: destinationUrl,
        title: null,
        description: null,
        image: null,
        siteName: null,
      };
    }

    if (this.cache) {
      try {
        await this.cache.set(shortCode, fetched, this.cacheTtlSeconds);
      } catch (error) {
        this.onError?.(error);
      }
    }

    return fetched;
  }

  private async buildPreview(destinationUrl: string): Promise<LinkPreview | null> {
    const result = await this.fetchHtml(destinationUrl);
    if (!result) {
      return null;
    }
    return parseLinkPreview(result.html, result.url);
  }

  /** Guarded, manual-redirect fetch: http(s) only, public hosts only. */
  private async fetchHtml(
    startUrl: string,
  ): Promise<{ html: string; url: string } | null> {
    let current = startUrl;

    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      if (!(await this.isFetchable(current))) {
        return null;
      }

      let response: Response;
      try {
        response = await this.fetchImpl(current, {
          redirect: "manual",
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml",
          },
        });
      } catch (error) {
        this.onError?.(error);
        return null;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return null;
        }
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.includes("text/html")) {
        return null;
      }

      const html = await this.readCapped(response);
      if (!html) {
        return null;
      }

      return { html, url: current };
    }

    return null;
  }

  private async isFetchable(raw: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    let addresses: string[];
    try {
      addresses = await this.lookup(hostname);
    } catch {
      return false;
    }

    return addresses.length > 0 && addresses.every((address) => !isPrivateIp(address));
  }

  private async readCapped(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      return "";
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= this.maxBytes) {
          await reader.cancel();
          break;
        }
      }
    }

    return Buffer.concat(chunks).toString("utf8");
  }
}
