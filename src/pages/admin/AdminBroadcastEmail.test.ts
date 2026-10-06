import { describe, expect, it } from "vitest";
import { createDefaultAudienceTargeting } from "@/components/admin/audience-targeting.constants";
import {
  buildBroadcastComposePayload,
  broadcastCompanyErrors,
  showBroadcastCompanySection,
} from "@/pages/admin/broadcast-email-compose";

const baseInput = {
  audience: "all_deliverable" as const,
  category: "none" as const,
  profileTargeting: createDefaultAudienceTargeting(),
  emailCategory: "none",
  subject: "",
  headline: "",
  body: "",
  preheader: "",
  ctaLabel: "View perks",
  ctaUrl: "https://vpnkeen.com/perks",
};

describe("buildBroadcastComposePayload", () => {
  it("sends template only for membership transfer when copy is blank", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "membership_transfer",
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      template: "membership_transfer",
    });
  });

  it("keeps an optional subject override on the membership transfer template", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "membership_transfer",
        subject: "  Transfer now  ",
        headline: "ignored",
        body: "ignored",
        ctaUrl: "https://example.com",
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      template: "membership_transfer",
      subject: "Transfer now",
    });
  });

  it("sends perkId and perks_offers for perk announcement", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "perk_announcement",
        perkId: "perk_ca_disney",
        subject: "  Override subject  ",
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      emailCategory: "perks_offers",
      template: "perk_announcement",
      perkId: "perk_ca_disney",
      subject: "Override subject",
      ctaLabel: "View perks",
      ctaUrl: "https://vpnkeen.com/perks",
    });
  });

  it("requires perkId for perk announcement", () => {
    expect(() =>
      buildBroadcastComposePayload({
        ...baseInput,
        template: "perk_announcement",
      }),
    ).toThrow(/perkId is required/i);
  });

  it("sends template only for chrome extension when copy is blank", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "chrome_extension",
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      template: "chrome_extension",
    });
  });

  it("keeps an optional subject override on the chrome extension template and drops any ctaUrl override", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "chrome_extension",
        subject: "  Try the extension  ",
        headline: "ignored",
        body: "ignored",
        ctaUrl: "https://vpnkeen.com/chrome",
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      template: "chrome_extension",
      subject: "Try the extension",
    });
  });

  it("still requires custom copy on a one-off broadcast", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "custom",
        subject: "Perk drop",
        headline: "New cashback",
        body: "See perks.",
        preheader: "Inbox preview",
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      subject: "Perk drop",
      headline: "New cashback",
      body: "See perks.",
      preheader: "Inbox preview",
      ctaLabel: "View perks",
      ctaUrl: "https://vpnkeen.com/perks",
    });
  });
});

describe("class action broadcast companies", () => {
  it("shows the company section only for class action perks", () => {
    expect(
      showBroadcastCompanySection("perk_announcement", "class_action"),
    ).toBe(true);
    expect(showBroadcastCompanySection("perk_announcement", "cashback")).toBe(
      false,
    );
    expect(showBroadcastCompanySection("custom", "class_action")).toBe(false);
  });

  it("includes trimmed companies for class action perks, including an empty list", () => {
    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "perk_announcement",
        perkId: "perk_ca_disney",
        isClassActionPerk: true,
        ctaUrl: "https://claims.example.com",
        companies: [
          { name: "  Disney  ", logoUrl: "  https://cdn.example.com/d.png  " },
          { name: "   ", logoUrl: "" },
          { name: "Hulu", logoUrl: "   " },
        ],
      }),
    ).toEqual({
      audience: "all_deliverable",
      profileTargeting: createDefaultAudienceTargeting(),
      emailCategory: "perks_offers",
      template: "perk_announcement",
      perkId: "perk_ca_disney",
      ctaLabel: "View perks",
      companies: [
        { name: "Disney", logoUrl: "https://cdn.example.com/d.png" },
        { name: "Hulu" },
      ],
    });

    expect(
      buildBroadcastComposePayload({
        ...baseInput,
        template: "perk_announcement",
        perkId: "perk_ca_disney",
        isClassActionPerk: true,
        companies: [],
      }).companies,
    ).toEqual([]);
  });

  it("blocks sending while a company row is invalid", () => {
    expect(
      broadcastCompanyErrors([
        { name: "", logoUrl: "https://cdn.example.com/a.png" },
      ]),
    ).toEqual(["Company 1 needs a name."]);
    expect(
      broadcastCompanyErrors([
        { name: "Disney", logoUrl: "http://cdn.example.com/a.png" },
      ]),
    ).toEqual(["Company 1 logo must be an https link."]);
    expect(
      broadcastCompanyErrors([
        { name: "Disney", logoUrl: "https://cdn.example.com/a.svg?x=1" },
      ]),
    ).toEqual([
      "Company 1 logo must be a PNG or JPG. SVG won't show in Gmail or Outlook.",
    ]);
    expect(
      broadcastCompanyErrors([
        { name: "Disney", logoUrl: "https://cdn.example.com/a.png" },
      ]),
    ).toEqual([]);
  });
});
