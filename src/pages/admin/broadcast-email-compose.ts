import {
  MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE,
  PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE,
  CHROME_EXTENSION_BROADCAST_TEMPLATE,
  type AdminBroadcastComposePayload,
  type AudienceTargeting,
  type BroadcastEmailAudience,
  type BroadcastEmailCategory,
  type BroadcastEmailTemplate,
} from "@/auth/backend";

function optionalTrim(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const MAX_BROADCAST_COMPANIES = 4;

const RASTER_LOGO_EXTENSIONS = [".png", ".jpg", ".jpeg"];

export interface BroadcastCompanyDraft {
  id: string;
  name: string;
  logoUrl: string;
}

function createBroadcastCompanyId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createBroadcastCompanyDraft(
  name = "",
  logoUrl = "",
): BroadcastCompanyDraft {
  return { id: createBroadcastCompanyId(), name, logoUrl };
}

function parsedHttpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function isSvgLogoUrl(url: string): boolean {
  return parsedHttpsUrl(url)?.pathname.toLowerCase().endsWith(".svg") ?? false;
}

const ALLOWED_CLOUDINARY_FORMATS = new Set(["png", "jpg", "jpeg", "auto"]);

/**
 * Cloudinary image/upload URLs often omit the file extension. Flags in one
 * transform group are comma-separated (`c_fill,q_auto,f_jpg`), so every `f_`
 * flag counts, including ones that are not at the start of the group.
 * `f_auto` is the usual extensionless delivery URL and stays allowed.
 */
function isExtensionlessCloudinaryLogo(parsed: URL): boolean {
  if (parsed.hostname !== "res.cloudinary.com") return false;
  const path = parsed.pathname.toLowerCase();
  if (!path.includes("/image/upload/")) return false;
  const formats = [...path.matchAll(/(?:^|[/,])f_([a-z0-9]+)/g)].map(
    (match) => match[1],
  );
  if (
    formats.some((format) => !ALLOWED_CLOUDINARY_FORMATS.has(format))
  ) {
    return false;
  }
  const last = path.split("/").filter(Boolean).pop() ?? "";
  return !last.includes(".");
}

/** https PNG/JPG, including extensionless Cloudinary image URLs. SVG is rejected. */
export function isEmailSafeLogoUrl(url: string): boolean {
  const parsed = parsedHttpsUrl(url);
  if (!parsed) return false;
  const path = parsed.pathname.toLowerCase();
  if (path.endsWith(".svg")) return false;
  return (
    RASTER_LOGO_EXTENSIONS.some((extension) => path.endsWith(extension)) ||
    isExtensionlessCloudinaryLogo(parsed)
  );
}

export function showBroadcastCompanySection(
  template: string,
  category: string | null | undefined,
): boolean {
  return (
    template === PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE &&
    category === "class_action"
  );
}

export function broadcastCompanyErrors(
  rows: BroadcastCompanyDraft[],
): string[] {
  const errors: string[] = [];
  const visible = rows.slice(0, MAX_BROADCAST_COMPANIES);
  visible.forEach((row, index) => {
    const name = row.name.trim();
    const logoUrl = row.logoUrl.trim();
    if (!name && !logoUrl) return;
    const label = `Company ${index + 1}`;
    if (!name) errors.push(`${label} needs a name.`);
    if (logoUrl && !isEmailSafeLogoUrl(logoUrl)) {
      errors.push(
        isSvgLogoUrl(logoUrl)
          ? `${label} logo must be a PNG or JPG. SVG won't show in Gmail or Outlook.`
          : parsedHttpsUrl(logoUrl)
            ? `${label} logo must be a PNG or JPG.`
            : `${label} logo must be an https link.`,
      );
    }
  });
  if (rows.length > MAX_BROADCAST_COMPANIES) {
    errors.push("Add at most 4 companies.");
  }
  return errors;
}

export function normalizeBroadcastCompanies(
  rows: BroadcastCompanyDraft[],
): { name: string; logoUrl?: string }[] {
  return rows
    .slice(0, MAX_BROADCAST_COMPANIES)
    .map((row) => ({
      name: row.name.trim(),
      logoUrl: row.logoUrl.trim(),
    }))
    .filter((row) => row.name.length > 0)
    .map((row) =>
      row.logoUrl && isEmailSafeLogoUrl(row.logoUrl)
        ? { name: row.name, logoUrl: row.logoUrl }
        : { name: row.name },
    );
}

export function buildBroadcastComposePayload(input: {
  audience: BroadcastEmailAudience;
  category: BroadcastEmailCategory | "none";
  profileTargeting: AudienceTargeting;
  emailCategory: string;
  template: BroadcastEmailTemplate | "custom";
  perkId?: string;
  subject: string;
  headline: string;
  body: string;
  preheader: string;
  ctaLabel: string;
  ctaUrl: string;
  isClassActionPerk?: boolean;
  companies?: BroadcastCompanyDraft[];
}): AdminBroadcastComposePayload {
  const payload: AdminBroadcastComposePayload = {
    audience: input.audience,
    // "none" means genuinely uncategorised; the backend stores null rather
    // than guessing, so reporting never shows an invented category.
    category: input.category === "none" ? undefined : input.category,
    profileTargeting: input.profileTargeting,
    emailCategory:
      input.emailCategory === "none" ? undefined : input.emailCategory,
  };

  if (input.template === MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE) {
    payload.template = MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE;
    const subject = optionalTrim(input.subject);
    if (subject) payload.subject = subject;
    return payload;
  }

  if (input.template === PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE) {
    payload.template = PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE;
    const perkId = optionalTrim(input.perkId ?? "");
    if (!perkId) {
      throw new Error("perkId is required for perk announcement");
    }
    payload.perkId = perkId;
    // Perk sends always go under Class Actions & Perks preferences.
    payload.emailCategory = "perks_offers";
    const subject = optionalTrim(input.subject);
    if (subject) payload.subject = subject;
    const headline = optionalTrim(input.headline);
    if (headline) payload.headline = headline;
    const body = optionalTrim(input.body);
    if (body) payload.body = body;
    const preheader = optionalTrim(input.preheader);
    if (preheader) payload.preheader = preheader;
    const ctaLabel = optionalTrim(input.ctaLabel);
    if (ctaLabel) payload.ctaLabel = ctaLabel;
    if (input.isClassActionPerk) {
      payload.companies = normalizeBroadcastCompanies(input.companies ?? []);
    } else {
      const ctaUrl = optionalTrim(input.ctaUrl);
      if (ctaUrl) payload.ctaUrl = ctaUrl;
    }
    return payload;
  }

  if (input.template === CHROME_EXTENSION_BROADCAST_TEMPLATE) {
    payload.template = CHROME_EXTENSION_BROADCAST_TEMPLATE;
    const subject = optionalTrim(input.subject);
    if (subject) payload.subject = subject;
    return payload;
  }

  payload.subject = input.subject.trim();
  payload.headline = input.headline.trim();
  payload.body = input.body.trim();
  payload.preheader = optionalTrim(input.preheader);
  payload.ctaLabel = optionalTrim(input.ctaLabel);
  payload.ctaUrl = optionalTrim(input.ctaUrl);
  return payload;
}
