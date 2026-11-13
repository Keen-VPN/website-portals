import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Plane,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getSessionToken } from "@/auth";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  flightCompensationApi as api,
  type AlertSettings,
  type EligibilityStatus,
  type EmailConnection,
  type FlightAlert,
  type ProvidersPayload,
  type TrackedFlight,
} from "@/lib/flight-compensation-api";
import { cn } from "@/lib/utils";

const PAGE_PADDING = "px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#0f2040] px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#dbe2ec] bg-white px-3 text-[13px] font-semibold text-[#0f2040] transition-colors hover:bg-[#f5f7fb] disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#f3c9c3] bg-white px-3 text-[13px] font-semibold text-[#b42318] transition-colors hover:bg-[#fff5f4] disabled:opacity-50";

/** After "Scan now", poll this long so results appear without a manual refresh. */
const POLL_INTERVAL_MS = 10_000;
/** setTimeout overflows above 2^31-1 ms (~24.8 days). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const POLL_DURATION_MS = 3 * 60_000;

const OAUTH_ERROR_COPY: Record<string, string> = {
  expired_or_invalid_state:
    "The connection link expired. Please start the connection again.",
  missing_code: "The provider did not complete the sign-in.",
  invalid_request: "The provider returned an invalid response.",
};

const ELIGIBILITY_BADGE: Record<
  EligibilityStatus,
  { label: string; className: string }
> = {
  potentially_eligible: {
    label: "May be eligible",
    className: "border-[#b7e4c7] bg-[#effaf3] text-[#1a7f43]",
  },
  needs_verification: {
    label: "Needs checking",
    className: "border-[#f6d3b8] bg-[#fff8f2] text-[#b24a14]",
  },
  not_eligible: {
    label: "Not eligible",
    className: "border-[#e7edf5] bg-[#f7f9fc] text-[#627086]",
  },
  insufficient_data: {
    label: "Not enough data",
    className: "border-[#e7edf5] bg-[#f7f9fc] text-[#627086]",
  },
  not_evaluated: {
    label: "Waiting for flight data",
    className: "border-[#cfe0f7] bg-[#f3f8ff] text-[#2456a6]",
  },
};

const FLIGHT_STATUS_LABEL: Record<string, string> = {
  on_time: "On time",
  delayed: "Delayed",
  cancelled: "Cancelled",
  cancelled_unconfirmed: "Reported as cancelled",
  diverted: "Diverted",
};

function formatDate(value: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    ...(value.length === 10 ? { timeZone: "UTC" } : {}),
  });
}

function formatDelay(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes <= 0) return "on time";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m late` : `${m}m late`;
}

function humanize(code: string | null): string {
  return code ? code.replace(/_/g, " ") : "";
}

function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[18px] border border-[#e7edf5] bg-white p-5 shadow-[0_2px_8px_rgba(15,32,64,0.04)] sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-bold text-[#0f2040]">{children}</h2>
      {action}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[#0f2040]" : "bg-[#d5dce7]",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function OAuthResultBanner({ onDismiss }: { onDismiss: () => void }) {
  const [params] = useSearchParams();
  const status = params.get("status");
  if (!status) return null;
  const provider = params.get("provider");
  const providerName =
    provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : "";
  const reason = params.get("reason");

  const tone =
    status === "connected"
      ? {
          icon: <CheckCircle2 className="h-5 w-5 text-[#1a7f43]" />,
          className: "border-[#b7e4c7] bg-[#effaf3]",
          title: `${providerName || "Mailbox"} connected`,
          body: "We're scanning it for flight bookings now. Results show up below in a minute or two.",
        }
      : status === "cancelled"
        ? {
            icon: <AlertTriangle className="h-5 w-5 text-[#b24a14]" />,
            className: "border-[#f6d3b8] bg-[#fff8f2]",
            title: "Connection cancelled",
            body: "You didn't grant access, so nothing was connected.",
          }
        : {
            icon: <AlertTriangle className="h-5 w-5 text-[#b42318]" />,
            className: "border-[#f3c9c3] bg-[#fff5f4]",
            title: "We couldn't connect your mailbox",
            body:
              (reason && OAUTH_ERROR_COPY[reason]) ||
              `Something went wrong${reason ? ` (${humanize(reason)})` : ""}. Please try again.`,
          };

  return (
    <div
      className={cn(
        "mt-6 flex items-start gap-3 rounded-[14px] border px-4 py-3",
        tone.className,
      )}
    >
      {tone.icon}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[#0f2040]">
          {tone.title}
        </p>
        <p className="text-[14px] text-[#43516a]">{tone.body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[13px] font-medium text-[#627086] hover:text-[#0f2040]"
      >
        Dismiss
      </button>
    </div>
  );
}

function ConnectCard({
  providers,
  hasConnections,
}: {
  providers: ProvidersPayload;
  hasConnections: boolean;
}) {
  const { toast } = useToast();
  const [consented, setConsented] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const connect = async (providerId: string) => {
    const token = getSessionToken();
    if (!token) return;
    setStarting(providerId);
    const res = await api.authorize(token, {
      provider: providerId,
      consent: true,
      consentVersion: providers.consent.version,
      returnTo: "web",
    });
    if (res.success) {
      window.location.assign(res.data.authorizationUrl);
      return;
    }
    setStarting(null);
    toast({
      title: "Could not start the connection",
      description: res.error,
      variant: "destructive",
    });
  };

  return (
    <Card>
      <SectionTitle>
        {hasConnections ? "Connect another mailbox" : "Connect your mailbox"}
      </SectionTitle>
      <div className="rounded-[12px] border border-[#e7edf5] bg-[#f7f9fc] p-4 text-[14px] leading-[1.6] text-[#43516a]">
        {providers.consent.text}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px] text-[#0f2040]">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#0f2040]"
        />
        <span>
          I agree to let KeenVPN scan my mailbox for flight bookings and airline
          cancellation notices as described above.
        </span>
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
        {providers.providers.map((provider) => (
          <div key={provider.id} className="flex flex-col gap-1">
            <button
              type="button"
              className={primaryBtn}
              disabled={!consented || !provider.available || starting !== null}
              onClick={() => void connect(provider.id)}
            >
              {starting === provider.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Connect {provider.name}
            </button>
            <p className="max-w-[260px] text-[12px] text-[#627086]">
              {provider.available
                ? provider.permissionSummary
                : "Not configured on this server."}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ConnectionRow({
  connection,
  onChanged,
  onScanRequested,
}: {
  connection: EmailConnection;
  onChanged: () => void;
  onScanRequested: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const scan = async () => {
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    const res = await api.scan(token, connection.id);
    setBusy(false);
    if (res.success) {
      toast({
        title: "Scan started",
        description: "New flights will appear below as they're found.",
      });
      onScanRequested();
    } else {
      toast({
        title: "Could not start a scan",
        description: res.error,
        variant: "destructive",
      });
    }
  };

  const revoke = async (deleteFlights: boolean) => {
    const token = getSessionToken();
    if (!token) return;
    setBusy(true);
    const res = await api.revoke(token, connection.id, deleteFlights);
    setBusy(false);
    setConfirming(false);
    if (res.success) {
      toast({ title: "Mailbox disconnected" });
      onChanged();
    } else {
      toast({
        title: "Could not disconnect",
        description: res.error,
        variant: "destructive",
      });
    }
  };

  const active = connection.status === "active";

  return (
    <div className="flex flex-col gap-3 border-t border-[#eef2f7] py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-[#0f2040]">
            {connection.accountEmail}
          </p>
          <span className="rounded-[6px] bg-[#f0f3f8] px-2 py-0.5 text-[12px] font-medium capitalize text-[#43516a]">
            {connection.provider}
          </span>
          {connection.needsReconnect ? (
            <span className="rounded-[6px] bg-[#fff5f4] px-2 py-0.5 text-[12px] font-semibold text-[#b42318]">
              Reconnect needed
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] text-[#627086]">
          {connection.lastScanCompletedAt
            ? `Last scan ${formatDate(connection.lastScanCompletedAt, true)} · ${connection.lastScanFlightCount} new flight${connection.lastScanFlightCount === 1 ? "" : "s"}`
            : "First scan in progress"}
        </p>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-[#43516a]">Also delete its flights?</span>
          <button
            type="button"
            className={secondaryBtn}
            disabled={busy}
            onClick={() => void revoke(false)}
          >
            Keep flights
          </button>
          <button
            type="button"
            className={dangerBtn}
            disabled={busy}
            onClick={() => void revoke(true)}
          >
            Delete flights
          </button>
          <button
            type="button"
            className="text-[13px] font-medium text-[#627086] hover:text-[#0f2040]"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            className={secondaryBtn}
            disabled={busy || !active}
            onClick={() => void scan()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Scan now
          </button>
          <button
            type="button"
            className={dangerBtn}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function flightStatusLine(flight: TrackedFlight): string {
  const { status } = flight;
  switch (status.state) {
    case "pending":
      return status.nextCheckAt &&
        new Date(status.nextCheckAt).getTime() > Date.now()
        ? `Flight status check scheduled for ${formatDate(status.nextCheckAt, true)}`
        : "Flight status check due shortly";
    case "not_covered":
      return "No supported passenger-rights rules cover this route";
    case "unavailable":
      return `No flight data available (${humanize(status.unavailableReason) || "unknown"})`;
    default: {
      const label =
        FLIGHT_STATUS_LABEL[status.flightStatus ?? ""] ??
        humanize(status.flightStatus);
      const delay =
        status.flightStatus === "delayed" || status.flightStatus === "on_time"
          ? formatDelay(status.arrivalDelayMinutes)
          : null;
      const source =
        status.source === "airline_email"
          ? " · from airline email"
          : status.source
            ? ` · via ${status.source}`
            : "";
      return `${label}${delay ? ` · arrived ${delay}` : ""}${source}`;
    }
  }
}

function FlightCard({
  flight,
  onDeleted,
}: {
  flight: TrackedFlight;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, rerender] = useState(0);
  const nextCheckAt =
    flight.status.state === "pending" ? flight.status.nextCheckAt : null;

  // Swap "scheduled for …" to "due shortly" once the check time passes.
  useEffect(() => {
    if (!nextCheckAt) return;
    const delay = new Date(nextCheckAt).getTime() - Date.now();
    if (delay <= 0 || delay > MAX_TIMEOUT_MS) return;
    const timer = window.setTimeout(() => rerender((n) => n + 1), delay + 1000);
    return () => window.clearTimeout(timer);
  }, [nextCheckAt]);

  const badge = ELIGIBILITY_BADGE[flight.eligibility.status] ??
    ELIGIBILITY_BADGE.not_evaluated;
  const primary = flight.eligibility.primary;
  const hasFlightTimes = [
    flight.status.scheduledDepartureAt,
    flight.status.actualDepartureAt,
    flight.status.scheduledArrivalAt,
    flight.status.actualArrivalAt,
  ].some(Boolean);
  const notes = flight.eligibility.notes.filter(
    (note) =>
      !(
        note === "cancellation_reported_by_airline_email" &&
        flight.status.source === "airline_email"
      ),
  );

  const remove = async () => {
    const token = getSessionToken();
    if (!token || !window.confirm(`Remove ${flight.flightCode}?`)) return;
    setDeleting(true);
    const res = await api.deleteFlight(token, flight.id);
    setDeleting(false);
    if (res.success) onDeleted();
    else
      toast({
        title: "Could not remove flight",
        description: res.error,
        variant: "destructive",
      });
  };

  return (
    <article className="rounded-[14px] border border-[#e7edf5] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f0f3f8]">
            <Plane className="h-5 w-5 text-[#0f2040]" />
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-bold text-[#0f2040]">
              {flight.flightCode}{" "}
              <span className="font-semibold text-[#43516a]">
                {flight.departureAirport} → {flight.arrivalAirport}
              </span>
            </p>
            <p className="text-[13px] text-[#627086]">
              {flight.airline.name ?? flight.airline.code} ·{" "}
              {formatDate(flight.departureDate)}
            </p>
            <p className="mt-1 text-[13px] text-[#43516a]">
              {flightStatusLine(flight)}
            </p>
            {flight.status.airlineCancellationNoticeAt ? (
              <p className="mt-1 text-[13px] text-[#b24a14]">
                Airline cancellation email received{" "}
                {formatDate(flight.status.airlineCancellationNoticeAt, true)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span
            className={cn(
              "rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold",
              badge.className,
            )}
          >
            {badge.label}
          </span>
          {primary?.benefit ? (
            <p className="text-[15px] font-bold text-[#0f2040]">
              {primary.benefit.summary}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {flight.eligibility.claimUrl ? (
          <a
            href={flight.eligibility.claimUrl}
            target="_blank"
            rel="noreferrer"
            className={primaryBtn + " h-9 px-4 text-[13px]"}
          >
            How to claim <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <button
          type="button"
          className={secondaryBtn}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide details" : "Details"}
        </button>
        <button
          type="button"
          className={dangerBtn}
          disabled={deleting}
          onClick={() => void remove()}
          aria-label={`Remove ${flight.flightCode}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[#eef2f7] pt-4 text-[13px] text-[#43516a]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {[
              ...(hasFlightTimes
                ? [
                    ["Scheduled departure", formatDate(flight.status.scheduledDepartureAt, true)],
                    ["Actual departure", formatDate(flight.status.actualDepartureAt, true)],
                    ["Scheduled arrival", formatDate(flight.status.scheduledArrivalAt, true)],
                    ["Actual arrival", formatDate(flight.status.actualArrivalAt, true)],
                  ]
                : []),
              ["Detected via", humanize(flight.detectionMethod)],
              ["Seen in emails", String(flight.confirmationCount)],
              ["Check state", humanize(flight.status.state)],
              ["Evaluated", formatDate(flight.eligibility.evaluatedAt, true)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#8390a5]">
                  {label}
                </dt>
                <dd className="text-[#0f2040]">{value}</dd>
              </div>
            ))}
          </dl>

          {flight.eligibility.evaluations.map((evaluation) => (
            <div
              key={evaluation.jurisdiction}
              className="rounded-[10px] border border-[#e7edf5] bg-[#fbfcfe] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#0f2040]">
                  {evaluation.regulation}
                </p>
                <span className="text-[12px] font-semibold">
                  {ELIGIBILITY_BADGE[evaluation.status]?.label ??
                    evaluation.status}
                  {evaluation.benefit ? ` · ${evaluation.benefit.summary}` : ""}
                </span>
              </div>
              {evaluation.verificationReasons.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[#b24a14]">
                  {evaluation.verificationReasons.map((reason) => (
                    <li key={reason.code}>{reason.message}</li>
                  ))}
                </ul>
              ) : null}
              {evaluation.conditions.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {evaluation.conditions.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}

          {notes.length > 0 ? (
            <p className="text-[12px] text-[#8390a5]">
              Notes: {notes.map(humanize).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SettingsCard({ initial }: { initial: AlertSettings }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saving) setSettings(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on refreshed server values only
  }, [initial]);

  const update = async (changes: Partial<AlertSettings>) => {
    const token = getSessionToken();
    if (!token) return;
    const previous = settings;
    setSettings({ ...settings, ...changes });
    setSaving(true);
    const res = await api.updateSettings(token, changes);
    setSaving(false);
    if (res.success) setSettings(res.data);
    else {
      setSettings(previous);
      toast({
        title: "Could not save",
        description: res.error,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <SectionTitle>Alerts</SectionTitle>
      <div className="space-y-4">
        {(
          [
            ["pushEnabled", "Push notifications", "On your phone, via the KeenVPN app"],
            ["emailEnabled", "Email", "To your KeenVPN account email"],
          ] as const
        ).map(([key, title, hint]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-[#0f2040]">{title}</p>
              <p className="text-[13px] text-[#627086]">{hint}</p>
            </div>
            <Toggle
              label={title}
              checked={settings[key]}
              disabled={saving}
              onChange={(next) => void update({ [key]: next })}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function AlertsHistory({ alerts }: { alerts: FlightAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <Card>
      <SectionTitle>Alert history</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#8390a5]">
            <tr>
              <th className="pb-2 pr-3">Flight</th>
              <th className="pb-2 pr-3">Channel</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Sent</th>
              <th className="pb-2">Clicks</th>
            </tr>
          </thead>
          <tbody className="text-[#0f2040]">
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-t border-[#eef2f7]">
                <td className="py-2 pr-3 font-semibold">
                  {alert.trackedFlight.airlineCode}
                  {alert.trackedFlight.flightNumber}{" "}
                  <span className="font-normal text-[#627086]">
                    {formatDate(alert.trackedFlight.departureDate.slice(0, 10))}
                  </span>
                </td>
                <td className="py-2 pr-3 capitalize">{alert.channel}</td>
                <td className="py-2 pr-3">
                  {alert.status}
                  {alert.skipReason ? (
                    <span className="text-[#627086]">
                      {" "}
                      ({humanize(alert.skipReason)})
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">{formatDate(alert.sentAt, true)}</td>
                <td className="py-2">{alert.clickCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface PageData {
  providers: ProvidersPayload;
  connections: EmailConnection[];
  flights: TrackedFlight[];
  settings: AlertSettings;
  alerts: FlightAlert[];
}

export default function DashboardFlightCompensation() {
  const { user, loading: authLoading } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [pollUntil, setPollUntil] = useState<number>(0);
  const loadedOnce = useRef(false);
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestLoad.current;
    const token = getSessionToken();
    if (!token) {
      setRefreshing(false);
      setError({
        message: "Your session has expired. Sign in again to continue.",
        status: 401,
      });
      return;
    }
    setRefreshing(true);
    const [providers, connections, flights, settings, alerts] =
      await Promise.all([
        api.providers(token),
        api.connections(token),
        api.flights(token),
        api.settings(token),
        api.alerts(token),
      ]);
    if (requestId !== latestLoad.current) return;
    setRefreshing(false);
    const failed = [providers, connections, flights, settings, alerts].find(
      (res) => !res.success,
    );
    if (failed && !failed.success) {
      setError({ message: failed.error, status: failed.status });
      return;
    }
    setError(null);
    loadedOnce.current = true;
    setData({
      providers: providers.success ? providers.data : { consent: { version: "", text: "" }, providers: [] },
      connections: connections.success ? connections.data : [],
      flights: flights.success ? flights.data : [],
      settings: settings.success ? settings.data : { pushEnabled: true, emailEnabled: true },
      alerts: alerts.success ? alerts.data : [],
    });
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [authLoading, user, load]);

  // A fresh connection starts its first scan in the background.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "connected") {
      setPollUntil(Date.now() + POLL_DURATION_MS);
    }
  }, []);

  useEffect(() => {
    if (pollUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      if (Date.now() > pollUntil) {
        window.clearInterval(timer);
        setPollUntil(0);
        return;
      }
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pollUntil, load]);

  const activeConnections =
    data?.connections.filter((connection) => connection.status !== "revoked") ??
    [];

  if (authLoading || (!data && !error)) {
    return (
      <div className={PAGE_PADDING}>
        <div className="mx-auto w-full max-w-[1000px] space-y-5">
          <Skeleton className="h-10 w-full max-w-[420px]" />
          <Skeleton className="h-5 w-full max-w-[640px]" />
          <Skeleton className="h-48 w-full rounded-[18px]" />
          <Skeleton className="h-64 w-full rounded-[18px]" />
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_PADDING}>
      <div className="mx-auto w-full max-w-[1000px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-[680px]">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.6px] text-[#0f2040] sm:text-[34px]">
              Flight compensation
            </h1>
            <p className="mt-2 text-[15px] leading-[1.6] text-[#627086] sm:text-[16px]">
              Connect your mailbox and we'll find your flights, check whether
              they were delayed or cancelled, and tell you when you may be owed
              compensation under EU, UK, Canadian or U.S. rules.
            </p>
          </div>
          {data ? (
            <button
              type="button"
              className={secondaryBtn}
              disabled={refreshing}
              onClick={() => void load()}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              />
              {pollUntil > 0 ? "Updating…" : "Refresh"}
            </button>
          ) : null}
        </div>

        <OAuthResultBanner
          onDismiss={() => setSearchParams({}, { replace: true })}
        />

        {error && !loadedOnce.current ? (
          <Card className="mt-8 text-center">
            <p className="text-[16px] font-semibold text-[#0f2040]">
              {error.status === 404
                ? "Flight compensation isn't enabled yet"
                : "We couldn't load flight compensation"}
            </p>
            <p className="mt-1 text-[14px] text-[#627086]">
              {error.status === 404
                ? "Set FF_FLIGHT_COMPENSATION_ENABLED=true on the backend to turn it on."
                : error.message}
            </p>
            {error.status === 401 ? (
              <a href="/signin" className={cn(primaryBtn, "mt-4")}>
                Sign in
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void load()}
                className={cn(primaryBtn, "mt-4")}
              >
                Try again
              </button>
            )}
          </Card>
        ) : data ? (
          <div className="mt-6 space-y-5">
            {error ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#f3d2bd] bg-[#fff7f1] px-4 py-3 text-[14px] text-[#9a4a16]"
              >
                <span>
                  Couldn't refresh, so what you see may be out of date.{" "}
                  {error.message}
                </span>
                <button
                  type="button"
                  className="font-semibold underline"
                  disabled={refreshing}
                  onClick={() => void load()}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {activeConnections.length > 0 ? (
              <Card>
                <SectionTitle>Connected mailboxes</SectionTitle>
                {activeConnections.map((connection) => (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    onChanged={() => void load()}
                    onScanRequested={() =>
                      setPollUntil(Date.now() + POLL_DURATION_MS)
                    }
                  />
                ))}
              </Card>
            ) : null}

            <Card>
              <SectionTitle>
                Your flights{" "}
                <span className="font-semibold text-[#8390a5]">
                  ({data.flights.length})
                </span>
              </SectionTitle>
              {data.flights.length === 0 ? (
                <p className="text-[14px] text-[#627086]">
                  {activeConnections.length > 0
                    ? "No flights found yet. Scans can take a few minutes for large mailboxes."
                    : "Connect a mailbox to find your flights."}
                </p>
              ) : (
                <div className="space-y-3">
                  {data.flights.map((flight) => (
                    <FlightCard
                      key={flight.id}
                      flight={flight}
                      onDeleted={() => void load()}
                    />
                  ))}
                </div>
              )}
            </Card>

            <ConnectCard
              providers={data.providers}
              hasConnections={activeConnections.length > 0}
            />

            <SettingsCard initial={data.settings} />
            <AlertsHistory alerts={data.alerts} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
