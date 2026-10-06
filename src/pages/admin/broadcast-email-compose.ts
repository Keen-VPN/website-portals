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
 * Format flags live in the transform section, before the version or public id.
 * A comma group can carry `f_` mid-chain (`c_fill,q_auto,f_svg`). A lone
 * `f_<value>` segment is a format flag too, including values this list does
 * not name: an omitted format must not pass just because the path ends in
 * `.png` or `.jpg`. A folder such as `f_icons` is part of the public id only
 * once a version segment (`v123`) has ended the transform section.
 */
function cloudinaryFormatFlags(path: string): string[] {
  const marker = "/image/upload/";
  const start = path.indexOf(marker);
  if (start === -1) return [];
  const formats: string[] = [];
  for (const segment of path.slice(start + marker.length).split("/")) {
    if (!segment || /^v\d+$/.test(segment)) break;
    if (segment.includes(",")) {
      let isTransform = true;
      for (const token of segment.split(",")) {
        const format = token.match(/^f_([a-z0-9]+)$/)?.[1];
        if (format) {
          formats.push(format);
        } else if (!/^[a-z]{1,3}_/.test(token)) {
          isTransform = false;
          break;
        }
      }
      if (!isTransform) break;
      continue;
    }
    const format = segment.match(/^f_([a-z0-9]+)$/)?.[1];
    if (format) {
      formats.push(format);
      continue;
    }
    if (/^[a-z]{1,3}_/.test(segment)) continue;
    break;
  }
  return formats;
}

function isCloudinaryImageUpload(parsed: URL): boolean {
  return (
    parsed.hostname === "res.cloudinary.com" &&
    parsed.pathname.toLowerCase().includes("/image/upload/")
  );
}

/** https PNG/JPG, including extensionless Cloudinary image URLs. SVG is rejected. */
export function isEmailSafeLogoUrl(url: string): boolean {
  const parsed = parsedHttpsUrl(url);
  if (!parsed) return false;
  const path = parsed.pathname.toLowerCase();
  if (path.endsWith(".svg")) return false;
  if (isCloudinaryImageUpload(parsed)) {
    const formats = cloudinaryFormatFlags(path);
    if (formats.some((format) => !ALLOWED_CLOUDINARY_FORMATS.has(format))) {
      return false;
    }
  }
  if (RASTER_LOGO_EXTENSIONS.some((extension) => path.endsWith(extension))) {
    return true;
  }
  if (!isCloudinaryImageUpload(parsed)) return false;
  const last = path.split("/").filter(Boolean).pop() ?? "";
  return !last.includes(".");
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
