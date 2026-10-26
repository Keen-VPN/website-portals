import { BACKEND_URL } from "@/auth/backend";

const BASE = `${BACKEND_URL}/v1/flight-compensation`;

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };

export interface EmailProviderInfo {
  id: "gmail" | "outlook";
  name: string;
  available: boolean;
  scopes: string[];
  permissionSummary: string;
}

export interface ProvidersPayload {
  consent: { version: string; text: string };
  providers: EmailProviderInfo[];
}

export interface EmailConnection {
  id: string;
  provider: string;
  accountEmail: string;
  status: "active" | "reauth_required" | "revoked" | string;
  needsReconnect: boolean;
  grantedScopes: string[];
  consentVersion: string;
  consentedAt: string;
  lastScanCompletedAt: string | null;
  lastScanFlightCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface BenefitEstimate {
  kind: "compensation" | "refund";
  currency?: string;
  amount?: number;
  maxAmount?: number;
  summary: string;
}

export interface JurisdictionEvaluation {
  jurisdiction: string;
  regulation: string;
  status: EligibilityStatus;
  qualifyingEvent: string | null;
  delayBelowThreshold: boolean;
  benefit: BenefitEstimate | null;
  conditions: string[];
  verificationReasons: { code: string; message: string }[];
  claimPageSlug: string;
  resources: { label: string; url: string }[];
}

export type EligibilityStatus =
  | "not_evaluated"
  | "potentially_eligible"
  | "needs_verification"
  | "not_eligible"
  | "insufficient_data";

export interface TrackedFlight {
  id: string;
  flightCode: string;
  airline: { code: string; name: string | null };
  flightNumber: string;
  departureDate: string;
  departureAirport: string;
  arrivalAirport: string;
  detectionMethod: string;
  confirmationCount: number;
  firstDetectedAt: string;
  status: {
    state: "pending" | "checked" | "unavailable" | "not_covered" | string;
    flightStatus: string | null;
    source: string | null;
    airlineCancellationNoticeAt: string | null;
    unavailableReason: string | null;
    nextCheckAt: string | null;
    scheduledDepartureAt: string | null;
    actualDepartureAt: string | null;
    scheduledArrivalAt: string | null;
    actualArrivalAt: string | null;
    departureDelayMinutes: number | null;
    arrivalDelayMinutes: number | null;
  };
  eligibility: {
    status: EligibilityStatus;
    evaluatedAt: string | null;
    requiresVerification: boolean;
    primary: JurisdictionEvaluation | null;
    evaluations: JurisdictionEvaluation[];
    notes: string[];
    claimUrl: string | null;
  };
}

export interface AlertSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export interface FlightAlert {
  id: string;
  channel: "push" | "email";
  status: "pending" | "sent" | "failed" | "skipped";
  skipReason: string | null;
  eligibilityStatus: EligibilityStatus;
  claimUrl: string;
  sentAt: string | null;
  openedAt: string | null;
  firstClickedAt: string | null;
  clickCount: number;
  dismissedAt: string | null;
  createdAt: string;
  trackedFlight: {
    id: string;
    airlineCode: string;
    flightNumber: string;
    departureDate: string;
    departureAirport: string;
    arrivalAirport: string;
  };
}

async function call<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body: unknown = await response.json().catch(() => ({}));
    const record =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: errorMessage(record) ?? `Request failed (${response.status})`,
      };
    }
    return { success: true, data: record.data as T };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

function errorMessage(record: Record<string, unknown>): string | null {
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  const message = record.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === "string")
    return message[0];
  return null;
}

export const flightCompensationApi = {
  providers: (token: string) => call<ProvidersPayload>(token, "/providers"),

  authorize: (
    token: string,
    body: {
      provider: string;
      consent: boolean;
      consentVersion: string;
      returnTo: "web";
    },
  ) =>
    call<{ authorizationUrl: string; expiresAt: string }>(
      token,
      "/connections/authorize",
      { method: "POST", body: JSON.stringify(body) },
    ),

  connections: (token: string) =>
    call<EmailConnection[]>(token, "/connections"),

  revoke: (token: string, id: string, deleteFlights: boolean) =>
    call<unknown>(
      token,
      `/connections/${id}?deleteFlights=${deleteFlights ? "true" : "false"}`,
      { method: "DELETE" },
    ),

  scan: (token: string, id: string) =>
    call<{ queued: boolean }>(token, `/connections/${id}/scan`, {
      method: "POST",
    }),

  flights: (token: string) => call<TrackedFlight[]>(token, "/flights"),

  deleteFlight: (token: string, id: string) =>
    call<{ deleted: boolean }>(token, `/flights/${id}`, { method: "DELETE" }),

  settings: (token: string) => call<AlertSettings>(token, "/settings"),

  updateSettings: (token: string, changes: Partial<AlertSettings>) =>
    call<AlertSettings>(token, "/settings", {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),

  alerts: (token: string) => call<FlightAlert[]>(token, "/notifications"),
};
