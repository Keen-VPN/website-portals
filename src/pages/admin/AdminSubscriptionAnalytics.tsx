import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  adminBackfillSubscriptionLifecycle,
  adminFetchFirstPaidCohortReport,
  adminFetchMonthlyRetentionReport,
  adminFetchMonthlyRevenueGrowthReport,
  type AdminFirstPaidCohortReport,
  type AdminMonthlyRetentionReport,
  type AdminMonthlyRevenueGrowthReport,
  type AdminSubscriptionAnalyticsSource,
  type AdminSubscriptionPlanType,
} from "@/auth/backend";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function currentUtcMonth() {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function monthLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Milliseconds until the next UTC month starts (plus a small buffer). */
function msUntilNextUtcMonthBoundary() {
  const now = Date.now();
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return Math.max(next - now, 0) + 50;
}

export default function AdminSubscriptionAnalytics() {
  const initial = useMemo(() => currentUtcMonth(), []);
  const [utcMonth, setUtcMonth] = useState(initial);
  const maxMonth = monthLabel(utcMonth.year, utcMonth.month);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  useEffect(() => {
    let timeoutId = 0;
    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        setUtcMonth(currentUtcMonth());
        schedule();
      }, Math.min(msUntilNextUtcMonthBoundary(), 2_000_000_000));
    };
    schedule();
    return () => window.clearTimeout(timeoutId);
  }, []);
  const [source, setSource] =
    useState<AdminSubscriptionAnalyticsSource>("all");
  const [planType, setPlanType] = useState<AdminSubscriptionPlanType>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retention, setRetention] = useState<AdminMonthlyRetentionReport | null>(
    null,
  );
  const [cohorts, setCohorts] = useState<AdminFirstPaidCohortReport | null>(
    null,
  );
  const [revenue, setRevenue] =
    useState<AdminMonthlyRevenueGrowthReport | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillNote, setBackfillNote] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadLatestRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    const params = {
      month,
      year,
      source,
      planType,
      signal: controller.signal,
    };
    const [r, c, rev] = await Promise.all([
      adminFetchMonthlyRetentionReport(params),
      adminFetchFirstPaidCohortReport(params),
      adminFetchMonthlyRevenueGrowthReport(params),
    ]);
    if (
      controller.signal.aborted ||
      generation !== loadGeneration.current
    ) {
      return;
    }
    if (r.aborted || c.aborted || rev.aborted) return;

    if (!r.ok || !r.data || !c.ok || !c.data || !rev.ok || !rev.data) {
      setError(
        r.error ??
          c.error ??
          rev.error ??
          "Failed to load analytics (incomplete response)",
      );
      setRetention(null);
      setCohorts(null);
      setRevenue(null);
      setLoading(false);
      return;
    }
    setRetention(r.data);
    setCohorts(c.data);
    setRevenue(rev.data);
    setLoading(false);
  }, [month, year, source, planType]);

  loadLatestRef.current = load;

  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current += 1;
      loadAbortRef.current?.abort();
    };
  }, [load]);

  const monthInputValue = monthLabel(year, month);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Retention &amp; revenue
          </h2>
          <p className="text-sm text-muted-foreground">
            Renewals, first-paid cohorts, and month-over-month revenue vs the
            10% growth target. Cancellation with remaining paid time is not
            counted as churn here — expirations are.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Month</span>
            <input
              type="month"
              max={maxMonth}
              className="rounded-md border border-border bg-background px-3 py-2"
              value={monthInputValue}
              onChange={(e) => {
                const match = /^(\d{4})-(\d{2})$/.exec(e.target.value);
                if (!match) return;
                const nextYear = Number(match[1]);
                const nextMonth = Number(match[2]);
                const now = currentUtcMonth();
                if (
                  nextYear > now.year ||
                  (nextYear === now.year && nextMonth > now.month)
                ) {
                  return;
                }
                setYear(nextYear);
                setMonth(nextMonth);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Billing source</span>
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={source}
              onChange={(e) =>
                setSource(e.target.value as AdminSubscriptionAnalyticsSource)
              }
            >
              <option value="all">All</option>
              <option value="stripe">Stripe</option>
              <option value="apple_iap">Apple</option>
              <option value="google_play">Google Play</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Plan type</span>
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={planType}
              onChange={(e) =>
                setPlanType(e.target.value as AdminSubscriptionPlanType)
              }
            >
              <option value="all">All</option>
              <option value="individual">Individual</option>
              <option value="business">Business</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={backfilling}
            onClick={() => {
              void (async () => {
                setBackfilling(true);
                setBackfillNote(null);
                const res = await adminBackfillSubscriptionLifecycle({
                  limit: 2000,
                });
                setBackfilling(false);
                if (!res.ok) {
                  setBackfillNote(res.error ?? "Backfill failed");
                  return;
                }
                setBackfillNote(
                  `Backfill: scanned ${res.scanned ?? 0}, created ${res.created ?? 0}, skipped ${res.skipped ?? 0}`,
                );
                await loadLatestRef.current();
              })();
            }}
          >
            {backfilling ? "Backfilling…" : "Backfill history"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Where to look: </span>
        Signups → weekly report /{" "}
        <Link className="underline" to="/admin/churn">
          Churn (weekly)
        </Link>
        . Trials → Churn monthly trial drop-offs. Repeat purchase (renewals) +
        paid churn (expirations) → this page. Per-user signup / trial / renewals
        / churn → Admin user profile. Cancel-with-time-left is &quot;Cancel
        requested&quot;, not churn.
      </p>

      {backfillNote ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          {backfillNote}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Revenue growth (10% MoM target)</CardTitle>
          <CardDescription>
            Recognized paid revenue (initial purchase + renewals − refunds /
            chargebacks).
            {revenue?.isPartialMonth
              ? " Current month is partial (in progress)."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="This month"
            value={revenue ? money(revenue.currentMonthRevenue) : "—"}
            loading={loading}
          />
          <Metric
            label="Previous month"
            value={revenue ? money(revenue.previousMonthRevenue) : "—"}
            loading={loading}
          />
          <Metric
            label="MoM growth"
            value={revenue ? pct(revenue.momGrowthPercent) : "—"}
            loading={loading}
            hint={
              revenue?.absoluteChange != null
                ? money(revenue.absoluteChange)
                : undefined
            }
          />
          <Metric
            label="Vs 10% target"
            value={
              revenue?.aboveTarget == null
                ? "—"
                : revenue.aboveTarget
                  ? `Above (${pct(revenue.differenceFromTargetPercent)})`
                  : `Below (${pct(revenue.differenceFromTargetPercent)})`
            }
            loading={loading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention (month)</CardTitle>
          <CardDescription>
            {retention?.monthRangeLabel ?? monthInputValue}
            {retention?.isPartialMonth ? " · partial month" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Active paid (start)"
            value={retention ? String(retention.activePaidUsers) : "—"}
            loading={loading}
          />
          <Metric
            label="Renewals"
            value={
              retention
                ? `${retention.renewals} (${pct(retention.renewalRate)})`
                : "—"
            }
            loading={loading}
          />
          <Metric
            label="Expired (churn)"
            value={
              retention
                ? `${retention.churnedSubscriptions} (${pct(retention.churnRate)})`
                : "—"
            }
            loading={loading}
          />
          <Metric
            label="Reactivations"
            value={retention ? String(retention.reactivations) : "—"}
            loading={loading}
          />
          <Metric
            label="Cancel requested"
            value={retention ? String(retention.cancellationsRequested) : "—"}
            loading={loading}
          />
          <Metric
            label="Payment failures"
            value={retention ? String(retention.paymentFailures) : "—"}
            loading={loading}
          />
          <Metric
            label="Refunds"
            value={retention ? String(retention.refunds) : "—"}
            loading={loading}
          />
          <Metric
            label="Initial purchases"
            value={retention ? String(retention.initialPurchases) : "—"}
            loading={loading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>First-paid month cohorts</CardTitle>
          <CardDescription>
            Retention as of {cohorts?.asOfMonthLabel ?? monthInputValue} by the
            month the subscriber first paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">First paid month</th>
                <th className="pb-2 pr-4 font-medium text-right">Cohort size</th>
                <th className="pb-2 pr-4 font-medium text-right">Still active</th>
                <th className="pb-2 font-medium text-right">Retention</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-4 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !cohorts?.cohorts.length ? (
                <tr>
                  <td colSpan={4} className="py-4 text-muted-foreground">
                    No first-paid cohort events yet. Run Backfill history or wait
                    for new webhooks.
                  </td>
                </tr>
              ) : (
                cohorts.cohorts.map((row) => (
                  <tr
                    key={row.firstPaidMonth}
                    className="border-t border-border/60"
                  >
                    <td className="py-2 pr-4">{row.firstPaidMonth}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.cohortSize}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.retainedInMonth}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {pct(row.retentionRate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
  hint,
}: {
  label: string;
  value: string;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {loading ? "…" : value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
