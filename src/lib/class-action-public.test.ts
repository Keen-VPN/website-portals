import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/backend", () => ({
  BACKEND_URL: "https://api.test/api",
}));

import {
  buildPublicClassActionUrl,
  getClassActionPublicLookupKey,
  resolvePublicClassActionSlug,
  resolvePublicClassActionUrl,
  sanitizeClassActionSearch,
} from "./class-action-public";

describe("resolvePublicClassActionSlug", () => {
  it("prefers the analyst sourceSlug", () => {
    expect(
      resolvePublicClassActionSlug({ sourceSlug: " disney-settlement ", perkId: "perk_ca_x" }),
    ).toBe("disney-settlement");
  });

  it("falls back to the perk id without its perk_ca_ prefix", () => {
    expect(resolvePublicClassActionSlug({ sourceSlug: "", perkId: "perk_ca_disney" })).toBe(
      "disney",
    );
    expect(resolvePublicClassActionSlug({ sourceSlug: null, perkId: "perk_other" })).toBe(
      "perk_other",
    );
  });

  it("returns null when neither value is usable", () => {
    expect(resolvePublicClassActionSlug({ sourceSlug: null, perkId: null })).toBeNull();
    expect(resolvePublicClassActionSlug({ sourceSlug: "  ", perkId: "perk_ca_" })).toBeNull();
  });
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("getClassActionPublicLookupKey", () => {
  it("returns the slug for class-action detail routes", () => {
    expect(getClassActionPublicLookupKey("/class-actions/disney-youtube-tv-settlement")).toBe(
      "disney-youtube-tv-settlement",
    );
    expect(getClassActionPublicLookupKey("/class-actions/disney/")).toBe("disney");
  });

  it("returns the perk id for singular class-action routes", () => {
    expect(getClassActionPublicLookupKey("/class-action/perk_ca_disney")).toBe(
      "perk_ca_disney",
    );
  });

  it("decodes encoded slugs", () => {
    expect(getClassActionPublicLookupKey("/class-actions/my%20plan")).toBe("my plan");
  });

  it("ignores the list page and unrelated routes", () => {
    expect(getClassActionPublicLookupKey("/class-action")).toBeNull();
    expect(getClassActionPublicLookupKey("/class-actions/")).toBeNull();
    expect(getClassActionPublicLookupKey("/class-actions/a/b")).toBeNull();
    expect(getClassActionPublicLookupKey("/dashboard")).toBeNull();
    expect(getClassActionPublicLookupKey("/perks")).toBeNull();
  });

  it("returns null for malformed encodings instead of throwing", () => {
    expect(getClassActionPublicLookupKey("/class-actions/%E0%A4%A")).toBeNull();
  });
});

describe("buildPublicClassActionUrl", () => {
  it("builds an encoded public URL on the marketing origin", () => {
    expect(buildPublicClassActionUrl("acme & co settlement")).toBe(
      "https://vpnkeen.com/class-actions/acme%20%26%20co%20settlement",
    );
  });

  it("keeps the originating query string (e.g. UTM params)", () => {
    expect(buildPublicClassActionUrl("disney", "?utm_source=email")).toBe(
      "https://vpnkeen.com/class-actions/disney?utm_source=email",
    );
  });
});

describe("sanitizeClassActionSearch", () => {
  it("drops values that are not a query string", () => {
    expect(sanitizeClassActionSearch("utm=1")).toBe("");
    expect(sanitizeClassActionSearch("")).toBe("");
    expect(sanitizeClassActionSearch(`?${"a".repeat(600)}`)).toBe("");
  });
});

describe("resolvePublicClassActionUrl", () => {
  it("resolves a published slug to its public URL without sending credentials", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { slug: "disney-youtube-tv-settlement" } }),
    );

    const result = await resolvePublicClassActionUrl(
      "perk_ca_disney-youtube-tv-settlement",
      "?utm_source=x",
      fetcher as unknown as typeof fetch,
    );

    expect(result).toEqual({
      kind: "found",
      url: "https://vpnkeen.com/class-actions/disney-youtube-tv-settlement?utm_source=x",
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.test/api/public/class-actions/perk_ca_disney-youtube-tv-settlement",
    );
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
  });

  it("reports not_found for unknown or unpublished records", async () => {
    const fetcher = vi.fn(async () => jsonResponse(404, { message: "not found" }));
    await expect(
      resolvePublicClassActionUrl("draft", "", fetcher as unknown as typeof fetch),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("does not call the backend for an empty key", async () => {
    const fetcher = vi.fn();
    await expect(
      resolvePublicClassActionUrl("   ", "", fetcher as unknown as typeof fetch),
    ).resolves.toEqual({ kind: "not_found" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports error on outages, network failures, and malformed payloads", async () => {
    const serverError = vi.fn(async () => jsonResponse(500, {}));
    await expect(
      resolvePublicClassActionUrl("x", "", serverError as unknown as typeof fetch),
    ).resolves.toEqual({ kind: "error" });

    const network = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      resolvePublicClassActionUrl("x", "", network as unknown as typeof fetch),
    ).resolves.toEqual({ kind: "error" });

    const malformed = vi.fn(async () => jsonResponse(200, { data: {} }));
    await expect(
      resolvePublicClassActionUrl("x", "", malformed as unknown as typeof fetch),
    ).resolves.toEqual({ kind: "error" });
  });
});
