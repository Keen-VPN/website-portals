import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
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
});
