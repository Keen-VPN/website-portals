import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { APP_STORE_URLS } from "@/constants/app-store-urls";
import TestLandingPage from "./TestLandingPage";

const html = renderToStaticMarkup(
  createElement(
    HelmetProvider,
    null,
    createElement(
      MemoryRouter,
      { initialEntries: ["/test-landing-page"] },
      createElement(TestLandingPage),
    ),
  ),
);
const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const routes = new Set(
  [...appSource.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map((m) => m[1]),
);

describe("TestLandingPage", () => {
  it("is registered in the app routes", () => {
    expect(routes.has("/test-landing-page")).toBe(true);
  });

  it("renders every section", () => {
    for (const id of ["settlements", "tracking", "cookies", "libraries", "faq"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("has no empty links", () => {
    expect(hrefs.length).toBeGreaterThan(50);
    expect(hrefs.filter((h) => !h.trim() || h === "#")).toEqual([]);
  });

  it("points internal links at routes that exist in the app", () => {
    const internal = hrefs.filter((h) => h.startsWith("/"));
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.filter((h) => !routes.has(h))).toEqual([]);
  });

  it("points in-page anchors at existing section ids", () => {
    const anchors = hrefs.filter((h) => h.startsWith("#"));
    expect(anchors.filter((h) => !html.includes(`id="${h.slice(1)}"`))).toEqual([]);
  });

  it("links every platform download anchor to its canonical store URL", () => {
    const platforms = ["windows", "macos", "ios", "android", "chrome"] as const;
    const canonical = new Set<string>(platforms.map((p) => APP_STORE_URLS[p]));
    const storeHosts = /^https:\/\/(apps\.apple\.com|play\.google\.com|apps\.microsoft\.com|chromewebstore\.google\.com)\//;

    // No store link anywhere on the page (nav, mobile menu, hero, download section, footer) may be stale.
    const storeLinks = hrefs.filter((h) => storeHosts.test(h));
    expect(storeLinks.length).toBeGreaterThan(0);
    expect(storeLinks.filter((h) => !canonical.has(h))).toEqual([]);

    // Anchors tagged for a platform must point at that platform's URL.
    const tagged = [...html.matchAll(/<a [^>]*>/g)]
      .map((m) => m[0])
      .map((tag) => ({
        track: /data-track="([^"]*)"/.exec(tag)?.[1] ?? "",
        href: /href="([^"]*)"/.exec(tag)?.[1] ?? "",
      }));
    for (const platform of platforms) {
      const links = tagged.filter((t) => t.track.endsWith(`download_${platform}`));
      expect(links.length).toBeGreaterThanOrEqual(3); // desktop nav, mobile menu, download section
      for (const link of links) expect(link.href).toBe(APP_STORE_URLS[platform]);
    }
  });

  it("keeps the visitor's query string on links to the marketing site", () => {
    const withUtm = renderToStaticMarkup(
      createElement(
        HelmetProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: ["/test-landing-page?utm_source=ad&utm_campaign=spring"] },
          createElement(TestLandingPage),
        ),
      ),
    );
    expect(withUtm).toContain("/server-locations/?utm_source=ad&amp;utm_campaign=spring");
    expect(withUtm).toContain("/transfer.html?utm_source=ad&amp;utm_campaign=spring");
  });

  it("does not request third-party images", () => {
    expect(html).not.toContain("flagcdn.com");
  });
});
