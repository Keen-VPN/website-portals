import { createElement, type ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
  subscription: null as null | { status: string },
  loading: false,
  hasSessionToken: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/auth", () => ({
  buildSignInUrl: ({ redirect, asweb }: { redirect: string; asweb: boolean }) =>
    `/signin?redirect=${encodeURIComponent(redirect)}${asweb ? "&asweb=1" : ""}`,
}));

vi.mock("@/components/ClassActionPublicRedirect", () => ({
  default: ({ lookupKey }: { lookupKey: string }) =>
    createElement("div", { "data-testid": "public-redirect", "data-key": lookupKey }),
}));

import ProtectedRoute from "./ProtectedRoute";

function LocationProbe(): ReactElement {
  const location = useLocation();
  return createElement(
    "div",
    { "data-testid": "location" },
    `${location.pathname}${location.search}`,
  );
}

function renderAt(path: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/signin", element: createElement(LocationProbe) }),
          createElement(Route, {
            path: "*",
            element: createElement(
              ProtectedRoute,
              null,
              createElement("div", { "data-testid": "protected-content" }, "portal"),
            ),
          }),
        ),
      ),
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const query = (container: HTMLElement, testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`);

describe("ProtectedRoute Class Action routing", () => {
  beforeEach(() => {
    authState.user = null;
    authState.subscription = null;
    authState.loading = false;
    authState.hasSessionToken = false;
    sessionStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sends logged-out visitors on a slug route to the public redirect", () => {
    const view = renderAt("/class-actions/disney-settlement?utm_source=email");
    expect(query(view.container, "public-redirect")?.getAttribute("data-key")).toBe(
      "disney-settlement",
    );
    expect(query(view.container, "protected-content")).toBeNull();
    view.unmount();
  });

  it("sends logged-out visitors on a singular id route to the public redirect", () => {
    const view = renderAt("/class-action/perk_ca_123");
    expect(query(view.container, "public-redirect")?.getAttribute("data-key")).toBe(
      "perk_ca_123",
    );
    view.unmount();
  });

  it("keeps the normal sign-in redirect for non-Class-Action portal routes", () => {
    const view = renderAt("/dashboard");
    expect(query(view.container, "public-redirect")).toBeNull();
    expect(query(view.container, "location")?.textContent).toMatch(/^\/signin\?redirect=/);
    view.unmount();
  });

  it("keeps the normal sign-in redirect for the Class Action list page", () => {
    const view = renderAt("/class-action");
    expect(query(view.container, "public-redirect")).toBeNull();
    expect(query(view.container, "location")?.textContent).toMatch(/^\/signin\?redirect=/);
    view.unmount();
  });

  it("keeps ASWeb embedded sessions on the sign-in flow", () => {
    const view = renderAt("/class-actions/disney-settlement?asweb=1");
    expect(query(view.container, "public-redirect")).toBeNull();
    expect(query(view.container, "location")?.textContent).toMatch(/^\/signin\?redirect=/);
    view.unmount();
  });

  it("lets authenticated users reach the portal detail page", () => {
    authState.user = { id: "user_1" };
    authState.subscription = { status: "active" };
    const view = renderAt("/class-actions/disney-settlement");
    expect(query(view.container, "protected-content")).not.toBeNull();
    expect(query(view.container, "public-redirect")).toBeNull();
    view.unmount();
  });
});
