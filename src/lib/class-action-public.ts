import { BACKEND_URL } from "@/auth/backend";

/** Public, Google-indexable Class Action pages live on the marketing site. */
export const CLASS_ACTION_PUBLIC_ORIGIN = "https://vpnkeen.com";
export const CLASS_ACTION_PUBLIC_PATH_PREFIX = "/class-actions";

/** Portal routes that serve a single Class Action (by URL slug or perk id). */
const CLASS_ACTION_DETAIL_PATTERNS = [
  /^\/class-actions\/([^/]+)\/?$/,
  /^\/class-action\/([^/]+)\/?$/,
];

const MAX_SEARCH_LENGTH = 512;

export type PublicClassActionLookup =
  | { kind: "found"; url: string }
  | { kind: "not_found" }
  | { kind: "error" };

/**
 * Returns the slug/perk id for a logged-out portal visitor on a Class Action
 * detail route, or null for every other route (including the list page).
 */
export function getClassActionPublicLookupKey(pathname: string): string | null {
  for (const pattern of CLASS_ACTION_DETAIL_PATTERNS) {
    const match = pattern.exec(pathname);
    if (!match?.[1]) continue;
    try {
      const key = decodeURIComponent(match[1]).trim();
      return key || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Keeps only a query string (e.g. UTM params) so it can follow the visitor. */
export function sanitizeClassActionSearch(search: string): string {
  if (!search || !search.startsWith("?")) return "";
  if (search.length > MAX_SEARCH_LENGTH) return "";
  return search;
}

/**
 * Public slug for a candidate/perk, mirroring the backend: the analyst
 * sourceSlug, else the perk id without its `perk_ca_` prefix. Returns null when
 * neither is usable.
 */
export function resolvePublicClassActionSlug(input: {
  sourceSlug?: string | null;
  perkId?: string | null;
}): string | null {
  const fromSource = input.sourceSlug?.trim();
  if (fromSource) return fromSource;
  const perkId = input.perkId?.trim();
  if (!perkId) return null;
  const stripped = perkId.replace(/^perk_ca_/, "");
  return stripped || null;
}

export function buildPublicClassActionUrl(slug: string, search = ""): string {
  return `${CLASS_ACTION_PUBLIC_ORIGIN}${CLASS_ACTION_PUBLIC_PATH_PREFIX}/${encodeURIComponent(
    slug.trim(),
  )}${sanitizeClassActionSearch(search)}`;
}

/**
 * Resolve a portal key (slug or perk id) to its published public page.
 * Calls the unauthenticated backend endpoint; never sends a session token.
 */
export async function resolvePublicClassActionUrl(
  key: string,
  search = "",
  fetcher: typeof fetch = fetch,
): Promise<PublicClassActionLookup> {
  const trimmed = key.trim();
  if (!trimmed) return { kind: "not_found" };

  let response: Response;
  try {
    response = await fetcher(
      `${BACKEND_URL}/public/class-actions/${encodeURIComponent(trimmed)}`,
      { headers: { Accept: "application/json" } },
    );
  } catch {
    return { kind: "error" };
  }

  if (response.status === 404) return { kind: "not_found" };
  if (!response.ok) return { kind: "error" };

  const body = (await response.json().catch(() => null)) as {
    data?: { slug?: unknown };
  } | null;
  const slug = body?.data?.slug;
  if (typeof slug !== "string" || !slug.trim()) return { kind: "error" };

  const url = buildPublicClassActionUrl(slug, search);
  // Defensive loop guard: the public page must never point back into the portal.
  if (typeof window !== "undefined") {
    try {
      if (new URL(url).host === window.location.host) return { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  }
  return { kind: "found", url };
}
