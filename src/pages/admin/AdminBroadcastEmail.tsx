import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  adminExportBroadcastAudienceCsv,
  adminFetchBroadcastAudience,
  adminFetchBroadcastEmailJob,
  adminListPerks,
  adminSendBroadcastEmail,
  adminSendBroadcastPreview,
  MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS,
  MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE,
  PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE,
  type AdminPerk,
  CHROME_EXTENSION_BROADCAST_DEFAULTS,
  CHROME_EXTENSION_BROADCAST_TEMPLATE,
  type AudienceTargeting,
  type AudienceTargetingPreview,
  type BroadcastEmailAudience,
  type BroadcastEmailCategory,
  type BroadcastEmailTemplate,
} from "@/auth/backend";
import {
  buildBroadcastComposePayload,
  broadcastCompanyErrors,
  createBroadcastCompanyDraft,
  isEmailSafeLogoUrl,
  MAX_BROADCAST_COMPANIES,
  showBroadcastCompanySection,
  type BroadcastCompanyDraft,
} from "@/pages/admin/broadcast-email-compose";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { AudienceTargetingPanel } from "@/components/admin/AudienceTargetingPanel";
import {
  createDefaultAudienceTargeting,
  getAudienceTargetingValidationError,
} from "@/components/admin/audience-targeting.constants";

const AUDIENCE_OPTIONS: { value: BroadcastEmailAudience; label: string }[] = [
  { value: "all_deliverable", label: "All deliverable users" },
  { value: "opted_in", label: "Opted in to tips & offers only" },
  {
    value: "referral_eligible",
    label: "Referral eligible (had a long session)",
  },
];

const CATEGORY_OPTIONS: {
  value: BroadcastEmailCategory | "none";
  label: string;
}[] = [
  { value: "none", label: "Uncategorised" },
  { value: "referrals", label: "#referrals" },
  { value: "lifecycle", label: "#lifecycle" },
  { value: "product", label: "#product" },
  { value: "announcement", label: "#announcement" },
];

const EMAIL_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No category (all recipients)" },
  { value: "product_updates", label: "Product Updates" },
  { value: "education_privacy", label: "Education, Privacy & Security" },
  { value: "perks_offers", label: "Class Actions & Perks" },
  { value: "referrals", label: "Referrals" },
];

const DEFAULT_CTA_LABEL = "View perks";
const DEFAULT_CTA_URL = "https://vpnkeen.com/perks";
const BROADCAST_JOB_POLL_INTERVAL_MS = 2000;
const BROADCAST_JOB_POLL_TIMEOUT_MS = 15 * 60 * 1000;

interface BroadcastComposeDraft {
  subject: string;
  headline: string;
  body: string;
  preheader: string;
  ctaLabel: string;
  ctaUrl: string;
  category: BroadcastEmailCategory | "none";
  emailCategory: string;
}

const EMPTY_CUSTOM_DRAFT: BroadcastComposeDraft = {
  subject: "",
  headline: "",
  body: "",
  preheader: "",
  ctaLabel: DEFAULT_CTA_LABEL,
  ctaUrl: DEFAULT_CTA_URL,
  category: "none",
  emailCategory: "none",
};

const TEMPLATE_OPTIONS: {
  value: BroadcastEmailTemplate | "custom";
  label: string;
}[] = [
  { value: "custom", label: "Custom message" },
  {
    value: MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE,
    label: "Membership transfer",
  },
  {
    value: PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE,
    label: "Perk announcement",
  },
  {
    value: CHROME_EXTENSION_BROADCAST_TEMPLATE,
    label: "Chrome extension",
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function LogoThumb({ url }: { url: string }) {
  const trimmed = url.trim();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl !== null && failedUrl !== trimmed) {
    setFailedUrl(null);
  }
  if (!trimmed || !isEmailSafeLogoUrl(trimmed)) return null;
  const loadFailed = failedUrl === trimmed;
  return (
    <div className="relative h-11 w-11 shrink-0">
      <img
        key={trimmed}
        src={trimmed}
        alt=""
        className={`h-11 w-11 rounded-md border border-border bg-white object-contain${loadFailed ? " opacity-40" : ""}`}
        onLoad={() =>
          setFailedUrl((current) => (current === trimmed ? null : current))
        }
        onError={() => setFailedUrl(trimmed)}
      />
      {loadFailed ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center text-[10px] leading-tight text-destructive">
          Couldn&apos;t load
        </span>
      ) : null}
    </div>
  );
}

export default function AdminBroadcastEmail() {
  const { admin, can } = useAdminAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const canBroadcast = can("emails.broadcast");

  const [audience, setAudience] =
    useState<BroadcastEmailAudience>("all_deliverable");
  const [category, setCategory] = useState<BroadcastEmailCategory | "none">(
    "none",
  );
  const [profileTargeting, setProfileTargeting] = useState<AudienceTargeting>(
    () => createDefaultAudienceTargeting(),
  );
  const [emailCategory, setEmailCategory] = useState("none");
  const [template, setTemplate] = useState<BroadcastEmailTemplate | "custom">(
    "custom",
  );
  const [perkId, setPerkId] = useState("");
  const [activePerks, setActivePerks] = useState<AdminPerk[]>([]);
  const [loadingPerks, setLoadingPerks] = useState(false);
  const perksCatalogLoadedRef = useRef(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [totalAudience, setTotalAudience] = useState<number | null>(null);
  const [matchPercentage, setMatchPercentage] = useState<number | null>(null);
  // Deliverable users before the recipient filter, and how many it removed.
  // Total audience is counted after the filter, so without these the panel
  // cannot tell "the filter excluded nobody" from "the filter is not running"
  // — the ambiguity QA hit on KVPN-602.
  const [deliverableBase, setDeliverableBase] = useState<number | null>(null);
  const [filteredOut, setFilteredOut] = useState<number | null>(null);
  const [optedInCount, setOptedInCount] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [preheader, setPreheader] = useState("");
  const [ctaLabel, setCtaLabel] = useState(DEFAULT_CTA_LABEL);
  const [ctaUrl, setCtaUrl] = useState(DEFAULT_CTA_URL);
  const [companies, setCompanies] = useState<BroadcastCompanyDraft[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const audienceRequestIdRef = useRef(0);
  const broadcastPollActiveRef = useRef(false);
  const customDraftRef = useRef<BroadcastComposeDraft>(EMPTY_CUSTOM_DRAFT);
  const perkQueryAppliedRef = useRef(false);

  useEffect(() => {
    return () => {
      broadcastPollActiveRef.current = false;
    };
  }, []);

  const isMembershipTransferTemplate =
    template === MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE;
  const isPerkAnnouncementTemplate =
    template === PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE;
  const isChromeExtensionTemplate =
    template === CHROME_EXTENSION_BROADCAST_TEMPLATE;
  const isDesignedTemplate =
    isMembershipTransferTemplate ||
    isPerkAnnouncementTemplate ||
    isChromeExtensionTemplate;
  const selectedPerk = useMemo(
    () => activePerks.find((perk) => perk.id === perkId) ?? null,
    [activePerks, perkId],
  );
  const isClassActionPerk = showBroadcastCompanySection(
    template,
    selectedPerk?.category,
  );
  const companyErrors = useMemo(
    () => (isClassActionPerk ? broadcastCompanyErrors(companies) : []),
    [isClassActionPerk, companies],
  );

  const composeReady = useMemo(
    () =>
      isMembershipTransferTemplate ||
      isChromeExtensionTemplate ||
      (isPerkAnnouncementTemplate &&
        !!selectedPerk &&
        companyErrors.length === 0) ||
      (!isPerkAnnouncementTemplate &&
        subject.trim().length > 0 &&
        headline.trim().length > 0 &&
        body.trim().length > 0),
    [
      isMembershipTransferTemplate,
      isChromeExtensionTemplate,
      isPerkAnnouncementTemplate,
      selectedPerk,
      companyErrors,
      subject,
      headline,
      body,
    ],
  );

  const resetComposeForm = useCallback(() => {
    customDraftRef.current = { ...EMPTY_CUSTOM_DRAFT };
    setTemplate("custom");
    setPerkId("");
    setSubject("");
    setHeadline("");
    setBody("");
    setPreheader("");
    setCtaLabel(DEFAULT_CTA_LABEL);
    setCtaUrl(DEFAULT_CTA_URL);
    setCompanies([]);
    setCategory("none");
    setEmailCategory("none");
  }, []);

  const applyPerkDefaults = useCallback((perk: AdminPerk) => {
    const isClassAction = perk.category === "class_action";
    const title = perk.title.replace(/^Class Action:\s*/i, "").trim();
    setSubject(
      isClassAction
        ? `New class action settlement: ${title}`
        : `New perk: ${title}`,
    );
    setHeadline(isClassAction ? "You may qualify for a new settlement" : title);
    setBody(
      isClassAction
        ? "You may be eligible to submit a claim for this settlement."
        : `A new partner perk is available for KeenVPN members: ${perk.offerText}`,
    );
    setPreheader(
      isClassAction
        ? `New settlement alert — ${title}`
        : `New perk available — ${title}`,
    );
    setCtaLabel(isClassAction ? "See If You Qualify →" : "View perk");
    setCtaUrl(
      isClassAction ? "" : perk.redemptionUrl?.trim() || DEFAULT_CTA_URL,
    );
    setCompanies(
      isClassAction
        ? [
            createBroadcastCompanyDraft(
              perk.partnerName?.trim() ?? "",
              perk.imageUrl?.trim() ?? "",
            ),
          ].filter((row) => row.name || row.logoUrl)
        : [],
    );
    setEmailCategory("perks_offers");
    setCategory("announcement");
  }, []);

  const applyTemplate = (next: BroadcastEmailTemplate | "custom") => {
    if (template === "custom" && next !== "custom") {
      customDraftRef.current = {
        subject,
        headline,
        body,
        preheader,
        ctaLabel,
        ctaUrl,
        category,
        emailCategory,
      };
    }

    setTemplate(next);

    if (next === MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE) {
      setPerkId("");
      setSubject(MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.subject);
      setHeadline(MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.headline);
      setBody(MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.body);
      setPreheader(MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.preheader);
      setCtaLabel(MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.ctaLabel);
      setCtaUrl(MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.ctaUrl);
      return;
    }

    if (next === PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE) {
      setEmailCategory("perks_offers");
      setCategory("announcement");
      if (selectedPerk) {
        applyPerkDefaults(selectedPerk);
      } else {
        setSubject("");
        setHeadline("");
        setBody("");
        setPreheader("");
        setCtaLabel(DEFAULT_CTA_LABEL);
        setCtaUrl(DEFAULT_CTA_URL);
        setCompanies([]);
      }
      return;
    }

    if (next === CHROME_EXTENSION_BROADCAST_TEMPLATE) {
      setPerkId("");
      setSubject(CHROME_EXTENSION_BROADCAST_DEFAULTS.subject);
      setHeadline(CHROME_EXTENSION_BROADCAST_DEFAULTS.headline);
      setBody(CHROME_EXTENSION_BROADCAST_DEFAULTS.body);
      setPreheader(CHROME_EXTENSION_BROADCAST_DEFAULTS.preheader);
      setCtaLabel(CHROME_EXTENSION_BROADCAST_DEFAULTS.ctaLabel);
      setCtaUrl(CHROME_EXTENSION_BROADCAST_DEFAULTS.ctaUrl);
      return;
    }

    setPerkId("");
    const draft = customDraftRef.current;
    setSubject(draft.subject);
    setHeadline(draft.headline);
    setBody(draft.body);
    setPreheader(draft.preheader);
    setCtaLabel(draft.ctaLabel);
    setCtaUrl(draft.ctaUrl);
    setCategory(draft.category);
    setEmailCategory(draft.emailCategory);
  };

  const composePayload = useCallback(
    () =>
      buildBroadcastComposePayload({
        audience,
        category,
        profileTargeting,
        emailCategory,
        template,
        perkId: perkId || undefined,
        subject,
        headline,
        body,
        preheader,
        ctaLabel,
        ctaUrl,
        isClassActionPerk,
        companies,
      }),
    [
      audience,
      category,
      profileTargeting,
      emailCategory,
      template,
      perkId,
      subject,
      headline,
      body,
      preheader,
      ctaLabel,
      ctaUrl,
      isClassActionPerk,
      companies,
    ],
  );

  useEffect(() => {
    if (!canBroadcast || !isPerkAnnouncementTemplate) return;
    if (perksCatalogLoadedRef.current) return;
    let cancelled = false;
    setLoadingPerks(true);
    void adminListPerks({ includeInactive: false }).then((result) => {
      if (cancelled) return;
      setLoadingPerks(false);
      if (!result.ok || !result.data) {
        toast({
          title: "Could not load perks",
          description: result.error ?? "Try again.",
          variant: "destructive",
        });
        return;
      }
      perksCatalogLoadedRef.current = true;
      const active = result.data.filter((perk) => perk.isActive);
      setActivePerks(active);
    });
    return () => {
      cancelled = true;
    };
  }, [canBroadcast, isPerkAnnouncementTemplate, toast]);

  useEffect(() => {
    if (perkQueryAppliedRef.current) return;
    const queryPerkId = searchParams.get("perkId")?.trim();
    if (!queryPerkId) return;
    perkQueryAppliedRef.current = true;
    setTemplate(PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE);
    setPerkId(queryPerkId);
    setEmailCategory("perks_offers");
    setCategory("announcement");
  }, [searchParams]);

  // If Email members / URL preselected a perk that isn't active, clear it and
  // explain why preview/send stays disabled.
  useEffect(() => {
    if (!isPerkAnnouncementTemplate || loadingPerks || !perkId) return;
    if (!perksCatalogLoadedRef.current) return;
    if (activePerks.some((perk) => perk.id === perkId)) return;
    setPerkId("");
    toast({
      title: "Perk not available to email",
      description:
        "That perk is inactive or still pending review. Activate it first, then try Email members again.",
      variant: "destructive",
    });
  }, [isPerkAnnouncementTemplate, loadingPerks, activePerks, perkId, toast]);

  const lastAppliedPerkIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPerkAnnouncementTemplate) {
      lastAppliedPerkIdRef.current = null;
      return;
    }
    if (!perkId || lastAppliedPerkIdRef.current === perkId) return;
    const perk = activePerks.find((entry) => entry.id === perkId);
    if (!perk) return;
    lastAppliedPerkIdRef.current = perkId;
    applyPerkDefaults(perk);
  }, [isPerkAnnouncementTemplate, perkId, activePerks, applyPerkDefaults]);

  const refreshAudience = useCallback(
    async (
      targetAudience: BroadcastEmailAudience,
      targeting: AudienceTargeting,
      category: string,
      selectedPerkId?: string,
    ) => {
      // Perk mode ignores profile targeting (backend uses the perk's stored
      // audience), so invalid panel state must not block the count.
      if (!selectedPerkId && getAudienceTargetingValidationError(targeting)) {
        return;
      }

      const requestId = ++audienceRequestIdRef.current;
      setLoadingAudience(true);
      setRecipientCount(null);
      setTotalAudience(null);
      setMatchPercentage(null);
      setOptedInCount(null);
      setDeliverableBase(null);
      setFilteredOut(null);

      // Same query the send runs, so the number an admin confirms against is
      // the number that will actually be mailed (KVPN-602).
      const result = await adminFetchBroadcastAudience(
        targetAudience,
        selectedPerkId ? createDefaultAudienceTargeting() : targeting,
        category === "none" ? undefined : category,
        selectedPerkId || undefined,
      );
      if (requestId !== audienceRequestIdRef.current) {
        return;
      }

      if (!result.ok || !result.data) {
        setRecipientCount(null);
        setTotalAudience(null);
        setMatchPercentage(null);
        setOptedInCount(null);
        setDeliverableBase(null);
        setFilteredOut(null);
        toast({
          title: "Could not load audience",
          description: result.error ?? "Try again.",
          variant: "destructive",
        });
      } else {
        setRecipientCount(result.data.matchingRecipients);
        setTotalAudience(result.data.totalAudience);
        setMatchPercentage(result.data.matchPercentage);
        setOptedInCount(result.data.optedInCount ?? null);
        setDeliverableBase(result.data.deliverableBaseCount ?? null);
        setFilteredOut(result.data.audienceFilteredOut ?? null);
      }
      setLoadingAudience(false);
    },
    [toast],
  );

  const audienceTargetingError = useMemo(
    () => getAudienceTargetingValidationError(profileTargeting),
    [profileTargeting],
  );

  const sharedAudiencePreview = useMemo((): AudienceTargetingPreview | null => {
    if (
      audienceTargetingError ||
      recipientCount == null ||
      totalAudience == null ||
      matchPercentage == null
    ) {
      return null;
    }
    return {
      context: "broadcast",
      deliverability: audience,
      profileTargeting,
      totalAudience,
      matchingRecipients: recipientCount,
      matchPercentage,
      optedInCount: optedInCount ?? undefined,
    };
  }, [
    audience,
    audienceTargetingError,
    matchPercentage,
    optedInCount,
    profileTargeting,
    recipientCount,
    totalAudience,
  ]);

  useEffect(() => {
    if (!canBroadcast) return;

    // Perk announcement audience is only meaningful after a perk is chosen;
    // otherwise we'd count every perks_offers recipient (and Export would too).
    // Check this before profile-targeting errors: perk mode ignores the panel.
    if (isPerkAnnouncementTemplate && !perkId) {
      audienceRequestIdRef.current += 1;
      setRecipientCount(null);
      setTotalAudience(null);
      setMatchPercentage(null);
      setOptedInCount(null);
      setDeliverableBase(null);
      setFilteredOut(null);
      setLoadingAudience(false);
      return;
    }

    if (!isPerkAnnouncementTemplate && audienceTargetingError) {
      audienceRequestIdRef.current += 1;
      setRecipientCount(null);
      setTotalAudience(null);
      setMatchPercentage(null);
      setOptedInCount(null);
      setDeliverableBase(null);
      setFilteredOut(null);
      setLoadingAudience(false);
      return;
    }

    setRecipientCount(null);
    setTotalAudience(null);
    setMatchPercentage(null);
    setOptedInCount(null);
    setDeliverableBase(null);
    setFilteredOut(null);
    setLoadingAudience(true);

    const timer = window.setTimeout(() => {
      void refreshAudience(
        audience,
        profileTargeting,
        isPerkAnnouncementTemplate ? "perks_offers" : emailCategory,
        isPerkAnnouncementTemplate ? perkId : undefined,
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    canBroadcast,
    audience,
    profileTargeting,
    emailCategory,
    perkId,
    isPerkAnnouncementTemplate,
    refreshAudience,
    audienceTargetingError,
  ]);

  const handleExport = async () => {
    if (!isPerkAnnouncementTemplate && audienceTargetingError) {
      toast({
        title: "Invalid audience",
        description: audienceTargetingError,
        variant: "destructive",
      });
      return;
    }
    if (isPerkAnnouncementTemplate && !perkId) {
      toast({
        title: "Select a perk",
        description: "Choose an active perk before exporting its audience.",
        variant: "destructive",
      });
      return;
    }

    setExporting(true);
    const result = await adminExportBroadcastAudienceCsv(
      audience,
      isPerkAnnouncementTemplate
        ? createDefaultAudienceTargeting()
        : profileTargeting,
      isPerkAnnouncementTemplate
        ? "perks_offers"
        : emailCategory === "none"
          ? undefined
          : emailCategory,
      isPerkAnnouncementTemplate ? perkId || undefined : undefined,
    );
    setExporting(false);
    if (!result.ok || !result.blob) {
      toast({
        title: "Export failed",
        description: result.error ?? "Try again.",
        variant: "destructive",
      });
      return;
    }
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "broadcast-audience.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (!isPerkAnnouncementTemplate && audienceTargetingError) {
      toast({
        title: "Invalid audience",
        description: audienceTargetingError,
        variant: "destructive",
      });
      return;
    }

    setPreviewing(true);
    const result = await adminSendBroadcastPreview(composePayload());
    setPreviewing(false);
    if (!result.ok) {
      toast({
        title: "Preview failed",
        description: result.error ?? "Try again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Preview sent",
      description: `Check ${admin?.email ?? "your inbox"}.`,
    });
  };

  const handleSend = async () => {
    if (!isPerkAnnouncementTemplate && audienceTargetingError) {
      toast({
        title: "Invalid audience",
        description: audienceTargetingError,
        variant: "destructive",
      });
      return;
    }

    if (recipientCount == null || recipientCount < 1) {
      toast({
        title: "No recipients",
        description:
          recipientCount === 0
            ? "No deliverable recipients match this audience filter."
            : "Refresh the audience preview before sending.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm(
      `Send this broadcast to ${recipientCount.toLocaleString()} users via Resend?`,
    );
    if (!confirmed) return;

    setSending(true);
    setSendProgress("Queueing broadcast…");

    const result = await adminSendBroadcastEmail({
      ...composePayload(),
      confirmRecipientCount: recipientCount,
      sendImmediately: true,
    });

    if (!result.ok || !result.data?.jobId) {
      setSending(false);
      setSendProgress(null);
      toast({
        title: "Broadcast failed",
        description: result.error ?? "Try again.",
        variant: "destructive",
      });
      return;
    }

    const jobId = result.data.jobId;
    const deadline = Date.now() + BROADCAST_JOB_POLL_TIMEOUT_MS;
    let completed = false;
    broadcastPollActiveRef.current = true;

    while (Date.now() < deadline) {
      if (!broadcastPollActiveRef.current) {
        return;
      }

      await sleep(BROADCAST_JOB_POLL_INTERVAL_MS);
      if (!broadcastPollActiveRef.current) {
        return;
      }

      const statusResult = await adminFetchBroadcastEmailJob(jobId);
      if (!broadcastPollActiveRef.current) {
        return;
      }

      if (!statusResult.ok || !statusResult.data) {
        setSendProgress("Waiting for broadcast status…");
        continue;
      }

      const job = statusResult.data;
      if (job.status === "pending") {
        setSendProgress("Preparing broadcast…");
        continue;
      }
      if (job.status === "processing") {
        setSendProgress(
          `Syncing contacts to Resend… ${job.syncedContactCount.toLocaleString()} / ${job.recipientCount.toLocaleString()}`,
        );
        continue;
      }
      if (job.status === "failed") {
        broadcastPollActiveRef.current = false;
        setSending(false);
        setSendProgress(null);
        toast({
          title: "Broadcast failed",
          description:
            job.errorMessage ?? "Check server logs for the latest sync error.",
          variant: "destructive",
        });
        return;
      }
      if (job.status === "completed") {
        completed = true;
        broadcastPollActiveRef.current = false;
        setSending(false);
        setSendProgress(null);
        resetComposeForm();
        toast({
          title: "Broadcast queued in Resend",
          description: job.broadcastId
            ? `Broadcast ${job.broadcastId} — ${job.syncedContactCount.toLocaleString()} contacts synced.`
            : `${job.syncedContactCount.toLocaleString()} contacts synced.`,
        });
        break;
      }
    }

    if (!broadcastPollActiveRef.current) {
      return;
    }

    broadcastPollActiveRef.current = false;

    if (!completed) {
      setSending(false);
      setSendProgress(null);
      toast({
        title: "Broadcast still processing",
        description:
          "This large send is still running in the background. Refresh this page and check Netlify logs if needed.",
        variant: "destructive",
      });
    }
  };

  if (!canBroadcast) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Broadcast Email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your admin account does not have permission to send broadcast emails.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Broadcast Email
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compose a Resend broadcast for KeenVPN users, or send the designed
          membership-transfer email. Default audience is all deliverable
          accounts.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Audience</h3>
        <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,220px)_minmax(0,220px)_1fr] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="audience">Recipient filter</Label>
            <Select
              value={audience}
              onValueChange={(value) => {
                const next = value as BroadcastEmailAudience;
                setAudience(next);
                // The backend tags a referral audience as #referrals when no
                // category was chosen. Reflect that here so the form shows
                // what will actually be stored rather than "Uncategorised".
                if (next === "referral_eligible" && category === "none") {
                  setCategory("referrals");
                }
              }}
            >
              <SelectTrigger id="audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {audience === "referral_eligible" ? (
              <p className="text-xs text-muted-foreground">
                Only users who have completed at least one VPN session of an
                hour or more.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) =>
                setCategory(value as BroadcastEmailCategory | "none")
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Groups this send in unsubscribe and weekly reporting.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-category">Email category</Label>
            <Select
              value={
                isPerkAnnouncementTemplate ? "perks_offers" : emailCategory
              }
              onValueChange={setEmailCategory}
              disabled={isPerkAnnouncementTemplate}
            >
              <SelectTrigger id="email-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isPerkAnnouncementTemplate
                ? "Perk announcements always use Class Actions & Perks preferences."
                : "Recipients who turned this category off in their email preferences are excluded."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Expected recipients
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {loadingAudience
                  ? "…"
                  : (recipientCount?.toLocaleString() ?? "—")}
              </p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Total audience</p>
              <p className="text-lg font-medium tabular-nums">
                {loadingAudience
                  ? "…"
                  : (totalAudience?.toLocaleString() ?? "—")}
              </p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Match rate</p>
              <p className="text-lg font-medium tabular-nums">
                {loadingAudience
                  ? "…"
                  : matchPercentage != null
                    ? `${matchPercentage}%`
                    : "—"}
              </p>
            </div>
            {audience !== "all_deliverable" &&
            !loadingAudience &&
            filteredOut != null &&
            deliverableBase != null ? (
              // Total audience is measured after the recipient filter, so it
              // can never show the filter working. This card is what separates
              // "excluded nobody" from "not running at all" (KVPN-602).
              <div className="rounded-lg border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Excluded by recipient filter
                </p>
                <p className="text-lg font-medium tabular-nums">
                  {filteredOut.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  of {deliverableBase.toLocaleString()} deliverable
                </p>
              </div>
            ) : null}
            {audience === "all_deliverable" && optedInCount != null ? (
              <div className="rounded-lg border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">Opted in</p>
                <p className="text-lg font-medium tabular-nums">
                  {optedInCount.toLocaleString()}
                </p>
              </div>
            ) : null}
            <Button
              variant="outline"
              onClick={() =>
                void refreshAudience(
                  audience,
                  profileTargeting,
                  isPerkAnnouncementTemplate ? "perks_offers" : emailCategory,
                  isPerkAnnouncementTemplate ? perkId : undefined,
                )
              }
              disabled={
                loadingAudience ||
                (!isPerkAnnouncementTemplate && !!audienceTargetingError) ||
                (isPerkAnnouncementTemplate && !perkId)
              }
            >
              Refresh count
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExport()}
              disabled={
                exporting ||
                (!isPerkAnnouncementTemplate && !!audienceTargetingError) ||
                loadingAudience ||
                (isPerkAnnouncementTemplate && !perkId)
              }
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        </div>
        {isPerkAnnouncementTemplate ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1">
            <p className="text-sm font-medium">Perk audience</p>
            <p className="text-xs text-muted-foreground">
              {perkId
                ? "Recipient count uses this perk’s stored audience targeting and access level (not the profile filters below)."
                : "Select a perk to load the audience that will actually receive this send."}
            </p>
          </div>
        ) : null}
        <AudienceTargetingPanel
          value={profileTargeting}
          onChange={setProfileTargeting}
          context="broadcast"
          deliverability={audience}
          disabled={isPerkAnnouncementTemplate}
          sharedPreview={{
            data: isPerkAnnouncementTemplate ? null : sharedAudiencePreview,
            loading: isPerkAnnouncementTemplate ? false : loadingAudience,
          }}
        />
        {isPerkAnnouncementTemplate ? (
          <p className="text-xs text-muted-foreground">
            Profile targeting is locked for perk announcements so the count
            always matches the selected perk.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Message</h3>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select
              value={template}
              onValueChange={(value) =>
                applyTemplate(value as BroadcastEmailTemplate | "custom")
              }
            >
              <SelectTrigger id="template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isMembershipTransferTemplate ? (
              <p className="text-xs text-muted-foreground">
                Sends the designed membership-transfer layout. The button always
                goes to {MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.ctaUrl}. Edit
                the subject to override the template default.
              </p>
            ) : isPerkAnnouncementTemplate ? (
              <p className="text-xs text-muted-foreground">
                Class action perks use the settlement layout: a badge, company
                logos, payout, and a button to the KeenVPN class action page.
                Other perks use the generic perk card. Audience is everyone that
                perk is available to, under Class Actions &amp; Perks
                preferences.
              </p>
            ) : isChromeExtensionTemplate ? (
              <p className="text-xs text-muted-foreground">
                Sends the designed Chrome extension layout. Both CTAs always go
                to the Chrome Web Store listing with campaign attribution,
                regardless of any CTA URL. Edit the subject to override the
                template default.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Write a one-off broadcast. Use a designed template to send one
                of the designed campaigns instead.
              </p>
            )}
          </div>
          {isPerkAnnouncementTemplate ? (
            <div className="space-y-2">
              <Label htmlFor="perkId">Perk</Label>
              <Select
                value={perkId || undefined}
                onValueChange={(value) => setPerkId(value)}
                disabled={loadingPerks}
              >
                <SelectTrigger id="perkId">
                  <SelectValue
                    placeholder={
                      loadingPerks ? "Loading perks…" : "Select an active perk"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {activePerks.map((perk) => (
                    <SelectItem key={perk.id} value={perk.id}>
                      {perk.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPerk ? (
                <p className="text-xs text-muted-foreground">
                  Access: {selectedPerk.accessLevel} · Category:{" "}
                  {selectedPerk.category.replace(/_/g, " ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {isClassActionPerk ? (
            <div className="space-y-3">
              <div>
                <Label>Companies &amp; logos</Label>
                <p className="text-xs text-muted-foreground">
                  Use hosted PNG/JPG logos (e.g. Cloudinary). SVG won&apos;t
                  show in Gmail/Outlook.
                </p>
              </div>
              {companies.map((company) => (
                <div
                  key={company.id}
                  className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="space-y-1">
                    <Label htmlFor={`company-name-${company.id}`}>
                      Company name
                    </Label>
                    <Input
                      id={`company-name-${company.id}`}
                      value={company.name}
                      onChange={(event) =>
                        setCompanies((rows) =>
                          rows.map((row) =>
                            row.id === company.id
                              ? { ...row, name: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`company-logo-${company.id}`}>
                      Logo URL
                    </Label>
                    <Input
                      id={`company-logo-${company.id}`}
                      value={company.logoUrl}
                      placeholder="https://"
                      onChange={(event) =>
                        setCompanies((rows) =>
                          rows.map((row) =>
                            row.id === company.id
                              ? { ...row, logoUrl: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <LogoThumb url={company.logoUrl} />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setCompanies((rows) =>
                          rows.filter((row) => row.id !== company.id),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {companyErrors.map((error) => (
                <p key={error} className="text-xs text-destructive">
                  {error}
                </p>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={companies.length >= MAX_BROADCAST_COMPANIES}
                onClick={() =>
                  setCompanies((rows) =>
                    rows.length >= MAX_BROADCAST_COMPANIES
                      ? rows
                      : [...rows, createBroadcastCompanyDraft()],
                  )
                }
              >
                Add company
              </Button>
            </div>
          ) : null}
          {isMembershipTransferTemplate ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 space-y-2 text-sm">
              <p className="font-medium">Designed membership-transfer email</p>
              <p className="text-muted-foreground">
                {MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.headline} We bring your
                remaining time to KeenVPN.
              </p>
              <p>
                CTA: {MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.ctaLabel} →{" "}
                <span className="font-mono text-xs">
                  {MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.ctaUrl}
                </span>
              </p>
            </div>
          ) : null}
          {isChromeExtensionTemplate ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 space-y-2 text-sm">
              <p className="font-medium">Designed Chrome extension email</p>
              <p className="text-muted-foreground">
                {CHROME_EXTENSION_BROADCAST_DEFAULTS.headline}
              </p>
              <p>
                CTA: {CHROME_EXTENSION_BROADCAST_DEFAULTS.ctaLabel} →{" "}
                <span className="font-mono text-xs break-all">
                  {CHROME_EXTENSION_BROADCAST_DEFAULTS.ctaUrl}
                </span>
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="subject">
              {isDesignedTemplate ? "Subject (optional)" : "Subject"}
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={
                isMembershipTransferTemplate
                  ? MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS.subject
                  : isChromeExtensionTemplate
                    ? CHROME_EXTENSION_BROADCAST_DEFAULTS.subject
                    : "New partner perk for KeenVPN members"
              }
            />
          </div>
          {isMembershipTransferTemplate || isChromeExtensionTemplate ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="headline">Headline</Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="Exclusive cashback offer inside"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preheader">Preheader (optional)</Label>
                <Input
                  id="preheader"
                  value={preheader}
                  onChange={(event) => setPreheader(event.target.value)}
                  placeholder="Short inbox preview line"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="body">Body</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={8}
                  placeholder={
                    "We partnered with a new cashback provider.\n\nView the full offer and claim steps on your perks page."
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Separate paragraphs with a blank line.
                </p>
                {isClassActionPerk ? (
                  <p className="text-xs text-muted-foreground">
                    When companies are listed, the email shows &quot;Customers
                    of … may be eligible to submit a claim.&quot; instead of
                    this body. The body is only used when no companies are
                    listed.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ctaLabel">CTA label (optional)</Label>
                  <Input
                    id="ctaLabel"
                    value={ctaLabel}
                    onChange={(event) => setCtaLabel(event.target.value)}
                  />
                </div>
                {isClassActionPerk ? (
                  <div className="space-y-2">
                    <Label>Button link</Label>
                    <p className="text-sm text-muted-foreground">
                      Button links to the KeenVPN class action page.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="ctaUrl">CTA URL (optional)</Label>
                    <Input
                      id="ctaUrl"
                      value={ctaUrl}
                      onChange={(event) => setCtaUrl(event.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => void handlePreview()}
          disabled={
            previewing ||
            !composeReady ||
            (!isPerkAnnouncementTemplate && !!audienceTargetingError)
          }
        >
          {previewing ? "Sending preview…" : "Send preview to me"}
        </Button>
        <Button
          onClick={() => void handleSend()}
          disabled={
            sending ||
            loadingAudience ||
            (!isPerkAnnouncementTemplate && !!audienceTargetingError) ||
            !composeReady ||
            recipientCount == null ||
            recipientCount < 1
          }
        >
          {sending ? "Sending…" : "Send broadcast"}
        </Button>
      </div>

      {sendProgress ? (
        <p className="text-sm text-muted-foreground">{sendProgress}</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Requires `RESEND_BROADCAST_SEGMENT_ID` on the backend. Recipients are
        synced to that Resend segment before the broadcast is created. Resend
        adds per-recipient unsubscribe links automatically.
      </p>
    </div>
  );
}
