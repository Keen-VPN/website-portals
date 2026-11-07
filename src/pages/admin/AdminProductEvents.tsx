import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminFetchIpAddressClickSummary,
  adminFetchRestrictedNetworkDiagnosticSummary,
  adminFetchReviewPromptSummary,
  type AdminIpAddressClickSummary,
  type AdminRestrictedNetworkDiagnosticSummary,
  type AdminReviewPromptSummary,
} from "@/auth/backend";

function BreakdownList({
  title,
  rows,
  loading,
  failed = false,
}: {
  title: string;
  rows: { label: string; count: number }[];
  loading: boolean;
  failed?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-mono tabular-nums">{row.count}</span>
          </div>
        ))}
        {loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {!loading && failed && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : null}
        {!loading && !failed && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded.</p>
        ) : null}
      </div>
    </div>
  );
}

function formatDateRange(from?: string, to?: string) {
  if (!from || !to) return "Last 90 days";
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Last 90 days";
  }
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
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

type PanelKey = "ip" | "review" | "restricted";

export default function AdminProductEvents() {
  const [summary, setSummary] = useState<AdminIpAddressClickSummary | null>(
    null,
  );
  const [reviewSummary, setReviewSummary] =
    useState<AdminReviewPromptSummary | null>(null);
  const [restrictedSummary, setRestrictedSummary] =
    useState<AdminRestrictedNetworkDiagnosticSummary | null>(null);
  const [loadingIp, setLoadingIp] = useState(true);
  const [loadingReview, setLoadingReview] = useState(true);
  const [loadingRestricted, setLoadingRestricted] = useState(true);
  const [restrictedFailed, setRestrictedFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const panelErrors = useRef<Partial<Record<PanelKey, string>>>({});

  const publishErrors = useCallback(() => {
    const messages = Object.values(panelErrors.current).filter(Boolean);
    setError(messages.length > 0 ? messages.join(" · ") : null);
  }, []);

  const load = useCallback(
    async (fromValue: string, toValue: string) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      panelErrors.current = {};

      setLoadingIp(true);
      setLoadingReview(true);
      setLoadingRestricted(true);
      setRestrictedFailed(false);
      setError(null);
      if (fromValue && toValue && fromValue > toValue) {
        setSummary(null);
        setReviewSummary(null);
        setRestrictedSummary(null);
        setRestrictedFailed(false);
        setError("Start date must be before end date");
        setLoadingIp(false);
        setLoadingReview(false);
        setLoadingRestricted(false);
        activeRequest.current = null;
        return;
      }

      const from = dateInputToIsoStart(fromValue);
      const to = dateInputToIsoExclusiveEnd(toValue);
      const isCurrent = () =>
        !controller.signal.aborted && activeRequest.current === controller;

      let pending = 3;
      const onPanelSettled = () => {
        pending -= 1;
        if (pending === 0 && activeRequest.current === controller) {
          activeRequest.current = null;
        }
      };

      void adminFetchIpAddressClickSummary({
        from,
        to,
        signal: controller.signal,
      }).then((ipRes) => {
        if (!isCurrent()) return;
        if (ipRes.ok && ipRes.data) {
          setSummary(ipRes.data);
          delete panelErrors.current.ip;
        } else {
          setSummary(null);
          panelErrors.current.ip =
            ipRes.error ?? "Failed to load IP address click metrics";
        }
        publishErrors();
        setLoadingIp(false);
        onPanelSettled();
      });

      void adminFetchReviewPromptSummary({
        from,
        to,
        signal: controller.signal,
      }).then((reviewRes) => {
        if (!isCurrent()) return;
        if (reviewRes.ok && reviewRes.data) {
          setReviewSummary(reviewRes.data);
          delete panelErrors.current.review;
        } else {
          setReviewSummary(null);
          panelErrors.current.review =
            reviewRes.error ?? "Failed to load review prompt metrics";
        }
        publishErrors();
        setLoadingReview(false);
        onPanelSettled();
      });

      void adminFetchRestrictedNetworkDiagnosticSummary({
        from,
        to,
        signal: controller.signal,
      }).then((restrictedRes) => {
        if (!isCurrent()) return;
        if (restrictedRes.ok && restrictedRes.data) {
          setRestrictedSummary(restrictedRes.data);
          setRestrictedFailed(false);
          delete panelErrors.current.restricted;
        } else {
          setRestrictedSummary(null);
          setRestrictedFailed(true);
          panelErrors.current.restricted =
            restrictedRes.error ??
            "Failed to load restricted network diagnostics";
        }
        publishErrors();
        setLoadingRestricted(false);
        onPanelSettled();
      });
    },
    [publishErrors],
  );

  useEffect(() => {
    void load("", "");
    return () => activeRequest.current?.abort();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Product events</h2>
        <button
          type="button"
          onClick={() => void load(fromInput, toInput)}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">From</span>
          <input
            type="date"
            value={fromInput}
            onChange={(event) => setFromInput(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">To</span>
          <input
            type="date"
            value={toInput}
            onChange={(event) => setToInput(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load(fromInput, toInput)}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setFromInput("");
            setToInput("");
            void load("", "");
          }}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Clear
        </button>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">In-app review prompts</h3>
          <p className="text-sm text-muted-foreground">
            Users who connected on 3+ days with 3+ successful sessions and saw
            the review prompt.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Users prompted</p>
            <p className="mt-1 text-3xl font-semibold">
              {reviewSummary?.usersPrompted ?? (loadingReview ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Needs improvement</p>
            <p className="mt-1 text-3xl font-semibold">
              {reviewSummary?.needsImprovementSelected ??
                (loadingReview ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Feedback submitted</p>
            <p className="mt-1 text-3xl font-semibold">
              {reviewSummary?.feedbackSubmitted ?? (loadingReview ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Feedback conversion</p>
            <p className="mt-1 text-3xl font-semibold">
              {loadingReview
                ? "…"
                : formatPercent(reviewSummary?.feedbackConversionRate)}
            </p>
          </div>
        </div>

        <div
          className={`rounded-lg border p-4 text-sm ${
            loadingReview || !reviewSummary
              ? "border-border bg-muted/30"
              : reviewSummary.feedbackFormEnabled
                ? "border-border bg-muted/30"
                : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <p className="font-medium">
            Feedback form (live app setting):{" "}
            {loadingReview || !reviewSummary
              ? "…"
              : reviewSummary.feedbackFormEnabled
                ? "enabled"
                : "auto-disabled"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {loadingReview
              ? "Loading feedback form status…"
              : !reviewSummary
                ? "Review prompt metrics unavailable."
                : reviewSummary.feedbackFormEnabled
                  ? "Users who tap “Needs improvement” see the in-app feedback form."
                  : `No feedback submissions after ${reviewSummary.minSampleSize}+ “Needs improvement” taps in the last ${reviewSummary.feedbackFormWindowDays ?? 90} days. Apps hide the feedback form automatically.`}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {formatDateRange(reviewSummary?.from, reviewSummary?.to)} · Great:{" "}
          {reviewSummary?.accepted ?? (loadingReview ? "…" : 0)} · Later:{" "}
          {reviewSummary?.dismissed ?? (loadingReview ? "…" : 0)}
        </p>

        <BreakdownList
          title="Prompt events by platform"
          rows={reviewSummary?.byPlatform ?? []}
          loading={loadingReview}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">IP address link clicks</h3>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total clicks</p>
          <p className="mt-1 text-3xl font-semibold">
            {summary?.total ?? (loadingIp ? "…" : 0)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDateRange(summary?.from, summary?.to)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <BreakdownList
            title="By platform"
            rows={summary?.byPlatform ?? []}
            loading={loadingIp}
          />
          <BreakdownList
            title="By connection status"
            rows={summary?.byConnectionStatus ?? []}
            loading={loadingIp}
          />
          <BreakdownList
            title="Top server locations"
            rows={summary?.topServerLocations ?? []}
            loading={loadingIp}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">
            Restricted network diagnostics
          </h3>
          <p className="text-sm text-muted-foreground">
            Coarse Wi‑Fi conditions when VPN fails (airline / hotel / captive).
            No SSIDs are stored.
          </p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total diagnostics</p>
          <p className="mt-1 text-3xl font-semibold">
            {loadingRestricted
              ? "…"
              : restrictedFailed
                ? "—"
                : (restrictedSummary?.total ?? 0)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {restrictedFailed
              ? "Could not load diagnostics"
              : formatDateRange(restrictedSummary?.from, restrictedSummary?.to)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <BreakdownList
            title="By trigger"
            rows={restrictedSummary?.byTrigger ?? []}
            loading={loadingRestricted}
            failed={restrictedFailed}
          />
          <BreakdownList
            title="By connectivity result"
            rows={restrictedSummary?.byConnectivityResult ?? []}
            loading={loadingRestricted}
            failed={restrictedFailed}
          />
          <BreakdownList
            title="By Wi‑Fi security"
            rows={restrictedSummary?.byWifiSecurity ?? []}
            loading={loadingRestricted}
            failed={restrictedFailed}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownList
            title="By platform"
            rows={restrictedSummary?.byPlatform ?? []}
            loading={loadingRestricted}
            failed={restrictedFailed}
          />
          <BreakdownList
            title="By public hint"
            rows={restrictedSummary?.byPublicHint ?? []}
            loading={loadingRestricted}
            failed={restrictedFailed}
          />
        </div>
      </section>
    </div>
  );
}
