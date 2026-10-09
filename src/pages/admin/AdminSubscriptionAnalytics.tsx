import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
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

export default function AdminSubscriptionAnalytics() {
  const initial = useMemo(() => currentUtcMonth(), []);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = { month, year, source, planType };
    const [r, c, rev] = await Promise.all([
      adminFetchMonthlyRetentionReport(params),
      adminFetchFirstPaidCohortReport(params),
      adminFetchMonthlyRevenueGrowthReport(params),
    ]);
    if (!r.ok || !c.ok || !rev.ok) {
      setError(r.error ?? c.error ?? rev.error ?? "Failed to load analytics");
      setRetention(null);
      setCohorts(null);
      setRevenue(null);
      setLoading(false);
      return;
    }
    setRetention(r.data ?? null);
    setCohorts(c.data ?? null);
    setRevenue(rev.data ?? null);
    setLoading(false);
  }, [month, year, source, planType]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

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
              className="rounded-md border border-border bg-background px-3 py-2"
              value={monthInputValue}
              onChange={(e) => {
                const match = /^(\d{4})-(\d{2})$/.exec(e.target.value);
                if (!match) return;
                setYear(Number(match[1]));
                setMonth(Number(match[2]));
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
        </div>
      </div>

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
                    No first-paid cohort events yet (events start after deploy /
                    new webhooks).
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
