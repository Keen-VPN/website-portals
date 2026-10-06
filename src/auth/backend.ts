import type { ApiPlan } from "@/lib/pricing";
import type {
  VaultFieldCategory,
  VaultFieldInputType,
} from "@/lib/vault-fields";
import {
  BackendAuthResponse,
  ScheduledPlanChange,
  SubscriptionData,
  TrialData,
  UserEntitlements,
} from "./types";
import {
  getReferralTokenFromStorage,
  clearReferralTokenStorage,
} from "./referral-token";
import {
  clearUtmAttributionStorage,
  getUtmAttributionAuthPayload,
} from "@/lib/utm-attribution";
import {
  getDownloadClientIdAuthPayload,
  getOrCreateDownloadClientId,
} from "@/lib/download-client-id";
import { buildAuthDeepLink } from "@/lib/keenvpn-deep-links";
import {
  trackPostHogAccountCreated,
  trackPostHogAppDownloadClicked,
  trackPostHogSignupStarted,
  trackPostHogTrialCtaClicked,
  trackPostHogTrialCtaViewed,
  type AppDownloadPlatform,
} from "@/lib/posthog-analytics";
import { trackRedditLeadCompleted } from "@/lib/reddit-analytics";
import { storeBusinessInviteAutoAcceptedNotice, clearBusinessInviteAutoAcceptedNotice } from "@/auth/business-invite-auto-accepted";
import {
  consumeClassActionAttribution,
  markClassActionNewSignup,
} from "@/lib/class-action-attribution";
import { trackClassActionEvent } from "@/lib/product-analytics";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "/api";

function trackNewAccount(response: BackendAuthResponse): void {
  const createdUser =
    response.createdUser === true || response.user?.createdUser === true;
  if (createdUser && response.user?.id) {
    trackRedditLeadCompleted(response.user.id);
    trackPostHogAccountCreated(response.user.id);
    // Consume once so later signups in the same tab cannot re-attribute.
    const attribution = consumeClassActionAttribution();
    if (attribution) {
      markClassActionNewSignup(attribution.slug);
      trackClassActionEvent("class_action_signup", {
        class_action_slug: attribution.slug,
        redirect_path: attribution.path,
        user_id: response.user.id,
      });
      const session =
        typeof response.sessionToken === "string"
          ? response.sessionToken
          : null;
      if (session) {
        void recordPerkEvent(
          session,
          "class_action_signup",
          {
            source: "class_action_page",
            classActionSlug: attribution.slug,
            visitorType: "new_signup",
          },
          { keepalive: true },
        );
      }
    }
  }
  // Only store on new-account create. Backend already gates auto-accept the
  // same way; this keeps a stale/replayed field from re-showing the banner.
  if (createdUser && response.businessInviteAutoAccepted) {
    storeBusinessInviteAutoAcceptedNotice(response.businessInviteAutoAccepted);
  }
}

function extractBackendErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;

  // Common shapes:
  // - { error: "..." }
  // - { error: { message: "..." } }
  // - { message: "..." }
  const record = data as Record<string, unknown>;
  const errorValue = record["error"];
  if (typeof errorValue === "string" && errorValue.trim()) return errorValue;
  if (errorValue && typeof errorValue === "object") {
    const errorRecord = errorValue as Record<string, unknown>;
    const message = errorRecord["message"];
    if (typeof message === "string" && message.trim()) return message;
  }
  const messageValue = record["message"];
  if (typeof messageValue === "string" && messageValue.trim())
    return messageValue;

  return fallback;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Wire shape from backend before normalization (fields may be missing or named differently). */
export interface RawSubscription {
  status?: string;
  endDate?: string;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  billingPeriod?: string | null;
  subscriptionStartedAt?: string;
  daysSinceSubscriptionStart?: number;
  showAnnualUpgradePrompt?: boolean;
  scheduledBillingInterval?: {
    from?: string;
    to?: string;
    effectiveAt?: string;
  } | null;
  scheduledPlanChange?: {
    from?: string;
    to?: string;
    planId?: string;
    planName?: string;
    effectiveAt?: string;
  } | null;
  serviceThroughDate?: string | null;
  customerId?: string;
  plan?: string;
  planName?: string;
  planId?: string | null;
  seatLimit?: number | null;
  cancelAtPeriodEnd?: boolean;
  subscriptionType?: string;
  accessRole?: "owner" | "linked" | "member";
  canManageBilling?: boolean;
}

export interface RawTrial {
  active?: boolean;
  trialActive?: boolean;
  endsAt?: string | null;
  trialEndsAt?: string | null;
  daysRemaining?: number | null;
  isPaid?: boolean;
  tier?: string | null;
}

export interface RawBackendAuthResponse extends Omit<
  BackendAuthResponse,
  "subscription" | "trial"
> {
  subscription?: RawSubscription | null;
  trial?: RawTrial | null;
}

const activeSubscriptionStatuses = new Set(["active", "trialing", "past_due"]);
/** Ended subscriptions we still surface so UI can show renew/expired states. */
const endedSubscriptionStatuses = new Set([
  "canceled",
  "cancelled",
  "expired",
]);

function normalizeTrial(
  rawTrial: RawTrial | null | undefined,
): TrialData | null {
  if (!rawTrial) return null;

  return {
    active: Boolean(rawTrial.active ?? rawTrial.trialActive),
    endsAt: rawTrial.endsAt ?? rawTrial.trialEndsAt ?? null,
    daysRemaining: rawTrial.daysRemaining ?? null,
    isPaid: rawTrial.isPaid,
    tier: rawTrial.tier ?? null,
  };
}

/**
 * Normalizes a raw backend auth response into a typed `BackendAuthResponse`.
 *
 * Key behaviour:
 * - Subscription fields are renamed/coerced (e.g. `currentPeriodEnd` → `endDate`).
 * - Actionable statuses (`active`, `trialing`, `past_due`) are always surfaced.
 * - Ended statuses (`canceled` / `cancelled` / `expired`) are also kept so renew /
 *   expired UI can render; other non-actionable statuses stay `null`.
 * - Callers that need “has an active subscription” must still check active
 *   statuses (see `fetchSubscriptionStatusWithSession`), not mere presence.
 * - Trial data is normalised from snake_case backend fields to camelCase frontend types.
 */
export function normalizeBackendAuthResponse(
  data: RawBackendAuthResponse,
): BackendAuthResponse {
  const rawSubscription = data.subscription;
  const normalizedTrial = normalizeTrial(data.trial);
  const responseWithoutRawTrial = {
    ...data,
  } as Omit<RawBackendAuthResponse, "trial">;
  delete (responseWithoutRawTrial as RawBackendAuthResponse).trial;

  if (!rawSubscription) {
    return {
      ...(responseWithoutRawTrial as BackendAuthResponse),
      ...(data.trial !== undefined ? { trial: normalizedTrial } : {}),
    };
  }

  const normalizedSubscription: SubscriptionData = {
    status: (rawSubscription.status ?? "").toLowerCase(),
    endDate: rawSubscription.endDate ?? rawSubscription.currentPeriodEnd ?? "",
    plan: rawSubscription.plan ?? rawSubscription.planName,
    canManageBilling: rawSubscription.canManageBilling === true,
  };
  if (rawSubscription.customerId !== undefined) {
    normalizedSubscription.customerId = rawSubscription.customerId;
  }
  if (rawSubscription.cancelAtPeriodEnd !== undefined) {
    normalizedSubscription.cancelAtPeriodEnd =
      rawSubscription.cancelAtPeriodEnd;
  }
  if (rawSubscription.subscriptionType !== undefined) {
    normalizedSubscription.subscriptionType = rawSubscription.subscriptionType;
  }
  if (rawSubscription.accessRole !== undefined) {
    normalizedSubscription.accessRole = rawSubscription.accessRole;
  }
  if (rawSubscription.currentPeriodStart !== undefined) {
    normalizedSubscription.currentPeriodStart =
      rawSubscription.currentPeriodStart;
  }
  if (rawSubscription.currentPeriodEnd !== undefined) {
    normalizedSubscription.currentPeriodEnd = rawSubscription.currentPeriodEnd;
  }
  if (
    rawSubscription.billingPeriod === "month" ||
    rawSubscription.billingPeriod === "year" ||
    rawSubscription.billingPeriod === "2year" ||
    rawSubscription.billingPeriod === null
  ) {
    normalizedSubscription.billingPeriod = rawSubscription.billingPeriod;
  }
  if (rawSubscription.subscriptionStartedAt !== undefined) {
    normalizedSubscription.subscriptionStartedAt =
      rawSubscription.subscriptionStartedAt;
  }
  if (rawSubscription.daysSinceSubscriptionStart !== undefined) {
    normalizedSubscription.daysSinceSubscriptionStart =
      rawSubscription.daysSinceSubscriptionStart;
  }
  if (rawSubscription.showAnnualUpgradePrompt !== undefined) {
    normalizedSubscription.showAnnualUpgradePrompt =
      rawSubscription.showAnnualUpgradePrompt;
  }
  const scheduled = rawSubscription.scheduledBillingInterval;
  if (scheduled && typeof scheduled === "object") {
    const from = scheduled.from;
    const to = scheduled.to;
    const effectiveAt = scheduled.effectiveAt;
    const supportedBillingPeriods = new Set(["month", "year", "2year"]);
    if (
      typeof from === "string" &&
      supportedBillingPeriods.has(from) &&
      typeof to === "string" &&
      supportedBillingPeriods.has(to)
    ) {
      // Keep from/to even when effectiveAt is missing so annual-upgrade CTAs
      // stay hidden; notice copy falls back when the date is empty/invalid.
      normalizedSubscription.scheduledBillingInterval = {
        from: from as "month" | "year" | "2year",
        to: to as "month" | "year" | "2year",
        effectiveAt: typeof effectiveAt === "string" ? effectiveAt : "",
      };
    }
  } else if (scheduled === null) {
    normalizedSubscription.scheduledBillingInterval = null;
  }
  const scheduledPlanChange = rawSubscription.scheduledPlanChange;
  if (scheduledPlanChange && typeof scheduledPlanChange === "object") {
    const { from, to, planId, planName, effectiveAt } = scheduledPlanChange;
    const supportedPeriods = new Set<ScheduledPlanChange["from"]>([
      "month",
      "year",
      "2year",
    ]);
    if (
      supportedPeriods.has(from as ScheduledPlanChange["from"]) &&
      supportedPeriods.has(to as ScheduledPlanChange["to"]) &&
      typeof planId === "string" &&
      typeof planName === "string" &&
      typeof effectiveAt === "string" &&
      effectiveAt.trim().length > 0 &&
      !Number.isNaN(new Date(effectiveAt).getTime())
    ) {
      normalizedSubscription.scheduledPlanChange = {
        from: from as ScheduledPlanChange["from"],
        to: to as ScheduledPlanChange["to"],
        planId,
        planName,
        effectiveAt,
      };
    }
  } else if (scheduledPlanChange === null) {
    normalizedSubscription.scheduledPlanChange = null;
  }
  if (rawSubscription.serviceThroughDate !== undefined) {
    normalizedSubscription.serviceThroughDate =
      rawSubscription.serviceThroughDate;
  }
  if (rawSubscription.planId !== undefined) {
    normalizedSubscription.planId = rawSubscription.planId;
  }
  if (
    rawSubscription.seatLimit !== undefined &&
    rawSubscription.seatLimit !== null
  ) {
    normalizedSubscription.seatLimit = rawSubscription.seatLimit;
  }

  // Surface active/trialing/past_due as usual. Also keep ended statuses
  // (canceled/expired) so dashboard home can show ExpiredHome instead of
  // treating former subscribers as brand-new users. Incomplete/other statuses
  // stay null so CTAs that key off subscription presence stay correct.
  const status = normalizedSubscription.status;
  const isActionable = activeSubscriptionStatuses.has(status);
  const isEnded = endedSubscriptionStatuses.has(status);

  return {
    ...responseWithoutRawTrial,
    subscription: isActionable || isEnded ? normalizedSubscription : null,
    ...(data.trial !== undefined ? { trial: normalizedTrial } : {}),
  };
}

export interface SubscriptionStatusResult {
  success: boolean;
  hasActiveSubscription?: boolean;
  entitlements: UserEntitlements | null;
  subscription: SubscriptionData | null;
  trial: TrialData | null;
  redditTrialConversionId?: string | null;
  annualSavings?: {
    savingsPercent: number;
    yearlySavingsAmount: number;
    annualMonthlyEquivalent: number;
  } | null;
  error?: string;
  unauthorized?: boolean;
}

function parseUserEntitlements(value: unknown): UserEntitlements | null {
  if (!isJsonObject(value) || !isJsonObject(value.workspace)) return null;

  const { enabled, reason } = value.workspace;
  const validReason =
    reason === "active_subscription" ||
    reason === "active_trial" ||
    reason === "not_eligible";

  if (typeof enabled !== "boolean" || !validReason) return null;

  return { workspace: { enabled, reason } };
}

// ============================================================================
// Backend Authentication
// ============================================================================

/**
 * Login with Firebase ID token. Use this when you have a Firebase user and need
 * a backend session (e.g. from onAuthStateChanged). Works for any provider (Google/Apple).
 * Do not send Firebase token to /auth/apple/signin — that endpoint expects an Apple identity token.
 */
export async function loginWithFirebaseToken(
  idToken: string,
  provider?: "google" | "apple",
): Promise<BackendAuthResponse> {
  try {
    const referralToken = getReferralTokenFromStorage();
    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        ...(provider ? { provider } : {}),
        ...(referralToken ? { referralToken } : {}),
        ...getUtmAttributionAuthPayload(),
        ...getDownloadClientIdAuthPayload(),
      }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(extractBackendErrorMessage(data, "Login failed"));
    }
    // Backend /auth/login doesn't currently include `success` (unlike /auth/apple/signin).
    // Default to true only when absent so a future explicit `success: false` is respected.
    const normalized = normalizeBackendAuthResponse(
      data as RawBackendAuthResponse,
    );
    if (normalized.success ?? true) {
      trackNewAccount(normalized);
      clearReferralTokenStorage();
      clearUtmAttributionStorage();
    }
    return { ...normalized, success: normalized.success ?? true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to authenticate",
    };
  }
}

/**
 * Authenticate with backend using provider-specific token:
 * - Google: pass Firebase ID token (backend /auth/google/signin).
 * - Apple: pass Apple identity token (backend /auth/apple/signin). Do not pass Firebase token.
 */
export async function authenticateWithBackend(
  accessToken: string,
  provider: "google" | "apple" = "google",
  additionalData?: {
    userIdentifier?: string;
    email?: string;
    fullName?: string;
  },
): Promise<BackendAuthResponse> {
  try {
    const referralToken = getReferralTokenFromStorage();
    const endpoint =
      provider === "apple" ? "/auth/apple/signin" : "/auth/google/signin";
    const utmPayload = getUtmAttributionAuthPayload();
    const downloadClientPayload = getDownloadClientIdAuthPayload();
    const body =
      provider === "apple"
        ? {
            identityToken: accessToken,
            userIdentifier: additionalData?.userIdentifier,
            email: additionalData?.email,
            fullName: additionalData?.fullName,
            ...(referralToken ? { referralToken } : {}),
            ...utmPayload,
            ...downloadClientPayload,
          }
        : {
            idToken: accessToken, // Backend expects 'idToken' parameter for Google
            ...(referralToken ? { referralToken } : {}),
            ...utmPayload,
            ...downloadClientPayload,
          };

    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        extractBackendErrorMessage(data, "Backend authentication failed"),
      );
    }

    // Some provider responses may omit `success`; treat missing as success on HTTP 200.
    const normalized = normalizeBackendAuthResponse(
      data as RawBackendAuthResponse,
    );
    if (normalized.success ?? true) {
      trackNewAccount(normalized);
      clearReferralTokenStorage();
      clearUtmAttributionStorage();
    }
    return { ...normalized, success: normalized.success ?? true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to authenticate with backend",
    };
  }
}

export async function fetchReferralDashboard(
  sessionToken: string,
  options?: { offset?: number; limit?: number },
): Promise<{
  success: boolean;
  referralUrl?: string;
  token?: string;
  totalReferrals?: number;
  rewardsEarned?: number;
  pendingReferrals?: number;
  rewardsAwaitingSubscription?: number;
  canReceiveRewards?: boolean;
  referrals?: Record<string, unknown>[];
  referralsOffset?: number;
  referralsLimit?: number;
  referralsHasMore?: boolean;
  standardRewardMonths?: number;
  campaign?: {
    id: string;
    rewardMonths: number;
    startAt: string;
    endAt: string;
    active: boolean;
  } | null;
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (options?.offset !== undefined && options.offset >= 0) {
      params.set("offset", String(options.offset));
    }
    if (options?.limit !== undefined && options.limit > 0) {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    const url = `${BACKEND_URL}/referral/dashboard${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to load referrals"),
      };
    }
    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    return { ...payload, success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load referrals",
    };
  }
}

export type PerkAccessTier = "free" | "paid" | "annual";

export type PerkCategory =
  | "privacy_security"
  | "ai_productivity"
  | "developer_tools"
  | "startup_growth"
  | "remote_work"
  | "finance"
  | "class_action";

export type PerkRedemptionType =
  "external_link" | "coupon_code" | "invite_only" | "workflow";

export type PerkUserTab = "new" | "completed" | "snoozed" | "not_interested";

export type PerkConfirmationStatus =
  | "claimed"
  | "confirmed_received"
  | "not_received";

export type PerkRequestCategory =
  | "finance"
  | "software"
  | "travel"
  | "shopping"
  | "food"
  | "entertainment"
  | "other";

export interface PerkItem {
  id: string;
  title: string;
  partnerName: string | null;
  category: PerkCategory;
  description: string;
  imageUrl: string | null;
  offerText: string;
  redemptionType: PerkRedemptionType;
  accessLevel: "free" | "paid" | "annual";
  isFeatured: boolean;
  accessible: boolean;
  redeemed: boolean;
  confirmationStatus?: PerkConfirmationStatus | null;
  confirmedAt?: string | null;
  estimatedValueCents?: number | null;
  ctaLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  daysRemaining: number | null;
  userTab: PerkUserTab;
  /** Present on claimed coupon perks so the code stays visible on the card. */
  couponCode?: string;
  redemptionUrl?: string;
  /** Workflow Engine type identifier for "workflow" redemption perks, e.g. "chase_signup". */
  workflowType?: string;
  /** True when a workflow application is in progress but not yet completed. */
  applicationInProgress?: boolean;
  applicationWorkflowId?: string;
  /** Class-action settlement fields (only on category "class_action"). */
  settlementStatus?: SettlementStatus;
  potentialPayment?: string | null;
  claimDeadline?: string | null;
  docsNeeded?: boolean;
  docsNeededLabel?: string;
  eligibilityTags?: string[];
  proofSummary?: string;
  eligibleRegion?: string;
  /** Class-action page slug for /class-actions/:slug URLs. */
  sourceSlug?: string | null;
}

export type SettlementStatus = "open" | "closing_soon" | "closed";

export type SettlementStatusFilter = SettlementStatus | "all";

export interface PerkUserStats {
  confirmedCount: number;
  lifetimeSavingsCents: number;
  awaitingConfirmationCount: number;
}

export interface PerksListPayload {
  userAccessTier: PerkAccessTier;
  categories: PerkCategory[];
  tab: PerkUserTab | null;
  perks: PerkItem[];
  userStats?: PerkUserStats;
}

export interface FetchPerksOptions {
  category?: string;
  search?: string;
  tab?: PerkUserTab;
  /** Class-action only. The API defaults to open settlements. */
  status?: SettlementStatusFilter;
  /** Class-action only. */
  docsNeeded?: boolean;
}

export function buildPerksQuery(options?: FetchPerksOptions): string {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (options?.tab) params.set("tab", options.tab);
  if (options?.status) params.set("status", options.status);
  if (typeof options?.docsNeeded === "boolean") {
    params.set("docsNeeded", String(options.docsNeeded));
  }
  return params.toString();
}

export async function fetchPerks(
  sessionToken: string,
  options?: FetchPerksOptions,
): Promise<{ success: boolean; data?: PerksListPayload; error?: string }> {
  try {
    const query = buildPerksQuery(options);
    const url = `${BACKEND_URL}/perks${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to load perks"),
      };
    }
    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    const inner = payload["data"];
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) {
      return { success: false, error: "Invalid perks response" };
    }
    return { success: true, data: inner as PerksListPayload };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load perks",
    };
  }
}

export interface SettlementAtAGlance {
  status: SettlementStatus;
  proof: string;
  paymentMethod: string;
  expectedPayout: string;
  claimBy: string | null;
  daysRemaining: number | null;
}

export interface PerkDetail extends PerkItem {
  redeemedAt: string | null;
  /** Class-action detail fields; absent for other categories. */
  whatHappened?: string;
  whoMayQualify?: string;
  whatYouMayNeed?: string;
  howToClaim?: string;
  atAGlance?: SettlementAtAGlance;
  claimUrl?: string | null;
  caseLabel?: string | null;
  cta?: {
    primary: string;
    secondary: string | null;
    primaryDisabled: boolean;
  };
}

export async function fetchPerk(
  sessionToken: string,
  perkId: string,
): Promise<{
  success: boolean;
  data?: PerkDetail;
  error?: string;
  notFound?: boolean;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}`,
      { headers: { Authorization: `Bearer ${sessionToken}` } },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        notFound: response.status === 404,
        error: extractBackendErrorMessage(data, "Failed to load perk"),
      };
    }
    const inner =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)["data"]
        : undefined;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) {
      return { success: false, error: "Invalid perk response" };
    }
    return { success: true, data: inner as PerkDetail };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load perk",
    };
  }
}

export type PerkDiscoveryOutcome =
  | {
      status: "skipped";
      reason:
        | "friends_disabled"
        | "never"
        | "no_eligible_friends"
        | "perk_unavailable"
        | "error";
    }
  | {
      status: "draft_created";
      draftId: string;
      friendCount: number;
      perkTitle: string;
      partnerName: string | null;
      valueLabel: string;
    }
  | {
      status: "auto_shared";
      deliveredCount: number;
      skippedCount: number;
    };

export async function claimPerk(
  sessionToken: string,
  perkId: string,
): Promise<{
  success: boolean;
  redemptionType?: PerkRedemptionType;
  redemptionUrl?: string;
  couponCode?: string;
  message?: string;
  error?: string;
  /** Present when redemptionType is "workflow" — the auto-started/resumed workflow. */
  workflowId?: string;
  workflowState?: WorkflowState;
  discovery?: PerkDiscoveryOutcome;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/claim`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to claim perk"),
      };
    }
    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    if (payload["success"] === false) {
      const err = payload["error"];
      return {
        success: false,
        error: typeof err === "string" ? err : "Unable to claim this perk",
      };
    }
    return {
      success: true,
      redemptionType: payload["redemptionType"] as
        PerkRedemptionType | undefined,
      redemptionUrl:
        typeof payload["redemptionUrl"] === "string"
          ? payload["redemptionUrl"]
          : undefined,
      couponCode:
        typeof payload["couponCode"] === "string"
          ? payload["couponCode"]
          : undefined,
      message:
        typeof payload["message"] === "string" ? payload["message"] : undefined,
      workflowId:
        typeof payload["workflowId"] === "string"
          ? payload["workflowId"]
          : undefined,
      workflowState:
        typeof payload["workflowState"] === "string"
          ? (payload["workflowState"] as WorkflowState)
          : undefined,
      discovery: parsePerkDiscoveryOutcome(payload["discovery"]),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to claim perk",
    };
  }
}

function parsePerkDiscoveryOutcome(
  raw: unknown,
): PerkDiscoveryOutcome | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (value.status === "draft_created" && typeof value.draftId === "string") {
    return {
      status: "draft_created",
      draftId: value.draftId,
      friendCount:
        typeof value.friendCount === "number" ? value.friendCount : 0,
      perkTitle:
        typeof value.perkTitle === "string" ? value.perkTitle : "Opportunity",
      partnerName:
        typeof value.partnerName === "string" ? value.partnerName : null,
      valueLabel: typeof value.valueLabel === "string" ? value.valueLabel : "",
    };
  }
  if (value.status === "auto_shared") {
    return {
      status: "auto_shared",
      deliveredCount:
        typeof value.deliveredCount === "number" ? value.deliveredCount : 0,
      skippedCount:
        typeof value.skippedCount === "number" ? value.skippedCount : 0,
    };
  }
  if (value.status === "skipped") {
    const reason = value.reason;
    if (
      reason === "friends_disabled" ||
      reason === "never" ||
      reason === "no_eligible_friends" ||
      reason === "perk_unavailable" ||
      reason === "error"
    ) {
      return { status: "skipped", reason };
    }
    return { status: "skipped", reason: "error" };
  }
  return undefined;
}

export async function unclaimPerk(
  sessionToken: string,
  perkId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/unclaim`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to unclaim perk"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unclaim perk",
    };
  }
}

export async function confirmPerkReceived(
  sessionToken: string,
  perkId: string,
): Promise<{
  success: boolean;
  confirmationStatus?: PerkConfirmationStatus;
  confirmedAt?: string | null;
  estimatedValueCents?: number | null;
  lifetimeSavingsCents?: number;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/confirm-received`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to confirm perk receipt",
        ),
      };
    }
    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    if (payload["success"] === false) {
      const err = payload["error"];
      return {
        success: false,
        error:
          typeof err === "string" ? err : "Unable to confirm perk receipt",
      };
    }
    return {
      success: true,
      confirmationStatus:
        typeof payload.confirmationStatus === "string"
          ? (payload.confirmationStatus as PerkConfirmationStatus)
          : "confirmed_received",
      confirmedAt:
        typeof payload.confirmedAt === "string" ? payload.confirmedAt : null,
      estimatedValueCents:
        typeof payload.estimatedValueCents === "number"
          ? payload.estimatedValueCents
          : null,
      lifetimeSavingsCents:
        typeof payload.lifetimeSavingsCents === "number"
          ? payload.lifetimeSavingsCents
          : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to confirm perk receipt",
    };
  }
}

export async function reportPerkNotReceived(
  sessionToken: string,
  perkId: string,
): Promise<{
  success: boolean;
  confirmationStatus?: PerkConfirmationStatus;
  notReceivedAt?: string | null;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/report-not-received`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to report perk issue",
        ),
      };
    }
    const payload =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    if (payload["success"] === false) {
      const err = payload["error"];
      return {
        success: false,
        error: typeof err === "string" ? err : "Unable to report perk issue",
      };
    }
    return {
      success: true,
      confirmationStatus:
        typeof payload.confirmationStatus === "string"
          ? (payload.confirmationStatus as PerkConfirmationStatus)
          : "not_received",
      notReceivedAt:
        typeof payload.notReceivedAt === "string"
          ? payload.notReceivedAt
          : null,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to report perk issue",
    };
  }
}

export async function recordPerkEvent(
  sessionToken: string,
  eventName:
    | "perk_viewed"
    | "perk_clicked"
    | "perk_claimed"
    | "perk_restored_to_new"
    | "perk_marked_not_interested"
    | "perk_moved_from_snoozed_to_not_interested"
    | "perk_moved_from_not_interested_to_snoozed"
    | "class_action_page_viewed"
    | "class_action_claim_cta_clicked"
    | "class_action_signup",
  payload?: {
    perkId?: string;
    platform?: string;
    source?: string;
    visitorType?: string;
    classActionSlug?: string;
  },
  options?: { keepalive?: boolean },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/perks/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        eventName,
        perkId: payload?.perkId,
        platform: payload?.platform ?? "web",
        source: payload?.source ?? "perks_page",
        visitorType: payload?.visitorType,
        classActionSlug: payload?.classActionSlug,
      }),
      keepalive: options?.keepalive === true,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to record perk event"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to record perk event",
    };
  }
}

export async function snoozePerk(
  sessionToken: string,
  perkId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/snooze`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to snooze perk"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to snooze perk",
    };
  }
}

export async function dismissPerk(
  sessionToken: string,
  perkId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/dismiss`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to dismiss perk"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to dismiss perk",
    };
  }
}

export async function restorePerk(
  sessionToken: string,
  perkId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/perks/${encodeURIComponent(perkId)}/restore`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to restore perk"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to restore perk",
    };
  }
}

export async function submitPerkRequest(
  sessionToken: string,
  payload: {
    serviceName: string;
    websiteUrl?: string;
    category?: PerkRequestCategory;
    notes?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/perks/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to submit perk request",
        ),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to submit perk request",
    };
  }
}

/**
 * Verify session token with the backend.
 * Returns unauthorized: true when the backend explicitly rejects the token
 * (HTTP 401, or 200 with { success: false, unauthorized: true } in the body),
 * so callers can clear the session. On network errors we return success: false without unauthorized.
 */
export async function verifySessionToken(
  sessionToken: string,
): Promise<BackendAuthResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionToken,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      if (data?.success === false) {
        return {
          ...data,
          success: false,
          unauthorized: data?.unauthorized === true,
          error: data?.error ?? "Session verification failed",
        };
      }
      return normalizeBackendAuthResponse({
        ...data,
        success: data.success ?? true,
      });
    }
    return {
      success: false,
      error: data?.error || "Session verification failed",
      unauthorized: response.status === 401,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to verify session",
      unauthorized: false,
    };
  }
}

export async function requestMagicLink(email: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  rateLimited?: boolean;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to send magic link"),
        rateLimited: response.status === 429,
      };
    }
    const record = data as { message?: string };
    return { success: true, message: record.message };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to send magic link",
    };
  }
}

export async function verifyMagicLink(
  token: string,
): Promise<BackendAuthResponse> {
  try {
    const referralToken = getReferralTokenFromStorage();
    const response = await fetch(`${BACKEND_URL}/auth/magic/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        ...(referralToken ? { referralToken } : {}),
        ...getUtmAttributionAuthPayload(),
        ...getDownloadClientIdAuthPayload(),
      }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Magic link verification failed",
        ),
        unauthorized: response.status === 401,
      };
    }
    const normalized = normalizeBackendAuthResponse({
      ...(data as RawBackendAuthResponse),
      success: true,
    });
    if (normalized.success ?? true) {
      trackNewAccount(normalized);
      clearReferralTokenStorage();
      clearUtmAttributionStorage();
    }
    return normalized;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Magic link verification failed",
      unauthorized: false,
    };
  }
}

export interface ContactEmailStatusResponse {
  success: boolean;
  shouldPrompt: boolean;
  required?: boolean;
  contactEmail: string | null;
  isVerified: boolean;
  error?: string;
  unauthorized?: boolean;
}

export function isContactEmailRequired(
  status: Pick<ContactEmailStatusResponse, "success" | "required">,
): boolean {
  return status.success === true && status.required === true;
}

export async function getContactEmailStatus(
  sessionToken: string,
): Promise<ContactEmailStatusResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/contact-email-status`, {
      method: "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        shouldPrompt: false,
        required: false,
        contactEmail: null,
        isVerified: false,
        unauthorized: response.status === 401,
        error: extractBackendErrorMessage(
          data,
          "Failed to fetch contact email status",
        ),
      };
    }
    return data as ContactEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      shouldPrompt: false,
      required: false,
      contactEmail: null,
      isVerified: false,
      unauthorized: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch contact email status",
    };
  }
}

export async function requestEmailOtp(email: string): Promise<{
  success: boolean;
  message?: string;
  expiresInMinutes?: number;
  error?: string;
  rateLimited?: boolean;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to send sign-in code"),
        rateLimited: response.status === 429,
      };
    }
    const record = data as { message?: string; expiresInMinutes?: number };
    return {
      success: true,
      message: record.message,
      expiresInMinutes: record.expiresInMinutes,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to send sign-in code",
    };
  }
}

export async function saveContactEmail(
  sessionToken: string,
  email: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/contact-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to save contact email"),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save contact email",
    };
  }
}

export async function skipContactEmailPrompt(
  sessionToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/contact-email/skip`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "not_now" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to skip for now"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to skip for now",
    };
  }
}

export interface EmailPreferencesResponse {
  success: boolean;
  contextualEngagementOptIn: boolean;
  contextualEngagementOptInAt: string | null;
  error?: string;
}

export async function getEmailPreferences(
  sessionToken: string,
): Promise<EmailPreferencesResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/email-preferences`, {
      method: "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        contextualEngagementOptIn: true,
        contextualEngagementOptInAt: null,
        error: extractBackendErrorMessage(
          data,
          "Failed to fetch email preferences",
        ),
      };
    }
    return data as EmailPreferencesResponse;
  } catch (error) {
    return {
      success: false,
      contextualEngagementOptIn: true,
      contextualEngagementOptInAt: null,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch email preferences",
    };
  }
}

export interface EmailCategoryPreference {
  category: string;
  label: string;
  description: string;
  subscribed: boolean;
}

export interface EmailCategoryPreferencesResponse {
  success: boolean;
  email?: string;
  unsubscribedFromAll?: boolean;
  preferences?: EmailCategoryPreference[];
  error?: string;
}

async function emailCategoryPreferencesRequest(
  path: string,
  init: RequestInit,
): Promise<EmailCategoryPreferencesResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load email preferences",
        ),
      };
    }
    return data as EmailCategoryPreferencesResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load email preferences",
    };
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Signed link from an email footer; works without a KeenVPN session. */
export function fetchEmailCategoryPreferencesByToken(token: string) {
  return emailCategoryPreferencesRequest(
    `/email-preferences?token=${encodeURIComponent(token)}`,
    { method: "GET" },
  );
}

export function updateEmailCategoryPreferencesByToken(
  token: string,
  preferences: Record<string, boolean>,
  intent?: "important-only",
) {
  return emailCategoryPreferencesRequest("/email-preferences", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      token,
      preferences,
      ...(intent ? { intent } : {}),
    }),
  });
}

export function unsubscribeAllByToken(token: string) {
  return emailCategoryPreferencesRequest("/email-preferences/unsubscribe-all", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ token }),
  });
}

export function fetchMyEmailCategoryPreferences(sessionToken: string) {
  return emailCategoryPreferencesRequest("/email-preferences/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export function updateMyEmailCategoryPreferences(
  sessionToken: string,
  preferences: Record<string, boolean>,
  intent?: "important-only",
) {
  return emailCategoryPreferencesRequest("/email-preferences/me", {
    method: "PATCH",
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ preferences, ...(intent ? { intent } : {}) }),
  });
}

export function unsubscribeAllForCurrentUser(sessionToken: string) {
  return emailCategoryPreferencesRequest(
    "/email-preferences/me/unsubscribe-all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    },
  );
}

/** Untokenised visitor: mail them their own preference link. */
export async function requestEmailPreferencesLink(
  email: string,
  intent?: "important-only" | "unsubscribe",
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/email-preferences/request-link`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email, ...(intent ? { intent } : {}) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to send preference link",
        ),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send preference link",
    };
  }
}

export interface AuthEmailPending {
  newEmail: string;
  expiresAt: string;
  requestedBy: string;
}

export interface AuthEmailStatusResponse {
  success: boolean;
  email?: string;
  emailVerified?: boolean;
  hasLinkedOAuth?: boolean;
  pending?: AuthEmailPending | null;
  message?: string;
  error?: string;
}

export async function getAuthEmailStatus(
  sessionToken: string,
): Promise<AuthEmailStatusResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/auth-email`, {
      method: "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load authentication email",
        ),
      };
    }
    return data as AuthEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load authentication email",
    };
  }
}

export async function requestAuthEmailChange(
  sessionToken: string,
  email: string,
): Promise<AuthEmailStatusResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/auth-email/change`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to start email change",
        ),
      };
    }
    return data as AuthEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to start email change",
    };
  }
}

export async function resendAuthEmailChange(
  sessionToken: string,
): Promise<AuthEmailStatusResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/auth-email/resend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to resend verification email",
        ),
      };
    }
    return data as AuthEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to resend verification email",
    };
  }
}

export async function cancelAuthEmailChange(
  sessionToken: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/auth-email/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to cancel email change",
        ),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to cancel email change",
    };
  }
}

export async function confirmAuthEmailChange(
  token: string,
): Promise<{ success: boolean; message?: string; email?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/auth-email/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Verification link is invalid or expired",
        ),
      };
    }
    return data as { success: boolean; message?: string; email?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verification link is invalid or expired",
    };
  }
}

export async function cancelAuthEmailChangeWithToken(
  token: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/auth-email/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Cancellation link is invalid or expired",
        ),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Cancellation link is invalid or expired",
    };
  }
}

export async function adminGetUserAuthEmail(
  userId: string,
): Promise<AuthEmailStatusResponse> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/users/${encodeURIComponent(userId)}/auth-email`,
      { credentials: "include" },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load authentication email",
        ),
      };
    }
    return data as AuthEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load authentication email",
    };
  }
}

export async function adminRequestUserAuthEmailChange(
  userId: string,
  email: string,
): Promise<AuthEmailStatusResponse> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/users/${encodeURIComponent(userId)}/auth-email/change`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to start authentication email change",
        ),
      };
    }
    return data as AuthEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to start authentication email change",
    };
  }
}

export async function adminResendUserAuthEmailChange(
  userId: string,
): Promise<AuthEmailStatusResponse> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/users/${encodeURIComponent(userId)}/auth-email/resend`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to resend authentication email verification",
        ),
      };
    }
    return data as AuthEmailStatusResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to resend authentication email verification",
    };
  }
}

export async function adminCancelUserAuthEmailChange(
  userId: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/users/${encodeURIComponent(userId)}/auth-email/cancel`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to cancel authentication email change",
        ),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to cancel authentication email change",
    };
  }
}

export async function updateEmailPreferences(
  sessionToken: string,
  contextualEngagementOptIn: boolean,
): Promise<EmailPreferencesResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/email-preferences`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contextualEngagementOptIn }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        contextualEngagementOptIn: true,
        contextualEngagementOptInAt: null,
        error: extractBackendErrorMessage(
          data,
          "Failed to update email preferences",
        ),
      };
    }
    return data as EmailPreferencesResponse;
  } catch (error) {
    return {
      success: false,
      contextualEngagementOptIn: true,
      contextualEngagementOptInAt: null,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update email preferences",
    };
  }
}

export interface ProfileQuestionOption {
  value: string;
  label: string;
}

export interface ProfileQuestionShowWhen {
  questionKey: string;
  values: string[];
}

export interface ProfileQuestion {
  key: string;
  label: string;
  category: string;
  options: ProfileQuestionOption[];
  showWhen?: ProfileQuestionShowWhen;
}

export interface UserProfileInformationResponse {
  success: boolean;
  questions: ProfileQuestion[];
  answers: Record<string, string>;
  isComplete: boolean;
  completedAt: string | null;
  updatedAt: string | null;
  error?: string;
}

export async function getUserProfileInformation(
  sessionToken: string,
): Promise<UserProfileInformationResponse> {
  const empty: UserProfileInformationResponse = {
    success: false,
    questions: [],
    answers: {},
    isComplete: false,
    completedAt: null,
    updatedAt: null,
  };

  try {
    const response = await fetch(`${BACKEND_URL}/user/profile-information`, {
      method: "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...empty,
        error: extractBackendErrorMessage(
          data,
          "Failed to fetch profile information",
        ),
      };
    }
    return data as UserProfileInformationResponse;
  } catch (error) {
    return {
      ...empty,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch profile information",
    };
  }
}

export async function updateUserProfileInformation(
  sessionToken: string,
  answers: Record<string, string>,
  entrySource = "web",
): Promise<UserProfileInformationResponse> {
  const empty: UserProfileInformationResponse = {
    success: false,
    questions: [],
    answers: {},
    isComplete: false,
    completedAt: null,
    updatedAt: null,
  };

  try {
    const response = await fetch(`${BACKEND_URL}/user/profile-information`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ answers, platform: "web", entrySource }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...empty,
        error: extractBackendErrorMessage(
          data,
          "Failed to update profile information",
        ),
      };
    }
    return data as UserProfileInformationResponse;
  } catch (error) {
    return {
      ...empty,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update profile information",
    };
  }
}

export interface SignupSourceOption {
  value: string;
  label: string;
}

export interface SignupSourceStatusResponse {
  success: boolean;
  question: string;
  options: SignupSourceOption[];
  source: string | null;
  otherText: string | null;
  shouldPrompt: boolean;
  capturedAt: string | null;
  error?: string;
}

export async function getSignupSourceStatus(
  sessionToken: string,
): Promise<SignupSourceStatusResponse> {
  const empty: SignupSourceStatusResponse = {
    success: false,
    question: "How did you hear about KeenVPN?",
    options: [],
    source: null,
    otherText: null,
    shouldPrompt: false,
    capturedAt: null,
  };

  try {
    const response = await fetch(`${BACKEND_URL}/user/signup-source`, {
      method: "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...empty,
        error: extractBackendErrorMessage(
          data,
          "Failed to fetch signup source",
        ),
      };
    }
    return data as SignupSourceStatusResponse;
  } catch (error) {
    return {
      ...empty,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch signup source",
    };
  }
}

export async function updateSignupSource(
  sessionToken: string,
  payload: {
    source?: string;
    otherText?: string;
    skipped?: boolean;
  },
): Promise<SignupSourceStatusResponse> {
  const empty: SignupSourceStatusResponse = {
    success: false,
    question: "How did you hear about KeenVPN?",
    options: [],
    source: null,
    otherText: null,
    shouldPrompt: false,
    capturedAt: null,
  };

  try {
    const response = await fetch(`${BACKEND_URL}/user/signup-source`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, platform: "web" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...empty,
        error: extractBackendErrorMessage(data, "Failed to save signup source"),
      };
    }
    return data as SignupSourceStatusResponse;
  } catch (error) {
    return {
      ...empty,
      error:
        error instanceof Error ? error.message : "Failed to save signup source",
    };
  }
}

export interface AdminSignupSourceSummary {
  totalUsers: number;
  responsesCaptured: number;
  responsesSkipped: number;
  unansweredCount: number;
  distribution: { value: string; label: string; count: number }[];
  options: { value: string; label: string; count: number }[];
  trends: { day: string; source: string; label: string; count: number }[];
  analyticsEvents: { eventName: string; count: number }[];
}

export async function adminFetchSignupSourceSummary(params?: {
  signal?: AbortSignal;
}): Promise<{ ok: boolean; data?: AdminSignupSourceSummary; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/signup-sources/summary`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load signup source summary",
        ),
      };
    }
    const record = raw as { data?: AdminSignupSourceSummary };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface ContextualEmailUnsubscribeResponse {
  success: boolean;
  redirectUrl?: string;
  error?: string;
}

export async function confirmContextualEmailUnsubscribe(
  token: string,
): Promise<ContextualEmailUnsubscribeResponse> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/contextual-email/unsubscribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to unsubscribe from personalized emails",
        ),
      };
    }
    return data as ContextualEmailUnsubscribeResponse;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to unsubscribe from personalized emails",
    };
  }
}

export async function sendContactEmailVerification(
  sessionToken: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/verify-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to send verification email",
        ),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send verification email",
    };
  }
}

export async function confirmContactEmailVerification(
  token: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/verify-email/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Verification link is invalid or expired",
        ),
      };
    }
    return data as { success: boolean; message?: string };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Verification link is invalid or expired",
    };
  }
}

export async function verifyEmailOtp(
  email: string,
  code: string,
): Promise<BackendAuthResponse> {
  try {
    const referralToken = getReferralTokenFromStorage();
    const response = await fetch(`${BACKEND_URL}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code,
        ...(referralToken ? { referralToken } : {}),
        ...getUtmAttributionAuthPayload(),
        ...getDownloadClientIdAuthPayload(),
      }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Code verification failed"),
        unauthorized: response.status === 401,
      };
    }
    const normalized = normalizeBackendAuthResponse({
      ...(data as RawBackendAuthResponse),
      success: true,
    });
    if (normalized.success ?? true) {
      trackNewAccount(normalized);
      clearReferralTokenStorage();
      clearUtmAttributionStorage();
    }
    return { ...normalized, success: normalized.success ?? true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Code verification failed",
    };
  }
}

export async function fetchSubscriptionStatusWithSession(
  sessionToken: string,
): Promise<SubscriptionStatusResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/subscription/status-session`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionToken }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        entitlements: null,
        subscription: null,
        trial: null,
        error: data?.error || "Failed to fetch subscription status",
        unauthorized: response.status === 401,
      };
    }

    const normalized = normalizeBackendAuthResponse({
      ...(data as RawBackendAuthResponse),
      success: data?.success ?? true,
    });

    const annualSavings =
      data && typeof data === "object" && "annualSavings" in data
        ? ((
            data as {
              annualSavings?: SubscriptionStatusResult["annualSavings"];
            }
          ).annualSavings ?? null)
        : null;
    const entitlements = isJsonObject(data)
      ? parseUserEntitlements(data.entitlements)
      : null;

    return {
      success: normalized.success,
      hasActiveSubscription: Boolean(
        normalized.subscription &&
          activeSubscriptionStatuses.has(normalized.subscription.status),
      ),
      entitlements,
      subscription: normalized.subscription ?? null,
      trial: normalized.trial ?? null,
      redditTrialConversionId: normalized.redditTrialConversionId ?? null,
      annualSavings,
      error: normalized.error,
      unauthorized: normalized.unauthorized,
    };
  } catch (error) {
    return {
      success: false,
      entitlements: null,
      subscription: null,
      trial: null,
      annualSavings: null,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch subscription status",
      unauthorized: false,
    };
  }
}

export async function recordSubscriptionProductEvent(
  sessionToken: string,
  eventName:
    | "annual_plan_viewed"
    | "annual_upgrade_clicked"
    | "annual_upgrade_completed"
    | "two_year_plan_viewed"
    | "two_year_switch_clicked"
    | "two_year_switch_completed",
  payload?: { platform?: string; source?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/subscription/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        eventName,
        platform: payload?.platform ?? "web",
        source: payload?.source,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        extractBackendErrorMessage(data, "Failed to record event"),
      );
    }
    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record event",
    };
  }
}

export async function cancelSubscription(
  sessionToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/subscription/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to cancel subscription");
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to cancel subscription",
    };
  }
}

interface PreviewRetentionWinbackOfferResult {
  success: boolean;
  subscriptionType?: string;
  requiresAppleSettings?: boolean;
  offerExpiresAt?: string;
  invalidToken?: boolean;
  /** When true, remove retention token from sessionStorage so /signin is not hijacked. */
  discardStoredOffer?: boolean;
  error?: string;
}

interface ReactivateRetentionWinbackOfferResult {
  success: boolean;
  message?: string;
  requiresAppleSettings?: boolean;
  alreadyRedeemed?: boolean;
  invalidToken?: boolean;
  /** When true, remove retention token from sessionStorage so /signin is not hijacked. */
  discardStoredOffer?: boolean;
  error?: string;
}

/** Matches Nest `RetentionService.reactivateOffer` when `rewardGrantedAt` is set. */
const WINBACK_ALREADY_REDEEMED_MESSAGE =
  "Your 30 extra days free were already applied.";

function messageIfNonEmpty(
  record: Record<string, unknown>,
): string | undefined {
  const raw = record.message;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

export async function previewRetentionWinbackOffer(
  token: string,
): Promise<PreviewRetentionWinbackOfferResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/retention/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = extractBackendErrorMessage(data, "Invalid win-back offer");
      const invalidToken =
        response.status === 404 ||
        (response.status === 400 && /invalid|expired/i.test(error));
      const discardStoredOffer =
        invalidToken || response.status === 400 || response.status === 404;
      return {
        success: false,
        error,
        invalidToken,
        discardStoredOffer,
      };
    }
    const parsed = isJsonObject(data) ? data : null;
    if (!parsed || Object.keys(parsed).length === 0) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Unexpected server response."),
      };
    }
    if (parsed.success === false) {
      return {
        ...parsed,
        success: false,
      } as PreviewRetentionWinbackOfferResult;
    }
    if (parsed.success === true) {
      return { ...parsed, success: true } as PreviewRetentionWinbackOfferResult;
    }
    const hasPreviewPayload =
      typeof parsed.subscriptionType === "string" ||
      parsed.requiresAppleSettings === true ||
      typeof parsed.offerExpiresAt === "string";
    if (!hasPreviewPayload) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          parsed,
          "Unexpected server response.",
        ),
      };
    }
    return { ...parsed, success: true } as PreviewRetentionWinbackOfferResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid win-back offer",
    };
  }
}

export async function reactivateRetentionWinbackOffer(
  sessionToken: string,
  token: string,
): Promise<ReactivateRetentionWinbackOfferResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/retention/reactivate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = extractBackendErrorMessage(
        data,
        "Could not reactivate offer",
      );
      const record =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : {};
      const invalidToken =
        response.status === 404 ||
        (response.status === 400 && /invalid|expired/i.test(error));
      // Do not discard on 401: session/auth expired while the win-back JWT may still be valid —
      // keeping it lets sign-in redirects return to /reactivate to retry.
      const discardStoredOffer =
        invalidToken ||
        // Business-rule failures: drop stale offer from session so login redirect stops looping.
        response.status === 400 ||
        response.status === 403 ||
        response.status === 404;
      return {
        success: false,
        error,
        invalidToken,
        discardStoredOffer,
        message:
          typeof record.message === "string" ? record.message : undefined,
        requiresAppleSettings: record.requiresAppleSettings === true,
        alreadyRedeemed: record.alreadyRedeemed === true,
      };
    }
    const parsed = isJsonObject(data) ? data : null;
    if (!parsed || Object.keys(parsed).length === 0) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Could not reactivate offer"),
      };
    }
    if (parsed.success === true) {
      if (parsed.requiresAppleSettings === true) {
        return {
          ...parsed,
          success: false,
          requiresAppleSettings: true,
        } as ReactivateRetentionWinbackOfferResult;
      }
      const alreadyRedeemed = parsed.alreadyRedeemed === true;
      const existingMsg = messageIfNonEmpty(parsed);
      return {
        ...parsed,
        success: true,
        ...(alreadyRedeemed && !existingMsg
          ? { message: WINBACK_ALREADY_REDEEMED_MESSAGE }
          : {}),
      } as ReactivateRetentionWinbackOfferResult;
    }
    if (parsed.success === false) {
      return {
        ...parsed,
        success: false,
      } as ReactivateRetentionWinbackOfferResult;
    }
    if (parsed.alreadyRedeemed === true) {
      return {
        ...parsed,
        success: true,
        message: messageIfNonEmpty(parsed) ?? WINBACK_ALREADY_REDEEMED_MESSAGE,
      } as ReactivateRetentionWinbackOfferResult;
    }
    if (parsed.requiresAppleSettings === true) {
      return {
        ...parsed,
        success: false,
      } as ReactivateRetentionWinbackOfferResult;
    }
    return {
      success: false,
      error: extractBackendErrorMessage(parsed, "Unexpected server response."),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Could not reactivate offer",
    };
  }
}

/** Sentinel error code when checkout fails due to expired/invalid session (e.g. 401). */
export const CHECKOUT_ERROR_SESSION_EXPIRED = "SESSION_EXPIRED" as const;

export type CreateCheckoutResult =
  | { success: true; url: string }
  | {
      success: false;
      error: string;
      errorCode?: typeof CHECKOUT_ERROR_SESSION_EXPIRED;
    };

/**
 * Create Stripe checkout session.
 * Uses the backend session token (from login/Apple sign-in), not the Firebase ID token.
 * Returns errorCode CHECKOUT_ERROR_SESSION_EXPIRED when the backend returns 401.
 */
export async function createCheckoutSession(
  sessionToken: string,
  planId: string,
  successUrl?: string,
  cancelUrl?: string,
  seatCount?: number,
): Promise<CreateCheckoutResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/payment/stripe/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        planId,
        successUrl,
        cancelUrl,
        ...(seatCount !== undefined ? { seatCount } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      url?: string;
      error?: string;
    };

    if (!response.ok) {
      const errorMessage = data?.error || "Failed to create checkout session";
      const isUnauthorized = response.status === 401;
      return {
        success: false,
        error: errorMessage,
        ...(isUnauthorized && { errorCode: CHECKOUT_ERROR_SESSION_EXPIRED }),
      };
    }

    if (data?.success && data?.url) {
      return { success: true, url: data.url };
    }
    return {
      success: false,
      error: data?.error || "No checkout URL received",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create checkout session",
    };
  }
}

/**
 * Switch a monthly Stripe subscription to annual at the next billing date (or trial end).
 * No upfront annual charge; proration is disabled on the backend.
 */
export async function upgradeSubscriptionToAnnual(
  sessionToken: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/subscription/upgrade-to-annual`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to upgrade to annual plan",
        ),
      };
    }

    if (data?.success) {
      return { success: true, message: data.message };
    }

    return {
      success: false,
      error: data?.error || data?.message || "Upgrade failed",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upgrade to annual plan",
    };
  }
}

/**
 * Switch an Individual Stripe subscription to another term (monthly/annual/2-year)
 * at the next billing date. The already-paid period runs to its end.
 */
export async function changeSubscriptionPlan(
  sessionToken: string,
  planId: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/subscription/change-plan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(data, "Failed to change plan"),
      };
    }

    if (data?.success) {
      return { success: true, message: data.message };
    }

    return {
      success: false,
      error: data?.error || data?.message || "Plan change failed",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to change plan",
    };
  }
}

/**
 * Enable Business on the current subscription without charging for the account
 * type change. If the selected interval differs, the backend schedules it for
 * the end of the already-paid period.
 */
export async function upgradeSubscriptionToBusiness(
  sessionToken: string,
  planId: string,
  seatCount: number,
  options?: { successUrl?: string; cancelUrl?: string },
): Promise<{
  success: boolean;
  mode?: "upgraded" | "checkout";
  url?: string | null;
  planId?: string;
  seatLimit?: number;
  billingIntervalChange?: {
    from: "month" | "year" | "2year";
    to: "month" | "year" | "2year";
    effectiveAt: string;
  };
  message?: string;
  error?: string;
}> {
  try {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://vpnkeen.com";
    const response = await fetch(
      `${BACKEND_URL}/payment/stripe/upgrade-business`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          planId,
          seatCount,
          successUrl:
            options?.successUrl ??
            `${origin}/account?tab=team&business=upgraded`,
          cancelUrl: options?.cancelUrl ?? `${origin}/account`,
        }),
      },
    );

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      mode?: "upgraded" | "checkout";
      url?: string | null;
      planId?: string;
      seatLimit?: number;
      billingIntervalChange?: {
        from: "month" | "year" | "2year";
        to: "month" | "year" | "2year";
        effectiveAt: string;
      };
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to upgrade to Business",
        ),
      };
    }

    if (data?.success === true) {
      return {
        success: true,
        mode: data.mode,
        url: data.url,
        planId: data.planId,
        seatLimit: data.seatLimit,
        billingIntervalChange: data.billingIntervalChange,
        message: data.message,
      };
    }

    return {
      success: false,
      error: data?.error || data?.message || "Business upgrade failed",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upgrade to Business",
    };
  }
}

/**
 * Enable Family on the current Stripe Individual subscription in place
 * (same Individual price — no Checkout / Portal for Stripe owners).
 */
export async function upgradeSubscriptionToFamily(
  sessionToken: string,
  planId: string,
): Promise<{
  success: boolean;
  mode?: "upgraded";
  planId?: string;
  seatLimit?: number;
  message?: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/payment/stripe/upgrade-family`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ planId }),
      },
    );

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      mode?: "upgraded";
      planId?: string;
      seatLimit?: number;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to upgrade to Family",
        ),
      };
    }

    if (data?.success === true) {
      return {
        success: true,
        mode: data.mode ?? "upgraded",
        planId: data.planId,
        seatLimit: data.seatLimit,
        message: data.message,
      };
    }

    return {
      success: false,
      error: data?.error || data?.message || "Family upgrade failed",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to upgrade to Family",
    };
  }
}

/**
 * Create a Stripe Billing Portal session for the current user.
 * Allows managing subscription (upgrade, downgrade, update payment method, etc.)
 */
export async function createBillingPortalSession(
  sessionToken: string,
  returnUrl: string,
  options?: { intent?: "default" | "change_plan" },
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/payment/stripe/portal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        returnUrl,
        ...(options?.intent ? { intent: options.intent } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        extractBackendErrorMessage(data, "Failed to open billing portal"),
      );
    }

    if (data?.url) {
      return { success: true, url: data.url };
    }
    return {
      success: false,
      error: data?.error || "No portal URL received",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create billing portal session",
    };
  }
}

// ============================================================================
// Membership transfer (competitor VPN → Keen credit)
// ============================================================================

export interface MembershipTransferRequestData {
  id: string;
  provider: string;
  expiryDate: string;
  proofUrl: string;
  hasUploadedProof?: boolean;
  hasS3Proof?: boolean;
  status: string;
  requestedCreditDays: number;
  approvedCreditDays: number | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  // Backward compatibility: older backend responses expose reviewer ID directly.
  reviewedByAdminId?: string | null;
  // New safer shape from backend that avoids leaking admin UUIDs to end users.
  reviewedBySystem?: boolean;
}

export async function fetchMembershipTransferRequest(
  sessionToken: string,
): Promise<{
  success: boolean;
  data: MembershipTransferRequestData | null;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/subscription/transfer-request`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: extractBackendErrorMessage(
          raw,
          "Could not load transfer request",
        ),
      };
    }
    const record = raw as { data?: MembershipTransferRequestData | null };
    return { success: true, data: record.data ?? null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export interface MembershipTransferPresignData {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
  headers: Record<string, string>;
}

/** Presigned PUT to upload proof bytes to S3 before submitting the transfer request with `proofS3Key`. */
export async function requestMembershipTransferPresignedUpload(
  sessionToken: string,
  contentType: "image/jpeg" | "image/png" | "image/webp",
): Promise<{
  success: boolean;
  data?: MembershipTransferPresignData;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/subscription/transfer-request/presigned-upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contentType }),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(raw, "Could not start proof upload"),
      };
    }
    const record = raw as { data?: MembershipTransferPresignData };
    if (!record.data?.uploadUrl || !record.data.key) {
      return { success: false, error: "Invalid presign response" };
    }
    return { success: true, data: record.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/** PUT proof image bytes to the presigned URL (S3). */
export async function putMembershipTransferProofToPresignedUrl(
  uploadUrl: string,
  file: Blob,
  headers: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const h = new Headers(headers);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: h,
    });
    if (!response.ok) {
      return { ok: false, error: `Upload failed (${response.status})` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function submitMembershipTransferRequest(
  sessionToken: string,
  payload: {
    provider: string;
    expiryDate: string;
    contactEmail?: string;
    proofUrl?: string;
    proofS3Key?: string;
    proofOriginalFilename?: string;
    /** @deprecated Use presigned S3 flow: requestMembershipTransferPresignedUpload → PUT → submit with proofS3Key */
    proofFile?: File | null;
  },
): Promise<{
  success: boolean;
  data?: MembershipTransferRequestData | null;
  error?: string;
}> {
  try {
    let response: Response;
    if (payload.proofFile && payload.proofFile.size > 0) {
      const ct = payload.proofFile.type;
      const allowed =
        ct === "image/jpeg" || ct === "image/png" || ct === "image/webp"
          ? ct
          : ("image/jpeg" as const);
      const presign = await requestMembershipTransferPresignedUpload(
        sessionToken,
        allowed,
      );
      if (!presign.success || !presign.data) {
        return { success: false, error: presign.error ?? "Presign failed" };
      }
      const put = await putMembershipTransferProofToPresignedUrl(
        presign.data.uploadUrl,
        payload.proofFile,
        presign.data.headers,
      );
      if (!put.ok) {
        return { success: false, error: put.error ?? "Upload failed" };
      }
      response = await fetch(`${BACKEND_URL}/subscription/transfer-request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: payload.provider,
          expiryDate: payload.expiryDate,
          contactEmail: payload.contactEmail?.trim() || undefined,
          proofUrl: payload.proofUrl?.trim() || undefined,
          proofS3Key: presign.data.key,
          proofOriginalFilename: payload.proofFile?.name || undefined,
        }),
      });
    } else {
      response = await fetch(`${BACKEND_URL}/subscription/transfer-request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: payload.provider,
          expiryDate: payload.expiryDate,
          contactEmail: payload.contactEmail?.trim() || undefined,
          proofUrl: payload.proofUrl?.trim() || undefined,
          proofS3Key: payload.proofS3Key,
        }),
      });
    }
    const raw: unknown = await response.json().catch(() => ({}));
    if (response.status === 409) {
      const again = await fetchMembershipTransferRequest(sessionToken);
      return {
        success: false,
        error: "You already have a transfer request.",
        data: again.data,
      };
    }
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(raw, "Submission failed"),
      };
    }
    const record = raw as { data?: MembershipTransferRequestData };
    return { success: true, data: record.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function submitServerLocationPreference(params: {
  region: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getSessionToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(
      `${BACKEND_URL}/v1/user/preferences/server-locations`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(params),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to submit location request",
        ),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface AdminUserOverview {
  totalUsers: number;
  page: number;
  limit: number;
  totalPages: number;
  month: string;
  filters: {
    min_duration_seconds: number;
    exclude_platforms: string[];
  };
  users: {
    id: string;
    email: string;
    name: string | null;
    longestSessionSeconds: number;
    connectionCount: number;
    createdAt: string;
  }[];
}

export interface AdminIpAddressClickSummary {
  total: number;
  from: string;
  to: string;
  byPlatform: { label: string; count: number }[];
  byConnectionStatus: { label: string; count: number }[];
  topServerLocations: { label: string; count: number }[];
}

export interface AdminReviewPromptSummary {
  usersPrompted: number;
  needsImprovementSelected: number;
  feedbackSubmitted: number;
  accepted: number;
  dismissed: number;
  /** Ratio in [0, 1], e.g. 0.75 means 75% of "needs improvement" taps led to feedback. */
  feedbackConversionRate: number | null;
  feedbackFormEnabled: boolean;
  feedbackFormWindowDays: number;
  minSampleSize: number;
  from: string;
  to: string;
  byPlatform: { label: string; count: number }[];
}

export interface AdminUserProfileAnswerDistribution {
  value: string;
  label: string;
  count: number;
}

export interface AdminUserProfileQuestionSummary {
  key: string;
  label: string;
  category: string;
  answeredCount: number;
  skippedCount: number;
  distribution: AdminUserProfileAnswerDistribution[];
}

export type AdminUserProfileAudience = "all" | "billing";

export interface AdminUserProfileSummary {
  audience: AdminUserProfileAudience;
  totalUsers: number;
  activeSubscribers: number;
  trialUsers: number;
  paidUsers: number;
  profilesStarted: number;
  profilesCompleted: number;
  questions: AdminUserProfileQuestionSummary[];
  analyticsEvents: { eventName: string; count: number }[];
  completionSources?: { source: string; count: number }[];
}

export interface AdminDomainInsightsMetrics {
  visitsScheduled: number;
  visitsSkipped: number;
  eventsCreated: number;
  emailsSent: number;
  emailsOpened: number;
  ctaClicks: number;
  unsubscribes: number;
  sendRate: number | null;
  usersOptedIn: number;
  from: string;
  to: string;
  byStatus: { label: string; count: number }[];
  topDomains: { label: string; count: number }[];
}

export interface AdminDomainEmailRule {
  id: string;
  domain: string;
  category: string | null;
  subject: string;
  headline: string;
  bodyParagraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  cooldownDays: number;
  sendDelayMinutes: number;
  enabled: boolean;
}

export interface CreateDomainEmailRulePayload {
  id: string;
  domain: string;
  category?: string;
  emailSubject: string;
  emailHeadline: string;
  emailBodyParagraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  cooldownDays?: number;
  sendDelayMinutes?: number;
  enabled?: boolean;
}

export type UpdateDomainEmailRulePayload = Partial<{
  domain: string;
  category: string | null;
  emailSubject: string;
  emailHeadline: string;
  emailBodyParagraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  cooldownDays: number;
  sendDelayMinutes: number;
  enabled: boolean;
}>;

export interface AdminMedianMonthlySessionsSummary {
  month: string;
  median_sessions_per_user: number;
  mean_sessions_per_user: number;
  users_with_sessions: number;
  total_sessions: number;
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  filters: {
    min_duration_seconds: number;
    exclude_email_patterns: string[];
    exclude_platforms: string[];
  };
}

export interface AdminMedianMonthlySessionsReport {
  summary: AdminMedianMonthlySessionsSummary;
  histogram: { session_count: number; users: number }[];
  segments: {
    platform: AdminEngagementSegment[];
    subscription_tier: AdminEngagementSegment[];
    acquisition_source: AdminEngagementSegment[];
  };
  month_over_month: {
    previous_month: string;
    median_sessions_per_user: number;
    users_with_sessions: number;
    delta_median: number;
  } | null;
}

export interface AdminEngagementSegment {
  segment: string;
  median_sessions_per_user: number;
  users_with_sessions: number;
  total_sessions: number;
}

export type AdminEngagementSubscriptionTier =
  "all" | "free" | "paid" | "unknown";

export interface AdminWeeklySessionKpiSummary {
  iso_year: number;
  iso_week: number;
  week_label: string;
  week_range_label: string;
  /** Users with ≥1 qualifying VPN connection OR ≥1 perk click-through in the week. */
  active_users: number;
  active_users_with_connections?: number;
  active_users_with_perk_clicks?: number;
  active_users_vpn_only?: number;
  active_users_perk_only?: number;
  active_users_vpn_and_perk?: number;
  median_connections_per_user: number;
  total_connections: number;
  median_connection_seconds: number;
  total_connection_seconds: number;
  filters: {
    min_duration_seconds: number;
    exclude_email_patterns: string[];
    exclude_platforms: string[];
    include_platforms: string[];
    subscription_tier: string;
  };
}

export interface AdminWeeklySessionKpiReport {
  summary: AdminWeeklySessionKpiSummary;
  week_over_week: {
    previous_week: string;
    active_users: number;
    active_users_with_connections?: number;
    median_connections_per_user: number;
    total_connections: number;
    median_connection_seconds: number;
    total_connection_seconds: number;
    delta_active_users: number;
    delta_active_users_with_connections?: number;
    delta_median_connections: number;
  } | null;
  segments: {
    platform: AdminEngagementSegment[];
    subscription_tier: AdminEngagementSegment[];
  };
}

export interface AdminWeeklySessionKpiTrendReport {
  from: string;
  to: string;
  points: AdminWeeklySessionKpiSummary[];
}

export interface AdminSubscriptionListItem {
  id: string;
  status: string;
  planName: string | null;
  subscriptionType: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    joinedAt: string;
  };
}

export interface AdminSubscriptionListResponse {
  items: AdminSubscriptionListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminChurnBreakdownRow {
  billingPeriod: string;
  subscriptionType: string;
  hardChurned: number;
  softChurned: number;
  trialChurned: number;
  mrrStart: number;
  revenueChurned: number;
}

export interface AdminChurnReport {
  month: number;
  year: number;
  monthLabel: string;
  startOfMonthActiveUsers: number;
  startOfMonthTrialUsers?: number;
  startOfMonthPaidUsers?: number;
  hardChurned: number;
  hardChurnRate: number;
  churnedFromCancellation: number;
  accountsDeleted: number;
  softChurned: number;
  softChurnRate: number;
  trialChurned: number;
  trialChurnRate: number;
  mrrStart: number;
  revenueChurned: number;
  revenueChurnRate: number;
  breakdowns: AdminChurnBreakdownRow[];
}

export interface AdminJiraDeliveryRpRow {
  assigneeAccountId: string | null;
  assigneeDisplayName: string;
  points: number;
  percentOfTotal: number;
  suspended?: boolean;
}

export interface AdminJiraDeliveryEnvironmentRow {
  environment: string;
  points: number;
  percentOfTotal: number;
}

export interface AdminJiraDeliveryTrendPoint {
  month: string;
  monthLabel: string;
  totalPoints: number;
}

export interface AdminJiraKennaCreatedEstimates {
  displayName: string;
  accountId: string | null;
  points: number;
  issueCount: number;
  configured: boolean;
}

export interface AdminJiraDeliveryReport {
  month: string;
  monthLabel: string;
  totalPoints: number;
  completedIssueCount: number;
  issuesWithPointsCount: number;
  previousMonth: string;
  previousMonthTotalPoints: number;
  monthOverMonthDelta: number;
  monthOverMonthPercent: number | null;
  byRp: AdminJiraDeliveryRpRow[];
  byEnvironment: AdminJiraDeliveryEnvironmentRow[];
  trend: AdminJiraDeliveryTrendPoint[];
  kennaCreatedEstimates?: AdminJiraKennaCreatedEstimates;
  configured: boolean;
}

export interface AdminChurnTrendPoint {
  month: number;
  year: number;
  monthLabel: string;
  startOfMonthActiveUsers: number;
  hardChurned: number;
  hardChurnRate: number;
  softChurned: number;
  softChurnRate: number;
  trialChurned: number;
  mrrStart: number;
  revenueChurned: number;
  revenueChurnRate: number;
}

export interface AdminChurnTrendReport {
  from: string;
  to: string;
  points: AdminChurnTrendPoint[];
}

export type AdminChurnSubscriptionSource = "all" | "stripe" | "apple_iap";

export interface AdminWeeklyChurnSubscriptionSourceBreakdown {
  subscriptionType: string;
  activeAtWeekStart: number;
  churned: number;
  churnRate: number;
  autoRenewDisabled: number;
  subscriptionExpirations: number;
}

export interface AdminWeeklyChurnClientPlatformBreakdown {
  clientPlatform: string;
  churned: number;
  autoRenewDisabled: number;
  subscriptionExpirations: number;
}

export interface AdminWeeklyChurnSubscriptionStatusBreakdown {
  subscriptionStatus: "trial" | "paid";
  activeAtWeekStart: number;
  churned: number;
  churnRate: number;
  autoRenewDisabled: number;
  subscriptionExpirations: number;
}

export interface AdminWeeklyChurnReport {
  isoYear: number;
  isoWeek: number;
  weekLabel: string;
  weekRangeLabel: string;
  startOfWeekActiveUsers: number;
  startOfWeekTrialUsers?: number;
  startOfWeekPaidUsers?: number;
  churned: number;
  churnedTrialUsers?: number;
  churnedPaidUsers?: number;
  churnRate: number;
  churnedFromCancellation: number;
  accountsDeleted: number;
  autoRenewDisabled: number;
  autoRenewDisabledRate: number;
  subscriptionExpirations: number;
  subscriptionExpirationsRate: number;
  subscriptionSourceFilter: string | null;
  bySubscriptionStatus?: AdminWeeklyChurnSubscriptionStatusBreakdown[];
  bySubscriptionSource: AdminWeeklyChurnSubscriptionSourceBreakdown[];
  byClientPlatform: AdminWeeklyChurnClientPlatformBreakdown[];
}

export interface AdminWeeklyChurnTrendPoint {
  isoYear: number;
  isoWeek: number;
  weekLabel: string;
  weekRangeLabel: string;
  startOfWeekActiveUsers: number;
  churned: number;
  churnRate: number;
  churnedFromCancellation: number;
  accountsDeleted: number;
  autoRenewDisabled: number;
  autoRenewDisabledRate: number;
  subscriptionExpirations: number;
  subscriptionExpirationsRate: number;
}

export interface AdminWeeklyChurnTrendReport {
  from: string;
  to: string;
  subscriptionSourceFilter: string | null;
  points: AdminWeeklyChurnTrendPoint[];
}

/** Response body from POST /admin/subscription/stripe/retrigger-cancel-at-period-end */
export interface AdminRetriggerStripeCancelResponse {
  success: boolean;
  message: string;
  error: string | null;
  subscriptionId?: string;
  stripeSubscriptionId?: string;
  stripeCancelAtPeriodEnd?: boolean;
  stripeStatus?: string;
}

export interface CreateAdminUserPayload {
  email: string;
  password: string;
  name: string;
  role: "SUPER_ADMIN" | "SUPPORT_ADMIN" | "BILLING_ADMIN" | "READONLY_ADMIN";
}

export async function adminLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean; admin?: AdminMe; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Login failed"),
      };
    }
    const record = raw as { data?: { admin: AdminMe } };
    return { ok: true, admin: record.data?.admin };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminLogout(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/admin/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
}

export async function adminFetchMe(): Promise<{
  ok: boolean;
  admin?: AdminMe;
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/auth/me`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Unauthorized"),
      };
    }
    const record = raw as { data?: { admin: AdminMe } };
    return { ok: true, admin: record.data?.admin };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AdminConnectionSession {
  id: string;
  client_session_id: string;
  session_start: string;
  session_end: string | null;
  duration_seconds: number;
  platform: string;
  app_version: string | null;
  server_location: string | null;
  bytes_transferred: number;
  subscription_tier: string | null;
  termination_reason: string;
  disconnect_reason: string | null;
}

export interface AdminUserConnectionSessionsResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    provider: string;
    longestSessionSeconds: number;
    createdAt: string;
  };
  sessions: AdminConnectionSession[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserEmailRecord {
  id: string;
  category: string;
  subject: string;
  sentAt: string | null;
  deliveryStatus: string;
  openedAt: string | null;
  clickedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AdminUserReviewActivityRecord {
  eventName: string;
  label: string;
  occurredAt: string;
  platform: string | null;
  properties: Record<string, unknown> | null;
}

export interface AdminUserTimelineEvent {
  id: string;
  type: string;
  label: string;
  occurredAt: string;
  source: string;
  metadata: Record<string, unknown> | null;
}

export interface AdminUserEngagementProfile {
  user: {
    id: string;
    email: string;
    name: string | null;
    provider: string;
    createdAt: string;
    longestSessionSeconds: number;
  };
  subscription: {
    status: string;
    planName: string | null;
    billingPeriod: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    subscriptionType: string;
  } | null;
  emails: AdminUserEmailRecord[];
  reviewActivity: AdminUserReviewActivityRecord[];
  timeline: AdminUserTimelineEvent[];
}

export async function adminFetchUserEngagementProfile(
  userId: string,
  params?: { signal?: AbortSignal },
): Promise<{
  ok: boolean;
  data?: AdminUserEngagementProfile;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/users/${encodeURIComponent(userId)}/profile`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load user profile"),
      };
    }
    const record = raw as { data?: AdminUserEngagementProfile };
    if (!record.data) {
      return { ok: false, error: "Invalid response from server" };
    }
    return { ok: true, data: record.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function adminFetchUserConnectionSessions(
  userId: string,
  params?: { limit?: number; offset?: number; signal?: AbortSignal },
): Promise<{
  ok: boolean;
  data?: AdminUserConnectionSessionsResponse;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    query.set("limit", String(params?.limit ?? 50));
    query.set("offset", String(params?.offset ?? 0));
    const response = await fetch(
      `${BACKEND_URL}/admin/users/${encodeURIComponent(userId)}/connection-sessions?${query.toString()}`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load connection sessions",
        ),
      };
    }
    const record = raw as { data?: AdminUserConnectionSessionsResponse };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/** Matches backend default for admin engagement / overview filters. */
export const ADMIN_DEFAULT_MIN_DURATION_SECONDS = 10;

/** Omit default min duration from query string; still send 0 (use `!= null`, not truthy). */
function appendAdminMinDurationSeconds(
  query: URLSearchParams,
  minDurationSeconds?: number,
): void {
  if (minDurationSeconds == null) return;
  if (minDurationSeconds === ADMIN_DEFAULT_MIN_DURATION_SECONDS) return;
  query.set("min_duration_seconds", String(minDurationSeconds));
}

export async function adminFetchUsersOverview(params?: {
  page?: number;
  limit?: number;
  search?: string;
  month?: string;
  minDurationSeconds?: number;
  excludePlatforms?: string;
}): Promise<{
  ok: boolean;
  data?: AdminUserOverview;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    query.set("page", String(params?.page ?? 1));
    query.set("limit", String(params?.limit ?? 20));
    if (params?.search?.trim()) query.set("search", params.search.trim());
    if (params?.month) query.set("month", params.month);
    appendAdminMinDurationSeconds(query, params?.minDurationSeconds);
    if (params?.excludePlatforms) {
      query.set("exclude_platforms", params.excludePlatforms);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/users/overview${suffix}`,
      {
        credentials: "include",
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load users overview"),
      };
    }
    const record = raw as { data?: AdminUserOverview };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchMedianMonthlySessions(params?: {
  month?: string;
  minDurationSeconds?: number;
  excludePlatforms?: string;
  includeMom?: boolean;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminMedianMonthlySessionsReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.month) query.set("month", params.month);
    appendAdminMinDurationSeconds(query, params?.minDurationSeconds);
    if (params?.excludePlatforms) {
      query.set("exclude_platforms", params.excludePlatforms);
    }
    // Omit include_mom unless opting out — backend defaults to true (MoM included).
    // AdminConnectionEngagement never passes includeMom, so month_over_month is always returned.
    if (params?.includeMom === false) {
      query.set("include_mom", "false");
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/connection-engagement/median-monthly-sessions${suffix}`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load connection engagement",
        ),
      };
    }
    const record = raw as { data?: AdminMedianMonthlySessionsReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AdminUtmSignupRow {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  signups: number;
}

export interface AdminUtmSignupReport {
  from: string;
  to: string;
  total_signups: number;
  rows: AdminUtmSignupRow[];
}

export interface AdminLandingPageReportRow {
  first_page: string;
  signups: number;
  trials: number;
  signup_to_trial_rate: number;
}

export interface AdminLandingPageReport {
  from: string;
  to: string;
  total_signups: number;
  total_trials: number;
  rows: AdminLandingPageReportRow[];
}

const SIGNUP_STARTED_SESSION_KEY = "keen_signup_started_tracked";
const STICKER_LANDING_SESSION_KEY = "keen_sticker_landing_tracked";

function stickerLandingSessionKey(
  attribution: NonNullable<
    ReturnType<typeof getUtmAttributionAuthPayload>["utmAttribution"]
  >,
): string {
  const campaign = attribution.utm_campaign ?? "";
  const content = attribution.utm_content ?? "";
  const medium = attribution.utm_medium ?? "";
  return `${STICKER_LANDING_SESSION_KEY}:${campaign}:${content}:${medium}`;
}

let signupStartedInFlight: Promise<void> | null = null;
const stickerLandingInFlightByKey = new Map<string, Promise<void>>();

/** Records signup_started with stored first-touch UTMs (pre-account). */
export async function recordSignupStarted(email?: string | null): Promise<void> {
  // PostHog funnel step must fire for direct/no-UTM signups too.
  trackPostHogSignupStarted(email);

  const payload = getUtmAttributionAuthPayload();
  if (!payload.utmAttribution) return;

  if (typeof window !== "undefined") {
    try {
      if (sessionStorage.getItem(SIGNUP_STARTED_SESSION_KEY)) return;
    } catch {
      /* private mode / blocked storage */
    }
  }

  if (signupStartedInFlight) {
    return signupStartedInFlight;
  }

  signupStartedInFlight = (async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/marketing-attribution/signup-started`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        },
      );
      if (!response.ok) return;

      const data: unknown = await response.json().catch(() => ({}));
      const tracked =
        typeof data === "object" &&
        data !== null &&
        (data as { tracked?: boolean }).tracked === true;
      if (!tracked) return;

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(SIGNUP_STARTED_SESSION_KEY, "1");
        } catch {
          /* private mode / blocked storage */
        }
      }
    } catch {
      /* non-fatal */
    } finally {
      signupStartedInFlight = null;
    }
  })();

  return signupStartedInFlight;
}

/**
 * Records app_download_clicked (PostHog + backend product event).
 * Intent only — not a confirmed install.
 */
export async function recordAppDownloadClicked(input: {
  platform: AppDownloadPlatform;
  sourcePage?: string;
  cta?: string;
  storeUrl?: string;
}): Promise<void> {
  const downloadPlatform = input.platform;
  const sourcePage =
    input.sourcePage ??
    (typeof window !== "undefined" ? window.location.pathname : undefined);
  const storeUrl = input.storeUrl ?? null;
  const cta = input.cta ?? null;

  trackPostHogAppDownloadClicked(downloadPlatform, {
    source_page: sourcePage ?? null,
    cta,
    store_url: storeUrl,
  });

  try {
    const payload = getUtmAttributionAuthPayload();
    let sessionToken: string | null = null;
    try {
      sessionToken = getSessionToken();
    } catch {
      /* private mode / blocked storage — still record an anonymous click */
    }
    const downloadClientId = getOrCreateDownloadClientId();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // OptionalSessionGuard on this endpoint treats invalid/expired Bearer tokens as
    // anonymous (never 401). Attach when present so logged-in clicks link to the user.
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }
    const body = JSON.stringify({
      platform: downloadPlatform,
      source_page: sourcePage,
      cta: cta ?? undefined,
      store_url: storeUrl ?? undefined,
      download_client_id: downloadClientId,
      ...payload,
    });
    const response = await fetch(
      `${BACKEND_URL}/marketing-attribution/app-download-clicked`,
      {
        method: "POST",
        headers,
        body,
        keepalive: true,
      },
    );
    // Defensive: if auth ever starts rejecting, retry anonymous so the click is not lost.
    if (response.status === 401 && sessionToken) {
      const anonymousHeaders = { "Content-Type": "application/json" };
      await fetch(`${BACKEND_URL}/marketing-attribution/app-download-clicked`, {
        method: "POST",
        headers: anonymousHeaders,
        body,
        keepalive: true,
      });
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Records trial CTA impression or click (PostHog + backend product_events).
 * Distinct from trial_started (activation). Requires a logged-in user id so
 * admin KPI reports and PostHog funnel counts stay authenticated-only.
 *
 * View is session-deduped (Pricing → Subscribe should count once). Backend also
 * dedupes trial_cta_viewed per user. Click is recorded only when checkout starts.
 */
const trialCtaViewSeenInMemory = new Set<string>();

function hasTrialCtaViewDedupe(viewKey: string): boolean {
  if (trialCtaViewSeenInMemory.has(viewKey)) return true;
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(viewKey) === "1";
  } catch {
    return false;
  }
}

/** Claim in-flight / in-memory immediately so concurrent callers skip. */
function claimTrialCtaViewInMemory(viewKey: string): void {
  trialCtaViewSeenInMemory.add(viewKey);
}

/** Persist across remounts only after backend confirms tracked. */
function persistTrialCtaViewDedupe(viewKey: string): void {
  trialCtaViewSeenInMemory.add(viewKey);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(viewKey, "1");
  } catch {
    /* private mode — in-memory set still covers remounts in this tab */
  }
}

function releaseTrialCtaViewInMemory(viewKey: string): void {
  trialCtaViewSeenInMemory.delete(viewKey);
}

export async function recordTrialCtaEvent(input: {
  eventName: "trial_cta_viewed" | "trial_cta_clicked";
  userId?: string | null;
  sourcePage?: string;
  cta?: string;
}): Promise<void> {
  const userId = input.userId?.trim();
  if (!userId) return;

  const sourcePage =
    input.sourcePage ??
    (typeof window !== "undefined" ? window.location.pathname : undefined);
  const cta = input.cta ?? "start_free_trial";
  const viewKey =
    input.eventName === "trial_cta_viewed"
      ? `keen_trial_cta_viewed:${userId}`
      : null;

  if (viewKey && hasTrialCtaViewDedupe(viewKey)) {
    return;
  }
  // Close the concurrent-call window before the async fetch.
  if (viewKey) {
    claimTrialCtaViewInMemory(viewKey);
  }

  let sessionToken: string | null = null;
  try {
    sessionToken = getSessionToken();
  } catch {
    if (viewKey) releaseTrialCtaViewInMemory(viewKey);
    return;
  }
  if (!sessionToken) {
    if (viewKey) releaseTrialCtaViewInMemory(viewKey);
    return;
  }

  try {
    const response = await fetch(
      `${BACKEND_URL}/marketing-attribution/trial-cta`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          event_name: input.eventName,
          source_page: sourcePage,
          cta,
        }),
        keepalive: true,
      },
    );
    if (!response.ok) {
      if (viewKey) releaseTrialCtaViewInMemory(viewKey);
      return;
    }
    const data: unknown = await response.json().catch(() => ({}));
    const tracked =
      typeof data === "object" &&
      data !== null &&
      (data as { tracked?: boolean }).tracked === true;
    if (!tracked) {
      if (viewKey) releaseTrialCtaViewInMemory(viewKey);
      return;
    }

    // Persist across remounts only after backend accepts / already-tracked.
    if (viewKey) {
      persistTrialCtaViewDedupe(viewKey);
    }

    if (input.eventName === "trial_cta_viewed") {
      trackPostHogTrialCtaViewed(userId, {
        source_page: sourcePage ?? null,
        cta,
      });
    } else {
      trackPostHogTrialCtaClicked(userId, {
        source_page: sourcePage ?? null,
        cta,
      });
    }
  } catch {
    if (viewKey) releaseTrialCtaViewInMemory(viewKey);
    /* non-fatal — leave sessionStorage unset so a later attempt can retry */
  }
}

/** Records sticker_landing when a sticker QR/URL is opened (pre-account). */
export async function recordStickerLanding(
  utmAttribution?: import("@/lib/utm-attribution").StoredUtmAttribution,
): Promise<void> {
  const payload = utmAttribution
    ? { utmAttribution }
    : getUtmAttributionAuthPayload();
  if (!payload.utmAttribution) return;

  const sessionKey = stickerLandingSessionKey(payload.utmAttribution);

  if (typeof window !== "undefined") {
    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch {
      /* private mode / blocked storage */
    }
  }

  const existing = stickerLandingInFlightByKey.get(sessionKey);
  if (existing) {
    return existing;
  }

  const inFlight = (async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/marketing-attribution/sticker-landing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, platform: "web" }),
          keepalive: true,
        },
      );
      if (!response.ok) return;

      const data: unknown = await response.json().catch(() => ({}));
      const tracked =
        typeof data === "object" &&
        data !== null &&
        (data as { tracked?: boolean }).tracked === true;
      if (!tracked) return;

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(sessionKey, "1");
        } catch {
          /* private mode / blocked storage */
        }
      }
    } catch {
      /* non-fatal */
    } finally {
      stickerLandingInFlightByKey.delete(sessionKey);
    }
  })();

  stickerLandingInFlightByKey.set(sessionKey, inFlight);
  return inFlight;
}

export interface AdminUtmFunnelRow {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  signup_started: number;
  signups_completed: number;
  trials: number;
  subscriptions: number;
  revenue: number;
  signup_to_completed_rate: number;
  signup_completed_to_trial_rate: number;
  signup_completed_to_paid_rate: number;
}

export interface AdminUtmFunnelReport {
  from: string;
  to: string;
  totals: {
    signup_started: number;
    signups_completed: number;
    trials: number;
    subscriptions: number;
    revenue: number;
    signup_to_completed_rate: number;
    signup_completed_to_trial_rate: number;
    signup_completed_to_paid_rate: number;
  };
  rows: AdminUtmFunnelRow[];
}

export async function adminFetchUtmFunnelReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminUtmFunnelReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/funnel${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load UTM funnel report",
        ),
      };
    }
    const record = data as { data?: AdminUtmFunnelReport };
    if (!record.data) {
      return { ok: false, error: "Invalid UTM funnel report response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AdminStickerFunnelRow {
  utm_campaign: string;
  utm_content: string;
  utm_medium: string;
  sticker_landings: number;
  signup_started: number;
  signups_completed: number;
  trials: number;
  subscriptions: number;
  revenue: number;
  landing_to_signup_started_rate: number;
  signup_to_completed_rate: number;
  signup_completed_to_trial_rate: number;
  signup_completed_to_paid_rate: number;
}

export interface AdminStickerFunnelReport {
  from: string;
  to: string;
  totals: {
    sticker_landings: number;
    signup_started: number;
    signups_completed: number;
    trials: number;
    subscriptions: number;
    revenue: number;
    landing_to_signup_started_rate: number;
    signup_to_completed_rate: number;
    signup_completed_to_trial_rate: number;
    signup_completed_to_paid_rate: number;
  };
  rows: AdminStickerFunnelRow[];
}

export async function adminFetchStickerFunnelReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminStickerFunnelReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/stickers/funnel${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load sticker funnel report",
        ),
      };
    }
    const record = data as { data?: AdminStickerFunnelReport };
    if (!record.data) {
      return { ok: false, error: "Invalid sticker funnel report response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchUtmSignupReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminUtmSignupReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/signups${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load UTM sign-up report",
        ),
      };
    }
    const record = data as { data?: AdminUtmSignupReport };
    if (!record.data) {
      return { ok: false, error: "Invalid UTM sign-up report response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchLandingPageReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminLandingPageReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/landing-pages${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load landing page report",
        ),
      };
    }
    const record = data as { data?: AdminLandingPageReport };
    if (!record.data) {
      return { ok: false, error: "Invalid landing page report response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AdminDownloadClickRow {
  platform: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  clicks: number;
  identified_clicks: number;
  identified_users: number;
}

export interface AdminWebToAppFunnelRow {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  web_signups: number;
  later_app_authenticated: number;
  never_used_app: number;
  trials: number;
  subscriptions: number;
  web_signup_to_app_rate: number;
  web_signup_to_trial_rate: number;
  web_signup_to_paid_rate: number;
}

export interface AdminDownloadFunnelReport {
  from: string;
  to: string;
  downloads: {
    total_clicks: number;
    by_platform: Record<string, number>;
    rows: AdminDownloadClickRow[];
  };
  web_to_app: {
    web_signups: number;
    later_app_authenticated: number;
    never_used_app: number;
    by_platform: {
      windows: number;
      macos: number;
      ios: number;
      android: number;
    };
    trials: number;
    subscriptions: number;
    web_signup_to_app_rate: number;
    web_signup_to_trial_rate: number;
    web_signup_to_paid_rate: number;
    rows: AdminWebToAppFunnelRow[];
  };
}

export interface AdminSignupTrialPaidFunnelReport {
  from: string;
  to: string;
  stages: {
    signup_started: number;
    signups: number;
    trial_cta_viewed: number;
    trial_cta_clicked: number;
    trial_started: number;
    paid: number;
  };
  rates: {
    signup_to_cta_viewed: number;
    signup_to_cta_clicked: number;
    signup_to_trial: number;
    trial_to_paid: number;
    signup_to_paid: number;
  };
  drop_off: {
    signup_to_cta_viewed: number;
    cta_viewed_to_clicked: number;
    cta_clicked_to_trial: number;
    trial_to_paid: number;
  };
}

export async function adminFetchSignupTrialPaidFunnelReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  error?: string;
  data?: AdminSignupTrialPaidFunnelReport;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/signup-trial-paid${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load signup → trial → paid funnel",
        ),
      };
    }
    // Raw wire shape: signup_started may be absent; older APIs sent visitors.
    type RawSignupTrialStages = Omit<
      AdminSignupTrialPaidFunnelReport["stages"],
      "signup_started"
    > & {
      signup_started?: number;
      visitors?: number;
    };
    type RawSignupTrialPaidFunnelReport = Omit<
      AdminSignupTrialPaidFunnelReport,
      "stages"
    > & {
      stages?: RawSignupTrialStages;
    };
    const record = data as { data?: RawSignupTrialPaidFunnelReport };
    if (!record.data?.stages) {
      return { ok: false, error: "Invalid signup-trial-paid funnel response" };
    }
    const stages = record.data.stages;
    const signupStarted =
      typeof stages.signup_started === "number"
        ? stages.signup_started
        : typeof stages.visitors === "number"
          ? stages.visitors
          : 0;
    return {
      ok: true,
      data: {
        ...record.data,
        stages: {
          signup_started: signupStarted,
          signups: stages.signups,
          trial_cta_viewed: stages.trial_cta_viewed,
          trial_cta_clicked: stages.trial_cta_clicked,
          trial_started: stages.trial_started,
          paid: stages.paid,
        },
      },
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AdminDownloadFunnelUserRow {
  user_id: string | null;
  email: string | null;
  contact_email: string | null;
  clicked_at?: string;
  signed_up_at?: string;
  has_account: boolean;
  later_app_used: boolean;
  trial_started: boolean;
  subscription_started: boolean;
  download_platform?: string;
}

export interface AdminDownloadClickUsersReport {
  from: string;
  to: string;
  platform: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  total_clicks: number;
  anonymous_clicks: number;
  identified_clicks: number;
  rows: AdminDownloadFunnelUserRow[];
}

export interface AdminWebToAppUsersReport {
  from: string;
  to: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  rows: AdminDownloadFunnelUserRow[];
}

export type AdminDownloadsByOsKey = 'ios' | 'macos' | 'android' | 'windows';

export interface AdminDownloadsByOsReport {
  from: string;
  to: string;
  source: 'app_first_open';
  total: number;
  by_os: Record<
    AdminDownloadsByOsKey,
    {
      count: number;
      percent_of_total: number;
    }
  >;
}

export async function adminFetchDownloadFunnelReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminDownloadFunnelReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/downloads/funnel${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load download funnel report",
        ),
      };
    }
    const record = data as { data?: AdminDownloadFunnelReport };
    if (!record.data) {
      return { ok: false, error: "Invalid download funnel report response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchDownloadClickUsers(params: {
  from?: string;
  to?: string;
  platform: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminDownloadClickUsersReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    query.set("platform", params.platform);
    query.set("utm_source", params.utm_source);
    query.set("utm_medium", params.utm_medium);
    query.set("utm_campaign", params.utm_campaign);
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/downloads/clicks/users?${query.toString()}`,
      {
        method: "GET",
        credentials: "include",
        signal: params.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load download click users",
        ),
      };
    }
    const record = data as { data?: AdminDownloadClickUsersReport };
    if (!record.data) {
      return { ok: false, error: "Invalid download click users response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchWebToAppUsers(params: {
  from?: string;
  to?: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminWebToAppUsersReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    query.set("utm_source", params.utm_source);
    query.set("utm_medium", params.utm_medium);
    query.set("utm_campaign", params.utm_campaign);
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/downloads/web-to-app/users?${query.toString()}`,
      {
        method: "GET",
        credentials: "include",
        signal: params.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load web-to-app users",
        ),
      };
    }
    const record = data as { data?: AdminWebToAppUsersReport };
    if (!record.data) {
      return { ok: false, error: "Invalid web-to-app users response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchDownloadsByOs(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminDownloadsByOsReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/utm-attribution/downloads/by-os${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          data,
          "Failed to load downloads by OS",
        ),
      };
    }
    const record = data as { data?: AdminDownloadsByOsReport };
    if (!record.data) {
      return { ok: false, error: "Invalid downloads by OS response" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export type AdminUnsubscribeTrendInterval = "day" | "week" | "month";

export interface AdminEmailUnsubscribeSummary {
  from: string;
  to: string;
  total_unsubscribes: number;
  unsubscribe_all_events: number;
  category_optout_events: number;
  category_optout_share: number | null;
  broadcast_unsubscribes: number;
  delivered_recipients: number;
  unsubscribe_rate: number | null;
  avg_subscribed_days: number | null;
  avg_emails_received: number | null;
}

export interface AdminEmailUnsubscribeTrendReport {
  from: string;
  to: string;
  interval: AdminUnsubscribeTrendInterval;
  rows: { bucket: string; unsubscribes: number }[];
}

export interface AdminEmailUnsubscribeCampaignRow {
  campaign_key: string;
  campaign: string;
  broadcast_id: string | null;
  template_id: string | null;
  unsubscribes: number;
  broadcast_unsubscribes: number;
  share_of_total: number | null;
  unsubscribe_rate: number | null;
  delivered_recipients: number | null;
  last_unsubscribe_at: string | null;
  avg_subscribed_days: number | null;
  avg_emails_received: number | null;
}

export interface AdminEmailUnsubscribeCampaignsReport {
  from: string;
  to: string;
  total_unsubscribes: number;
  rows: AdminEmailUnsubscribeCampaignRow[];
}

export interface AdminEmailUnsubscribeCategoryRow {
  category: string;
  category_label: string;
  scope: "all" | "category";
  unsubscribes: number;
  share_of_total: number | null;
  last_unsubscribe_at: string | null;
  avg_subscribed_days: number | null;
  avg_emails_received: number | null;
}

export interface AdminEmailUnsubscribeCategoriesReport {
  from: string;
  to: string;
  total_unsubscribes: number;
  rows: AdminEmailUnsubscribeCategoryRow[];
}

export interface AdminEmailUnsubscribeEventRow {
  id: string;
  email: string;
  source: string;
  /** Preference category the recipient turned off, or "all". */
  preference_category: string;
  preference_category_label: string;
  scope: "all" | "category";
  /** Classification of the broadcast they last received, when known. */
  category: string | null;
  unsubscribed_at: string;
  subscribed_at: string | null;
  subscribed_days: number | null;
  emails_received_count: number;
  last_email_subject: string | null;
  last_email_broadcast_id: string | null;
  last_email_template_id: string | null;
  last_email_at: string | null;
  campaign_key: string;
}

export interface AdminEmailUnsubscribeEventsReport {
  from: string;
  to: string;
  total: number;
  limit: number;
  offset: number;
  rows: AdminEmailUnsubscribeEventRow[];
}

async function adminFetchEmailUnsubscribeJson<T>(
  path: string,
  params: {
    from?: string;
    to?: string;
    interval?: AdminUnsubscribeTrendInterval;
    campaign?: string;
    template?: string;
    category?: string;
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  },
  fallbackError: string,
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const query = new URLSearchParams();
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (params.interval) query.set("interval", params.interval);
    if (params.campaign) query.set("campaign", params.campaign);
    if (params.template) query.set("template", params.template);
    if (params.category) query.set("category", params.category);
    if (params.limit != null) query.set("limit", String(params.limit));
    if (params.offset != null) query.set("offset", String(params.offset));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/email-unsubscribes/${path}${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params.signal,
      },
    );
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(data, fallbackError),
      };
    }
    const record = data as { data?: T };
    if (!record.data) {
      return { ok: false, error: `Invalid ${path} response` };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request aborted" };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export function adminFetchEmailUnsubscribeSummary(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}) {
  return adminFetchEmailUnsubscribeJson<AdminEmailUnsubscribeSummary>(
    "summary",
    params ?? {},
    "Failed to load unsubscribe summary",
  );
}

export function adminFetchEmailUnsubscribeTrends(params?: {
  from?: string;
  to?: string;
  interval?: AdminUnsubscribeTrendInterval;
  signal?: AbortSignal;
}) {
  return adminFetchEmailUnsubscribeJson<AdminEmailUnsubscribeTrendReport>(
    "trends",
    params ?? {},
    "Failed to load unsubscribe trends",
  );
}

export function adminFetchEmailUnsubscribeCampaigns(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}) {
  return adminFetchEmailUnsubscribeJson<AdminEmailUnsubscribeCampaignsReport>(
    "campaigns",
    params ?? {},
    "Failed to load unsubscribe campaigns",
  );
}

export function adminFetchEmailUnsubscribeEvents(params?: {
  from?: string;
  to?: string;
  campaign?: string;
  template?: string;
  category?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}) {
  return adminFetchEmailUnsubscribeJson<AdminEmailUnsubscribeEventsReport>(
    "events",
    params ?? {},
    "Failed to load unsubscribe events",
  );
}

export async function adminFetchEmailUnsubscribeCategories(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminEmailUnsubscribeCategoriesReport;
  error?: string;
}> {
  return adminFetchEmailUnsubscribeJson<AdminEmailUnsubscribeCategoriesReport>(
    "categories",
    params ?? {},
    "Failed to load unsubscribe categories",
  );
}

export interface AdminClassActionEmailCtaReport {
  from: string;
  to: string;
  emails_sent: number;
  total_cta_clicks: number;
  unique_users_clicked: number;
  bot_clicks_excluded: number;
  overall_ctr: number | null;
  by_cta: {
    cta_id: string;
    total_clicks: number;
    unique_users: number;
  }[];
  by_perk: {
    perk_id: string;
    perk_title: string | null;
    emails_sent: number;
    total_clicks: number;
    unique_users: number;
    ctr: number | null;
    subsequent_trials: number;
    subsequent_paid: number;
  }[];
}

export async function adminFetchClassActionEmailCtaReport(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminClassActionEmailCtaReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/email-cta/class-action${suffix}`,
      {
        method: "GET",
        credentials: "include",
        signal: params?.signal,
      },
    );
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          body,
          "Failed to load class-action email CTA report",
        ),
      };
    }
    const record = body as { data?: AdminClassActionEmailCtaReport };
    if (!record.data) {
      return { ok: false, error: "Invalid class-action email CTA response" };
    }
    return { ok: true, data: record.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "aborted" };
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load class-action email CTA report",
    };
  }
}

export async function adminFetchWeeklySessionKpis(params?: {
  year?: number;
  week?: number;
  minDurationSeconds?: number;
  excludePlatforms?: string;
  includePlatforms?: string;
  subscriptionTier?: AdminEngagementSubscriptionTier;
  includeWow?: boolean;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminWeeklySessionKpiReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.year != null) query.set("year", String(params.year));
    if (params?.week != null) query.set("week", String(params.week));
    appendAdminMinDurationSeconds(query, params?.minDurationSeconds);
    if (params?.excludePlatforms) {
      query.set("exclude_platforms", params.excludePlatforms);
    }
    if (params?.includePlatforms) {
      query.set("include_platforms", params.includePlatforms);
    }
    if (params?.subscriptionTier && params.subscriptionTier !== "all") {
      query.set("subscription_tier", params.subscriptionTier);
    }
    if (params?.includeWow === false) {
      query.set("include_wow", "false");
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/connection-engagement/weekly-kpis${suffix}`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load weekly session KPIs",
        ),
      };
    }
    const record = raw as { data?: AdminWeeklySessionKpiReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchWeeklySessionKpiTrend(params: {
  from: string;
  to: string;
  minDurationSeconds?: number;
  excludePlatforms?: string;
  includePlatforms?: string;
  subscriptionTier?: AdminEngagementSubscriptionTier;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminWeeklySessionKpiTrendReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    query.set("from", params.from);
    query.set("to", params.to);
    appendAdminMinDurationSeconds(query, params.minDurationSeconds);
    if (params.excludePlatforms) {
      query.set("exclude_platforms", params.excludePlatforms);
    }
    if (params.includePlatforms) {
      query.set("include_platforms", params.includePlatforms);
    }
    if (params.subscriptionTier && params.subscriptionTier !== "all") {
      query.set("subscription_tier", params.subscriptionTier);
    }
    const response = await fetch(
      `${BACKEND_URL}/admin/connection-engagement/weekly-kpis/trend?${query.toString()}`,
      {
        credentials: "include",
        signal: params.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load weekly session KPI trend",
        ),
      };
    }
    const record = raw as { data?: AdminWeeklySessionKpiTrendReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchIpAddressClickSummary(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminIpAddressClickSummary;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/product-events/ip-address-clicks${suffix}`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load IP address clicks",
        ),
      };
    }
    const record = raw as { data?: AdminIpAddressClickSummary };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchReviewPromptSummary(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminReviewPromptSummary;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/product-events/review-prompts${suffix}`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load review prompt metrics",
        ),
      };
    }
    const record = raw as { data?: AdminReviewPromptSummary };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchUserProfileSummary(params?: {
  audience?: AdminUserProfileAudience;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminUserProfileSummary;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.audience && params.audience !== "all") {
      query.set("audience", params.audience);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/user-profiles/summary${suffix}`,
      {
        credentials: "include",
        signal: params?.signal,
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load user profile summary",
        ),
      };
    }
    const record = raw as { data?: AdminUserProfileSummary };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchDomainInsightsMetrics(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  data?: AdminDomainInsightsMetrics;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/contextual-email/metrics${suffix}`,
      { credentials: "include", signal: params?.signal },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load domain insights metrics",
        ),
      };
    }
    const record = raw as { data?: AdminDomainInsightsMetrics };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminSimulateDomainVisit(payload: {
  userId: string;
  domain: string;
}): Promise<{
  ok: boolean;
  data?: { success: boolean; scheduled: boolean; reason?: string };
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/contextual-email/simulate-visit`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Simulate visit failed"),
      };
    }
    return {
      ok: true,
      data: raw as { success: boolean; scheduled: boolean; reason?: string },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListDomainEmailRules(): Promise<{
  ok: boolean;
  data?: AdminDomainEmailRule[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/domain-email-rules`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load domain rules"),
      };
    }
    const record = raw as { data?: AdminDomainEmailRule[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminCreateDomainEmailRule(
  payload: CreateDomainEmailRulePayload,
): Promise<{ ok: boolean; data?: AdminDomainEmailRule; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/domain-email-rules`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to create rule"),
      };
    }
    const record = raw as { data?: AdminDomainEmailRule };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminUpdateDomainEmailRule(
  id: string,
  payload: UpdateDomainEmailRulePayload,
): Promise<{ ok: boolean; data?: AdminDomainEmailRule; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/domain-email-rules/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to update rule"),
      };
    }
    const record = raw as { data?: AdminDomainEmailRule };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminDeleteDomainEmailRule(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/domain-email-rules/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to delete rule"),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AudiencePreset {
  id:
    | "all_users"
    | "has_us_bank_account"
    | "no_us_bank_account"
    | "receives_direct_deposit"
    | "self_employed"
    | "business_owner"
    | "interested_in_starting_business"
    | "custom";
  label: string;
}

export type AudiencePresetId = AudiencePreset["id"];

export interface AudienceCustomRule {
  questionKey:
    | "us_bank_account"
    | "direct_deposit_income"
    | "entrepreneurship_interest_2026";
  value: string;
}

export interface AudienceTargeting {
  presets: AudiencePresetId[];
  customRules?: {
    logic: "or" | "and";
    rules: AudienceCustomRule[];
  };
}

export interface AudienceTargetingPreview {
  context: "perks" | "broadcast";
  totalAudience: number;
  matchingRecipients: number;
  matchPercentage: number;
  profileTargeting: AudienceTargeting;
  deliverability?: BroadcastEmailAudience;
  optedInCount?: number;
}

export async function adminFetchAudienceTargetingOptions(): Promise<{
  ok: boolean;
  data?: {
    presets: AudiencePreset[];
    questions: {
      key: string;
      label: string;
      category: string;
      options: { value: string; label: string }[];
    }[];
  };
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/audience-targeting/options`,
      {
        credentials: "include",
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load audience options",
        ),
      };
    }
    const record = raw as {
      data?: {
        presets: AudiencePreset[];
        questions: {
          key: string;
          label: string;
          category: string;
          options: { value: string; label: string }[];
        }[];
      };
    };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminPreviewAudienceTargeting(payload: {
  context: "perks" | "broadcast";
  deliverability?: BroadcastEmailAudience;
  profileTargeting?: AudienceTargeting;
  emailCategory?: string;
}): Promise<{
  ok: boolean;
  data?: AudienceTargetingPreview;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/audience-targeting/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to preview audience"),
      };
    }
    const record = raw as { data?: AudienceTargetingPreview };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface ExtensionDomainRule {
  host: string;
  pathPrefix?: string;
  priority?: number;
}

export interface AdminPerk {
  id: string;
  title: string;
  partnerName: string | null;
  category: PerkCategory;
  description: string;
  imageUrl: string | null;
  offerText: string;
  redemptionType: PerkRedemptionType;
  redemptionUrl: string | null;
  couponCode: string | null;
  accessLevel: "free" | "paid" | "annual";
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  daysRemaining: number | null;
  status:
    | "active"
    | "scheduled"
    | "draft"
    | "expired"
    | "cooling_off"
    | "eligible_for_readd";
  reactivationCount: number;
  lastExpiredAt: string | null;
  eligibleForReactivationAt: string | null;
  clonedFromPerkId: string | null;
  audienceTargeting: AudienceTargeting;
  extensionDomains: ExtensionDomainRule[];
  /** Workflow Engine type identifier for "workflow" redemption perks, e.g. "chase_signup". */
  workflowType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPerkRequestAggregate {
  serviceKey: string;
  serviceName: string;
  websiteUrl: string | null;
  category: string | null;
  requestCount: number;
  uniqueUsers: number;
  isHighDemand: boolean;
  demandScore: number;
  latestRequestedAt: string;
}

export interface AdminPerkReactivation {
  id: string;
  perkId: string;
  perkTitle?: string;
  action: "reactivate" | "clone";
  reactivatedAt: string;
  previousEndsAt: string | null;
  newStartsAt: string;
  newEndsAt: string | null;
  clonedPerkId: string | null;
  adminUser: { id: string; email: string; name: string | null } | null;
}

export interface CreateAdminPerkPayload {
  id: string;
  title: string;
  partnerName?: string;
  category: PerkCategory;
  description: string;
  imageUrl?: string;
  offerText: string;
  redemptionType?: PerkRedemptionType;
  redemptionUrl?: string;
  couponCode?: string;
  /** Workflow Engine type identifier — required when redemptionType is "workflow". */
  workflowType?: string;
  accessLevel?: "free" | "paid" | "annual";
  isFeatured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  startsAt?: string;
  endsAt?: string | null;
  audienceTargeting?: AudienceTargeting;
  extensionDomains?: ExtensionDomainRule[];
}

export type UpdateAdminPerkPayload = Partial<{
  title: string;
  partnerName: string | null;
  category: PerkCategory;
  description: string;
  imageUrl: string | null;
  offerText: string;
  redemptionType: PerkRedemptionType;
  redemptionUrl: string | null;
  couponCode: string | null;
  workflowType: string | null;
  accessLevel: "free" | "paid" | "annual";
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  audienceTargeting: AudienceTargeting;
  extensionDomains: ExtensionDomainRule[] | null;
}>;

export interface AdminPerksMetrics {
  from: string;
  to: string;
  pageViews: number;
  clicks: number;
  claimEvents: number;
  redemptions: number;
  confirmedReceived?: number;
  notReceivedReports?: number;
  confirmationRate?: number | null;
  clickThroughRate: number | null;
  claimRate: number | null;
  snoozeRate: number | null;
  notInterestedRate: number | null;
  lifecycle?: {
    snoozedNow: number;
    notInterestedNow: number;
    completedTotal: number;
    notReceivedOpen?: number;
    expiringIn7Days: number;
    expiringIn30Days: number;
    expiredCatalog: number;
    snoozesInWindow: number;
    dismissalsInWindow: number;
  };
  byPerk: {
    perkId: string;
    title: string;
    viewed: number;
    clicked: number;
    claimed: number;
    redemptions: number;
    clickRate: number | null;
    claimRate: number | null;
  }[];
}

export async function adminFetchPerksMetrics(params?: {
  from?: string;
  to?: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; data?: AdminPerksMetrics; error?: string }> {
  try {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/metrics${suffix}`,
      { credentials: "include", signal: params?.signal },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load perk metrics"),
      };
    }
    const record = raw as { data?: AdminPerksMetrics };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListPerks(options?: {
  includeInactive?: boolean;
}): Promise<{ ok: boolean; data?: AdminPerk[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    params.set(
      "includeInactive",
      options?.includeInactive === false ? "false" : "true",
    );
    const query = params.toString();
    const response = await fetch(`${BACKEND_URL}/admin/perks?${query}`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load perks"),
      };
    }
    const record = raw as { data?: AdminPerk[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminCreatePerk(
  payload: CreateAdminPerkPayload,
): Promise<{
  ok: boolean;
  data?: AdminPerk;
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/perks`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        unauthorized: response.status === 401,
        error: extractBackendErrorMessage(raw, "Failed to create perk"),
      };
    }
    const record = raw as { data?: AdminPerk };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminUpdatePerk(
  id: string,
  payload: UpdateAdminPerkPayload,
): Promise<{
  ok: boolean;
  data?: AdminPerk;
  error?: string;
  unauthorized?: boolean;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        unauthorized: response.status === 401,
        error: extractBackendErrorMessage(raw, "Failed to update perk"),
      };
    }
    const record = raw as { data?: AdminPerk };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminDeletePerk(id: string): Promise<{
  ok: boolean;
  softDeleted?: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to delete perk"),
      };
    }
    const record = raw as {
      softDeleted?: boolean;
      message?: string;
    };
    return {
      ok: true,
      softDeleted: record.softDeleted,
      message: record.message,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListExpiredPerks(): Promise<{
  ok: boolean;
  data?: AdminPerk[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/perks/expired`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load expired perks"),
      };
    }
    const record = raw as { data?: AdminPerk[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListPerkRequests(options?: {
  sort?: "popular" | "newest" | "category" | "high_demand";
}): Promise<{
  ok: boolean;
  data?: AdminPerkRequestAggregate[];
  highDemandThreshold?: number;
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (options?.sort) params.set("sort", options.sort);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/requests${suffix}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load perk requests"),
      };
    }
    const record = raw as {
      data?: AdminPerkRequestAggregate[];
      highDemandThreshold?: number;
    };
    return {
      ok: true,
      data: record.data ?? [],
      highDemandThreshold: record.highDemandThreshold,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchPerkReactivations(
  perkId: string,
): Promise<{ ok: boolean; data?: AdminPerkReactivation[]; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/${encodeURIComponent(perkId)}/reactivations`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load reactivation history",
        ),
      };
    }
    const record = raw as { data?: AdminPerkReactivation[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchAllPerkReactivations(options?: {
  limit?: number;
}): Promise<{ ok: boolean; data?: AdminPerkReactivation[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/reactivations${suffix}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load reactivation history",
        ),
      };
    }
    const record = raw as { data?: AdminPerkReactivation[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminReactivatePerk(
  id: string,
  payload?: { startsAt?: string; endsAt?: string | null },
): Promise<{ ok: boolean; data?: AdminPerk; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/${encodeURIComponent(id)}/reactivate`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to reactivate perk"),
      };
    }
    const record = raw as { data?: AdminPerk };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminClonePerk(
  id: string,
  payload: { newId: string; startsAt?: string; endsAt?: string },
): Promise<{ ok: boolean; data?: AdminPerk; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/${encodeURIComponent(id)}/clone`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to clone perk"),
      };
    }
    const record = raw as { data?: AdminPerk };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export interface AdminNotReceivedPerkRow {
  id: string;
  perkId: string;
  userId: string;
  redeemedAt: string;
  notReceivedAt: string | null;
  redemptionSource: string | null;
  partnerName: string | null;
  perkTitle: string;
  perkCategory: string;
  offerText: string;
  userEmail: string;
  userDisplayName: string | null;
  adminResolvedAt: string | null;
  adminResolutionNote: string | null;
  adminResolvedBy: { id: string; email: string; name: string } | null;
}

export async function adminListNotReceivedPerks(options?: {
  includeResolved?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  ok: boolean;
  data?: AdminNotReceivedPerkRow[];
  hasMore?: boolean;
  error?: string;
}> {
  try {
    const params = new URLSearchParams();
    if (options?.includeResolved) params.set("includeResolved", "true");
    if (typeof options?.limit === "number") {
      params.set("limit", String(options.limit));
    }
    if (typeof options?.offset === "number") {
      params.set("offset", String(options.offset));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/not-received${suffix}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load not-received perks",
        ),
      };
    }
    const record = raw as {
      data?: AdminNotReceivedPerkRow[];
      pagination?: { hasMore?: boolean };
    };
    return {
      ok: true,
      data: record.data ?? [],
      hasMore: record.pagination?.hasMore === true,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminResolveNotReceivedPerk(
  redemptionId: string,
  payload: {
    resolution: "confirmed_received" | "dismissed" | "reopened";
    note?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/perks/redemptions/${encodeURIComponent(redemptionId)}/resolve`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to resolve report"),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminCreateUser(
  payload: CreateAdminUserPayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/users`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to create admin user"),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminUpdateOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/users/me/password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to update password"),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListTransferRequests(
  status?: string,
): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(
    `${BACKEND_URL}/admin/subscription/transfer-requests${q}`,
    {
      credentials: "include",
    },
  );
  const raw: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      success: false,
      error: extractBackendErrorMessage(raw, "Failed to list requests"),
    };
  }
  const record = raw as { data?: unknown[] };
  return { success: true, data: record.data };
}

export async function adminListMembershipSharing(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.search?.trim()) query.set("search", params.search.trim());
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/membership-sharing${suffix}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to list membership sharing",
        ),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list membership sharing",
    };
  }
}

export async function adminMembershipSharingMetrics(): Promise<{
  ok: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/membership-sharing/metrics`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load seat metrics"),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to load seat metrics",
    };
  }
}

export async function adminBusinessOnboarding(params?: {
  days?: number;
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const query = new URLSearchParams();
    // Nullish check: days: 0 must still be forwarded (backend clamps invalid windows).
    if (params?.days != null && Number.isFinite(params.days)) {
      query.set("days", String(params.days));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/membership-sharing/business-onboarding${suffix}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load Business onboarding",
        ),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load Business onboarding",
    };
  }
}

export async function adminRevokeMembershipMember(
  subscriptionId: string,
  memberUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/membership-sharing/${encodeURIComponent(subscriptionId)}/members/${encodeURIComponent(memberUserId)}/revoke`,
      { method: "POST", credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to revoke member"),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to revoke member",
    };
  }
}

export async function adminUpdateMembershipSeatLimit(
  subscriptionId: string,
  seatLimit: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/membership-sharing/${encodeURIComponent(subscriptionId)}/seat-limit`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatLimit }),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to update seat limit"),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update seat limit",
    };
  }
}

export interface ReceivedMembershipInvite {
  id: string;
  ownerEmail: string;
  ownerName?: string | null;
  planName?: string | null;
  invitedAt: string;
  expiresAt: string;
}

export interface MembershipInviteDetails {
  valid: boolean;
  inviteeEmail?: string;
  ownerEmail?: string;
  subscriptionStatus?: string;
  chargeOnAccept?: boolean;
  billingPending?: boolean;
  creditPending?: boolean;
  billingDeferredUntil?: string | null;
  requiresAppleCancellation?: boolean;
  prepaidAvailableSeats?: number | null;
  nextAcceptanceWillCharge?: boolean;
}

function isReceivedMembershipInvite(
  value: unknown,
): value is ReceivedMembershipInvite {
  if (!value || typeof value !== "object") return false;
  const invite = value as Record<string, unknown>;
  return (
    typeof invite.id === "string" &&
    typeof invite.ownerEmail === "string" &&
    (invite.ownerName === undefined ||
      invite.ownerName === null ||
      typeof invite.ownerName === "string") &&
    (invite.planName === undefined ||
      invite.planName === null ||
      typeof invite.planName === "string") &&
    typeof invite.invitedAt === "string" &&
    typeof invite.expiresAt === "string"
  );
}

export function isMembershipInviteDetails(
  value: unknown,
): value is MembershipInviteDetails {
  if (!value || typeof value !== "object") return false;
  const details = value as Record<string, unknown>;
  const optionalString = (field: unknown) =>
    field === undefined || typeof field === "string";
  const optionalBoolean = (field: unknown) =>
    field === undefined || typeof field === "boolean";
  return (
    typeof details.valid === "boolean" &&
    optionalString(details.inviteeEmail) &&
    optionalString(details.ownerEmail) &&
    optionalString(details.subscriptionStatus) &&
    optionalBoolean(details.chargeOnAccept) &&
    optionalBoolean(details.billingPending) &&
    optionalBoolean(details.creditPending) &&
    (details.billingDeferredUntil === undefined ||
      details.billingDeferredUntil === null ||
      typeof details.billingDeferredUntil === "string") &&
    optionalBoolean(details.requiresAppleCancellation) &&
    (details.prepaidAvailableSeats === undefined ||
      details.prepaidAvailableSeats === null ||
      typeof details.prepaidAvailableSeats === "number") &&
    optionalBoolean(details.nextAcceptanceWillCharge)
  );
}

export async function fetchReceivedMembershipInvites(
  sessionToken: string,
): Promise<{
  ok: boolean;
  status?: number;
  data?: ReceivedMembershipInvite[];
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/membership-sharing/received-invites`,
      {
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return {
        ok: false,
        status: response.status,
        error: "The invitation service returned an unreadable response.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractBackendErrorMessage(raw, "Failed to load invitations"),
      };
    }
    if (!Array.isArray(raw) || !raw.every(isReceivedMembershipInvite)) {
      return {
        ok: false,
        status: response.status,
        error: "The invitation service returned an unexpected response.",
      };
    }
    return { ok: true, status: response.status, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to load invitations",
    };
  }
}

export async function fetchReceivedMembershipInvite(
  sessionToken: string,
  inviteId: string,
): Promise<{
  ok: boolean;
  status?: number;
  data?: MembershipInviteDetails;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/membership-sharing/received-invites/${encodeURIComponent(inviteId)}`,
      {
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return {
        ok: false,
        status: response.status,
        error: "The invitation service returned an unreadable response.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractBackendErrorMessage(raw, "Failed to load invitation"),
      };
    }
    if (!isMembershipInviteDetails(raw)) {
      return {
        ok: false,
        status: response.status,
        error: "The invitation service returned an unexpected response.",
      };
    }
    return {
      ok: true,
      status: response.status,
      data: raw,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to load invitation",
    };
  }
}

interface MembershipInviteAcceptanceConfirmations {
  acceptsBusinessBilling: boolean;
  acknowledgesPrivacy: boolean;
}

interface MembershipInviteAcceptanceResult {
  ok: boolean;
  status?: number;
  pending?: boolean;
  billingDeferredUntil?: string | null;
  requiresAppleCancellation?: boolean;
  error?: string;
}

async function postMembershipInviteAcceptance(
  sessionToken: string,
  endpoint: string,
  body: object,
): Promise<MembershipInviteAcceptanceResult> {
  try {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      pending?: boolean;
      billingDeferredUntil?: string | null;
      requiresAppleCancellation?: boolean;
    };
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractBackendErrorMessage(raw, "Failed to accept invitation"),
      };
    }
    return {
      ok: true,
      status: response.status,
      pending: raw.pending === true,
      billingDeferredUntil: raw.billingDeferredUntil ?? null,
      requiresAppleCancellation: raw.requiresAppleCancellation === true,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to accept invitation",
    };
  }
}

export async function acceptMembershipInvite(
  sessionToken: string,
  token: string,
  confirmations: MembershipInviteAcceptanceConfirmations,
): Promise<MembershipInviteAcceptanceResult> {
  return postMembershipInviteAcceptance(
    sessionToken,
    "/membership-sharing/accept",
    { token, ...confirmations },
  );
}

export async function acceptReceivedMembershipInvite(
  sessionToken: string,
  inviteId: string,
  confirmations: MembershipInviteAcceptanceConfirmations,
): Promise<MembershipInviteAcceptanceResult> {
  return postMembershipInviteAcceptance(
    sessionToken,
    `/membership-sharing/received-invites/${encodeURIComponent(inviteId)}/accept`,
    confirmations,
  );
}

export async function fetchMembershipSharingDashboard(
  sessionToken: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/membership-sharing/dashboard`,
      {
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (response.status === 404) {
      return { ok: false, error: "Membership sharing is not enabled" };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load membership sharing",
        ),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load membership sharing",
    };
  }
}

export async function inviteMembershipMember(
  sessionToken: string,
  email: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/membership-sharing/invite`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to send invite"),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to send invite",
    };
  }
}

export async function revokeMembershipMember(
  sessionToken: string,
  memberUserId: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/membership-sharing/members/${encodeURIComponent(memberUserId)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to remove member"),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to remove member",
    };
  }
}

export async function resendMembershipInvite(
  sessionToken: string,
  inviteId: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/membership-sharing/invites/${encodeURIComponent(inviteId)}/resend`,
      {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to resend invite"),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to resend invite",
    };
  }
}

export async function revokeMembershipInvite(
  sessionToken: string,
  inviteId: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/membership-sharing/invites/${encodeURIComponent(inviteId)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to cancel invite"),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to cancel invite",
    };
  }
}

/** Invitee/member: cancel a pending Business transfer or leave an active shared membership. */
export async function leaveMembershipSharing(
  sessionToken: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/membership-sharing/me`, {
      method: "DELETE",
      credentials: "include",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to leave Business membership",
        ),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to leave Business membership",
    };
  }
}

/**
 * Buy/reduce seats on the caller's owned Business subscription (Slack/Devin-style seat
 * management). Stripe prorates the difference immediately; the returned `seatLimit` reflects
 * the new value right away, ahead of the webhook reconciliation.
 */
export async function updateMembershipSeatCount(
  sessionToken: string,
  quantity: number,
): Promise<{ ok: boolean; data?: { seatLimit: number }; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/membership-sharing/seats`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quantity }),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to update seat count"),
      };
    }
    return { ok: true, data: raw as { seatLimit: number } };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update seat count",
    };
  }
}

export async function adminFetchChurnReport(params: {
  month: number;
  year: number;
}): Promise<{ ok: boolean; data?: AdminChurnReport; error?: string }> {
  try {
    const query = new URLSearchParams();
    query.set("month", String(params.month));
    query.set("year", String(params.year));
    const response = await fetch(
      `${BACKEND_URL}/admin/churn/monthly?${query.toString()}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load churn report"),
      };
    }
    const record = raw as { data?: AdminChurnReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchJiraDeliveryReport(params: {
  month: number;
  year: number;
}): Promise<{ ok: boolean; data?: AdminJiraDeliveryReport; error?: string }> {
  try {
    const query = new URLSearchParams();
    query.set("month", String(params.month));
    query.set("year", String(params.year));
    const response = await fetch(
      `${BACKEND_URL}/admin/jira-delivery?${query.toString()}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load Jira delivery report",
        ),
      };
    }
    const record = raw as { data?: AdminJiraDeliveryReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchWeeklyChurnReport(params: {
  week: number;
  year: number;
  source?: AdminChurnSubscriptionSource;
}): Promise<{ ok: boolean; data?: AdminWeeklyChurnReport; error?: string }> {
  try {
    const query = new URLSearchParams();
    query.set("week", String(params.week));
    query.set("year", String(params.year));
    if (params.source && params.source !== "all") {
      query.set("source", params.source);
    }
    const response = await fetch(
      `${BACKEND_URL}/admin/churn/weekly?${query.toString()}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load weekly churn report",
        ),
      };
    }
    const record = raw as { data?: AdminWeeklyChurnReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchWeeklyChurnTrend(params: {
  from: string;
  to: string;
  source?: AdminChurnSubscriptionSource;
}): Promise<{
  ok: boolean;
  data?: AdminWeeklyChurnTrendReport;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    query.set("from", params.from);
    query.set("to", params.to);
    if (params.source && params.source !== "all") {
      query.set("source", params.source);
    }
    const response = await fetch(
      `${BACKEND_URL}/admin/churn/weekly/trend?${query.toString()}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load weekly churn trend",
        ),
      };
    }
    const record = raw as { data?: AdminWeeklyChurnTrendReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchChurnTrend(params: {
  from: string;
  to: string;
}): Promise<{ ok: boolean; data?: AdminChurnTrendReport; error?: string }> {
  try {
    const query = new URLSearchParams();
    query.set("from", params.from);
    query.set("to", params.to);
    const response = await fetch(
      `${BACKEND_URL}/admin/churn/trend?${query.toString()}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load churn trend"),
      };
    }
    const record = raw as { data?: AdminChurnTrendReport };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListSubscriptions(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
}): Promise<{
  ok: boolean;
  data?: AdminSubscriptionListResponse;
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    query.set("page", String(params?.page ?? 1));
    query.set("limit", String(params?.limit ?? 50));
    if (params?.search?.trim()) query.set("search", params.search.trim());
    if (params?.status?.trim()) query.set("status", params.status.trim());
    if (params?.type?.trim()) query.set("type", params.type.trim());
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/subscriptions?${query.toString()}`,
      {
        credentials: "include",
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load subscriptions"),
      };
    }
    const record = raw as { data?: Partial<AdminSubscriptionListResponse> };
    return {
      ok: true,
      data: {
        items: record.data?.items ?? [],
        page: record.data?.page ?? 1,
        limit: record.data?.limit ?? params?.limit ?? 50,
        total: record.data?.total ?? 0,
        totalPages: record.data?.totalPages ?? 1,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

/** Admin: re-apply Stripe `cancel_at_period_end` for a subscription row (legacy DB-only cancel fix). */
export async function adminRetriggerStripeCancelAtPeriodEnd(params: {
  subscriptionId: string;
}): Promise<{
  ok: boolean;
  data?: AdminRetriggerStripeCancelResponse;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/stripe/retrigger-cancel-at-period-end`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: params.subscriptionId }),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Request failed"),
      };
    }
    return { ok: true, data: raw as AdminRetriggerStripeCancelResponse };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchTransferProofBlob(
  requestId: string,
): Promise<{ ok: boolean; blob?: Blob; contentType?: string }> {
  const response = await fetch(
    `${BACKEND_URL}/admin/subscription/transfer-requests/${encodeURIComponent(requestId)}/proof`,
    { credentials: "include" },
  );
  if (!response.ok) return { ok: false };
  const blob = await response.blob();
  const contentType = response.headers.get("Content-Type") ?? undefined;
  return { ok: true, blob, contentType };
}

export type AdminTransferProofViewData =
  | { kind: "presigned"; viewUrl: string }
  | { kind: "public"; viewUrl: string }
  | { kind: "legacy_blob"; viewUrl: null; binaryPath: string };

export async function adminFetchTransferProofView(
  requestId: string,
): Promise<{ ok: boolean; data?: AdminTransferProofViewData; error?: string }> {
  const response = await fetch(
    `${BACKEND_URL}/admin/subscription/transfer-requests/${encodeURIComponent(requestId)}/proof-view`,
    { credentials: "include" },
  );
  const raw: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: extractBackendErrorMessage(raw, "Could not load proof view"),
    };
  }
  const record = raw as { data?: AdminTransferProofViewData };
  if (!record.data) {
    return { ok: false, error: "Invalid response" };
  }
  return { ok: true, data: record.data };
}

export async function adminApproveTransferRequest(
  requestId: string,
  body: { approvedCreditDays: number; adminNote?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/transfer-requests/${encodeURIComponent(requestId)}/approve`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(raw, "Approve failed"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function adminRejectTransferRequest(
  requestId: string,
  body: { adminNote: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/subscription/transfer-requests/${encodeURIComponent(requestId)}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: extractBackendErrorMessage(raw, "Reject failed"),
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

// ============================================================================
// Session Storage
// ============================================================================

const SESSION_TOKEN_KEY = "sessionToken";
const APP_TOKEN_KEY = "token";

export function storeSessionToken(sessionToken: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  // Also store for app deeplink (token is URL-encoded for safe query parsing)
  localStorage.setItem(APP_TOKEN_KEY, buildAuthDeepLink(sessionToken));
}

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(APP_TOKEN_KEY);
  localStorage.removeItem("google_access_token");
  clearBusinessInviteAutoAcceptedNotice();
}

/**
 * Delete user account
 */
export async function deleteAccount(
  sessionToken: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/delete-account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        extractBackendErrorMessage(data, "Failed to delete account"),
      );
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete account",
    };
  }
}

/**
 * Fetch subscription plans from backend
 */
export async function fetchSubscriptionPlans(): Promise<{
  success: boolean;
  plans?: ApiPlan[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/subscription/plans`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data: unknown = await response.json();

    if (!response.ok) {
      throw new Error(
        extractBackendErrorMessage(data, "Failed to fetch subscription plans"),
      );
    }

    const payload = data as { data?: { plans?: unknown } };
    const rawPlans = payload.data?.plans;
    const plans = Array.isArray(rawPlans) ? (rawPlans as ApiPlan[]) : [];

    return {
      success: true,
      plans,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch subscription plans",
    };
  }
}

/**
 * Fetch a single subscription plan by ID from backend
 */
export async function fetchSubscriptionPlanById(planId: string): Promise<{
  success: boolean;
  plan?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/subscription/plan/${planId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch subscription plan");
    }

    return {
      success: true,
      plan: data.data?.plan || null,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch subscription plan",
    };
  }
}

// ============================================================================
// Account Linking
// ============================================================================

export async function linkProvider(
  sessionToken: string,
  provider: "google" | "apple",
  firebaseIdToken: string,
): Promise<{
  success: boolean;
  linkedProviders: { google: boolean; apple: boolean };
}> {
  const response = await fetch(`${BACKEND_URL}/auth/link-provider`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ provider, firebaseIdToken }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      extractBackendErrorMessage(
        errorData,
        `Failed to link provider: ${response.status}`,
      ),
    );
  }
  return response.json();
}

export async function unlinkProvider(
  sessionToken: string,
  provider: "google" | "apple",
): Promise<{
  success: boolean;
  providers: {
    google: { linked: boolean; email?: string };
    apple: { linked: boolean; email?: string };
  };
}> {
  const response = await fetch(`${BACKEND_URL}/auth/unlink-provider`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ provider }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      extractBackendErrorMessage(
        errorData,
        `Failed to unlink provider: ${response.status}`,
      ),
    );
  }
  return response.json();
}

export type BroadcastEmailAudience =
  | "all_deliverable"
  | "opted_in"
  // Users with at least one long VPN session (KVPN-602). Referral sends target
  // this so we only ask people to recommend KeenVPN once it has worked for them.
  | "referral_eligible";

// Internal classification, used to read referral sends apart from the rest of
// the lifecycle programme in unsubscribe and weekly reporting (KVPN-602).
export type BroadcastEmailCategory =
  | "referrals"
  | "lifecycle"
  | "product"
  | "announcement";

/**
 * Named designed templates. `membership_transfer` uses the membership-transfer
 * layout; `chrome_extension` promotes the Chrome extension and always sends
 * to the Chrome Web Store listing regardless of any submitted ctaUrl.
 */
export type BroadcastEmailTemplate =
  | "membership_transfer"
  | "perk_announcement"
  | "chrome_extension";

export const MEMBERSHIP_TRANSFER_BROADCAST_TEMPLATE: BroadcastEmailTemplate =
  "membership_transfer";

export const PERK_ANNOUNCEMENT_BROADCAST_TEMPLATE: BroadcastEmailTemplate =
  "perk_announcement";

export const MEMBERSHIP_TRANSFER_PAGE_URL = "https://vpnkeen.com/transfer.html";

export const MEMBERSHIP_TRANSFER_BROADCAST_DEFAULTS = {
  subject: "Transfer your VPN membership to KeenVPN",
  headline: "You bring your current VPN membership.",
  preheader:
    "Switch without losing time. Bring your remaining VPN time to KeenVPN.",
  ctaLabel: "TRANSFER YOUR MEMBERSHIP",
  ctaUrl: MEMBERSHIP_TRANSFER_PAGE_URL,
  body: "Ready to switch VPNs? You don't have to lose the time you've already paid for. Transfer your eligible membership to KeenVPN and we'll apply the verified remaining time from your current VPN, so you can switch today without waiting for that subscription to expire.",
} as const;

export const CHROME_EXTENSION_BROADCAST_TEMPLATE: BroadcastEmailTemplate =
  "chrome_extension";

export const CHROME_EXTENSION_CWS_URL =
  "https://chromewebstore.google.com/detail/keenvpn-%E2%80%94-browser-protect/fdmiheabmohipekdgphijdboekojllfh?utm_source=email&utm_medium=email&utm_campaign=chrome_extension";

export const CHROME_EXTENSION_BROADCAST_DEFAULTS = {
  subject: "Take KeenVPN into your browser",
  headline: "Take KeenVPN into your browser",
  preheader:
    "A new Chrome extension: switch your browser location and catch Class Actions while you browse.",
  ctaLabel: "Download KeenVPN for Chrome",
  ctaUrl: CHROME_EXTENSION_CWS_URL,
  body: "Use a different VPN location in Chrome, discover relevant Class Actions while you browse, and get KeenVPN's newest browser features.",
} as const;

export interface AdminBroadcastComposePayload {
  audience?: BroadcastEmailAudience;
  category?: BroadcastEmailCategory;
  profileTargeting?: AudienceTargeting;
  emailCategory?: string;
  template?: BroadcastEmailTemplate;
  /** Required for perk_announcement template. Audience = everyone the perk is available to. */
  perkId?: string;
  /** Required for custom broadcasts. Optional when `template` is set. */
  subject?: string;
  headline?: string;
  body?: string;
  preheader?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Class-action perk announcements. An empty list means no logos. */
  companies?: { name: string; logoUrl?: string }[];
}

export interface AdminBroadcastAudienceSummary {
  audience: BroadcastEmailAudience;
  profileTargeting: AudienceTargeting;
  totalRecipients: number;
  /** Deliverable users *after* the recipient filter. */
  totalAudience: number;
  /**
   * Deliverable users *before* the recipient filter, and how many it removed.
   * `totalAudience` is counted after the gate, so on its own it always equals
   * `matchingRecipients` and cannot show a filter working (KVPN-602).
   * Optional: a backend older than that fix omits both.
   */
  deliverableBaseCount?: number;
  audienceFilteredOut?: number;
  matchingRecipients: number;
  matchPercentage: number;
  optedInCount: number;
}

/**
 * Recipient count for a broadcast, computed by the same query the send uses
 * (`AdminBroadcastEmailService.loadAudience`).
 *
 * Deliberately not `adminPreviewAudienceTargeting`: that endpoint keeps its own
 * second definition of the audience, which neither applied the referral-eligible
 * gate nor removed unsubscribed recipients (KVPN-602). Since `sendBroadcast`
 * rejects a `confirmRecipientCount` that does not match its own count exactly,
 * the number shown here has to come from the same place the send reads it.
 */
export async function adminFetchBroadcastAudience(
  audience: BroadcastEmailAudience = "all_deliverable",
  profileTargeting?: AudienceTargeting,
  emailCategory?: string,
  perkId?: string,
): Promise<{
  ok: boolean;
  data?: AdminBroadcastAudienceSummary;
  error?: string;
}> {
  try {
    const query = new URLSearchParams({ audience });
    if (profileTargeting) {
      query.set("profileTargeting", JSON.stringify(profileTargeting));
    }
    if (emailCategory) {
      query.set("emailCategory", emailCategory);
    }
    if (perkId) {
      query.set("perkId", perkId);
    }
    const response = await fetch(
      `${BACKEND_URL}/admin/broadcast-email/audience?${query.toString()}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load broadcast audience",
        ),
      };
    }
    const record = raw as { data?: AdminBroadcastAudienceSummary };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminExportBroadcastAudienceCsv(
  audience: BroadcastEmailAudience = "all_deliverable",
  profileTargeting?: AudienceTargeting,
  emailCategory?: string,
  perkId?: string,
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/broadcast-email/audience/export`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          ...(profileTargeting ? { profileTargeting } : {}),
          ...(emailCategory ? { emailCategory } : {}),
          ...(perkId ? { perkId } : {}),
        }),
      },
    );
    if (!response.ok) {
      const raw: unknown = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to export audience"),
      };
    }
    const blob = await response.blob();
    return { ok: true, blob };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminSendBroadcastPreview(
  payload: AdminBroadcastComposePayload,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/broadcast-email/preview`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to send preview"),
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export type BroadcastEmailJobStatus =
  "pending" | "processing" | "completed" | "failed";

export interface BroadcastEmailJobStatusPayload {
  jobId: string;
  status: BroadcastEmailJobStatus;
  audience: string;
  recipientCount: number;
  syncedContactCount: number;
  broadcastId: string | null;
  sendImmediately: boolean;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function adminSendBroadcastEmail(
  payload: AdminBroadcastComposePayload & {
    confirmRecipientCount: number;
    sendImmediately?: boolean;
  },
): Promise<{
  ok: boolean;
  data?: {
    jobId: string;
    status: BroadcastEmailJobStatus;
    recipientCount: number;
    sendImmediately: boolean;
  };
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/broadcast-email/send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to send broadcast"),
      };
    }
    const record = raw as {
      data?: {
        jobId: string;
        status: BroadcastEmailJobStatus;
        recipientCount: number;
        sendImmediately: boolean;
      };
    };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminFetchBroadcastEmailJob(jobId: string): Promise<{
  ok: boolean;
  data?: BroadcastEmailJobStatusPayload;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/broadcast-email/jobs/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        credentials: "include",
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load broadcast job"),
      };
    }
    const record = raw as { data?: BroadcastEmailJobStatusPayload };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function getLinkedProviders(sessionToken: string): Promise<{
  success: boolean;
  providers: {
    google: { linked: boolean; email?: string };
    apple: { linked: boolean; email?: string };
  };
}> {
  const response = await fetch(`${BACKEND_URL}/user/linked-providers`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      extractBackendErrorMessage(
        errorData,
        `Failed to get linked providers: ${response.status}`,
      ),
    );
  }
  return response.json();
}

export interface VpnConnectionStatusData {
  connected: boolean;
  source: "app_session" | "network_exit" | null;
  serverLocation: string | null;
  protocol: string | null;
  encryption: "AES-256";
  vpnIpMasked: string | null;
  protections: {
    killSwitch: boolean;
    dnsProtection: boolean;
    trackerBlocking: boolean;
  };
  activeSession: {
    platform: string;
    lastHeartbeatAt: string;
  } | null;
}

export async function fetchVpnConnectionStatus(
  sessionToken: string,
): Promise<{ ok: boolean; data?: VpnConnectionStatusData; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/connection/vpn-status`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load VPN connection status",
        ),
      };
    }
    const payload = raw as { data?: VpnConnectionStatusData };
    if (!payload.data) {
      return { ok: false, error: "Failed to load VPN connection status" };
    }
    return { ok: true, data: payload.data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load VPN connection status",
    };
  }
}

export async function fetchDeviceConnectionsStatus(
  sessionToken: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/device-connections/status`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (response.status === 404) {
      return { ok: false, error: "Device connection limits are not enabled" };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load connected devices",
        ),
      };
    }
    return { ok: true, data: raw };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load connected devices",
    };
  }
}

export async function revokeDeviceConnection(
  sessionToken: string,
  deviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/device-connections/revoke`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deviceId }),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to remove device"),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to remove device",
    };
  }
}

export async function restoreDeviceConnection(
  sessionToken: string,
  deviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/device-connections/restore`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deviceId }),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to restore device"),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to restore device",
    };
  }
}

// ---------------------------------------------------------------------
// AI Workflow Engine (VIG execution) — Phase 2 UI client
// ---------------------------------------------------------------------

export type WorkflowState =
  | "CREATED"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_VAULT_CONSENT"
  | "READY_TO_EXECUTE"
  | "EXECUTING"
  | "WAITING_FOR_APPROVAL"
  | "WAITING_FOR_PARTNER_ACTION"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkflowStepStatus =
  | "PENDING"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_APPROVAL"
  | "APPROVED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export interface WorkflowSummary {
  id: string;
  workflowType: string;
  partnerName: string | null;
  state: WorkflowState;
  completionPercent: number;
  currentStepKey: string | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
}

/** Mirrors backend WorkflowQuestionDefinition (workflow-question.types.ts) — richer
 * than ProfileQuestion so clients can render email/text/multi-select fields with
 * conditional visibility instead of hardcoding per-workflow UI. */
export type WorkflowQuestionFieldType =
  "email" | "text" | "single_select" | "multi_select";

export interface WorkflowQuestionOption {
  value: string;
  label: string;
}

export interface WorkflowQuestionShowWhen {
  questionKey: string;
  values: string[];
}

export interface WorkflowQuestionDefinition {
  key: string;
  label: string;
  type: WorkflowQuestionFieldType;
  helpText?: string;
  options?: WorkflowQuestionOption[];
  allowOther?: boolean;
  showWhen?: WorkflowQuestionShowWhen;
}

export interface WorkflowDetail extends WorkflowSummary {
  missingInputKeys: string[];
  /** Full question metadata for every input this workflow type collects. Omitted for
   * profile-backed workflow types, which fall back to the global ProfileQuestion catalog. */
  inputQuestions?: WorkflowQuestionDefinition[];
}

export interface WorkflowStepRunData {
  stepKey: string;
  sequence: number;
  status: WorkflowStepStatus;
  requiresApproval: boolean;
  attempts: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowDetailResult {
  workflow: WorkflowDetail;
  steps: WorkflowStepRunData[];
}

export type WorkflowExecutionHandoffStatus =
  "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface WorkflowExecutionHandoff {
  id: string;
  workflowId: string;
  userId: string;
  partnerName: string;
  action: string;
  status: WorkflowExecutionHandoffStatus;
  metadata: Record<string, unknown> | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWorkflowSummary extends WorkflowSummary {
  user: { id: string; email: string; displayName?: string | null };
  executionHandoffCount?: number;
  pendingExecutionHandoffCount?: number;
}

export interface AdminWorkflowDetailResult extends WorkflowDetailResult {
  success: boolean;
  user: { id: string; email: string; displayName?: string | null };
  events: {
    id: string;
    workflowId: string;
    eventType: string;
    fromState: WorkflowState | null;
    toState: WorkflowState | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }[];
  executionHandoffs: WorkflowExecutionHandoff[];
}

interface WorkflowApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function workflowRequest<T>(
  sessionToken: string,
  path: string,
  init: RequestInit,
  fallbackError: string,
): Promise<WorkflowApiResult<T>> {
  try {
    const response = await fetch(`${BACKEND_URL}/workflows${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Only the base "/workflows" list endpoint is used to detect whether the
      // feature is enabled at all; every other 404 (e.g. a specific workflow id)
      // means "not found", not "feature disabled" — regardless of message wording.
      if (
        response.status === 404 &&
        path === "" &&
        (init.method ?? "GET").toUpperCase() === "GET"
      ) {
        return { ok: false, error: "Workflow engine is not available" };
      }
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, fallbackError),
      };
    }
    return { ok: true, data: raw as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    };
  }
}

export async function listWorkflows(
  sessionToken: string,
): Promise<
  WorkflowApiResult<{ success: boolean; workflows: WorkflowSummary[] }>
> {
  return workflowRequest(
    sessionToken,
    "",
    { method: "GET" },
    "Failed to load workflows",
  );
}

export async function createWorkflow(
  sessionToken: string,
  workflowType: string,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    "",
    { method: "POST", body: JSON.stringify({ workflowType }) },
    "Failed to start workflow",
  );
}

export async function getWorkflow(
  sessionToken: string,
  workflowId: string,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}`,
    { method: "GET" },
    "Failed to load workflow",
  );
}

export async function submitWorkflowInputs(
  sessionToken: string,
  workflowId: string,
  answers: Record<string, string>,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}/inputs`,
    { method: "POST", body: JSON.stringify({ answers }) },
    "Failed to submit information",
  );
}

export async function approveWorkflowStep(
  sessionToken: string,
  workflowId: string,
  stepKey: string,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}/approve`,
    { method: "POST", body: JSON.stringify({ stepKey }) },
    "Failed to approve step",
  );
}

export async function cancelWorkflow(
  sessionToken: string,
  workflowId: string,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}/cancel`,
    { method: "POST" },
    "Failed to cancel workflow",
  );
}

export interface VaultAccessRequestField {
  fieldKey: string;
  label: string;
}

export interface VaultAccessRequestInfo {
  id: string;
  workflowId: string;
  status: string;
  requestedFieldKeys: string[];
  fields: VaultAccessRequestField[];
  expiresAt: string | null;
  createdAt: string;
}

export async function getWorkflowVaultAccess(
  sessionToken: string,
  workflowId: string,
): Promise<
  WorkflowApiResult<{ success: boolean; request: VaultAccessRequestInfo }>
> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}/vault-access`,
    { method: "GET" },
    "Failed to load vault access request",
  );
}

export async function approveWorkflowVaultAccess(
  sessionToken: string,
  workflowId: string,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}/vault-access/approve`,
    { method: "POST" },
    "Failed to approve vault access",
  );
}

export async function denyWorkflowVaultAccess(
  sessionToken: string,
  workflowId: string,
): Promise<WorkflowApiResult<{ success: boolean } & WorkflowDetailResult>> {
  return workflowRequest(
    sessionToken,
    `/${workflowId}/vault-access/deny`,
    { method: "POST" },
    "Failed to deny vault access",
  );
}

// ---------------------------------------------------------------------
// Secure User Vault
// ---------------------------------------------------------------------

export type {
  VaultFieldCategory,
  VaultFieldInputType,
} from "@/lib/vault-fields";

export interface VaultFieldMetadata {
  fieldKey: string;
  category: VaultFieldCategory;
  label: string;
  inputType: VaultFieldInputType;
  isStored: boolean;
  verificationStatus: string;
  lastUpdatedAt: string | null;
  confirmedAt: string | null;
  maskedPreview: string | null;
}

export interface VaultOverviewSection {
  category: VaultFieldCategory;
  fields: VaultFieldMetadata[];
}

interface VaultApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

async function vaultRequest<T>(
  sessionToken: string,
  path: string,
  init: RequestInit,
  fallbackError: string,
): Promise<VaultApiResult<T>> {
  try {
    const response = await fetch(`${BACKEND_URL}/user/vault${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 && path === "") {
        return {
          ok: false,
          status: 404,
          error: "Secure vault is not available",
        };
      }
      return {
        ok: false,
        status: response.status,
        error: extractBackendErrorMessage(raw, fallbackError),
      };
    }
    return { ok: true, status: response.status, data: raw as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    };
  }
}

export async function getVaultOverview(sessionToken: string) {
  return vaultRequest<{
    success: boolean;
    sections: VaultOverviewSection[];
    fields: VaultFieldMetadata[];
  }>(sessionToken, "", { method: "GET" }, "Failed to load secure vault");
}

export async function getVaultFieldValue(
  sessionToken: string,
  fieldKey: string,
) {
  return vaultRequest<{
    success: boolean;
    field: { fieldKey: string; value: string };
  }>(
    sessionToken,
    `/fields/${encodeURIComponent(fieldKey)}`,
    { method: "GET" },
    "Failed to load vault field",
  );
}

export async function upsertVaultField(
  sessionToken: string,
  fieldKey: string,
  value: string,
  confirmAccurate = false,
) {
  return vaultRequest<{ success: boolean; fieldKey: string }>(
    sessionToken,
    `/fields/${encodeURIComponent(fieldKey)}`,
    {
      method: "PUT",
      body: JSON.stringify({ value, confirmAccurate }),
    },
    "Failed to save vault field",
  );
}

export async function deleteVaultField(sessionToken: string, fieldKey: string) {
  return vaultRequest<{ success: boolean; fieldKey: string }>(
    sessionToken,
    `/fields/${encodeURIComponent(fieldKey)}`,
    { method: "DELETE" },
    "Failed to delete vault field",
  );
}

export async function adminListWorkflows(params: {
  page?: number;
  limit?: number;
  state?: WorkflowState | "";
  workflowType?: string;
}): Promise<
  WorkflowApiResult<{
    success: boolean;
    total: number;
    page: number;
    limit: number;
    workflows: AdminWorkflowSummary[];
  }>
> {
  try {
    const query = new URLSearchParams();
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 50));
    if (params.state) query.set("state", params.state);
    if (params.workflowType?.trim()) {
      query.set("workflowType", params.workflowType.trim());
    }
    const response = await fetch(`${BACKEND_URL}/admin/workflows?${query}`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load workflows"),
      };
    }
    return {
      ok: true,
      data: raw as {
        success: boolean;
        total: number;
        page: number;
        limit: number;
        workflows: AdminWorkflowSummary[];
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to load workflows",
    };
  }
}

export async function adminGetWorkflow(
  workflowId: string,
): Promise<WorkflowApiResult<AdminWorkflowDetailResult>> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/workflows/${encodeURIComponent(workflowId)}`,
      {
        credentials: "include",
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load workflow"),
      };
    }
    return { ok: true, data: raw as AdminWorkflowDetailResult };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load workflow",
    };
  }
}

export async function adminUpdateWorkflowHandoffStatus(
  handoffId: string,
  status: WorkflowExecutionHandoffStatus,
  note?: string,
): Promise<
  WorkflowApiResult<{ success: boolean; handoff: WorkflowExecutionHandoff }>
> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/workflows/handoffs/${encodeURIComponent(handoffId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to update handoff"),
      };
    }
    return {
      ok: true,
      data: raw as { success: boolean; handoff: WorkflowExecutionHandoff },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to update handoff",
    };
  }
}

export type AdminWorkflowTypeSource = "code" | "admin";

export interface AdminWorkflowTypeOption {
  source: AdminWorkflowTypeSource;
  id: string | null;
  type: string;
  partnerName: string;
  description: string | null;
  requiredFieldKeys: string[];
  requiresFinalApproval: boolean;
  isActive: boolean;
  selectable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminVaultFieldOption {
  key: string;
  label: string;
  category: string;
  inputType: string;
}

export async function adminListWorkflowTypes(): Promise<
  WorkflowApiResult<{
    success: boolean;
    types: AdminWorkflowTypeOption[];
    vaultFields: AdminVaultFieldOption[];
  }>
> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/workflows/types`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load workflow types"),
      };
    }
    return {
      ok: true,
      data: raw as {
        success: boolean;
        types: AdminWorkflowTypeOption[];
        vaultFields: AdminVaultFieldOption[];
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load workflow types",
    };
  }
}

export async function adminCreateWorkflowType(body: {
  typeSlug: string;
  partnerName: string;
  description?: string;
  requiredFieldKeys: string[];
  requiresFinalApproval?: boolean;
}): Promise<
  WorkflowApiResult<{
    success: boolean;
    type: AdminWorkflowTypeOption;
  }>
> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/workflows/types`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to create workflow type",
        ),
      };
    }
    return {
      ok: true,
      data: raw as { success: boolean; type: AdminWorkflowTypeOption },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create workflow type",
    };
  }
}

export async function adminUpdateWorkflowType(
  id: string,
  body: {
    partnerName?: string;
    description?: string | null;
    requiredFieldKeys?: string[];
    requiresFinalApproval?: boolean;
    isActive?: boolean;
  },
): Promise<
  WorkflowApiResult<{
    success: boolean;
    type: AdminWorkflowTypeOption;
  }>
> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/workflows/types/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to update workflow type",
        ),
      };
    }
    return {
      ok: true,
      data: raw as { success: boolean; type: AdminWorkflowTypeOption },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update workflow type",
    };
  }
}

// ---------------------------------------------------------------------
// AI Orchestrator (Claude) — conversational client on top of the Workflow Engine
// ---------------------------------------------------------------------

export type AiConversationStatus = "ACTIVE" | "CLOSED";
export type AiMessageRole = "USER" | "ASSISTANT" | "TOOL";

export interface AiConversationSummary {
  id: string;
  title: string | null;
  status: AiConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageData {
  id: string;
  role: AiMessageRole;
  content: string | null;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  toolResult: unknown;
  isError: boolean;
  createdAt: string;
}

export interface AiPendingApproval {
  workflowId: string;
  stepKey: string | null;
}

interface AiApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function aiRequest<T>(
  sessionToken: string,
  path: string,
  init: RequestInit,
  fallbackError: string,
): Promise<AiApiResult<T>> {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/conversations${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Only the base "/ai/conversations" list endpoint is used to detect
      // whether the feature is enabled at all — mirrors workflowRequest's
      // approach for the Workflow Engine's own feature flag.
      if (response.status === 404 && path === "") {
        return { ok: false, error: "AI assistant is not available" };
      }
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, fallbackError),
      };
    }
    return { ok: true, data: raw as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    };
  }
}

export async function listAiConversations(
  sessionToken: string,
): Promise<
  AiApiResult<{ success: boolean; conversations: AiConversationSummary[] }>
> {
  return aiRequest(
    sessionToken,
    "",
    { method: "GET" },
    "Failed to load conversations",
  );
}

export async function createAiConversation(
  sessionToken: string,
  title?: string,
): Promise<AiApiResult<{ success: boolean; conversationId: string }>> {
  return aiRequest(
    sessionToken,
    "",
    { method: "POST", body: JSON.stringify(title ? { title } : {}) },
    "Failed to start a new conversation",
  );
}

export async function getAiConversation(
  sessionToken: string,
  conversationId: string,
): Promise<
  AiApiResult<{
    success: boolean;
    conversation: AiConversationSummary;
    messages: AiMessageData[];
  }>
> {
  return aiRequest(
    sessionToken,
    `/${conversationId}`,
    { method: "GET" },
    "Failed to load conversation",
  );
}

export async function sendAiMessage(
  sessionToken: string,
  conversationId: string,
  message: string,
): Promise<
  AiApiResult<{
    success: boolean;
    reply: string;
    pendingApproval?: AiPendingApproval;
  }>
> {
  return aiRequest(
    sessionToken,
    `/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify({ message }) },
    "Failed to send message",
  );
}

export async function closeAiConversation(
  sessionToken: string,
  conversationId: string,
): Promise<
  AiApiResult<{ success: boolean; conversation: AiConversationSummary }>
> {
  return aiRequest(
    sessionToken,
    `/${conversationId}/close`,
    { method: "POST" },
    "Failed to close conversation",
  );
}

// --- Friends Network ---

interface FriendsApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function friendsRequest<T>(
  sessionToken: string,
  path: string,
  init: RequestInit = {},
  fallbackError: string,
  options?: { featureDisabledOn404?: boolean },
): Promise<FriendsApiResult<T>> {
  try {
    const response = await fetch(`${BACKEND_URL}/friends${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (options?.featureDisabledOn404 && response.status === 404) {
      return { ok: false, error: "Friends network is not enabled" };
    }
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, fallbackError),
      };
    }
    return { ok: true, data: raw as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    };
  }
}

export async function fetchFriendsDashboard(
  sessionToken: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/dashboard",
    { method: "GET" },
    "Failed to load friends",
    { featureDisabledOn404: true },
  );
}

export async function inviteFriendByEmail(
  sessionToken: string,
  email: string,
): Promise<FriendsApiResult> {
  return inviteFriend(sessionToken, { email });
}

export async function inviteFriendByUsername(
  sessionToken: string,
  username: string,
): Promise<FriendsApiResult> {
  return inviteFriend(sessionToken, { username });
}

export async function inviteFriend(
  sessionToken: string,
  params: { email?: string; username?: string; targetUserId?: string },
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/invite",
    { method: "POST", body: JSON.stringify(params) },
    "Failed to send invitation",
  );
}

export async function setFriendUsername(
  sessionToken: string,
  username: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/username",
    { method: "PATCH", body: JSON.stringify({ username }) },
    "Failed to set username",
  );
}

export async function acceptFriendInvitation(
  sessionToken: string,
  params: { relationshipId?: string; token?: string },
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/accept",
    { method: "POST", body: JSON.stringify(params) },
    "Failed to accept invitation",
  );
}

export async function declineFriendInvitation(
  sessionToken: string,
  relationshipId: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/decline",
    { method: "POST", body: JSON.stringify({ relationshipId }) },
    "Failed to decline invitation",
  );
}

export async function blockFriendUser(
  sessionToken: string,
  params: { relationshipId?: string; targetUserId?: string },
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/block",
    { method: "POST", body: JSON.stringify(params) },
    "Failed to block user",
  );
}

export async function removeFriend(
  sessionToken: string,
  friendUserId: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    `/${encodeURIComponent(friendUserId)}`,
    { method: "DELETE" },
    "Failed to remove friend",
  );
}

export async function reportFriendUser(
  sessionToken: string,
  targetUserId: string,
  reason?: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/report",
    { method: "POST", body: JSON.stringify({ targetUserId, reason }) },
    "Failed to submit report",
  );
}

export async function joinFriendNetworkViaLink(
  sessionToken: string,
  token: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/join",
    { method: "POST", body: JSON.stringify({ token }) },
    "Failed to join network",
  );
}

export async function fetchFriendsNotifications(
  sessionToken: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/notifications",
    { method: "GET" },
    "Failed to load notifications",
    { featureDisabledOn404: true },
  );
}

export async function markFriendsNotificationsRead(
  sessionToken: string,
  notificationIds?: string[],
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    "/notifications/read",
    { method: "POST", body: JSON.stringify({ notificationIds }) },
    "Failed to mark notifications read",
  );
}

export type DiscoverySharingMode = "auto" | "review" | "never";

export type DiscoveryFeedFilter =
  "new" | "saved" | "dismissed" | "shared" | "pending";

export type FriendShareAction = "view" | "save" | "dismiss" | "claim";

export interface FriendDiscoveryShare {
  id: string;
  status: string;
  message: string | null;
  sharedAt: string;
  viewedAt: string | null;
  savedAt: string | null;
  dismissedAt: string | null;
  claimedAt: string | null;
  sharer: { userId: string; displayName: string | null };
  recommendation: {
    id: string;
    opportunityType: string;
    partnerName: string | null;
    perkId: string | null;
    title: string;
    valueLabel: string | null;
    description: string | null;
    ctaPath: string | null;
    expiresAt: string | null;
    source: string;
  };
}

export interface FriendDiscoveryDraft {
  id: string;
  perkId: string;
  friendUserIds: string[];
  message: string | null;
  trigger: string;
  createdAt: string;
  perk: {
    title: string;
    partnerName: string | null;
    valueLabel: string;
    expiresAt: string | null;
  };
}

export async function fetchFriendDiscoveries(
  sessionToken: string,
  filter: DiscoveryFeedFilter = "new",
): Promise<
  FriendsApiResult<{
    filter: DiscoveryFeedFilter;
    counts: { new: number; saved: number; pending?: number };
    items: FriendDiscoveryShare[] | FriendDiscoveryDraft[];
  }>
> {
  return friendsRequest(
    sessionToken,
    `/discoveries?filter=${encodeURIComponent(filter)}`,
    { method: "GET" },
    "Failed to load discoveries",
    { featureDisabledOn404: true },
  );
}

export async function fetchDiscoveryPreferences(
  sessionToken: string,
): Promise<FriendsApiResult<{ sharingMode: DiscoverySharingMode }>> {
  return friendsRequest(
    sessionToken,
    "/discoveries/preferences",
    { method: "GET" },
    "Failed to load discovery preferences",
    { featureDisabledOn404: true },
  );
}

export async function updateDiscoveryPreferences(
  sessionToken: string,
  sharingMode: DiscoverySharingMode,
): Promise<
  FriendsApiResult<{ success: boolean; sharingMode: DiscoverySharingMode }>
> {
  return friendsRequest(
    sessionToken,
    "/discoveries/preferences",
    { method: "PATCH", body: JSON.stringify({ sharingMode }) },
    "Failed to update discovery preferences",
  );
}

export async function sharePerkWithFriends(
  sessionToken: string,
  params: {
    perkId: string;
    friendUserIds?: string[];
    message?: string;
  },
): Promise<
  FriendsApiResult<{
    success: boolean;
    recommendationId: string;
    deliveredShareIds: string[];
    skipped: { friendUserId: string; reason: string }[];
  }>
> {
  return friendsRequest(
    sessionToken,
    "/discoveries/share",
    { method: "POST", body: JSON.stringify(params) },
    "Failed to share opportunity",
  );
}

export async function updateFriendDiscoveryShare(
  sessionToken: string,
  shareId: string,
  action: FriendShareAction,
): Promise<
  FriendsApiResult<{
    success: boolean;
    share: FriendDiscoveryShare;
    claimCtaPath?: string | null;
  }>
> {
  return friendsRequest(
    sessionToken,
    `/discoveries/shares/${encodeURIComponent(shareId)}`,
    { method: "PATCH", body: JSON.stringify({ action }) },
    "Failed to update share",
  );
}

export async function approveFriendDiscoveryDraft(
  sessionToken: string,
  draftId: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    `/discoveries/drafts/${encodeURIComponent(draftId)}/approve`,
    { method: "POST" },
    "Failed to approve share",
  );
}

export async function dismissFriendDiscoveryDraft(
  sessionToken: string,
  draftId: string,
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    `/discoveries/drafts/${encodeURIComponent(draftId)}/dismiss`,
    { method: "POST" },
    "Failed to dismiss draft",
  );
}

export async function updateFriendSharingPreferences(
  sessionToken: string,
  friendUserId: string,
  preferences: {
    shareRecommendations?: boolean;
    shareReferrals?: boolean;
    shareAiInsights?: boolean;
  },
): Promise<FriendsApiResult> {
  return friendsRequest(
    sessionToken,
    `/${encodeURIComponent(friendUserId)}/sharing`,
    { method: "PATCH", body: JSON.stringify(preferences) },
    "Failed to update sharing preferences",
  );
}

/* ---------------------------------------------------------------------------
 * Hot Links — partner referral database (KVPN-538)
 * ------------------------------------------------------------------------ */

export interface AdminHotLinkDomain {
  host: string;
  pathPrefix: string | null;
}

export interface AdminHotLink {
  id: string;
  partnerName: string;
  category: string;
  websiteUrl: string;
  referralUrl: string;
  referralCode: string | null;
  promotionalValue: string | null;
  description: string | null;
  isActive: boolean;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  domains: AdminHotLinkDomain[];
}

export interface CreateHotLinkPayload {
  partnerName: string;
  category: string;
  websiteUrl: string;
  referralUrl: string;
  referralCode?: string;
  promotionalValue?: string;
  description?: string;
  priority?: number;
  notes?: string;
  domains: string[];
}

/** Domains the API refused, with the reason, so the UI can show them per row. */
export interface HotLinkDomainRejection {
  host: string;
  reason: string;
}

export async function adminListHotLinks(options?: {
  category?: string;
  search?: string;
}): Promise<{ ok: boolean; data?: AdminHotLink[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (options?.category) params.set("category", options.category);
    if (options?.search) params.set("search", options.search);
    const query = params.toString();
    const response = await fetch(
      `${BACKEND_URL}/admin/hot-links${query ? `?${query}` : ""}`,
      { credentials: "include" },
    );
    const raw = (await response.json().catch(() => ({}))) as {
      links?: AdminHotLink[];
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Failed to load hot links" };
    }
    return { ok: true, data: raw.links ?? [] };
  } catch {
    return { ok: false, error: "Network error loading hot links" };
  }
}

export async function adminCreateHotLink(payload: CreateHotLinkPayload): Promise<{
  ok: boolean;
  data?: AdminHotLink;
  rejectedDomains?: HotLinkDomainRejection[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/hot-links`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      link?: AdminHotLink;
      rejectedDomains?: HotLinkDomainRejection[];
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Failed to create hot link" };
    }
    // A create can succeed at the HTTP level and still create nothing when every
    // domain was rejected, so surface the rejections rather than a bare success.
    return {
      ok: Boolean(raw.link),
      data: raw.link,
      rejectedDomains: raw.rejectedDomains ?? [],
      error: raw.link ? undefined : "No domain was accepted",
    };
  } catch {
    return { ok: false, error: "Network error creating hot link" };
  }
}

export async function adminSetHotLinkActive(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/hot-links/${id}/active`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!response.ok) {
      const raw = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return { ok: false, error: raw.message ?? "Failed to update hot link" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error updating hot link" };
  }
}

export async function adminDeleteHotLink(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/hot-links/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const raw = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return { ok: false, error: raw.message ?? "Failed to delete hot link" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error deleting hot link" };
  }
}

export interface HotLinkImportResult {
  created: number;
  rowErrors: { lineNumber: number; reason: string }[];
  domainRejections: { lineNumber: number; host: string; reason: string }[];
}

/** `dryRun` writes nothing and reports every problem — always preview first. */
export async function adminImportHotLinksCsv(
  csv: string,
  dryRun: boolean,
): Promise<{ ok: boolean; data?: HotLinkImportResult; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/hot-links/import`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun }),
    });
    const raw = (await response.json().catch(() => ({}))) as
      HotLinkImportResult & { message?: string };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Import failed" };
    }
    return {
      ok: true,
      data: {
        created: raw.created ?? 0,
        rowErrors: raw.rowErrors ?? [],
        domainRejections: raw.domainRejections ?? [],
      },
    };
  } catch {
    return { ok: false, error: "Network error importing hot links" };
  }
}

export async function adminExportHotLinksCsv(): Promise<{
  ok: boolean;
  csv?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/hot-links/export`, {
      credentials: "include",
    });
    const raw = (await response.json().catch(() => ({}))) as {
      csv?: string;
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Export failed" };
    }
    return { ok: true, csv: raw.csv ?? "" };
  } catch {
    return { ok: false, error: "Network error exporting hot links" };
  }
}

/* ---------------------------------------------------------------------------
 * Affiliate links — pre-signup, bound to an email (KVPN-559)
 * ------------------------------------------------------------------------ */

export interface AdminAffiliateLink {
  id: string;
  email: string;
  displayName: string | null;
  campaignId: string | null;
  rewardMonths: number;
  isActive: boolean;
  expiresAt: string | null;
  claimed: boolean;
  claimedAt: string | null;
  notes: string | null;
}

export interface CreateAffiliateLinkPayload {
  email: string;
  displayName?: string;
  campaignId?: string;
  rewardMonths?: number;
  expiresAt?: string;
  notes?: string;
}

export async function adminListAffiliateLinks(
  email?: string,
): Promise<{ ok: boolean; data?: AdminAffiliateLink[]; error?: string }> {
  try {
    const query = email ? `?email=${encodeURIComponent(email)}` : "";
    const response = await fetch(`${BACKEND_URL}/admin/affiliate-links${query}`, {
      credentials: "include",
    });
    const raw = (await response.json().catch(() => ({}))) as {
      links?: AdminAffiliateLink[];
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to load affiliate links",
      };
    }
    return { ok: true, data: raw.links ?? [] };
  } catch {
    return { ok: false, error: "Network error loading affiliate links" };
  }
}

/**
 * Creates a link. The shareable URL comes back exactly once and is never
 * recoverable — only its hash is stored — so the caller must show it to the
 * admin immediately.
 */
export async function adminCreateAffiliateLink(
  payload: CreateAffiliateLinkPayload,
): Promise<{
  ok: boolean;
  data?: AdminAffiliateLink & { url?: string };
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/affiliate-links`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      link?: AdminAffiliateLink & { url?: string };
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to create affiliate link",
      };
    }
    return { ok: true, data: raw.link };
  } catch {
    return { ok: false, error: "Network error creating affiliate link" };
  }
}

export async function adminUpdateAffiliateLink(
  id: string,
  patch: { isActive?: boolean; expiresAt?: string; notes?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/affiliate-links/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const raw = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false,
        error: raw.message ?? "Failed to update affiliate link",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error updating affiliate link" };
  }
}

export interface UpdateHotLinkPayload {
  partnerName?: string;
  category?: string;
  websiteUrl?: string;
  referralUrl?: string;
  referralCode?: string;
  promotionalValue?: string;
  description?: string;
  priority?: number;
  notes?: string;
  /** Replaces the whole domain set. Omit to leave domains unchanged. */
  domains?: string[];
}

export async function adminUpdateHotLink(
  id: string,
  payload: UpdateHotLinkPayload,
): Promise<{
  ok: boolean;
  data?: AdminHotLink;
  rejectedDomains?: HotLinkDomainRejection[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/hot-links/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      link?: AdminHotLink;
      rejectedDomains?: HotLinkDomainRejection[];
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Failed to update hot link" };
    }
    // An edit whose every domain was rejected returns 200 with link:null, so
    // the rejections are the answer rather than an error string.
    return {
      ok: Boolean(raw.link),
      data: raw.link,
      rejectedDomains: raw.rejectedDomains ?? [],
      error: raw.link ? undefined : "No domain was accepted",
    };
  } catch {
    return { ok: false, error: "Network error updating hot link" };
  }
}

/**
 * Dry-run a domain list before saving — the ticket's "preview matching
 * domains". Pass `hotLinkId` when editing so the partner's own domains are not
 * reported as conflicts with itself.
 */
export async function adminValidateHotLinkDomains(
  domains: string[],
  hotLinkId?: string,
): Promise<{
  ok: boolean;
  accepted?: string[];
  rejected?: HotLinkDomainRejection[];
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/hot-links/validate-domains`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains, hotLinkId }),
      },
    );
    const raw = (await response.json().catch(() => ({}))) as {
      accepted?: string[];
      rejected?: HotLinkDomainRejection[];
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Validation failed" };
    }
    return {
      ok: true,
      accepted: raw.accepted ?? [],
      rejected: raw.rejected ?? [],
    };
  } catch {
    return { ok: false, error: "Network error validating domains" };
  }
}

/* ---------------------------------------------------------------------------
 * AI assistant connections (KVPN-506)
 *
 * A member authorises one assistant at a time to read their recommendations.
 * The token is returned once at creation and only its hash is stored, so it
 * cannot be recovered — the UI must surface it immediately.
 * ------------------------------------------------------------------------ */

export interface AiConnection {
  id: string;
  platform: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export async function listAiConnections(
  sessionToken: string,
): Promise<{ ok: boolean; data?: AiConnection[]; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/connections`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const raw = (await response.json().catch(() => ({}))) as {
      connections?: AiConnection[];
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Failed to load connections" };
    }
    return { ok: true, data: raw.connections ?? [] };
  } catch {
    return { ok: false, error: "Network error loading connections" };
  }
}

export async function createAiConnection(
  sessionToken: string,
  platform: string,
  expiresInDays?: number,
): Promise<{
  ok: boolean;
  token?: string;
  data?: AiConnection;
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/connections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ platform, expiresInDays }),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      token?: string;
      connection?: AiConnection;
      message?: string;
    };
    if (!response.ok) {
      return { ok: false, error: raw.message ?? "Failed to connect" };
    }
    return { ok: true, token: raw.token, data: raw.connection };
  } catch {
    return { ok: false, error: "Network error creating connection" };
  }
}

export async function revokeAiConnection(
  sessionToken: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/connections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok) {
      const raw = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return { ok: false, error: raw.message ?? "Failed to revoke" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error revoking connection" };
  }
}

/** Account-level website Split Tunneling preference (excluded domains). */
export interface SplitTunnelingPreference {
  enabled: boolean;
  domains: string[];
}

function parseSplitTunnelingPreferencePayload(
  raw: unknown,
): SplitTunnelingPreference | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.domains)) {
    return null;
  }
  return {
    enabled: record.enabled !== false,
    domains: record.domains.filter((d): d is string => typeof d === "string"),
  };
}

export async function fetchSplitTunnelingPreference(
  sessionToken: string,
): Promise<{
  ok: boolean;
  data?: SplitTunnelingPreference;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/users/me/preferences/split-tunneling`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${sessionToken}` },
      },
    );
    const raw = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to load website exclusions",
        ),
      };
    }
    const data = parseSplitTunnelingPreferencePayload(raw);
    if (!data) {
      return {
        ok: false,
        error: "Invalid website exclusions response",
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error loading website exclusions" };
  }
}

export async function updateSplitTunnelingPreference(
  sessionToken: string,
  payload: { domains: string[]; enabled?: boolean },
): Promise<{
  ok: boolean;
  data?: SplitTunnelingPreference;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/users/me/preferences/split-tunneling`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const raw = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to save website exclusions",
        ),
      };
    }
    const data = parseSplitTunnelingPreferencePayload(raw);
    if (!data) {
      return {
        ok: false,
        error: "Invalid website exclusions response",
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error saving website exclusions" };
  }
}

// --- Promotional Trial QR Codes ---

export interface AdminPromoTrialQr {
  id: string;
  name: string;
  code: string;
  trialDays: number;
  isActive: boolean;
  scanCount: number;
  redemptionCount: number;
  paidConversionCount: number;
  landingUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromoTrialQrDetail extends AdminPromoTrialQr {
  recentRedemptions: {
    id: string;
    userId: string;
    redeemedAt: string;
    trialEndsAt: string;
    convertedPaidAt: string | null;
  }[];
}

export async function adminListPromoTrialQr(): Promise<{
  ok: boolean;
  data?: AdminPromoTrialQr[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/promo-trial-qr`, {
      credentials: "include",
    });
    const raw = (await response.json().catch(() => ({}))) as {
      items?: AdminPromoTrialQr[];
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to load promotional trial QR codes",
      };
    }
    return { ok: true, data: raw.items ?? [] };
  } catch {
    return {
      ok: false,
      error: "Network error loading promotional trial QR codes",
    };
  }
}

export async function adminCreatePromoTrialQr(payload: {
  name: string;
  trialDays: number;
}): Promise<{ ok: boolean; data?: AdminPromoTrialQr; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/promo-trial-qr`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = (await response.json().catch(() => ({}))) as {
      item?: AdminPromoTrialQr;
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to create promotional trial QR code",
      };
    }
    return { ok: true, data: raw.item };
  } catch {
    return {
      ok: false,
      error: "Network error creating promotional trial QR code",
    };
  }
}

export async function adminUpdatePromoTrialQr(
  id: string,
  patch: { name?: string; isActive?: boolean },
): Promise<{ ok: boolean; data?: AdminPromoTrialQr; error?: string }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/promo-trial-qr/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const raw = (await response.json().catch(() => ({}))) as {
      item?: AdminPromoTrialQr;
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to update promotional trial QR code",
      };
    }
    return { ok: true, data: raw.item };
  } catch {
    return {
      ok: false,
      error: "Network error updating promotional trial QR code",
    };
  }
}

export async function resolvePromoTrialQr(code: string): Promise<{
  ok: boolean;
  data?: {
    found: boolean;
    active: boolean;
    name: string | null;
    trialDays: number | null;
  };
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/promo-trial-qr/${encodeURIComponent(code)}`,
    );
    const raw = (await response.json().catch(() => ({}))) as {
      found?: boolean;
      active?: boolean;
      name?: string | null;
      trialDays?: number | null;
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to resolve promotional offer",
      };
    }
    return {
      ok: true,
      data: {
        found: Boolean(raw.found),
        active: Boolean(raw.active),
        name: raw.name ?? null,
        trialDays: raw.trialDays ?? null,
      },
    };
  } catch {
    return { ok: false, error: "Network error resolving promotional offer" };
  }
}

export async function recordPromoTrialQrScan(
  code: string,
  anonymousId?: string,
): Promise<{ ok: boolean }> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/promo-trial-qr/${encodeURIComponent(code)}/scan`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(anonymousId ? { anonymousId } : {}),
      },
    );
    if (!response.ok) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export type PromoTrialRedeemReason =
  | "inactive"
  | "not_found"
  | "existing_subscriber"
  | "already_used_trial"
  | "already_redeemed"
  | "device_hash_exists"
  | "feature_disabled";

export async function redeemPromoTrialQr(
  code: string,
  sessionToken: string,
): Promise<{
  ok: boolean;
  success?: boolean;
  reason?: PromoTrialRedeemReason;
  trialEndsAt?: string;
  trialStartsAt?: string;
  trialDays?: number;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/promo-trial-qr/${encodeURIComponent(code)}/redeem`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    const raw = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      reason?: PromoTrialRedeemReason;
      trialEndsAt?: string;
      trialStartsAt?: string;
      trialDays?: number;
      message?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        error: raw.message ?? "Failed to redeem promotional trial",
      };
    }
    return {
      ok: true,
      success: raw.success,
      reason: raw.reason,
      trialEndsAt: raw.trialEndsAt,
      trialStartsAt: raw.trialStartsAt,
      trialDays: raw.trialDays,
    };
  } catch {
    return { ok: false, error: "Network error redeeming promotional trial" };
  }
}

// ---------------------------------------------------------------------------
// Admin — Centralized pricing manager
// ---------------------------------------------------------------------------

export type PricingPlatform =
  | "WEB"
  | "IOS"
  | "MACOS"
  | "ANDROID"
  | "WINDOWS";

export type PricingBillingPeriod = "MONTHLY" | "ANNUAL" | "TWO_YEAR";

export type PricingChangeStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "APPLYING"
  | "APPLIED"
  | "PARTIAL_FAILURE"
  | "FAILED";

export type PricingPlatformSyncStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

export interface AdminPricingSku {
  id: string;
  planKey: string;
  billingPeriod: PricingBillingPeriod;
  platform: PricingPlatform;
  currency: string;
  basePrice: string | number;
  trialDays: number;
  storeProductId: string | null;
  storePriceId: string | null;
  isActive: boolean;
  effectiveFrom: string;
}

export interface AdminProposedPricingChange {
  planKey: string;
  billingPeriod: PricingBillingPeriod;
  platform: PricingPlatform;
  currency?: string;
  fromPrice: number;
  toPrice: number;
  trialDays?: number;
  storeProductId?: string | null;
  storePriceId?: string | null;
}

export interface AdminPricingChangeListItem {
  id: string;
  title: string;
  status: PricingChangeStatus;
  notes: string | null;
  createdByAdminId: string | null;
  approvedByAdminId: string | null;
  rejectedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  appliedAt: string | null;
  previewSummary: string | null;
  affectedPlatforms: PricingPlatform[];
}

export interface AdminPricingPreviewLine {
  planKey: string;
  billingPeriod: PricingBillingPeriod;
  platform: PricingPlatform;
  currency: string;
  fromPrice: number;
  toPrice: number;
  delta: number;
}

export interface AdminPricingPreview {
  title: string;
  summary: string;
  affectedPlatforms: PricingPlatform[];
  lines: AdminPricingPreviewLine[];
}

export interface AdminPricingPlatformResult {
  id: string;
  platform: PricingPlatform;
  status: PricingPlatformSyncStatus;
  message: string | null;
  verifiedAt: string | null;
}

export interface AdminPricingAuditEvent {
  id: string;
  action: string;
  actorAdminId: string | null;
  actorLabel: string | null;
  createdAt: string;
}

export interface AdminPricingChangeDetail {
  id: string;
  title: string;
  status: PricingChangeStatus;
  notes: string | null;
  proposedChanges: AdminProposedPricingChange[];
  preview: AdminPricingPreview | null;
  createdByAdminId: string | null;
  approvedByAdminId: string | null;
  rejectedByAdminId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  appliedAt: string | null;
  platformResults: AdminPricingPlatformResult[];
  auditEvents: AdminPricingAuditEvent[];
}

export interface AdminPricingDriftFinding {
  platform: PricingPlatform;
  planKey: string;
  billingPeriod: PricingBillingPeriod;
  expectedPrice: number;
  observedPrice: number | null;
  storeProductId: string | null;
  message: string;
}

export interface AdminPricingDriftAuditData {
  findings: AdminPricingDriftFinding[];
}

export async function adminFetchPricingCatalog(): Promise<{
  ok: boolean;
  data?: AdminPricingSku[];
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/pricing/catalog`, {
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load pricing catalog"),
      };
    }
    const record = raw as { data?: AdminPricingSku[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminUpdatePricingSkuStoreIds(
  id: string,
  input: {
    storeProductId?: string | null;
    storePriceId?: string | null;
  },
): Promise<{
  ok: boolean;
  data?: AdminPricingSku;
  needsCatalogRefresh?: boolean;
  error?: string;
}> {
  const normalize = (
    value: string | null | undefined,
  ): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/pricing/catalog/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // JSON.stringify omits undefined so unchanged fields stay unset (partial PATCH).
        body: JSON.stringify({
          storeProductId: normalize(input.storeProductId),
          storePriceId: normalize(input.storePriceId),
        }),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(
          raw,
          "Failed to update catalog store IDs",
        ),
      };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      // Persist succeeded but body was null/non-object — caller should refetch.
      return { ok: true, needsCatalogRefresh: true };
    }
    const record = raw as { data?: AdminPricingSku };
    if (!record.data) {
      // Persist succeeded but payload missing — caller should refetch catalog.
      return { ok: true, needsCatalogRefresh: true };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminListPricingChanges(params?: {
  status?: PricingChangeStatus | "";
  limit?: number;
}): Promise<{
  ok: boolean;
  data?: AdminPricingChangeListItem[];
  error?: string;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit != null) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await fetch(
      `${BACKEND_URL}/admin/pricing/changes${suffix}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load pricing changes"),
      };
    }
    const record = raw as { data?: AdminPricingChangeListItem[] };
    return { ok: true, data: record.data ?? [] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminGetPricingChange(id: string): Promise<{
  ok: boolean;
  data?: AdminPricingChangeDetail;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/pricing/changes/${encodeURIComponent(id)}`,
      { credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to load pricing change"),
      };
    }
    const record = raw as { data?: AdminPricingChangeDetail };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminCreatePricingChange(input: {
  title: string;
  notes?: string;
  changes: AdminProposedPricingChange[];
}): Promise<{
  ok: boolean;
  data?: { request: AdminPricingChangeDetail; preview: AdminPricingPreview };
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/pricing/changes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to create pricing change"),
      };
    }
    const record = raw as {
      data?: { request: AdminPricingChangeDetail; preview: AdminPricingPreview };
    };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminSubmitPricingChange(id: string): Promise<{
  ok: boolean;
  data?: AdminPricingChangeDetail;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/pricing/changes/${encodeURIComponent(id)}/submit`,
      { method: "POST", credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to submit pricing change"),
      };
    }
    const record = raw as { data?: AdminPricingChangeDetail };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminApprovePricingChange(id: string): Promise<{
  ok: boolean;
  data?: AdminPricingChangeDetail;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/pricing/changes/${encodeURIComponent(id)}/approve`,
      { method: "POST", credentials: "include" },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to approve pricing change"),
      };
    }
    const record = raw as { data?: AdminPricingChangeDetail };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminRejectPricingChange(
  id: string,
  reason?: string,
): Promise<{
  ok: boolean;
  data?: AdminPricingChangeDetail;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/admin/pricing/changes/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to reject pricing change"),
      };
    }
    const record = raw as { data?: AdminPricingChangeDetail };
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function adminRunPricingDriftAudit(): Promise<{
  ok: boolean;
  data?: AdminPricingDriftAuditData;
  error?: string;
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/admin/pricing/drift-audit`, {
      method: "POST",
      credentials: "include",
    });
    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: extractBackendErrorMessage(raw, "Failed to run drift audit"),
      };
    }
    const record = raw as { data?: AdminPricingDriftAuditData };
    const findings = record.data?.findings;
    if (
      !record.data ||
      !Array.isArray(findings) ||
      !findings.every(
        (finding) =>
          !!finding &&
          typeof finding.platform === "string" &&
          typeof finding.billingPeriod === "string" &&
          typeof finding.message === "string",
      )
    ) {
      return { ok: false, error: "Invalid response from server" };
    }
    return { ok: true, data: record.data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}
