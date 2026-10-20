import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adminCreateProductWorkRecommendation,
  adminFetchIterationWeeklyComparison,
  adminGenerateProductWorkRecommendations,
  adminLinkProductWorkRecommendationJira,
  adminSyncProductWorkRecommendationJira,
  adminUpdateProductWorkRecommendationStatus,
  type AdminIterationWeeklyComparison,
  type AdminProductWorkRecommendationStatus,
} from "@/auth/backend";

const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;

function mondayUtc(d = new Date()): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const base = WEEK_START_RE.test(weekStart) ? weekStart : mondayUtc();
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) {
    return shiftWeek(mondayUtc(), deltaWeeks);
  }
  date.setUTCDate(date.getUTCDate() + deltaWeeks * 7);
  return date.toISOString().slice(0, 10);
}

function formatRate(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function displayStatus(
  status: AdminProductWorkRecommendationStatus,
  hasJiraKey: boolean,
): string {
  if (status === "RECOMMENDED" && !hasJiraKey) {
    return "Pending / not selected";
  }
  const labels: Record<AdminProductWorkRecommendationStatus, string> = {
    RECOMMENDED: "Recommended",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    STARTED: "Started",
    COMPLETED: "Completed",
    MODIFIED_REPLACED: "Modified/replaced",
  };
  return labels[status];
}

export default function AdminIterationRecommendations() {
  const [weekStart, setWeekStart] = useState(mondayUtc);
  const [report, setReport] = useState<AdminIterationWeeklyComparison | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newJiraKey, setNewJiraKey] = useState("");
  const loadGeneration = useRef(0);
  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;

  /** Always reads the latest week from the ref so post-mutation reloads
   *  follow the week currently selected, not the week when the button rendered. */
  const load = useCallback(async (weekOverride?: string) => {
    const week = weekOverride ?? weekStartRef.current;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    const res = await adminFetchIterationWeeklyComparison({ weekStart: week });
    if (generation !== loadGeneration.current) return;
    if (!res.ok || !res.data) {
      setReport(null);
      setError(res.error ?? "Failed to load weekly comparison");
      setLoading(false);
      return;
    }
    setReport(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(weekStart);
    return () => {
      loadGeneration.current += 1;
    };
  }, [weekStart, load]);

  const rates = report?.rates;
  const humanRows = report?.humanOriginatedCompleted ?? [];
  const statValue = (n: number | undefined) =>
    loading ? "…" : report == null ? "—" : String(n ?? 0);

  const rejectedCount = useMemo(() => {
    if (!report) return null;
    return report.rates.rejected;
  }, [report]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Iteration recommendations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare AI product-work recommendations against Jira outcomes for the
            week. Human-originated Done tickets with no linked recommendation
            are listed separately. Unselected recommendations stay pending until
            you explicitly reject them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
          >
            Previous week
          </button>
          <input
            aria-label="Week start (Monday UTC)"
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={weekStart}
            onChange={(e) => {
              const raw = e.target.value;
              if (!WEEK_START_RE.test(raw)) return;
              const selected = new Date(`${raw}T00:00:00Z`);
              if (!Number.isNaN(selected.getTime())) {
                setWeekStart(mondayUtc(selected));
              }
            }}
          />
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
          >
            Next week
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => {
              setBusy(true);
              setError(null);
              void adminGenerateProductWorkRecommendations({ weekStart })
                .then((res) => {
                  if (!res.ok) {
                    setError(res.error ?? "Generate failed");
                    return;
                  }
                  void load();
                  if (res.data?.skipped) {
                    setError(
                      res.data.message ??
                        "AI recommendations already exist for this week.",
                    );
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            Generate with AI
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => {
              setBusy(true);
              setError(null);
              void adminSyncProductWorkRecommendationJira({ weekStart })
                .then((res) => {
                  if (!res.ok) {
                    setError(res.error ?? "Sync failed");
                    return;
                  }
                  void load();
                  if (res.data?.errors.length) {
                    setError(
                      `Jira sync completed with errors: ${res.data.errors.join("; ")}`,
                    );
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            Sync Jira
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Recommended" value={statValue(rates?.recommended)} />
        <Stat
          label="Accepted into Jira"
          value={statValue(rates?.acceptedIntoJira)}
          hint={
            report ? formatRate(rates?.acceptanceRate ?? null) : undefined
          }
        />
        <Stat
          label="Completed"
          value={statValue(rates?.completed)}
          hint={
            report ? formatRate(rates?.completionRate ?? null) : undefined
          }
        />
        <Stat
          label="Rejected"
          value={statValue(rejectedCount ?? undefined)}
          hint={
            report ? formatRate(rates?.rejectionRate ?? null) : undefined
          }
        />
        <Stat
          label="Human-only Done"
          value={statValue(report?.humanOriginatedCompletedCount)}
        />
      </div>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-lg font-semibold">Add recommendation</h3>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Recommendation title"
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <input
            aria-label="Optional summary"
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Summary (optional)"
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
          />
          <input
            aria-label="Optional Jira issue key"
            className="w-[140px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="KVPN-123"
            value={newJiraKey}
            onChange={(e) => setNewJiraKey(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !newTitle.trim()}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => {
              setBusy(true);
              void adminCreateProductWorkRecommendation({
                title: newTitle.trim(),
                summary: newSummary.trim() || undefined,
                weekStart,
                jiraIssueKey: newJiraKey.trim() || undefined,
                source: "ADMIN",
              })
                .then((res) => {
                  if (!res.ok) setError(res.error ?? "Create failed");
                  else {
                    setNewTitle("");
                    setNewSummary("");
                    setNewJiraKey("");
                    void load();
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            Create
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recommendations</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">Status</th>
                <th className="p-3">Jira</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(report?.recommendations ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="p-3">
                    <div className="font-medium">{row.title}</div>
                    {row.summary ? (
                      <div className="text-xs text-muted-foreground">
                        {row.summary}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    {displayStatus(row.status, Boolean(row.jiraIssueKey))}
                  </td>
                  <td className="p-3">
                    {row.jiraIssueUrl && row.jiraIssueKey ? (
                      <a
                        className="text-primary underline"
                        href={row.jiraIssueUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.jiraIssueKey}
                      </a>
                    ) : (
                      (row.jiraIssueKey ?? "—")
                    )}
                    {row.jiraStatus ? (
                      <div className="text-xs text-muted-foreground">
                        {row.jiraStatus}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-xs text-primary underline"
                        onClick={() => {
                          const key = window.prompt(
                            "Jira issue key",
                            row.jiraIssueKey ?? "",
                          );
                          if (!key?.trim()) return;
                          setBusy(true);
                          void adminLinkProductWorkRecommendationJira(row.id, {
                            jiraIssueKey: key.trim(),
                          })
                            .then((res) => {
                              if (!res.ok)
                                setError(res.error ?? "Link failed");
                              else void load();
                            })
                            .finally(() => setBusy(false));
                        }}
                      >
                        Link / accept Jira…
                      </button>
                      <button
                        type="button"
                        className="text-left text-xs text-primary underline"
                        onClick={() => {
                          setBusy(true);
                          void adminUpdateProductWorkRecommendationStatus(
                            row.id,
                            { status: "REJECTED" },
                          )
                            .then((res) => {
                              if (!res.ok)
                                setError(res.error ?? "Reject failed");
                              else void load();
                            })
                            .finally(() => setBusy(false));
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && report && report.recommendations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-muted-foreground">
                    No recommendations for this week.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">
          Human-originated completed work
        </h3>
        <p className="text-sm text-muted-foreground">
          Done Jira issues resolved this week that are not linked to any AI
          recommendation.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="p-3">Key</th>
                <th className="p-3">Summary</th>
                <th className="p-3">Points</th>
                <th className="p-3">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {humanRows.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <td className="p-3 font-mono text-xs">{row.key}</td>
                  <td className="p-3">{row.summary}</td>
                  <td className="p-3">{row.points}</td>
                  <td className="p-3">
                    {new Date(row.resolvedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!loading && report && humanRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-muted-foreground">
                    None this week (or Jira is not configured).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
      ) : null}
    </div>
  );
}
