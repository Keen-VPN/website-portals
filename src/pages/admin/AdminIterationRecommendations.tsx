import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  adminApproveProductWorkRecommendation,
  adminCreateProductWorkRecommendation,
  adminFetchIterationCreateOptions,
  adminFetchIterationWeeklyComparison,
  adminGenerateProductWorkRecommendations,
  adminLinkProductWorkRecommendationJira,
  adminSyncProductWorkRecommendationJira,
  adminUpdateProductWorkRecommendationDraft,
  adminUpdateProductWorkRecommendationStatus,
  type AdminIterationCreateOptions,
  type AdminIterationWeeklyComparison,
  type AdminProductWorkRecommendation,
  type AdminProductWorkRecommendationStatus,
  type AdminProductWorkStoryDraft,
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
    return "Pending draft";
  }
  const labels: Record<AdminProductWorkRecommendationStatus, string> = {
    RECOMMENDED: "Recommended",
    ACCEPTED: "Accepted (in Jira)",
    REJECTED: "Rejected",
    STARTED: "Started",
    COMPLETED: "Completed",
    MODIFIED_REPLACED: "Modified/replaced",
  };
  return labels[status];
}

function draftFromRow(row: AdminProductWorkRecommendation): AdminProductWorkStoryDraft {
  return {
    title: row.title,
    summary: row.summary ?? "",
    background: row.background ?? "",
    description: row.description ?? "",
    requirements: row.requirements ?? "",
    acceptanceCriteria: row.acceptanceCriteria ?? "",
    definitionOfDone: row.definitionOfDone ?? "",
    environment: row.environment ?? "Multi",
    storyPoints: row.storyPoints ?? row.aiStoryPoints,
    recommendedRp: row.recommendedRp,
  };
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminProductWorkStoryDraft | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [createOptions, setCreateOptions] =
    useState<AdminIterationCreateOptions | null>(null);
  const loadGeneration = useRef(0);
  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;

  const load = useCallback(async (weekOverride?: string) => {
    const week = weekOverride ?? weekStartRef.current;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setReport(null);
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

  useEffect(() => {
    void adminFetchIterationCreateOptions().then((res) => {
      if (res.ok && res.data) {
        setCreateOptions(res.data);
      } else {
        setError(
          res.error ?? "Failed to load Jira Environment / RP options",
        );
      }
    });
  }, []);

  const activeReport =
    report && report.weekStart === weekStart ? report : null;
  const awaitingWeek = loading || (report != null && activeReport == null);
  const rates = activeReport?.rates;
  const humanRows = activeReport?.humanOriginatedCompleted ?? [];
  const statValue = (n: number | undefined) =>
    awaitingWeek ? "…" : activeReport == null ? "—" : String(n ?? 0);

  const selected = useMemo(() => {
    if (!activeReport || !selectedId) return null;
    return (
      activeReport.recommendations.find((r) => r.id === selectedId) ?? null
    );
  }, [activeReport, selectedId]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(draftFromRow(selected));
    setShowOriginal(false);
  }, [selected]);

  const rejectedCount = useMemo(() => {
    if (!activeReport) return null;
    return activeReport.rates.rejected;
  }, [activeReport]);

  const canEditDraft =
    selected != null &&
    !selected.jiraIssueKey &&
    (selected.status === "RECOMMENDED" || selected.status === "REJECTED");

  const hasValidJiraEnvironment = useMemo(() => {
    if (!draft?.environment.trim() || !createOptions?.environments.length) {
      return false;
    }
    return createOptions.environments.some(
      (opt) => opt.value === draft.environment,
    );
  }, [draft, createOptions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Iteration recommendations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI drafts arrive as full Jira-ready stories. Review and edit in the
            portal, then approve to create a KVPN story in Needs Refinement — or
            reject. No Jira issue is created until approve.
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
              const selectedDate = new Date(`${raw}T00:00:00Z`);
              if (!Number.isNaN(selectedDate.getTime())) {
                setWeekStart(mondayUtc(selectedDate));
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
              void adminSyncProductWorkRecommendationJira({ weekStart })
                .then((res) => {
                  if (!res.ok) setError(res.error ?? "Sync failed");
                  else {
                    void load();
                    if (res.data?.errors?.length) {
                      setError(
                        `Jira sync completed with errors: ${res.data.errors.join("; ")}`,
                      );
                    }
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
        <Stat
          label="Recommended"
          value={statValue(rates?.recommended)}
        />
        <Stat
          label="In Jira"
          value={statValue(rates?.acceptedIntoJira)}
          hint={
            activeReport
              ? formatRate(rates?.acceptanceRate ?? null)
              : undefined
          }
        />
        <Stat
          label="Completed"
          value={statValue(rates?.completed)}
          hint={
            activeReport
              ? formatRate(rates?.completionRate ?? null)
              : undefined
          }
        />
        <Stat
          label="Rejected"
          value={statValue(rejectedCount ?? undefined)}
          hint={
            activeReport
              ? formatRate(rates?.rejectionRate ?? null)
              : undefined
          }
        />
        <Stat
          label="Human-only Done"
          value={statValue(activeReport?.humanOriginatedCompletedCount)}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Recommendations</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="p-3">Title</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Pts</th>
                  <th className="p-3">Jira</th>
                </tr>
              </thead>
              <tbody>
                {awaitingWeek ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : null}
                {!awaitingWeek
                  ? (activeReport?.recommendations ?? []).map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectedId === row.id}
                        aria-label={`Select recommendation ${row.title}`}
                        className={`cursor-pointer border-b border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selectedId === row.id
                            ? "bg-muted/50"
                            : "hover:bg-muted/30"
                        }`}
                        onClick={() => setSelectedId(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(row.id);
                          }
                        }}
                      >
                        <td className="p-3">
                          <div className="font-medium">{row.title}</div>
                          {row.environment ? (
                            <div className="text-xs text-muted-foreground">
                              {row.environment}
                              {row.recommendedRp
                                ? ` · RP: ${row.recommendedRp}`
                                : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {displayStatus(row.status, Boolean(row.jiraIssueKey))}
                        </td>
                        <td className="p-3">
                          {row.storyPoints ?? row.aiStoryPoints ?? "—"}
                          {row.estimateAccuracyScore != null ? (
                            <div className="text-xs text-muted-foreground">
                              est {row.estimateAccuracyScore}/2
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {row.jiraIssueUrl && row.jiraIssueKey ? (
                            <a
                              className="text-primary underline"
                              href={row.jiraIssueUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.jiraIssueKey}
                            </a>
                          ) : (
                            (row.jiraIssueKey ?? "—")
                          )}
                        </td>
                      </tr>
                    ))
                  : null}
                {!awaitingWeek &&
                activeReport &&
                activeReport.recommendations.length === 0 ? (
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

        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Story draft preview</h3>
            {selected?.originalAiDraft ? (
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? "Show working draft" : "Show original AI draft"}
              </button>
            ) : null}
          </div>

          {!selected || !draft ? (
            <p className="text-sm text-muted-foreground">
              Select a recommendation to review the full Jira-ready draft.
            </p>
          ) : showOriginal && selected.originalAiDraft ? (
            <OriginalDraftView draft={selected.originalAiDraft} />
          ) : (
            <>
              <DraftFields
                draft={draft}
                disabled={!canEditDraft || busy}
                onChange={setDraft}
                environments={createOptions?.environments ?? []}
                responsiblePersons={createOptions?.responsiblePersons ?? []}
              />
              {selected.estimateDirection ||
              selected.estimateAccuracyScore != null ||
              selected.estimateUnavailableReason ||
              selected.aiStoryPoints != null ||
              selected.finalJiraStoryPoints != null ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <p className="font-medium">Estimate accuracy (when Done)</p>
                  <p className="mt-1 text-muted-foreground">
                    AI {selected.aiStoryPoints ?? "—"} → final{" "}
                    {selected.finalJiraStoryPoints ?? "—"}
                    {selected.estimateAccuracyScore != null
                      ? ` · score ${selected.estimateAccuracyScore}/2`
                      : ""}
                    {selected.estimateDirection
                      ? ` · ${selected.estimateDirection}`
                      : ""}
                    {selected.estimateUnavailableReason
                      ? ` · ${selected.estimateUnavailableReason}`
                      : ""}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                {canEditDraft ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                      onClick={() => {
                        if (!draft || !selected) return;
                        setBusy(true);
                        setError(null);
                        void adminUpdateProductWorkRecommendationDraft(
                          selected.id,
                          draft,
                        )
                          .then((res) => {
                            if (!res.ok)
                              setError(res.error ?? "Save draft failed");
                            else void load();
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      disabled={busy || !hasValidJiraEnvironment}
                      title={
                        hasValidJiraEnvironment
                          ? undefined
                          : "Select a valid Jira Environment before approving"
                      }
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      onClick={() => {
                        if (!draft || !selected) return;
                        if (!hasValidJiraEnvironment) {
                          setError(
                            "Select a valid Jira Environment before approving",
                          );
                          return;
                        }
                        setBusy(true);
                        setError(null);
                        void adminApproveProductWorkRecommendation(selected.id, {
                          draft,
                        })
                          .then((res) => {
                            if (!res.ok)
                              setError(res.error ?? "Approve failed");
                            else void load();
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Approve → create Jira
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                      onClick={() => {
                        if (!selected) return;
                        const reason = window.prompt(
                          "Rejection reason (optional)",
                          selected.rejectionReason ?? "",
                        );
                        if (reason === null) return;
                        setBusy(true);
                        void adminUpdateProductWorkRecommendationStatus(
                          selected.id,
                          {
                            status: "REJECTED",
                            rejectionReason: reason.trim() || undefined,
                          },
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
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                      onClick={() => {
                        if (!selected) return;
                        const key = window.prompt(
                          "Link existing Jira key (no create)",
                          selected.jiraIssueKey ?? "",
                        );
                        if (!key?.trim()) return;
                        setBusy(true);
                        void adminLinkProductWorkRecommendationJira(
                          selected.id,
                          { jiraIssueKey: key.trim() },
                        )
                          .then((res) => {
                            if (!res.ok)
                              setError(res.error ?? "Link failed");
                            else void load();
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Link existing Jira…
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {selected.jiraIssueKey
                      ? "Already in Jira — draft is read-only. Original AI draft remains available above."
                      : "This recommendation is not editable in its current status."}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

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
              {awaitingWeek ? (
                <tr>
                  <td colSpan={4} className="p-4 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {!awaitingWeek
                ? humanRows.map((row) => (
                    <tr key={row.key} className="border-b border-border/60">
                      <td className="p-3 font-mono text-xs">{row.key}</td>
                      <td className="p-3">{row.summary}</td>
                      <td className="p-3">{row.points}</td>
                      <td className="p-3">
                        {new Date(row.resolvedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                : null}
              {!awaitingWeek && activeReport && humanRows.length === 0 ? (
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

function DraftFields(props: {
  draft: AdminProductWorkStoryDraft;
  disabled: boolean;
  onChange: (next: AdminProductWorkStoryDraft) => void;
  environments: { id: string; value: string }[];
  responsiblePersons: { accountId: string; displayName: string }[];
}) {
  const { draft, disabled, onChange, environments, responsiblePersons } =
    props;
  const set = <K extends keyof AdminProductWorkStoryDraft>(
    key: K,
    value: AdminProductWorkStoryDraft[K],
  ) => onChange({ ...draft, [key]: value });

  const envSelectValue = environments.some(
    (opt) => opt.value === draft.environment,
  )
    ? draft.environment
    : "";

  const rpSelectValue =
    responsiblePersons.find(
      (p) =>
        p.displayName === draft.recommendedRp ||
        p.accountId === draft.recommendedRp,
    )?.accountId ?? "";

  return (
    <div className="space-y-3">
      <Field label="Title">
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={disabled}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Environment">
          <select
            aria-label="Environment"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={disabled}
            value={envSelectValue}
            onChange={(e) => set("environment", e.target.value)}
          >
            <option value="">Select environment…</option>
            {environments.map((opt) => (
              <option key={opt.id || opt.value} value={opt.value}>
                {opt.value}
              </option>
            ))}
          </select>
          {!envSelectValue && draft.environment ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              AI suggested “{draft.environment}” — pick a Jira Environment
              option above (required to approve).
            </p>
          ) : null}
        </Field>
        <Field label="Story points">
          <select
            aria-label="Story points"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={disabled}
            value={draft.storyPoints ?? ""}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              set("storyPoints", Number.isFinite(n) ? n : null);
            }}
          >
            <option value="">Select points…</option>
            {[1, 2, 3, 5, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recommended RP">
          <select
            aria-label="Recommended RP"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={disabled}
            value={rpSelectValue}
            onChange={(e) => {
              const accountId = e.target.value;
              if (!accountId) {
                set("recommendedRp", null);
                return;
              }
              const person = responsiblePersons.find(
                (p) => p.accountId === accountId,
              );
              set("recommendedRp", person?.displayName ?? accountId);
            }}
          >
            <option value="">Unassigned / none</option>
            {responsiblePersons.map((p) => (
              <option key={p.accountId} value={p.accountId}>
                {p.displayName}
              </option>
            ))}
          </select>
          {!rpSelectValue && draft.recommendedRp ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              AI suggested “{draft.recommendedRp}” — pick a Jira assignee above
              (or clear to leave unassigned).
            </p>
          ) : null}
        </Field>
      </div>
      <Field label="Summary">
        <textarea
          className="min-h-[64px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={disabled}
          value={draft.summary}
          onChange={(e) => set("summary", e.target.value)}
        />
      </Field>
      <Field label="Background">
        <textarea
          className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={disabled}
          value={draft.background}
          onChange={(e) => set("background", e.target.value)}
        />
      </Field>
      <Field label="Description / implementation">
        <textarea
          className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={disabled}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <Field label="Requirements">
        <textarea
          className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          disabled={disabled}
          value={draft.requirements}
          onChange={(e) => set("requirements", e.target.value)}
        />
      </Field>
      <Field label="Acceptance criteria">
        <textarea
          className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          disabled={disabled}
          value={draft.acceptanceCriteria}
          onChange={(e) => set("acceptanceCriteria", e.target.value)}
        />
      </Field>
      <Field label="Definition of Done">
        <textarea
          className="min-h-[64px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          disabled={disabled}
          value={draft.definitionOfDone}
          onChange={(e) => set("definitionOfDone", e.target.value)}
        />
      </Field>
    </div>
  );
}

function OriginalDraftView(props: {
  draft: AdminProductWorkStoryDraft | Record<string, unknown>;
}) {
  const d = props.draft as Partial<AdminProductWorkStoryDraft>;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Immutable AI snapshot (not edited by reviewers).
      </p>
      <ReadBlock label="Title" value={d.title} />
      <ReadBlock label="Summary" value={d.summary} />
      <ReadBlock label="Background" value={d.background} />
      <ReadBlock label="Description" value={d.description} />
      <ReadBlock label="Requirements" value={d.requirements} />
      <ReadBlock label="Acceptance criteria" value={d.acceptanceCriteria} />
      <ReadBlock label="Definition of Done" value={d.definitionOfDone} />
      <ReadBlock label="Environment" value={d.environment} />
      <ReadBlock
        label="Story points"
        value={d.storyPoints != null ? String(d.storyPoints) : null}
      />
      <ReadBlock label="Recommended RP" value={d.recommendedRp} />
    </div>
  );
}

function ReadBlock(props: { label: string; value?: string | null }) {
  if (!props.value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{props.label}</p>
      <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">
        {props.value}
      </pre>
    </div>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {props.label}
      </span>
      {props.children}
    </label>
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
