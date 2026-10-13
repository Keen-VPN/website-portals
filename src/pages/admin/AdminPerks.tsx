import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADMIN_PERK_RESTORE_QUERY,
  adminPerkLoginReturnPath,
  claimUnscopedLegacyPerkFormDraft,
  clearPerkFormDraft,
  defaultPerkEndDateInput,
  discardUnscopedLegacyPerkFormDraft,
  draftMatchesSession,
  isAdminSessionError,
  peekUnscopedLegacyPerkFormDraft,
  readPerkFormDraft,
  writePerkFormDraft,
  type PendingLegacyPerkFormDraft,
  type PerkFormDraft,
} from "@/pages/admin/admin-perk-form-draft";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminClonePerk,
  adminCreatePerk,
  adminDeletePerk,
  adminFetchAllPerkReactivations,
  adminFetchPerkReactivations,
  adminFetchPerksMetrics,
  adminListExpiredPerks,
  adminListNotReceivedPerks,
  adminListPerks,
  adminListWorkflowTypes,
  adminReactivatePerk,
  adminResolveNotReceivedPerk,
  adminUpdatePerk,
  type AdminNotReceivedPerkRow,
  type AdminPerk,
  type AdminPerkReactivation,
  type AdminPerksMetrics,
  type AdminWorkflowTypeOption,
  type CreateAdminPerkPayload,
  type ExtensionDomainRule,
  type PerkCategory,
  type PerkRedemptionType,
} from "@/auth/backend";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useFeatureFlags } from "@/lib/feature-flags";
import {
  AudienceTargetingPanel,
} from "@/components/admin/AudienceTargetingPanel";
import {
  cloneAudienceTargeting,
  createDefaultAudienceTargeting,
  getAudienceTargetingValidationError,
} from "@/components/admin/audience-targeting.constants";
import type { AudienceTargeting } from "@/auth/backend";

const PERK_CATEGORIES: { value: PerkCategory; label: string }[] = [
  { value: "privacy_security", label: "Privacy & Security" },
  { value: "ai_productivity", label: "AI & Productivity" },
  { value: "developer_tools", label: "Developer Tools" },
  { value: "startup_growth", label: "Startup & Growth" },
  { value: "remote_work", label: "Remote Work" },
  { value: "finance", label: "Finance" },
  { value: "class_action", label: "Class Action" },
];

const REDEMPTION_TYPES: { value: PerkRedemptionType; label: string }[] = [
  { value: "external_link", label: "External link" },
  { value: "coupon_code", label: "Coupon code" },
  { value: "invite_only", label: "Invite only" },
  { value: "workflow", label: "Workflow (auto-apply)" },
];

/** Fallback if /admin/workflows/types is unavailable. */
const FALLBACK_WORKFLOW_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "chase_signup", label: "Chase — Account signup (VIG)" },
  { value: "airwallex_signup", label: "Airwallex — Business signup" },
  { value: "mercury_signup", label: "Mercury — Business signup" },
];

const ACCESS_LEVELS = [
  { value: "free", label: "All members" },
  { value: "paid", label: "Paid members" },
  { value: "annual", label: "Annual members" },
] as const;

interface ExtensionDomainFormRow {
  host: string;
  pathPrefix: string;
  priority: string;
}

interface PerkFormState {
  id: string;
  title: string;
  partnerName: string;
  category: PerkCategory;
  description: string;
  imageUrl: string;
  offerText: string;
  redemptionType: PerkRedemptionType;
  redemptionUrl: string;
  couponCode: string;
  workflowType: string;
  accessLevel: "free" | "paid" | "annual";
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  audienceTargeting: AudienceTargeting;
  extensionDomains: ExtensionDomainFormRow[];
}

function normalizeExtensionHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function emptyExtensionDomainRow(): ExtensionDomainFormRow {
  return { host: "", pathPrefix: "", priority: "" };
}

function extensionDomainsToFormRows(
  rules: ExtensionDomainRule[] | undefined,
): ExtensionDomainFormRow[] {
  if (!rules?.length) {
    return [];
  }

  return rules.map((rule) => ({
    host: rule.host,
    pathPrefix: rule.pathPrefix ?? "",
    priority:
      rule.priority != null && Number.isFinite(rule.priority)
        ? String(rule.priority)
        : "",
  }));
}

function extensionDomainsFromFormRows(
  rows: ExtensionDomainFormRow[],
): ExtensionDomainRule[] {
  const rules: ExtensionDomainRule[] = [];

  for (const row of rows) {
    const host = normalizeExtensionHost(row.host);
    if (!host) {
      continue;
    }

    const priority = row.priority.trim();
    const parsedPriority = priority ? Number(priority) : undefined;
    const rule: ExtensionDomainRule = { host };

    if (row.pathPrefix.trim()) {
      rule.pathPrefix = row.pathPrefix.trim();
    }
    if (parsedPriority != null && Number.isFinite(parsedPriority)) {
      rule.priority = parsedPriority;
    }

    rules.push(rule);
  }

  return rules;
}

function validateExtensionDomains(rows: ExtensionDomainFormRow[]): string | null {
  for (const row of rows) {
    const host = normalizeExtensionHost(row.host);
    const hasExtra =
      row.pathPrefix.trim().length > 0 || row.priority.trim().length > 0;

    if (!host && hasExtra) {
      return "Each Chrome extension site needs a host when path or priority is set.";
    }

    if (host && !/^[a-z0-9.-]+$/.test(host)) {
      return `Invalid extension host "${host}". Use a domain like amazon.com.`;
    }

    if (row.priority.trim()) {
      const parsed = Number(row.priority.trim());
      if (!Number.isFinite(parsed)) {
        return "Extension site priority must be a number.";
      }
    }
  }

  return null;
}

function formatExtensionSiteSummary(rules: ExtensionDomainRule[] | undefined) {
  if (!rules?.length) {
    return "—";
  }

  const preview = rules
    .slice(0, 2)
    .map((rule) => rule.pathPrefix ? `${rule.host}${rule.pathPrefix}` : rule.host)
    .join(", ");

  if (rules.length > 2) {
    return `${preview} +${rules.length - 2}`;
  }

  return preview;
}

function parseSortOrder(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalIsoDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

/** Build a stable perk id from partner and/or title for business-friendly create. */
function slugifyPerkIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function buildPerkId(partnerName: string, title: string): string {
  const partner = slugifyPerkIdPart(partnerName);
  const titlePart = slugifyPerkIdPart(title);
  let core = partner || titlePart;
  if (!core) return "";
  if (partner && titlePart && partner !== titlePart) {
    const shortTitle = titlePart.slice(0, 24);
    if (!partner.includes(shortTitle) && !shortTitle.includes(partner)) {
      core = `${partner}_${shortTitle}`.slice(0, 48);
    }
  }
  if (!/^[a-z]/.test(core)) {
    core = `p_${core}`;
  }
  return `perk_${core}`.slice(0, 64);
}

function uniquePerkId(preferred: string, existingIds: string[]): string {
  if (!preferred) return "";
  const taken = new Set(existingIds);
  if (!taken.has(preferred)) return preferred;
  const root = preferred.slice(0, 58);
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${root}_${n}`.slice(0, 64);
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}_${Date.now().toString(36)}`.slice(0, 64);
}

const emptyForm = (): PerkFormState => ({
  id: "",
  title: "",
  partnerName: "",
  category: "privacy_security",
  description: "",
  imageUrl: "",
  offerText: "",
  redemptionType: "external_link",
  redemptionUrl: "",
  couponCode: "",
  workflowType: "",
  accessLevel: "paid",
  isFeatured: false,
  isActive: true,
  sortOrder: "0",
  startsAt: "",
  endsAt: defaultPerkEndDateInput(),
  audienceTargeting: createDefaultAudienceTargeting(),
  extensionDomains: [],
});

function formToCreatePayload(form: PerkFormState): CreateAdminPerkPayload {
  return {
    id: form.id.trim(),
    title: form.title.trim(),
    partnerName: form.partnerName.trim() || undefined,
    category: form.category,
    description: form.description.trim(),
    imageUrl: form.imageUrl.trim() || undefined,
    offerText: form.offerText.trim(),
    redemptionType: form.redemptionType,
    redemptionUrl: form.redemptionUrl.trim() || undefined,
    couponCode: form.couponCode.trim() || undefined,
    workflowType: form.workflowType.trim() || undefined,
    accessLevel: form.accessLevel,
    isFeatured: form.isFeatured,
    isActive: form.isActive,
    sortOrder: parseSortOrder(form.sortOrder),
    startsAt: optionalIsoDate(form.startsAt),
    endsAt: form.endsAt.trim() ? optionalIsoDate(form.endsAt) : null,
    audienceTargeting: form.audienceTargeting,
    extensionDomains: extensionDomainsFromFormRows(form.extensionDomains),
  };
}

function perkToForm(perk: AdminPerk): PerkFormState {
  return {
    id: perk.id,
    title: perk.title,
    partnerName: perk.partnerName ?? "",
    category: perk.category,
    description: perk.description,
    imageUrl: perk.imageUrl ?? "",
    offerText: perk.offerText,
    redemptionType: perk.redemptionType,
    redemptionUrl: perk.redemptionUrl ?? "",
    couponCode: perk.couponCode ?? "",
    workflowType: perk.workflowType ?? "",
    accessLevel: perk.accessLevel,
    isFeatured: perk.isFeatured,
    isActive: perk.isActive,
    sortOrder: String(perk.sortOrder),
    startsAt: perk.startsAt ? perk.startsAt.slice(0, 10) : "",
    endsAt: perk.endsAt ? perk.endsAt.slice(0, 10) : "",
    audienceTargeting: perk.audienceTargeting
      ? cloneAudienceTargeting(perk.audienceTargeting)
      : createDefaultAudienceTargeting(),
    extensionDomains: extensionDomainsToFormRows(perk.extensionDomains),
  };
}

function categoryLabel(category: PerkCategory): string {
  return PERK_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatDateRange(from?: string, to?: string) {
  if (!from || !to) return "Last 90 days";
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Last 90 days";
  }
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

function dateInputToIsoStart(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function dateInputToIsoExclusiveEnd(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function formatAdminDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatAdminDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function adminDisplayName(
  admin: AdminPerkReactivation["adminUser"],
): string {
  if (!admin) return "—";
  return admin.name?.trim() || admin.email;
}

function statusLabel(status: AdminPerk["status"]) {
  switch (status) {
    case "active":
      return "Active";
    case "scheduled":
      return "Scheduled";
    case "draft":
      return "Pending review";
    case "expired":
      return "Expired";
    case "cooling_off":
      return "Cooling off";
    case "eligible_for_readd":
      return "Eligible";
    default:
      return status;
  }
}

function statusBadgeVariant(
  status: AdminPerk["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "scheduled":
    case "draft":
      return "secondary";
    case "expired":
    case "cooling_off":
      return "destructive";
    case "eligible_for_readd":
      return "outline";
    default:
      return "outline";
  }
}

function accessLabel(level: AdminPerk["accessLevel"]) {
  return (
    ACCESS_LEVELS.find((entry) => entry.value === level)?.label ?? level
  );
}

function accessBadgeClass(level: AdminPerk["accessLevel"]) {
  switch (level) {
    case "free":
      return "border-emerald-400 bg-emerald-500/40 text-emerald-100";
    case "paid":
      return "border-sky-400 bg-sky-500/40 text-sky-100";
    case "annual":
      return "border-amber-400 bg-amber-500/40 text-amber-100";
    default:
      return "";
  }
}

function redemptionLabel(type: PerkRedemptionType) {
  return (
    REDEMPTION_TYPES.find((entry) => entry.value === type)?.label ??
    type.replace(/_/g, " ")
  );
}

const NOT_RECEIVED_PAGE_SIZE = 500;

export default function AdminPerks() {
  const { admin, can } = useAdminAuth();
  const { workflowsEnabled } = useFeatureFlags();
  const canWrite = can("subscriptions.write");
  const canBroadcastEmail = can("emails.broadcast");
  const showPerkActions = canWrite || canBroadcastEmail;
  const adminId = admin?.id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();

  const [perks, setPerks] = useState<AdminPerk[]>([]);
  const [expiredPerks, setExpiredPerks] = useState<AdminPerk[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExpired, setLoadingExpired] = useState(true);
  const [expiredError, setExpiredError] = useState<string | null>(null);
  const [reactivationHistory, setReactivationHistory] = useState<
    AdminPerkReactivation[]
  >([]);
  const [loadingReactivations, setLoadingReactivations] = useState(true);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyPerk, setHistoryPerk] = useState<AdminPerk | null>(null);
  const [perkHistory, setPerkHistory] = useState<AdminPerkReactivation[]>([]);
  const [loadingPerkHistory, setLoadingPerkHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [highlightPerkId, setHighlightPerkId] = useState<string | null>(null);
  const focusedPerkFromQueryRef = useRef(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PerkFormState>(emptyForm());
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [showIdEditor, setShowIdEditor] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<PerkFormDraft | null>(
    null,
  );
  const [pendingLegacyDraft, setPendingLegacyDraft] =
    useState<PendingLegacyPerkFormDraft | null>(null);
  const [sessionErrorUnauthorized, setSessionErrorUnauthorized] =
    useState(false);
  /** When false, autosave will not overwrite an unrelated stored draft. */
  const claimDraftSessionRef = useRef(false);
  /** Stable blank endsAt for this dialog session (avoids midnight false drafts). */
  const sessionBlankEndsAtRef = useRef(defaultPerkEndDateInput());
  const showDisabledWorkflowType =
    !workflowsEnabled && Boolean(editingId) && form.redemptionType === "workflow";
  const availableRedemptionTypes =
    workflowsEnabled || showDisabledWorkflowType
      ? REDEMPTION_TYPES
      : REDEMPTION_TYPES.filter((type) => type.value !== "workflow");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowTypeOptions, setWorkflowTypeOptions] = useState<
    { value: string; label: string }[]
  >(FALLBACK_WORKFLOW_TYPE_OPTIONS);

  const [metrics, setMetrics] = useState<AdminPerksMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const metricsRequest = useRef<AbortController | null>(null);
  const historyRequestRef = useRef(0);
  const [notReceivedRows, setNotReceivedRows] = useState<
    AdminNotReceivedPerkRow[]
  >([]);
  const [loadingNotReceived, setLoadingNotReceived] = useState(false);
  const [loadingMoreNotReceived, setLoadingMoreNotReceived] = useState(false);
  const [notReceivedHasMore, setNotReceivedHasMore] = useState(false);
  const [notReceivedError, setNotReceivedError] = useState<string | null>(null);
  const [resolvingRedemptionIds, setResolvingRedemptionIds] = useState<
    Set<string>
  >(() => new Set());
  const notReceivedRequestRef = useRef(0);

  const loadNotReceived = useCallback(async () => {
    const requestId = ++notReceivedRequestRef.current;
    setLoadingNotReceived(true);
    setLoadingMoreNotReceived(false);
    setNotReceivedError(null);
    setNotReceivedHasMore(false);

    const res = await adminListNotReceivedPerks({
      limit: NOT_RECEIVED_PAGE_SIZE,
      offset: 0,
    });
    if (requestId !== notReceivedRequestRef.current) return;
    if (!res.ok) {
      setNotReceivedRows([]);
      setNotReceivedHasMore(false);
      setNotReceivedError(res.error ?? "Failed to load not-received queue");
      setLoadingNotReceived(false);
      return;
    }

    const page = res.data ?? [];
    setNotReceivedRows(page);
    setNotReceivedHasMore(res.hasMore === true && page.length > 0);
    setLoadingNotReceived(false);
  }, []);

  const loadMoreNotReceived = useCallback(async () => {
    if (loadingNotReceived || loadingMoreNotReceived || !notReceivedHasMore) {
      return;
    }
    const requestId = notReceivedRequestRef.current;
    setLoadingMoreNotReceived(true);
    setNotReceivedError(null);

    const res = await adminListNotReceivedPerks({
      limit: NOT_RECEIVED_PAGE_SIZE,
      offset: notReceivedRows.length,
    });
    if (requestId !== notReceivedRequestRef.current) return;
    if (!res.ok) {
      setNotReceivedError(res.error ?? "Failed to load more reports");
      setLoadingMoreNotReceived(false);
      return;
    }

    const page = res.data ?? [];
    setNotReceivedRows((prev) => {
      const seen = new Set(prev.map((row) => row.id));
      const appended = page.filter((row) => !seen.has(row.id));
      return [...prev, ...appended];
    });
    setNotReceivedHasMore(res.hasMore === true && page.length > 0);
    setLoadingMoreNotReceived(false);
  }, [
    loadingMoreNotReceived,
    loadingNotReceived,
    notReceivedHasMore,
    notReceivedRows.length,
  ]);

  const loadMetrics = useCallback(async (fromValue: string, toValue: string) => {
    metricsRequest.current?.abort();
    const controller = new AbortController();
    metricsRequest.current = controller;

    setLoadingMetrics(true);
    setMetricsError(null);
    if (fromValue && toValue && fromValue > toValue) {
      setMetrics(null);
      setMetricsError("Start date must be before end date");
      setLoadingMetrics(false);
      metricsRequest.current = null;
      return;
    }

    const res = await adminFetchPerksMetrics({
      from: dateInputToIsoStart(fromValue),
      to: dateInputToIsoExclusiveEnd(toValue),
      signal: controller.signal,
    });

    if (controller.signal.aborted || metricsRequest.current !== controller) {
      return;
    }

    if (!res.ok || !res.data) {
      setMetrics(null);
      setMetricsError(res.error ?? "Failed to load perk metrics");
    } else {
      setMetrics(res.data);
    }
    setLoadingMetrics(false);
    metricsRequest.current = null;
  }, []);

  const resolveNotReceived = useCallback(
    async (
      redemptionId: string,
      payload: {
        resolution: "confirmed_received" | "dismissed" | "reopened";
        note?: string;
      },
    ) => {
      if (!canWrite) return;
      setResolvingRedemptionIds((prev) => {
        const next = new Set(prev);
        next.add(redemptionId);
        return next;
      });
      try {
        const res = await adminResolveNotReceivedPerk(redemptionId, payload);
        if (!res.ok) {
          setNotReceivedError(res.error ?? "Failed to resolve");
          return;
        }
        await Promise.all([
          loadNotReceived(),
          loadMetrics(fromInput, toInput),
        ]);
      } finally {
        setResolvingRedemptionIds((prev) => {
          const next = new Set(prev);
          next.delete(redemptionId);
          return next;
        });
      }
    },
    [canWrite, fromInput, loadMetrics, loadNotReceived, toInput],
  );

  const loadExpired = useCallback(async () => {
    setLoadingExpired(true);
    setExpiredError(null);
    const res = await adminListExpiredPerks();
    if (res.ok) {
      setExpiredPerks(res.data ?? []);
    } else {
      setExpiredPerks([]);
      setExpiredError(res.error ?? "Failed to load expired perks");
    }
    setLoadingExpired(false);
  }, []);

  const loadReactivationHistory = useCallback(async () => {
    setLoadingReactivations(true);
    const res = await adminFetchAllPerkReactivations({ limit: 50 });
    if (res.ok) {
      setReactivationHistory(res.data ?? []);
    } else {
      setReactivationHistory([]);
    }
    setLoadingReactivations(false);
  }, []);

  const openPerkHistory = async (perk: AdminPerk) => {
    const requestId = ++historyRequestRef.current;
    setHistoryPerk(perk);
    setHistoryDialogOpen(true);
    setLoadingPerkHistory(true);
    setHistoryError(null);
    setPerkHistory([]);
    const res = await adminFetchPerkReactivations(perk.id);
    if (requestId !== historyRequestRef.current) return;
    if (res.ok) {
      setPerkHistory(res.data ?? []);
    } else {
      setHistoryError(res.error ?? "Failed to load reactivation history");
    }
    setLoadingPerkHistory(false);
  };

  const loadPerks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await adminListPerks({ includeInactive: showInactive });
    if (!res.ok) {
      setPerks([]);
      setError(res.error ?? "Failed to load perks");
    } else {
      setPerks(res.data ?? []);
    }
    setLoading(false);
  }, [showInactive]);

  useEffect(() => {
    void loadPerks();
  }, [loadPerks]);

  useEffect(() => {
    void (async () => {
      const res = await adminListWorkflowTypes();
      if (!res.ok || !res.data?.types) return;
      const options = res.data.types
        .filter((type: AdminWorkflowTypeOption) => type.selectable)
        .map((type: AdminWorkflowTypeOption) => ({
          value: type.type,
          label: `${type.partnerName} — ${type.type}${
            type.requiredFieldKeys.length
              ? ` (${type.requiredFieldKeys.join(", ")})`
              : ""
          }`,
        }));
      // Always apply — an empty selectable list must clear the fallback options.
      setWorkflowTypeOptions(options);
    })();
  }, []);

  useEffect(() => {
    void loadExpired();
    void loadReactivationHistory();
  }, [loadExpired, loadReactivationHistory]);

  useEffect(() => {
    void loadMetrics("", "");
    void loadNotReceived();
    return () => metricsRequest.current?.abort();
  }, [loadMetrics, loadNotReceived]);

  const applyDraft = useCallback((draft: PerkFormDraft) => {
    sessionBlankEndsAtRef.current =
      draft.blankEndsAt || defaultPerkEndDateInput();
    setEditingId(draft.mode === "edit" ? draft.editingId : null);
    setForm({
      ...emptyForm(),
      ...draft.form,
      category: draft.form.category as PerkCategory,
      redemptionType: draft.form.redemptionType as PerkRedemptionType,
      audienceTargeting: draft.form.audienceTargeting,
      extensionDomains: draft.form.extensionDomains,
    });
    setIdManuallyEdited(draft.idManuallyEdited);
    setShowIdEditor(draft.showIdEditor);
    setDialogError(null);
    setSessionErrorUnauthorized(false);
    claimDraftSessionRef.current = true;
    setDialogOpen(true);
  }, []);

  const persistCurrentDraft = useCallback(
    (opts?: { force?: boolean }) => {
      if (!adminId || !canWrite) return false;
      const existing = readPerkFormDraft(adminId);
      // Only overwrite an existing recovery draft once this dialog session claims it
      // (Continue draft / new blank with no prior draft / successful edit of same draft).
      if (existing && !claimDraftSessionRef.current && !opts?.force) {
        return false;
      }
      const wrote = writePerkFormDraft(
        {
          adminId,
          mode: editingId ? "edit" : "create",
          editingId,
          idManuallyEdited,
          showIdEditor,
          blankEndsAt: sessionBlankEndsAtRef.current,
          form,
        },
        localStorage,
        sessionBlankEndsAtRef.current,
      );
      if (wrote) {
        claimDraftSessionRef.current = true;
        setRecoveryDraft(readPerkFormDraft(adminId));
      }
      return wrote;
    },
    [adminId, canWrite, editingId, form, idManuallyEdited, showIdEditor],
  );

  useEffect(() => {
    if (!adminId) {
      setRecoveryDraft(null);
      setPendingLegacyDraft(null);
      return;
    }
    setRecoveryDraft(readPerkFormDraft(adminId));
    setPendingLegacyDraft(peekUnscopedLegacyPerkFormDraft());
  }, [adminId]);

  // Autosave while the dialog is open so an expired session never wipes work.
  useEffect(() => {
    if (!dialogOpen || !canWrite || !adminId) return;
    const timer = window.setTimeout(() => {
      persistCurrentDraft();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [adminId, canWrite, dialogOpen, persistCurrentDraft]);

  // After re-auth, restore the draft and strip the query flag.
  const restoredFromQueryRef = useRef(false);
  useEffect(() => {
    if (restoredFromQueryRef.current) return;
    if (searchParams.get(ADMIN_PERK_RESTORE_QUERY) !== "1") return;
    restoredFromQueryRef.current = true;
    if (adminId && canWrite) {
      const draft = readPerkFormDraft(adminId);
      if (draft) {
        applyDraft(draft);
        setRecoveryDraft(draft);
      }
    }
    const next = new URLSearchParams(searchParams);
    next.delete(ADMIN_PERK_RESTORE_QUERY);
    setSearchParams(next, { replace: true });
  }, [adminId, applyDraft, canWrite, searchParams, setSearchParams]);

  useEffect(() => {
    if (focusedPerkFromQueryRef.current || loading) return;
    const id = searchParams.get("perkId")?.trim();
    if (!id) return;
    const inCatalog =
      perks.some((p) => p.id === id) ||
      expiredPerks.some((p) => p.id === id);
    if (!inCatalog && loadingExpired) return;
    focusedPerkFromQueryRef.current = true;
    setHighlightPerkId(id);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`admin-perk-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const next = new URLSearchParams(searchParams);
    next.delete("perkId");
    setSearchParams(next, { replace: true });
  }, [
    expiredPerks,
    loading,
    loadingExpired,
    perks,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!highlightPerkId) return;
    const timer = window.setTimeout(() => setHighlightPerkId(null), 6000);
    return () => window.clearTimeout(timer);
  }, [highlightPerkId]);

  const openCreate = () => {
    const existing = adminId ? readPerkFormDraft(adminId) : null;
    // Intentionally start blank — do not auto-restore an old draft into a new form.
    sessionBlankEndsAtRef.current = defaultPerkEndDateInput();
    setEditingId(null);
    setForm(emptyForm());
    setIdManuallyEdited(false);
    setShowIdEditor(false);
    setDialogError(null);
    setSessionErrorUnauthorized(false);
    claimDraftSessionRef.current = !existing;
    setDialogOpen(true);
  };

  const openEdit = (perk: AdminPerk) => {
    const existing = adminId ? readPerkFormDraft(adminId) : null;
    sessionBlankEndsAtRef.current = defaultPerkEndDateInput();
    setEditingId(perk.id);
    setForm(perkToForm(perk));
    setIdManuallyEdited(false);
    setShowIdEditor(false);
    setDialogError(null);
    setSessionErrorUnauthorized(false);
    claimDraftSessionRef.current = Boolean(
      existing && draftMatchesSession(existing, perk.id),
    );
    setDialogOpen(true);
  };

  const continueRecoveryDraft = () => {
    if (!adminId) return;
    const draft = readPerkFormDraft(adminId);
    if (!draft) {
      setRecoveryDraft(null);
      return;
    }
    applyDraft(draft);
  };

  const claimLegacyDraft = () => {
    if (!adminId) return;
    const claimed = claimUnscopedLegacyPerkFormDraft(adminId);
    if (!claimed) return;
    setPendingLegacyDraft(null);
    setRecoveryDraft(claimed);
    applyDraft(claimed);
  };

  const discardLegacyDraft = () => {
    discardUnscopedLegacyPerkFormDraft();
    setPendingLegacyDraft(null);
  };

  const discardRecoveryDraft = () => {
    if (!adminId) return;
    clearPerkFormDraft(adminId);
    setRecoveryDraft(null);
    claimDraftSessionRef.current = dialogOpen;
  };

  const closePerkDialog = () => {
    // Persist immediately so Cancel within the autosave debounce window keeps edits.
    persistCurrentDraft();
    setDialogError(null);
    setSessionErrorUnauthorized(false);
    setDialogOpen(false);
  };

  const existingPerkIds = [
    ...perks.map((perk) => perk.id),
    ...expiredPerks.map((perk) => perk.id),
  ];

  const syncGeneratedPerkId = (partnerName: string, title: string) => {
    if (editingId || idManuallyEdited) return;
    const preferred = buildPerkId(partnerName, title);
    const nextId = uniquePerkId(preferred, existingPerkIds);
    setForm((prev) => ({ ...prev, id: nextId }));
  };

  const toggleActive = async (perk: AdminPerk, isActive: boolean) => {
    const res = await adminUpdatePerk(perk.id, { isActive });
    if (!res.ok) {
      setError(res.error ?? "Failed to update perk");
      return;
    }
    void loadPerks();
  };

  const toggleFeatured = async (perk: AdminPerk, isFeatured: boolean) => {
    const res = await adminUpdatePerk(perk.id, { isFeatured });
    if (!res.ok) {
      setError(res.error ?? "Failed to update perk");
      return;
    }
    void loadPerks();
  };

  const deletePerk = async (perk: AdminPerk) => {
    if (
      !window.confirm(
        `Remove "${perk.title}"? Perks with redemption history will be deactivated instead of permanently deleted.`,
      )
    ) {
      return;
    }
    const res = await adminDeletePerk(perk.id);
    if (!res.ok) {
      setError(res.error ?? "Failed to delete perk");
      return;
    }
    if (res.softDeleted && res.message) {
      setError(null);
      window.alert(res.message);
    }
    void loadPerks();
  };

  const validateFormDates = (): string | null => {
    if (form.startsAt.trim() && form.endsAt.trim() && form.startsAt > form.endsAt) {
      return "Start date must be before end date.";
    }
    return null;
  };

  const savePerk = async () => {
    setSaving(true);
    setDialogError(null);

    const dateError = validateFormDates();
    if (dateError) {
      setSaving(false);
      setDialogError(dateError);
      return;
    }

    const audienceError = getAudienceTargetingValidationError(
      form.audienceTargeting,
    );
    if (audienceError) {
      setSaving(false);
      setDialogError(audienceError);
      return;
    }

    const extensionDomainsError = validateExtensionDomains(form.extensionDomains);
    if (extensionDomainsError) {
      setSaving(false);
      setDialogError(extensionDomainsError);
      return;
    }

    if (form.redemptionType === "workflow" && !form.workflowType.trim()) {
      setSaving(false);
      setDialogError("Workflow type is required for workflow perks.");
      return;
    }

    const extensionDomains = extensionDomainsFromFormRows(form.extensionDomains);

    if (editingId) {
      const res = await adminUpdatePerk(editingId, {
        title: form.title.trim(),
        partnerName: form.partnerName.trim() || null,
        category: form.category,
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim() || null,
        offerText: form.offerText.trim(),
        redemptionType: form.redemptionType,
        redemptionUrl: form.redemptionUrl.trim() || null,
        couponCode: form.couponCode.trim() || null,
        workflowType: form.workflowType.trim() || null,
        accessLevel: form.accessLevel,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
        sortOrder: parseSortOrder(form.sortOrder),
        startsAt: form.startsAt.trim()
          ? optionalIsoDate(form.startsAt) ?? null
          : null,
        endsAt: form.endsAt.trim()
          ? optionalIsoDate(form.endsAt) ?? null
          : null,
        audienceTargeting: form.audienceTargeting,
        extensionDomains,
      });
      setSaving(false);
      if (!res.ok) {
        // Never force-overwrite an unrelated recovery draft on failed save.
        persistCurrentDraft();
        setSessionErrorUnauthorized(Boolean(res.unauthorized));
        setDialogError(res.error ?? "Failed to update perk");
        return;
      }
    } else {
      const resolvedId =
        form.id.trim() ||
        uniquePerkId(
          buildPerkId(form.partnerName, form.title),
          existingPerkIds,
        );
      if (!resolvedId || !form.title.trim()) {
        setSaving(false);
        setDialogError("Title is required (partner name helps generate the id).");
        return;
      }
      const res = await adminCreatePerk(
        formToCreatePayload({ ...form, id: resolvedId }),
      );
      setSaving(false);
      if (!res.ok) {
        persistCurrentDraft();
        setSessionErrorUnauthorized(Boolean(res.unauthorized));
        setDialogError(res.error ?? "Failed to create perk");
        return;
      }
    }

    // Only clear a draft claimed by this dialog session. Create drafts all share
    // editingId === null, so matching on mode alone would wipe an unrelated recovery draft.
    if (adminId && claimDraftSessionRef.current) {
      clearPerkFormDraft(adminId);
      setRecoveryDraft(null);
    }
    claimDraftSessionRef.current = false;
    setDialogOpen(false);
    void loadPerks();
    void loadExpired();
  };

  const reactivatePerk = async (perk: AdminPerk) => {
    if (perk.status !== "eligible_for_readd") {
      window.alert("This perk is still in its cooling-off period.");
      return;
    }
    const res = await adminReactivatePerk(perk.id);
    if (!res.ok) {
      setError(res.error ?? "Failed to reactivate perk");
      return;
    }
    void loadPerks();
    void loadExpired();
    void loadReactivationHistory();
  };

  const clonePerk = async (perk: AdminPerk) => {
    const newId = window.prompt(
      `Clone "${perk.title}" as a new perk. Enter a unique perk ID:`,
      `${perk.id}_v2`,
    );
    if (!newId?.trim()) return;
    const res = await adminClonePerk(perk.id, { newId: newId.trim() });
    if (!res.ok) {
      setError(res.error ?? "Failed to clone perk");
      return;
    }
    void loadPerks();
    void loadExpired();
    void loadReactivationHistory();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Perks &amp; Benefits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage partner offers shown on the member perks page. Requires{" "}
          <code className="text-xs">FF_PERKS_ENABLED=true</code> for members to
          see them.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {canWrite && recoveryDraft && !dialogOpen ? (
        <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Unsaved perk draft ready to continue
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {recoveryDraft.form.title.trim() || "Untitled perk"}
              {recoveryDraft.mode === "edit" && recoveryDraft.editingId
                ? ` · editing ${recoveryDraft.editingId}`
                : " · new perk"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={continueRecoveryDraft}>
              Continue draft
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={discardRecoveryDraft}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {canWrite && pendingLegacyDraft && !recoveryDraft && !dialogOpen ? (
        <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              Recover unsaved perk draft from a previous session?
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {pendingLegacyDraft.form.title.trim() || "Untitled perk"}
              {" · "}
              Claim it for your admin account to continue, or discard it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={claimLegacyDraft}>
              Claim &amp; continue
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={discardLegacyDraft}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Engagement</h3>
            <p className="text-sm text-muted-foreground">
              {formatDateRange(metrics?.from, metrics?.to)}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="metrics-from" className="text-xs">
                From
              </Label>
              <Input
                id="metrics-from"
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="mt-1 w-40"
              />
            </div>
            <div>
              <Label htmlFor="metrics-to" className="text-xs">
                To
              </Label>
              <Input
                id="metrics-to"
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="mt-1 w-40"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadMetrics(fromInput, toInput)}
            >
              Apply
            </Button>
          </div>
        </div>

        {metricsError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {metricsError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Page views</p>
            <p className="mt-1 text-3xl font-semibold">
              {metrics?.pageViews ?? (loadingMetrics ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Redemptions</p>
            <p className="mt-1 text-3xl font-semibold">
              {metrics?.redemptions ?? (loadingMetrics ? "…" : 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {loadingMetrics ? "" : `Redeem rate ${formatPercent(metrics?.claimRate)}`}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Snooze rate</p>
            <p className="mt-1 text-3xl font-semibold">
              {loadingMetrics ? "…" : formatPercent(metrics?.snoozeRate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics?.lifecycle?.snoozedNow ?? 0} currently snoozed
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Not interested rate</p>
            <p className="mt-1 text-3xl font-semibold">
              {loadingMetrics ? "…" : formatPercent(metrics?.notInterestedRate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics?.lifecycle?.notInterestedNow ?? 0} marked not interested
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Completed (all time)</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.lifecycle?.completedTotal ?? (loadingMetrics ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Expiring in 7 days</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.lifecycle?.expiringIn7Days ?? (loadingMetrics ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Expiring in 30 days</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.lifecycle?.expiringIn30Days ?? (loadingMetrics ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Expired catalog</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.lifecycle?.expiredCatalog ?? (loadingMetrics ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Snoozes in window</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.lifecycle?.snoozesInWindow ?? (loadingMetrics ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Confirmed received</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.confirmedReceived ?? (loadingMetrics ? "…" : 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Confirm rate{" "}
              {loadingMetrics
                ? "…"
                : formatPercent(metrics?.confirmationRate ?? null)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Not received (open)</p>
            <p className="mt-1 text-2xl font-semibold">
              {metrics?.lifecycle?.notReceivedOpen ??
                (loadingMetrics ? "…" : 0)}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">
                Claimed but not received
              </h3>
              <p className="text-sm text-muted-foreground">
                Members who reported a claimed perk wasn&apos;t delivered.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadNotReceived()}
              disabled={loadingNotReceived}
            >
              Refresh
            </Button>
          </div>
          {notReceivedError ? (
            <p className="text-sm text-destructive">{notReceivedError}</p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Perk</th>
                  <th className="px-3 py-2 font-medium">Reported</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingNotReceived ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                      Loading queue…
                    </td>
                  </tr>
                ) : notReceivedRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                      No open not-received reports.
                    </td>
                  </tr>
                ) : (
                  notReceivedRows.map((row) => {
                    const resolving = resolvingRedemptionIds.has(row.id);
                    return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium">
                          {row.userDisplayName || row.userEmail}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.userEmail}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium">{row.perkTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.partnerName || "—"} · {row.perkCategory}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-muted-foreground">
                        {row.notReceivedAt
                          ? new Date(row.notReceivedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {canWrite ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={resolving}
                            onClick={() => {
                              void resolveNotReceived(row.id, {
                                resolution: "confirmed_received",
                              });
                            }}
                          >
                            Mark received
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={resolving}
                            onClick={() => {
                              void resolveNotReceived(row.id, {
                                resolution: "reopened",
                              });
                            }}
                          >
                            Reopen claim
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={resolving}
                            onClick={() => {
                              void resolveNotReceived(row.id, {
                                resolution: "dismissed",
                                note: "Reviewed in admin; no further action",
                              });
                            }}
                          >
                            Dismiss
                          </Button>
                        </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            View only
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {notReceivedHasMore ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingNotReceived || loadingMoreNotReceived}
                onClick={() => void loadMoreNotReceived()}
              >
                {loadingMoreNotReceived
                  ? "Loading more…"
                  : `Load more (${notReceivedRows.length} shown)`}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Perk</th>
                <th className="px-3 py-2 font-medium">Card views</th>
                <th className="px-3 py-2 font-medium">Clicks</th>
                <th className="px-3 py-2 font-medium">Claims</th>
                <th className="px-3 py-2 font-medium">Redemptions</th>
                <th className="px-3 py-2 font-medium">Click rate</th>
              </tr>
            </thead>
            <tbody>
              {loadingMetrics ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    Loading metrics…
                  </td>
                </tr>
              ) : (metrics?.byPerk.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    No perk interactions in this window.
                  </td>
                </tr>
              ) : (
                metrics?.byPerk.map((row) => (
                  <tr key={row.perkId} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium">{row.title}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {row.viewed}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {row.clicked}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {row.claimed}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {row.redemptions}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {formatPercent(row.clickRate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold tracking-tight">
                Perks catalog
              </h3>
              <Badge variant="secondary" className="font-normal">
                {loading ? "…" : `${perks.length} offer${perks.length === 1 ? "" : "s"}`}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Partner offers shown to members. Toggle visibility without opening
              each perk.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1.5">
              <Switch
                id="admin-perks-show-inactive"
                checked={showInactive}
                onCheckedChange={setShowInactive}
              />
              <Label
                htmlFor="admin-perks-show-inactive"
                className="cursor-pointer text-sm font-normal text-muted-foreground"
              >
                Show inactive
              </Label>
            </div>
            {canWrite ? (
              <Button type="button" onClick={openCreate}>
                Add perk
              </Button>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border/80 bg-muted/60 backdrop-blur">
                <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Offer</th>
                  <th className="px-4 py-3 font-medium">Audience</th>
                  <th className="px-4 py-3 font-medium">Redemption</th>
                  <th className="px-4 py-3 font-medium">Schedule</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Visibility</th>
                  {showPerkActions ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loading ? (
                  <tr>
                    <td
                      colSpan={showPerkActions ? 7 : 6}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      Loading catalog…
                    </td>
                  </tr>
                ) : perks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={showPerkActions ? 7 : 6}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No perks configured yet.
                      {canWrite ? " Create one to populate the catalog." : null}
                    </td>
                  </tr>
                ) : (
                  perks.map((perk) => (
                    <tr
                      key={perk.id}
                      id={`admin-perk-${perk.id}`}
                      className={[
                        "group transition-colors hover:bg-muted/35",
                        highlightPerkId === perk.id
                          ? "bg-primary/10 ring-2 ring-inset ring-primary/40"
                          : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {(perk.partnerName || perk.title)
                              .trim()
                              .slice(0, 2) || "PK"}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium leading-tight text-foreground">
                                {perk.title}
                              </span>
                              {perk.isFeatured ? (
                                <Badge className="h-5 px-1.5 text-[10px] font-medium">
                                  Featured
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {perk.partnerName || "No partner"} ·{" "}
                              <span className="font-mono">{perk.id}</span>
                            </div>
                            {perk.offerText ? (
                              <div className="line-clamp-1 text-xs text-foreground/80">
                                {perk.offerText}
                              </div>
                            ) : null}
                            <div className="pt-0.5">
                              <Badge
                                variant="outline"
                                className="h-5 border-border/70 px-1.5 text-[10px] font-normal text-muted-foreground"
                              >
                                {categoryLabel(perk.category)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <Badge
                          variant="outline"
                          className={`h-6 whitespace-nowrap px-2 text-[11px] font-medium ${accessBadgeClass(perk.accessLevel)}`}
                        >
                          {accessLabel(perk.accessLevel)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-1">
                          <div className="font-medium text-foreground/90">
                            {redemptionLabel(perk.redemptionType)}
                          </div>
                          {perk.redemptionType === "workflow" &&
                          perk.workflowType ? (
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {perk.workflowType}
                            </div>
                          ) : null}
                          {formatExtensionSiteSummary(perk.extensionDomains) !==
                          "—" ? (
                            <div className="text-[11px] text-muted-foreground">
                              Ext:{" "}
                              {formatExtensionSiteSummary(perk.extensionDomains)}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-medium tabular-nums">
                          {formatAdminDate(perk.endsAt)}
                        </div>
                        {perk.daysRemaining != null ? (
                          <div
                            className={`mt-0.5 text-xs tabular-nums ${
                              perk.daysRemaining <= 7
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {perk.daysRemaining}d remaining
                          </div>
                        ) : (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            No end date
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <Badge variant={statusBadgeVariant(perk.status)}>
                          {statusLabel(perk.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <Label
                              htmlFor={`perk-featured-${perk.id}`}
                              className="text-xs font-normal text-muted-foreground"
                            >
                              Featured
                            </Label>
                            <Switch
                              id={`perk-featured-${perk.id}`}
                              checked={perk.isFeatured}
                              disabled={!canWrite}
                              onCheckedChange={(checked) =>
                                void toggleFeatured(perk, checked)
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <Label
                              htmlFor={`perk-active-${perk.id}`}
                              className="text-xs font-normal text-muted-foreground"
                            >
                              Active
                            </Label>
                            <Switch
                              id={`perk-active-${perk.id}`}
                              checked={perk.isActive}
                              disabled={!canWrite}
                              onCheckedChange={(checked) =>
                                void toggleActive(perk, checked)
                              }
                            />
                          </div>
                        </div>
                      </td>
                      {showPerkActions ? (
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex justify-end gap-2 opacity-90 transition-opacity group-hover:opacity-100">
                            {canBroadcastEmail && perk.isActive ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                asChild
                              >
                                <Link
                                  to={`/admin/broadcast-email?perkId=${encodeURIComponent(perk.id)}`}
                                >
                                  Email members
                                </Link>
                              </Button>
                            ) : null}
                            {canWrite ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEdit(perk)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => void deletePerk(perk)}
                                >
                                  Delete
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Expired &amp; reactivation</h3>
        <p className="text-sm text-muted-foreground">
          Perks enter a 7-day cooling-off period after expiration. Only admins
          with <code className="text-xs">subscriptions.write</code> can
          reactivate or clone once status is Eligible.
        </p>
        {expiredError ? (
          <p className="text-sm text-destructive">{expiredError}</p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Perk</th>
                <th className="px-3 py-2 font-medium">Ended</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Eligible from</th>
                <th className="px-3 py-2 font-medium">Reactivations</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingExpired ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    Loading expired perks…
                  </td>
                </tr>
              ) : expiredError ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-destructive">
                    {expiredError}
                  </td>
                </tr>
              ) : expiredPerks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    No expired perks.
                  </td>
                </tr>
              ) : (
                expiredPerks.map((perk) => (
                  <tr
                    key={perk.id}
                    id={`admin-perk-${perk.id}`}
                    className={[
                      "border-b border-border/60",
                      highlightPerkId === perk.id
                        ? "bg-primary/10 ring-2 ring-inset ring-primary/40"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2 font-medium">{perk.title}</td>
                    <td className="px-3 py-2">
                      {formatAdminDate(perk.endsAt ?? perk.lastExpiredAt)}
                    </td>
                    <td className="px-3 py-2">{statusLabel(perk.status)}</td>
                    <td className="px-3 py-2">
                      {formatAdminDate(perk.eligibleForReactivationAt)}
                    </td>
                    <td className="px-3 py-2">{perk.reactivationCount}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void openPerkHistory(perk)}
                        >
                          History
                        </Button>
                        {canWrite ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={perk.status !== "eligible_for_readd"}
                              onClick={() => void reactivatePerk(perk)}
                            >
                              Reactivate
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={perk.status !== "eligible_for_readd"}
                              onClick={() => void clonePerk(perk)}
                            >
                              Clone
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Reactivation history</h3>
            <p className="text-sm text-muted-foreground">
              Audit log of admin reactivations and clones (most recent first).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadReactivationHistory()}
          >
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Perk</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">New window</th>
                <th className="px-3 py-2 font-medium">Admin</th>
                <th className="px-3 py-2 font-medium">Clone ID</th>
              </tr>
            </thead>
            <tbody>
              {loadingReactivations ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    Loading reactivation history…
                  </td>
                </tr>
              ) : reactivationHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    No reactivations recorded yet.
                  </td>
                </tr>
              ) : (
                reactivationHistory.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-2">
                      {formatAdminDateTime(row.reactivatedAt)}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {row.perkTitle ?? row.perkId}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.action}</td>
                    <td className="px-3 py-2">
                      {formatAdminDate(row.newStartsAt)}
                      {" – "}
                      {formatAdminDate(row.newEndsAt)}
                    </td>
                    <td className="px-3 py-2">{adminDisplayName(row.adminUser)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.clonedPerkId ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={historyDialogOpen}
        onOpenChange={(open) => {
          setHistoryDialogOpen(open);
          if (!open) {
            setHistoryPerk(null);
            setPerkHistory([]);
            setHistoryError(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Reactivation history
              {historyPerk ? ` — ${historyPerk.title}` : ""}
            </DialogTitle>
          </DialogHeader>
          {historyError ? (
            <p className="text-sm text-destructive">{historyError}</p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">New window</th>
                  <th className="px-3 py-2 font-medium">Admin</th>
                  <th className="px-3 py-2 font-medium">Clone ID</th>
                </tr>
              </thead>
              <tbody>
                {loadingPerkHistory ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : historyError ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-destructive">
                      {historyError}
                    </td>
                  </tr>
                ) : perkHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      No reactivations for this perk yet.
                    </td>
                  </tr>
                ) : (
                  perkHistory.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-3 py-2">
                        {formatAdminDateTime(row.reactivatedAt)}
                      </td>
                      <td className="px-3 py-2 capitalize">{row.action}</td>
                      <td className="px-3 py-2">
                        {formatAdminDate(row.newStartsAt)}
                        {" – "}
                        {formatAdminDate(row.newEndsAt)}
                      </td>
                      <td className="px-3 py-2">
                        {adminDisplayName(row.adminUser)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.clonedPerkId ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePerkDialog();
            return;
          }
          setDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit perk" : "New perk"}
            </DialogTitle>
          </DialogHeader>
          {dialogError ? (
            <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p>
                {isAdminSessionError(dialogError, sessionErrorUnauthorized)
                  ? "Your admin session expired. Your perk draft is saved on this device — sign in again to continue without losing your work."
                  : dialogError}
              </p>
              {isAdminSessionError(dialogError, sessionErrorUnauthorized) ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={adminPerkLoginReturnPath()}
                    onClick={() => persistCurrentDraft({ force: true })}
                  >
                    Sign in again
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="perk-title">Title</Label>
                <Input
                  id="perk-title"
                  value={form.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setForm((prev) => ({ ...prev, title }));
                    syncGeneratedPerkId(form.partnerName, title);
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="perk-partner">Partner name</Label>
                <Input
                  id="perk-partner"
                  value={form.partnerName}
                  onChange={(e) => {
                    const partnerName = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      partnerName,
                    }));
                    syncGeneratedPerkId(partnerName, form.title);
                  }}
                  className="mt-1"
                />
              </div>
            </div>
            {!editingId ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Perk id</p>
                    <p className="truncate font-mono text-sm">
                      {form.id || "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowIdEditor((open) => !open)}
                  >
                    {showIdEditor ? "Done" : "Edit"}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generated from partner and title. Edit only if you need a
                  custom id.
                </p>
                {showIdEditor ? (
                  <Input
                    id="perk-id"
                    value={form.id}
                    onChange={(e) => {
                      setIdManuallyEdited(true);
                      setForm((prev) => ({
                        ...prev,
                        id: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "_"),
                      }));
                    }}
                    placeholder="perk_acme_bank"
                    className="mt-2 font-mono text-sm"
                  />
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      category: value as PerkCategory,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Access level</Label>
                <Select
                  value={form.accessLevel}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      accessLevel: value as PerkFormState["accessLevel"],
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AudienceTargetingPanel
              value={form.audienceTargeting}
              onChange={(audienceTargeting) =>
                setForm((prev) => ({ ...prev, audienceTargeting }))
              }
              context="perks"
            />

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <Label>Chrome extension sites</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  When a member visits these domains, the KeenVPN Chrome
                  extension activates and links this perk for copy/claim.
                </p>
              </div>

              {form.extensionDomains.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No extension sites configured.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.extensionDomains.map((row, index) => (
                    <div
                      key={`extension-domain-${index}`}
                      className="grid gap-2 rounded-md border border-border/70 p-2 sm:grid-cols-[1.4fr_1fr_0.7fr_auto]"
                    >
                      <div>
                        <Label className="text-xs">Host</Label>
                        <Input
                          value={row.host}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              extensionDomains: prev.extensionDomains.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, host: e.target.value }
                                    : entry,
                              ),
                            }))
                          }
                          placeholder="amazon.com"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Path prefix</Label>
                        <Input
                          value={row.pathPrefix}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              extensionDomains: prev.extensionDomains.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, pathPrefix: e.target.value }
                                    : entry,
                              ),
                            }))
                          }
                          placeholder="/optional"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Priority</Label>
                        <Input
                          value={row.priority}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              extensionDomains: prev.extensionDomains.map(
                                (entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, priority: e.target.value }
                                    : entry,
                              ),
                            }))
                          }
                          placeholder="0"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              extensionDomains: prev.extensionDomains.filter(
                                (_, entryIndex) => entryIndex !== index,
                              ),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    extensionDomains: [
                      ...prev.extensionDomains,
                      emptyExtensionDomainRow(),
                    ],
                  }))
                }
              >
                Add extension site
              </Button>
            </div>

            <div>
              <Label htmlFor="perk-offer">Offer text</Label>
              <Input
                id="perk-offer"
                value={form.offerText}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, offerText: e.target.value }))
                }
                placeholder="50% off your first year"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="perk-description">Description</Label>
              <Textarea
                id="perk-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="perk-image">Image URL</Label>
              <Input
                id="perk-image"
                value={form.imageUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, imageUrl: e.target.value }))
                }
                placeholder="https://…"
                className="mt-1"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Redemption type</Label>
                <Select
                  value={form.redemptionType}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      redemptionType: value as PerkRedemptionType,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRedemptionTypes.map((type) => (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        disabled={
                          type.value === "workflow" && !workflowsEnabled
                        }
                      >
                        {type.label}
                        {type.value === "workflow" && !workflowsEnabled
                          ? " (disabled)"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="perk-sort">Sort order</Label>
                <Input
                  id="perk-sort"
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      sortOrder: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
            {form.redemptionType === "external_link" ? (
              <div>
                <Label htmlFor="perk-url">Redemption URL</Label>
                <Input
                  id="perk-url"
                  value={form.redemptionUrl}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      redemptionUrl: e.target.value,
                    }))
                  }
                  placeholder="https://…"
                  className="mt-1"
                />
              </div>
            ) : null}
            {form.redemptionType === "coupon_code" ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="perk-coupon">Coupon code</Label>
                  <Input
                    id="perk-coupon"
                    value={form.couponCode}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        couponCode: e.target.value,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="perk-coupon-url">
                    Redemption URL (recommended)
                  </Label>
                  <Input
                    id="perk-coupon-url"
                    value={form.redemptionUrl}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        redemptionUrl: e.target.value,
                      }))
                    }
                    placeholder="https://github.com/…"
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Members copy the code and can open this page to redeem it
                    (e.g. partner checkout or billing).
                  </p>
                </div>
              </div>
            ) : null}
            {form.redemptionType === "workflow" ? (
              <div>
                <Label htmlFor="perk-workflow-type">Workflow type</Label>
                <Select
                  value={form.workflowType || undefined}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, workflowType: value }))
                  }
                >
                  <SelectTrigger id="perk-workflow-type" className="mt-1">
                    <SelectValue placeholder="Select a workflow type" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflowTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Claiming this perk starts the selected workflow. Create new
                  types (with vault fields) under Admin → Workflows.
                </p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="perk-starts">Starts (optional)</Label>
                <Input
                  id="perk-starts"
                  type="date"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startsAt: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="perk-ends">Ends (optional)</Label>
                <Input
                  id="perk-ends"
                  type="date"
                  value={form.endsAt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endsAt: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="admin-perk-featured"
                  checked={form.isFeatured}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isFeatured: checked }))
                  }
                />
                <Label htmlFor="admin-perk-featured" className="text-sm font-normal">
                  Featured
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="admin-perk-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isActive: checked }))
                  }
                />
                <Label htmlFor="admin-perk-active" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closePerkDialog}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void savePerk()}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create perk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
