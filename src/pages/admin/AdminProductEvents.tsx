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
}: {
  title: string;
  rows: { label: string; count: number }[];
  loading: boolean;
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
        {!loading && rows.length === 0 ? (
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

export default function AdminProductEvents() {
  const [summary, setSummary] = useState<AdminIpAddressClickSummary | null>(
    null,
  );
  const [reviewSummary, setReviewSummary] =
    useState<AdminReviewPromptSummary | null>(null);
  const [restrictedSummary, setRestrictedSummary] =
    useState<AdminRestrictedNetworkDiagnosticSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (fromValue: string, toValue: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    setLoading(true);
    setError(null);
    if (fromValue && toValue && fromValue > toValue) {
      setSummary(null);
      setReviewSummary(null);
      setRestrictedSummary(null);
      setError("Start date must be before end date");
      setLoading(false);
      activeRequest.current = null;
      return;
    }

    const from = dateInputToIsoStart(fromValue);
    const to = dateInputToIsoExclusiveEnd(toValue);
    const [ipRes, reviewRes, restrictedRes] = await Promise.all([
      adminFetchIpAddressClickSummary({ from, to, signal: controller.signal }),
      adminFetchReviewPromptSummary({ from, to, signal: controller.signal }),
      adminFetchRestrictedNetworkDiagnosticSummary({
        from,
        to,
        signal: controller.signal,
      }),
    ]);

    if (controller.signal.aborted || activeRequest.current !== controller) {
      return;
    }

    const errors: string[] = [];

    if (ipRes.ok && ipRes.data) {
      setSummary(ipRes.data);
    } else {
      setSummary(null);
      errors.push(
        ipRes.error ?? "Failed to load IP address click metrics",
      );
    }

    if (reviewRes.ok && reviewRes.data) {
      setReviewSummary(reviewRes.data);
    } else {
      setReviewSummary(null);
      errors.push(
        reviewRes.error ?? "Failed to load review prompt metrics",
      );
    }

    if (restrictedRes.ok && restrictedRes.data) {
      setRestrictedSummary(restrictedRes.data);
    } else {
      setRestrictedSummary(null);
      errors.push(
        restrictedRes.error ??
          "Failed to load restricted network diagnostics",
      );
    }

    setError(errors.length > 0 ? errors.join(" · ") : null);
    setLoading(false);
    activeRequest.current = null;
  }, []);

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
              {reviewSummary?.usersPrompted ?? (loading ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Needs improvement</p>
            <p className="mt-1 text-3xl font-semibold">
              {reviewSummary?.needsImprovementSelected ?? (loading ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Feedback submitted</p>
            <p className="mt-1 text-3xl font-semibold">
              {reviewSummary?.feedbackSubmitted ?? (loading ? "…" : 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Feedback conversion</p>
            <p className="mt-1 text-3xl font-semibold">
              {loading ? "…" : formatPercent(reviewSummary?.feedbackConversionRate)}
            </p>
          </div>
        </div>

        <div
          className={`rounded-lg border p-4 text-sm ${
            loading || !reviewSummary
              ? "border-border bg-muted/30"
              : reviewSummary.feedbackFormEnabled
                ? "border-border bg-muted/30"
                : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <p className="font-medium">
            Feedback form (live app setting):{" "}
            {loading || !reviewSummary
              ? "…"
              : reviewSummary.feedbackFormEnabled
                ? "enabled"
                : "auto-disabled"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {loading
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
          {reviewSummary?.accepted ?? (loading ? "…" : 0)} · Later:{" "}
          {reviewSummary?.dismissed ?? (loading ? "…" : 0)}
        </p>

        <BreakdownList
          title="Prompt events by platform"
          rows={reviewSummary?.byPlatform ?? []}
          loading={loading}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">IP address link clicks</h3>
        </div>

        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total clicks</p>
          <p className="mt-1 text-3xl font-semibold">
            {summary?.total ?? (loading ? "…" : 0)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDateRange(summary?.from, summary?.to)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <BreakdownList
            title="By platform"
            rows={summary?.byPlatform ?? []}
            loading={loading}
          />
          <BreakdownList
            title="By connection status"
            rows={summary?.byConnectionStatus ?? []}
            loading={loading}
          />
          <BreakdownList
            title="Top server locations"
            rows={summary?.topServerLocations ?? []}
            loading={loading}
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
            {restrictedSummary?.total ?? (loading ? "…" : 0)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDateRange(restrictedSummary?.from, restrictedSummary?.to)}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <BreakdownList
            title="By trigger"
            rows={restrictedSummary?.byTrigger ?? []}
            loading={loading}
          />
          <BreakdownList
            title="By connectivity result"
            rows={restrictedSummary?.byConnectivityResult ?? []}
            loading={loading}
          />
          <BreakdownList
            title="By Wi‑Fi security"
            rows={restrictedSummary?.byWifiSecurity ?? []}
            loading={loading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownList
            title="By platform"
            rows={restrictedSummary?.byPlatform ?? []}
            loading={loading}
          />
          <BreakdownList
            title="By public hint"
            rows={restrictedSummary?.byPublicHint ?? []}
            loading={loading}
          />
        </div>
      </section>
    </div>
  );
}
