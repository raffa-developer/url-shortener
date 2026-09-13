import { describe, expect, it, vi } from "vitest";
import type { LinkPreview, PreviewCache } from "../../src/cache/preview-cache";
import {
  LinkPreviewService,
  parseLinkPreview,
} from "../../src/modules/links/link-preview.service";

const PUBLIC_ADDRESS = "93.184.216.34";

function publicLookup(): Promise<string[]> {
  return Promise.resolve([PUBLIC_ADDRESS]);
}

class FakePreviewCache implements PreviewCache {
  entries = new Map<string, LinkPreview>();
  setCalls: { shortCode: string; value: LinkPreview; ttlSeconds: number }[] = [];

  async get(shortCode: string): Promise<LinkPreview | null> {
    return this.entries.get(shortCode) ?? null;
  }

  async set(shortCode: string, value: LinkPreview, ttlSeconds: number): Promise<void> {
    this.setCalls.push({ shortCode, value, ttlSeconds });
    this.entries.set(shortCode, value);
  }

  async delete(shortCode: string): Promise<void> {
    this.entries.delete(shortCode);
  }

  async close(): Promise<void> {}
}

function htmlResponse(
  html: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(html, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", ...init.headers },
  });
}

describe("parseLinkPreview", () => {
  it("parses Open Graph tags", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Spring launch" />
        <meta property="og:description" content="Everything new this season" />
        <meta property="og:image" content="https://cdn.example.com/og.png" />
        <meta property="og:site_name" content="Example" />
      </head></html>`;

    expect(parseLinkPreview(html, "https://example.com/page")).toEqual({
      url: "https://example.com/page",
      title: "Spring launch",
      description: "Everything new this season",
      image: "https://cdn.example.com/og.png",
      siteName: "Example",
    });
  });

  it("falls back to Twitter tags and then the title element", () => {
    const html = `
      <head>
        <meta name="twitter:title" content="Twitter title" />
        <meta name="description" content="Plain description" />
        <title>Document title</title>
      </head>`;

    const preview = parseLinkPreview(html, "https://example.com/");
    expect(preview.title).toBe("Twitter title");
    expect(preview.description).toBe("Plain description");
  });

  it("handles reversed attribute order and single quotes", () => {
    const html = `<meta content='Reversed' property='og:title'>`;
    expect(parseLinkPreview(html, "https://example.com/").title).toBe("Reversed");
  });

  it("decodes HTML entities", () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry &#39;show&#39;">`;
    expect(parseLinkPreview(html, "https://example.com/").title).toBe(
      "Tom & Jerry 'show'",
    );
  });

  it("resolves relative images and rejects javascript: images", () => {
    const relative = `<meta property="og:image" content="/img/og.png">`;
    expect(parseLinkPreview(relative, "https://example.com/page").image).toBe(
      "https://example.com/img/og.png",
    );

    const script = `<meta property="og:image" content="javascript:alert(1)">`;
    expect(parseLinkPreview(script, "https://example.com/").image).toBeNull();
  });

  it("returns nulls when there is nothing to parse", () => {
    const preview = parseLinkPreview("<html><body>hi</body></html>", "https://e.com/");
    expect(preview.title).toBeNull();
    expect(preview.description).toBeNull();
    expect(preview.image).toBeNull();
    expect(preview.siteName).toBeNull();
  });
});

describe("LinkPreviewService", () => {
  it("fetches, parses and caches a preview", async () => {
    const cache = new FakePreviewCache();
    const fetchImpl = vi.fn(async () =>
      htmlResponse(`<meta property="og:title" content="Hello">`),
    );
    const service = new LinkPreviewService(cache, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: publicLookup,
    });

    const preview = await service.getPreview("abc", "https://example.com/page");

    expect(preview.title).toBe("Hello");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cache.setCalls).toHaveLength(1);
    expect(cache.setCalls[0]?.shortCode).toBe("abc");
  });

  it("serves a cached preview without fetching again", async () => {
    const cache = new FakePreviewCache();
    cache.entries.set("abc", {
      url: "https://example.com/",
      title: "Cached",
      description: null,
      image: null,
      siteName: null,
    });
    const fetchImpl = vi.fn();
    const service = new LinkPreviewService(cache, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: publicLookup,
    });

    const preview = await service.getPreview("abc", "https://example.com/");

    expect(preview.title).toBe("Cached");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to fetch private addresses (SSRF)", async () => {
    const fetchImpl = vi.fn();
    const service = new LinkPreviewService(null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: () => Promise.resolve(["127.0.0.1"]),
    });

    const preview = await service.getPreview("abc", "http://internal.example/");

    expect(preview.title).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks redirects that point at private addresses", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://example.com/") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        });
      }
      return htmlResponse("<title>metadata</title>");
    });
    const service = new LinkPreviewService(null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: (hostname) =>
        Promise.resolve([
          hostname === "example.com" ? PUBLIC_ADDRESS : "169.254.169.254",
        ]),
    });

    const preview = await service.getPreview("abc", "https://example.com/");

    expect(preview.title).toBeNull();
    // The metadata endpoint must never be requested.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-HTML responses", async () => {
    const service = new LinkPreviewService(null, {
      fetchImpl: (async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
      lookup: publicLookup,
    });

    const preview = await service.getPreview("abc", "https://example.com/api");
    expect(preview.title).toBeNull();
  });

  it("returns an empty preview when the fetch fails", async () => {
    const onError = vi.fn();
    const service = new LinkPreviewService(null, {
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
      lookup: publicLookup,
      onError,
    });

    const preview = await service.getPreview("abc", "https://example.com/");

    expect(preview).toMatchObject({
      url: "https://example.com/",
      title: null,
      description: null,
      image: null,
      siteName: null,
    });
    expect(onError).toHaveBeenCalled();
  });
});
