import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminFetchJiraDeliveryReport,
  adminFetchJiraPointsSinceReport,
  type AdminJiraDeliveryReport,
  type AdminJiraPointsSinceReport,
} from "@/auth/backend";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calendarDateInUtcPlus1,
  monthKeyUtcPlus1,
  projectMonthEndFromMtd,
} from "@/lib/jira-delivery-run-rate";

const RP_FILTER_ALL = "__all__";
const RP_OPTION_PREFIX = "rp:";

function encodeRpSelectValue(displayName: string): string {
  return `${RP_OPTION_PREFIX}${encodeURIComponent(displayName)}`;
}

function decodeRpSelectValue(value: string): string | null {
  if (!value.startsWith(RP_OPTION_PREFIX)) return null;
  try {
    return decodeURIComponent(value.slice(RP_OPTION_PREFIX.length));
  } catch {
    return null;
  }
}

function defaultMeetingSinceLocal(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatResolvedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function currentMonthYear(): {
  month: number;
  year: number;
  label: string;
} {
  const { year, month } = calendarDateInUtcPlus1();
  return {
    month,
    year,
    label: monthKeyUtcPlus1({ year, month }),
  };
}

function isFutureMonth(month: number, year: number, max: { month: number; year: number }) {
  return year > max.year || (year === max.year && month > max.month);
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

const trendChartConfig = {
  totalPoints: {
    label: "Actual MTD",
    color: "hsl(var(--primary))",
  },
  projectedPoints: {
    label: "2× MTD projection",
    color: "hsl(38 90% 45%)",
  },
} satisfies ChartConfig;

export default function AdminJiraDelivery() {
  const initial = currentMonthYear();
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [report, setReport] = useState<AdminJiraDeliveryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rpFilterApplied, setRpFilterApplied] = useState("");
  const [rpDirectoryNames, setRpDirectoryNames] = useState<string[]>([]);
  const [pointsSinceOpen, setPointsSinceOpen] = useState(false);
  const [meetingSinceLocal, setMeetingSinceLocal] = useState(
    defaultMeetingSinceLocal,
  );
  const [pointsSinceReport, setPointsSinceReport] =
    useState<AdminJiraPointsSinceReport | null>(null);
  const [pointsSinceLoading, setPointsSinceLoading] = useState(false);
  const [pointsSinceError, setPointsSinceError] = useState<string | null>(null);
  const [asOfDay, setAsOfDay] = useState(() => calendarDateInUtcPlus1());
  const loadGeneration = useRef(0);
  const pointsSinceGeneration = useRef(0);
  const skipMeetingClearOnce = useRef(false);
  const loadPointsSinceRef = useRef<() => Promise<void>>(async () => {});
  const asOfReloadRef = useRef<{
    month: number;
    year: number;
    rp: string;
    load: (
      targetMonth: number,
      targetYear: number,
      options?: { preserveOnError?: boolean; rp?: string },
    ) => Promise<void>;
  } | null>(null);

  const load = useCallback(
    async (
      targetMonth: number,
      targetYear: number,
      options?: { preserveOnError?: boolean; rp?: string },
    ) => {
      const generation = ++loadGeneration.current;
      setLoading(true);
      setError(null);
      if (!options?.preserveOnError) {
        // Month change: drop stale totals so we don't show last month under a new label.
        setReport(null);
      }

      const res = await adminFetchJiraDeliveryReport({
        month: targetMonth,
        year: targetYear,
        rp: options?.rp?.trim() || undefined,
      });

      if (generation !== loadGeneration.current) return;

      if (!res.ok || !res.data) {
        if (!options?.preserveOnError) {
          setReport(null);
        }
        setError(res.error ?? "Failed to load Jira delivery report");
        setLoading(false);
        return;
      }

      setReport(res.data);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    void load(month, year, { rp: rpFilterApplied });
    return () => {
      loadGeneration.current += 1;
    };
  }, [load, month, year, rpFilterApplied]);

  asOfReloadRef.current = {
    month,
    year,
    rp: rpFilterApplied,
    load,
  };

  // Advance projection day after midnight / focus.
  useEffect(() => {
    const refreshAsOfDay = () => {
      const next = calendarDateInUtcPlus1();
      setAsOfDay((prev) =>
        prev.year === next.year &&
        prev.month === next.month &&
        prev.day === next.day
          ? prev
          : next,
      );
    };
    const id = window.setInterval(refreshAsOfDay, 60_000);
    window.addEventListener("focus", refreshAsOfDay);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshAsOfDay);
    };
  }, []);

  // When the calendar day rolls, reload MTD so projected EOM is not based on
  // yesterday's totalPoints with today's day denominator. Only needed while
  // viewing the current UTC+1 month (projection is hidden for past months).
  const asOfDayReady = useRef(false);
  useEffect(() => {
    if (!asOfDayReady.current) {
      asOfDayReady.current = true;
      return;
    }
    const args = asOfReloadRef.current;
    if (!args) return;
    if (args.month !== asOfDay.month || args.year !== asOfDay.year) return;
    void args.load(args.month, args.year, {
      // Clear stale totals if refresh fails so we don't project with a new day
      // denominator on yesterday's MTD.
      preserveOnError: false,
      rp: args.rp || undefined,
    });
  }, [asOfDay]);

  useEffect(() => {
    if (!report || rpFilterApplied) return;
    const names = [
      ...new Set(
        report.byRp
          .map((row) => row.assigneeDisplayName.trim())
          .filter((name) => name.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b));
    setRpDirectoryNames(names);
  }, [report, rpFilterApplied]);

  const rpSelectOptions = useMemo(() => {
    const names = [...rpDirectoryNames];
    if (
      rpFilterApplied &&
      !names.some(
        (name) => name.toLowerCase() === rpFilterApplied.toLowerCase(),
      )
    ) {
      names.push(rpFilterApplied);
      names.sort((a, b) => a.localeCompare(b));
    }
    return names;
  }, [rpDirectoryNames, rpFilterApplied]);

  const loadPointsSince = useCallback(async () => {
    const generation = ++pointsSinceGeneration.current;
    const since = new Date(meetingSinceLocal);
    if (Number.isNaN(since.getTime())) {
      setPointsSinceError("Enter a valid meeting date and time.");
      setPointsSinceReport(null);
      setPointsSinceLoading(false);
      return;
    }
    const sinceIso = since.toISOString();
    setPointsSinceLoading(true);
    setPointsSinceError(null);

    const res = await adminFetchJiraPointsSinceReport({ since: sinceIso });

    if (generation !== pointsSinceGeneration.current) return;

    if (!res.ok || !res.data) {
      setPointsSinceError(res.error ?? "Failed to load report");
      setPointsSinceLoading(false);
      return;
    }
    if (res.data.since !== sinceIso) {
      setPointsSinceLoading(false);
      return;
    }
    setPointsSinceReport(res.data);
    setPointsSinceLoading(false);
  }, [meetingSinceLocal]);

  loadPointsSinceRef.current = loadPointsSince;

  useEffect(() => {
    if (!pointsSinceOpen) {
      skipMeetingClearOnce.current = false;
      return;
    }
    skipMeetingClearOnce.current = true;
    void loadPointsSinceRef.current();
  }, [pointsSinceOpen]);

  useEffect(() => {
    if (!pointsSinceOpen) return;
    if (skipMeetingClearOnce.current) {
      skipMeetingClearOnce.current = false;
      return;
    }
    pointsSinceGeneration.current += 1;
    setPointsSinceReport(null);
    setPointsSinceError(null);
    setPointsSinceLoading(false);
  }, [meetingSinceLocal, pointsSinceOpen]);

  const viewingCurrentMonth =
    report?.month === monthKeyUtcPlus1(asOfDay);
  const dailyActualsAvailable = (report?.dailyActuals?.length ?? 0) > 0;

  const chartRows = useMemo(() => {
    if (!report) return [];

    const projectedEom = viewingCurrentMonth
      ? projectMonthEndFromMtd(report.totalPoints)
      : null;
    const allDailyActuals = report.dailyActuals ?? [];
    let visibleActuals = viewingCurrentMonth
      ? allDailyActuals.filter((point) => point.day <= asOfDay.day)
      : allDailyActuals;

    // The new backend returns a dense row for every day, but synthesize today
    // while rolling out or if a future producer returns activity days only.
    if (
      viewingCurrentMonth &&
      visibleActuals[visibleActuals.length - 1]?.day !== asOfDay.day
    ) {
      visibleActuals = [
        ...visibleActuals.filter((point) => point.day < asOfDay.day),
        { day: asOfDay.day, totalPoints: report.totalPoints },
      ];
    }

    const rows: {
      label: string;
      totalPoints: number | null;
      projectedPoints: number | null;
    }[] = visibleActuals.map((point, index) => ({
      label: String(point.day),
      totalPoints: point.totalPoints,
      // Dotted series starts at today's MTD actual.
      projectedPoints:
        viewingCurrentMonth && index === visibleActuals.length - 1
          ? point.totalPoints
          : null,
    }));

    if (viewingCurrentMonth && projectedEom != null) {
      rows.push({
        label: "Month end",
        totalPoints: null,
        projectedPoints: projectedEom,
      });
    }

    return rows;
  }, [report, asOfDay, viewingCurrentMonth]);

  const monthInputValue = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Jira story point delivery
          </h2>
          <p className="text-sm text-muted-foreground">
            Completed story points by month, assignee (RP), and environment
            label. Counted once when a story reaches Done. Tickets without an
            estimate count as 1 point. Kenna&apos;s total is story estimates on
            tickets where he is the{" "}
            <span className="font-medium text-foreground">Reporter</span>{" "}
            (created that month, any status), separate from Done-by-RP.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setPointsSinceOpen(true)}
          >
            Points since last meeting
          </Button>
          <label className="text-sm text-muted-foreground" htmlFor="jira-rp">
            RP filter
          </label>
          <Select
            value={
              rpFilterApplied
                ? encodeRpSelectValue(rpFilterApplied)
                : RP_FILTER_ALL
            }
            onValueChange={(value) => {
              if (value === RP_FILTER_ALL) {
                setRpFilterApplied("");
                return;
              }
              const name = decodeRpSelectValue(value);
              setRpFilterApplied(name ?? "");
            }}
          >
            <SelectTrigger id="jira-rp" className="h-9 w-[11rem]">
              <SelectValue placeholder="All RPs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RP_FILTER_ALL}>All RPs</SelectItem>
              {rpSelectOptions.map((name) => (
                <SelectItem
                  key={encodeRpSelectValue(name)}
                  value={encodeRpSelectValue(name)}
                >
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="text-sm text-muted-foreground" htmlFor="jira-month">
            Month
          </label>
          <input
            id="jira-month"
            type="month"
            max={initial.label}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            value={monthInputValue}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (!y || !m) return;
              if (isFutureMonth(m, y, initial)) return;
              setRpFilterApplied("");
              setRpDirectoryNames([]);
              setYear(y);
              setMonth(m);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void load(month, year, {
                preserveOnError: true,
                rp: rpFilterApplied,
              });
            }}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Dialog open={pointsSinceOpen} onOpenChange={setPointsSinceOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Points since last meeting</DialogTitle>
            <DialogDescription>
              Done story points per RP from the selected meeting time through
              now. Same counting rules as the monthly report (Done only, each
              ticket once, missing estimates count as 1).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label
                className="text-sm text-muted-foreground"
                htmlFor="meeting-since"
              >
                Previous meeting (local time)
              </label>
              <input
                id="meeting-since"
                type="datetime-local"
                className="block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                value={meetingSinceLocal}
                onChange={(e) => setMeetingSinceLocal(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pointsSinceLoading}
              onClick={() => void loadPointsSince()}
            >
              {pointsSinceLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {pointsSinceError ? (
            <p className="text-sm text-destructive">{pointsSinceError}</p>
          ) : null}
          {pointsSinceReport?.configured === false ? (
            <p className="text-sm text-muted-foreground">
              Jira is not configured on the backend.
            </p>
          ) : null}
          {pointsSinceReport?.configured ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {pointsSinceReport.completedIssueCount} Done tickets ·{" "}
                {pointsSinceReport.totalPoints} points · generated{" "}
                {formatResolvedAt(pointsSinceReport.reportGeneratedAt)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Team member</th>
                      <th className="py-2 pr-3 font-medium">Points</th>
                      <th className="py-2 font-medium">Stories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pointsSinceReport.members.map((member, index) => (
                      <tr
                        key={`${member.assigneeAccountId ?? "none"}:${member.assigneeDisplayName}:${index}`}
                        className="border-b border-border/60 align-top"
                      >
                        <td className="py-2 pr-3">{member.assigneeDisplayName}</td>
                        <td className="py-2 pr-3 tabular-nums">{member.points}</td>
                        <td className="py-2">
                          {member.storyCount === 0 ? (
                            <span className="text-muted-foreground">0</span>
                          ) : (
                            <Collapsible>
                              <CollapsibleTrigger className="text-left text-primary underline-offset-4 hover:underline">
                                {member.storyCount} stor
                                {member.storyCount === 1 ? "y" : "ies"}
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="mt-2 space-y-2 border-l border-border pl-3">
                                  {member.stories.map((story) => (
                                    <li key={story.key} className="text-xs">
                                      <a
                                        href={story.jiraUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-primary hover:underline"
                                      >
                                        {story.key}
                                      </a>
                                      <span className="text-muted-foreground">
                                        {" "}
                                        · {story.points} pt ·{" "}
                                        {formatResolvedAt(story.resolvedAt)}
                                      </span>
                                      <div className="text-foreground">
                                        {story.summary}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPointsSinceOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Could not load report</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {report && !report.configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jira not configured</CardTitle>
            <CardDescription>
              Set{" "}
              <code className="text-xs">
                JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
              </code>{" "}
              on the backend and redeploy. Create an API token at Atlassian
              account security settings.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loading && !report ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {loading && report?.configured ? (
        <p className="text-sm text-muted-foreground">Refreshing…</p>
      ) : null}

      {report?.configured ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total points</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {report.totalPoints}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {report.issuesWithPointsCount} of {report.completedIssueCount}{" "}
                Done issues had estimates; missing estimates default to 1 ·{" "}
                {report.monthLabel}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>vs previous month</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {report.monthOverMonthDelta > 0 ? "+" : ""}
                  {report.monthOverMonthDelta}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Prior month ({report.previousMonth}):{" "}
                {report.previousMonthTotalPoints} pts
                {report.monthOverMonthPercent != null
                  ? ` · ${pct(report.monthOverMonthPercent)} MoM`
                  : ""}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>RPs with points</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {report.byRp.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Assignees who completed estimated work this month
                {report.byRp.some((r) => r.suspended)
                  ? ` · ${report.byRp.filter((r) => r.suspended).length} suspended`
                  : ""}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  {report.kennaCreatedEstimates?.displayName ?? "Kenna"} — story
                  estimate (reporter)
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {report.kennaCreatedEstimates == null ||
                  report.kennaCreatedEstimates.configured === false
                    ? "—"
                    : report.kennaCreatedEstimates.points}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {report.kennaCreatedEstimates == null
                  ? "Unavailable until the API includes Kenna reporter estimates (deploy backend leaderboard)"
                  : report.kennaCreatedEstimates.configured === false
                    ? "Set JIRA_LEADERBOARD_BOSS_ACCOUNT_ID to enable"
                    : `${report.kennaCreatedEstimates.issueCount} tickets with Kenna as reporter this month · missing estimates default to 1 · not Done-by-RP`}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {report.monthLabel} story point run-rate
              </CardTitle>
              <CardDescription>
                Solid line shows cumulative Done story points through today.
                For the current month, the dotted line shows the projected
                month-end total at 2× the current MTD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!viewingCurrentMonth && !dailyActualsAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Daily actuals are unavailable for this historical month until
                  the backend run-rate update is deployed.
                </p>
              ) : (
                <ChartContainer config={trendChartConfig} className="h-[240px] w-full">
                  <LineChart data={chartRows} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="totalPoints"
                      stroke="var(--color-totalPoints)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      type="linear"
                      dataKey="projectedPoints"
                      stroke="var(--color-projectedPoints)"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      strokeLinecap="round"
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Points by RP</CardTitle>
                <CardDescription>
                  Assignee when the story was Done. Monthly targets from{" "}
                  <code className="text-xs">JIRA_RP_STORY_POINT_THRESHOLDS</code>{" "}
                  (35–70, no deploy). Suspended Jira accounts stay visible here
                  (hidden from daily Slack).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {report.byRp.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No points this month.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">RP</th>
                          <th className="py-2 pr-3 font-medium">Points</th>
                          <th className="py-2 pr-3 font-medium">Target</th>
                          <th className="py-2 pr-3 font-medium">% of target</th>
                          <th className="py-2 font-medium">% of total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byRp.map((row, index) => (
                          <tr
                            key={`${row.assigneeAccountId ?? "none"}:${row.assigneeDisplayName}:${index}`}
                            className="border-b border-border/60"
                          >
                            <td className="py-2 pr-3">
                              <span className="inline-flex flex-wrap items-center gap-2">
                                {row.assigneeDisplayName}
                                {row.suspended ? (
                                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                    Suspended
                                  </span>
                                ) : null}
                              </span>
                            </td>
                            <td className="py-2 pr-3 tabular-nums">{row.points}</td>
                            <td className="py-2 pr-3 tabular-nums">
                              {row.storyPointThreshold ?? "—"}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {row.percentTowardThreshold != null
                                ? pct(row.percentTowardThreshold)
                                : report.storyPointThresholdsConfigured
                                  ? "—"
                                  : "n/a"}
                            </td>
                            <td className="py-2 tabular-nums">
                              {pct(row.percentOfTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {report.storyPointThresholdLevels?.length ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Allowed monthly thresholds:{" "}
                    {report.storyPointThresholdLevels.join(", ")}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Points by environment</CardTitle>
                <CardDescription>
                  Labels: backend, ios, macos, android, website, seo, design,
                  windows, operations, chrome, infrastructure, geospatial.
                  Multi-label stories count full points in each match.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {report.byEnvironment.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No points this month.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Environment</th>
                          <th className="py-2 pr-3 font-medium">Points</th>
                          <th className="py-2 font-medium">% of total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byEnvironment.map((row) => (
                          <tr
                            key={row.environment}
                            className="border-b border-border/60"
                          >
                            <td className="py-2 pr-3 capitalize">
                              {row.environment}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">{row.points}</td>
                            <td className="py-2 tabular-nums">
                              {pct(row.percentOfTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
