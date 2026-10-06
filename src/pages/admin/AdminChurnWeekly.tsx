import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminFetchWeeklyChurnReport,
  adminFetchWeeklyChurnTrend,
  adminFetchWeeklySessionKpis,
  type AdminChurnSubscriptionSource,
  type AdminWeeklyChurnReport,
  type AdminWeeklyChurnTrendReport,
  type AdminWeeklySessionKpiReport,
} from "@/auth/backend";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  compareIsoWeek,
  currentIsoWeek,
  parseWeekInput,
  trendWindowEnd,
  trendWindowStart,
} from "@/lib/iso-week";

function formatWeeklyActiveUsersValue(
  engagement: AdminWeeklySessionKpiReport["summary"] | undefined,
): string {
  if (!engagement) return "—";
  return String(engagement.active_users);
}

function formatSignedInteger(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatWeeklyActiveUsersSubtitle(
  engagement: AdminWeeklySessionKpiReport["summary"] | undefined,
): string {
  if (!engagement) {
    return "Unavailable — engagement data failed to load";
  }
  if (
    engagement.active_users_vpn_only != null &&
    engagement.active_users_perk_only != null &&
    engagement.active_users_vpn_and_perk != null
  ) {
    return `${engagement.active_users_vpn_only} VPN only · ${engagement.active_users_perk_only} perk only · ${engagement.active_users_vpn_and_perk} both`;
  }
  return "Breakdown unavailable for this week";
}

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function friendlyProvider(raw: string): string {
  switch (raw.toLowerCase()) {
    case "stripe":
      return "Stripe";
    case "apple_iap":
      return "Apple";
    case "google_play":
      return "Google Play";
    default:
      return raw;
  }
}

function sourceBillingActiveTotal(
  report: AdminWeeklyChurnReport | null,
): number | null {
  if (!report?.bySubscriptionSource?.length) return null;
  const withBillingActive = report.bySubscriptionSource.filter(
    (row) => typeof row.billingActiveAtWeekStart === "number",
  );
  if (withBillingActive.length === 0) return null;
  return withBillingActive.reduce(
    (sum, row) => sum + (row.billingActiveAtWeekStart as number),
    0,
  );
}

function sourceBillingActiveDetail(
  report: AdminWeeklyChurnReport | null,
): string | undefined {
  if (!report?.bySubscriptionSource?.length) return undefined;
  if (
    !report.bySubscriptionSource.some(
      (row) => typeof row.billingActiveAtWeekStart === "number",
    )
  ) {
    return undefined;
  }
  return report.bySubscriptionSource
    .map((row) => {
      const count =
        typeof row.billingActiveAtWeekStart === "number"
          ? String(row.billingActiveAtWeekStart)
          : "—";
      return `${friendlyProvider(row.subscriptionType)} ${count}`;
    })
    .join(" · ");
}

function friendlyClientPlatform(raw: string): { label: string; hint?: string } {
  switch (raw.toLowerCase()) {
    case "macos":
      return { label: "macOS" };
    case "ios":
      return { label: "iOS" };
    case "no_vpn_sessions":
      return {
        label: "No VPN sessions",
        hint: "No qualifying VPN sessions in the prior 90 days",
      };
    case "other_platform":
      return {
        label: "Other / unrecognized",
        hint: "Had sessions, but not mostly iOS or macOS",
      };
    case "unknown":
      return {
        label: "No VPN sessions",
        hint: "Legacy bucket — no qualifying VPN sessions in the prior 90 days",
      };
    default:
      return { label: raw };
  }
}

type ChurnTrendMetric = "churned" | "auto_renew_off" | "expirations";

const CHURN_TREND_METRICS: {
  value: ChurnTrendMetric;
  label: string;
  dataKey: "churnRate" | "autoRenewDisabledRate" | "subscriptionExpirationsRate";
  color: string;
}[] = [
  {
    value: "churned",
    label: "Churned",
    dataKey: "churnRate",
    color: "hsl(var(--destructive))",
  },
  {
    value: "auto_renew_off",
    label: "Auto-renew off",
    dataKey: "autoRenewDisabledRate",
    color: "hsl(var(--primary))",
  },
  {
    value: "expirations",
    label: "Expirations",
    dataKey: "subscriptionExpirationsRate",
    color: "hsl(var(--chart-2))",
  },
];

const SOURCE_OPTIONS: { value: AdminChurnSubscriptionSource; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "stripe", label: "Stripe" },
  { value: "apple_iap", label: "Apple" },
  { value: "google_play", label: "Google Play" },
];

export default function AdminChurnWeekly() {
  const initial = currentIsoWeek();
  const [isoYear, setIsoYear] = useState(initial.isoYear);
  const [isoWeek, setIsoWeek] = useState(initial.isoWeek);
  const [source, setSource] = useState<AdminChurnSubscriptionSource>("all");
  const [trendMetric, setTrendMetric] = useState<ChurnTrendMetric>("churned");
  const [report, setReport] = useState<AdminWeeklyChurnReport | null>(null);
  const [engagement, setEngagement] =
    useState<AdminWeeklySessionKpiReport | null>(null);
  const [trend, setTrend] = useState<AdminWeeklyChurnTrendReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engagementWarning, setEngagementWarning] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  const load = useCallback(
    async (
      targetYear: number,
      targetWeek: number,
      targetSource: AdminChurnSubscriptionSource,
    ) => {
      const generation = ++loadGeneration.current;

      setLoading(true);
      setError(null);
      setEngagementWarning(null);
      setReport(null);
      setEngagement(null);
      setTrend(null);

      const from = trendWindowStart(targetYear, targetWeek, 8);
      const to = trendWindowEnd(targetYear, targetWeek);

      const [reportRes, trendRes, engagementRes] = await Promise.all([
        adminFetchWeeklyChurnReport({
          year: targetYear,
          week: targetWeek,
          source: targetSource,
        }),
        adminFetchWeeklyChurnTrend({ from, to, source: targetSource }),
        adminFetchWeeklySessionKpis({
          year: targetYear,
          week: targetWeek,
          minDurationSeconds: 10,
        }),
      ]);

      if (generation !== loadGeneration.current) {
        return;
      }

      if (!reportRes.ok || !reportRes.data) {
        setReport(null);
        setEngagement(null);
        setTrend(null);
        setError(reportRes.error ?? "Failed to load weekly churn report");
        setLoading(false);
        return;
      }

      setReport(reportRes.data);
      if (engagementRes.ok && engagementRes.data) {
        setEngagement(engagementRes.data);
      } else {
        setEngagement(null);
        setEngagementWarning(
          engagementRes.error ?? "Weekly active users unavailable for this week",
        );
      }
      if (trendRes.ok && trendRes.data) {
        setTrend(trendRes.data);
      } else {
        setTrend(null);
        if (!trendRes.ok) {
          setError(trendRes.error ?? "Failed to load weekly churn trend");
        }
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    void load(isoYear, isoWeek, source);
    return () => {
      loadGeneration.current += 1;
    };
  }, [load, isoYear, isoWeek, source]);

  const chartRows = useMemo(
    () =>
      (trend?.points ?? []).map((p) => ({
        label: p.weekLabel,
        churnRate: p.churnRate,
        autoRenewDisabledRate: p.autoRenewDisabledRate,
        subscriptionExpirationsRate: p.subscriptionExpirationsRate,
      })),
    [trend],
  );

  const selectedTrendMetric = CHURN_TREND_METRICS.find(
    (option) => option.value === trendMetric,
  ) ?? CHURN_TREND_METRICS[0];

  const trendChartConfig = useMemo(
    () =>
      ({
        [selectedTrendMetric.dataKey]: {
          label: `${selectedTrendMetric.label} %`,
          color: selectedTrendMetric.color,
        },
      }) satisfies ChartConfig,
    [selectedTrendMetric],
  );

  const weekInputValue = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Weekly churn</h3>
          <p className="text-sm text-muted-foreground">
            ISO week (Monday UTC). Churn = subscribers lost this week (cancellations
            + account deletions) ÷ active at week start. Users who switch billing
            source are not counted as churned. Weekly active users = VPN session or
            perk click (breakdown sums to the total). Internal test accounts are
            excluded.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Report week</span>
            <input
              type="week"
              max={initial.label}
              className="rounded-md border border-border bg-background px-3 py-2"
              value={weekInputValue}
              onChange={(e) => {
                const parsed = parseWeekInput(e.target.value);
                if (!parsed) return;
                if (compareIsoWeek(parsed, initial) > 0) return;
                setIsoYear(parsed.isoYear);
                setIsoWeek(parsed.isoWeek);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Subscription source</span>
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={source}
              onChange={(e) =>
                setSource(e.target.value as AdminChurnSubscriptionSource)
              }
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void load(isoYear, isoWeek, source)}
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

      {engagementWarning ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {engagementWarning}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="Billing-active (store cross-check)"
          value={
            report
              ? String(sourceBillingActiveTotal(report) ?? "—")
              : "—"
          }
          subtitle={
            report
              ? `status=active only · Stripe/Apple/Google · ${report.weekRangeLabel}`
              : "status=active only — compare to Stripe/ASC/Play"
          }
          detail={sourceBillingActiveDetail(report)}
          loading={loading}
        />
        <SummaryCard
          title="All DB entitlements at start"
          value={report ? String(report.startOfWeekActiveUsers) : "—"}
          subtitle={
            report &&
            report.startOfWeekPaidUsers != null &&
            report.startOfWeekTrialUsers != null
              ? `${report.startOfWeekPaidUsers} paid · ${report.startOfWeekTrialUsers} trial (includes past_due) · ${report.weekRangeLabel}`
              : (report?.weekRangeLabel ?? weekInputValue)
          }
          loading={loading}
        />
        <SummaryCard
          title="Weekly active users"
          value={formatWeeklyActiveUsersValue(engagement?.summary)}
          subtitle={formatWeeklyActiveUsersSubtitle(engagement?.summary)}
          detail={
            source !== "all"
              ? `All users (not filtered by ${sourceFilterLabel(source)}) · ${report?.weekRangeLabel ?? weekInputValue}`
              : (engagement?.summary.week_range_label ??
                report?.weekRangeLabel ??
                weekInputValue)
          }
          loading={loading}
          delta={
            engagement?.week_over_week
              ? formatSignedInteger(engagement.week_over_week.delta_active_users)
              : undefined
          }
        />
        <SummaryCard
          title="Weekly churn"
          value={report ? `${report.churned} (${pct(report.churnRate)})` : "—"}
          subtitle={
            report
              ? report.churnedPaidUsers != null && report.churnedTrialUsers != null
                ? `Lost: ${report.churnedPaidUsers} paid, ${report.churnedTrialUsers} trial (${report.churnedFromCancellation} cancelled, ${report.accountsDeleted} deleted)`
                : `Lost this week: ${report.churnedFromCancellation} cancelled, ${report.accountsDeleted} deleted account${report.accountsDeleted === 1 ? "" : "s"}`
              : "Subscribers lost this week"
          }
          loading={loading}
        />
        <SummaryCard
          title="Auto-renew disabled"
          value={
            report
              ? `${report.autoRenewDisabled} (${pct(report.autoRenewDisabledRate)})`
              : "—"
          }
          subtitle="Turned off auto-renewal this week"
          loading={loading}
        />
        <SummaryCard
          title="Subscription expirations"
          value={
            report
              ? `${report.subscriptionExpirations} (${pct(report.subscriptionExpirationsRate)})`
              : "—"
          }
          subtitle="Period ended without renewal"
          loading={loading}
        />
      </div>

      {!loading && report && report.bySubscriptionStatus && report.bySubscriptionStatus.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Churn by subscription status</CardTitle>
            <CardDescription>Paid vs free trial at week start.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium text-right">Active (start)</th>
                  <th className="pb-2 pr-4 font-medium text-right">Churned</th>
                  <th className="pb-2 pr-4 font-medium text-right">Churn %</th>
                  <th className="pb-2 pr-4 font-medium text-right">Auto-renew off</th>
                  <th className="pb-2 font-medium text-right">Expirations</th>
                </tr>
              </thead>
              <tbody>
                {report.bySubscriptionStatus.map((row) => (
                  <tr
                    key={row.subscriptionStatus}
                    className="border-t border-border/60"
                  >
                    <td className="py-2 pr-4 capitalize">{row.subscriptionStatus}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.activeAtWeekStart}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.churned}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {pct(row.churnRate)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.autoRenewDisabled}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.subscriptionExpirations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {!loading && report && source === "all" && report.bySubscriptionSource.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Churn by subscription source</CardTitle>
            <CardDescription>
              Use <span className="font-medium">Billing-active</span> to
              cross-check Stripe Active / App Store Active Paid / Play
              subscribers. Entitlements include trial and past_due.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium text-right">
                    Billing-active
                  </th>
                  <th className="pb-2 pr-4 font-medium text-right">Paid</th>
                  <th className="pb-2 pr-4 font-medium text-right">Trial</th>
                  <th className="pb-2 pr-4 font-medium text-right">
                    Entitlements
                  </th>
                  <th className="pb-2 pr-4 font-medium text-right">Churned</th>
                  <th className="pb-2 pr-4 font-medium text-right">Churn %</th>
                  <th className="pb-2 pr-4 font-medium text-right">Auto-renew off</th>
                  <th className="pb-2 font-medium text-right">Expirations</th>
                </tr>
              </thead>
              <tbody>
                {report.bySubscriptionSource.map((row) => (
                  <tr
                    key={row.subscriptionType}
                    className="border-t border-border/60"
                  >
                    <td className="py-2 pr-4">
                      {friendlyProvider(row.subscriptionType)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium">
                      {row.billingActiveAtWeekStart ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.paidAtWeekStart ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.trialAtWeekStart ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.activeAtWeekStart}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.churned}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {pct(row.churnRate)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.autoRenewDisabled}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.subscriptionExpirations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {!loading && report && report.byClientPlatform.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Churn by client platform</CardTitle>
            <CardDescription>
              Primary VPN app used in the 90 days before week end. &quot;No VPN
              sessions&quot; means the subscriber had no recorded VPN connections in
              that window (not the same as account deletion).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Platform</th>
                  <th className="pb-2 pr-4 font-medium text-right">Churned</th>
                  <th className="pb-2 pr-4 font-medium text-right">Auto-renew off</th>
                  <th className="pb-2 font-medium text-right">Expirations</th>
                </tr>
              </thead>
              <tbody>
                {report.byClientPlatform.map((row) => (
                  <tr
                    key={row.clientPlatform}
                    className="border-t border-border/60"
                  >
                    <td className="py-2 pr-4">
                      {(() => {
                        const platform = friendlyClientPlatform(row.clientPlatform);
                        return (
                          <div>
                            <span>{platform.label}</span>
                            {platform.hint ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {platform.hint}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.churned}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.autoRenewDisabled}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.subscriptionExpirations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>8-week trend</CardTitle>
            <CardDescription>
              {selectedTrendMetric.label} as % of active subscribers at week
              start.
            </CardDescription>
          </div>
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-border p-1"
            role="group"
            aria-label="Trend metric"
          >
            {CHURN_TREND_METRICS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={trendMetric === option.value ? "default" : "ghost"}
                className="h-8"
                aria-pressed={trendMetric === option.value}
                onClick={() => setTrendMetric(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading trend…</p>
          ) : chartRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trend data for this window.</p>
          ) : (
            <ChartContainer config={trendChartConfig} className="h-[320px] w-full">
              <LineChart data={chartRows} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey={selectedTrendMetric.dataKey}
                  stroke={`var(--color-${selectedTrendMetric.dataKey})`}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  loading,
  detail,
  delta,
}: {
  title: string;
  value: string;
  subtitle: string;
  loading: boolean;
  detail?: string;
  delta?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {loading ? "…" : value}
          {!loading && delta ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({delta} WoW)
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
