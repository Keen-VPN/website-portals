import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adminFetchProductStoryMonthlyReview,
  adminPostProductStoryMonthlyRatingsToSlack,
  adminUpsertProductStoryMonthlyRating,
  type AdminProductStoryMonthlyRatingValue,
  type AdminProductStoryMonthlyReview,
} from "@/auth/backend";

const RATING_LABELS: Record<AdminProductStoryMonthlyRatingValue, string> = {
  1: "1 — Waste of time",
  2: "2 — No meaningful value felt",
  3: "3 — Critically valuable",
};

const PAGE_SIZE = 20;

function previousUtcMonth(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAvg(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(2);
}

export default function AdminProductStoryMonthlyRatings() {
  const initial = useMemo(() => previousUtcMonth(), []);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [report, setReport] = useState<AdminProductStoryMonthlyReview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [page, setPage] = useState(1);
  const [postingSlack, setPostingSlack] = useState(false);
  const [slackNotice, setSlackNotice] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  /** Bumped on each Slack post and on every month change so A→B→A can't apply a stale result. */
  const slackPostGeneration = useRef(0);
  const yearRef = useRef(year);
  const monthRef = useRef(month);
  yearRef.current = year;
  monthRef.current = month;

  const load = useCallback(
    async (options?: {
      year?: number;
      month?: number;
      /** Keep current rows visible; used after saving a rating. */
      silent?: boolean;
    }) => {
      const targetYear = options?.year ?? yearRef.current;
      const targetMonth = options?.month ?? monthRef.current;
      const silent = options?.silent === true;
      const generation = ++loadGeneration.current;
      if (!silent) {
        setLoading(true);
        setReport(null);
        setError(null);
      }
      const res = await adminFetchProductStoryMonthlyReview({
        year: targetYear,
        month: targetMonth,
      });
      if (generation !== loadGeneration.current) return;
      if (!res.ok || !res.data) {
        if (!silent) setReport(null);
        setError(res.error ?? "Failed to load monthly review");
        setLoading(false);
        return;
      }
      // Drop responses that no longer match the selected month (e.g. silent
      // refresh finishing after the user already navigated away).
      if (
        res.data.year !== yearRef.current ||
        res.data.month !== monthRef.current
      ) {
        return;
      }
      setReport(res.data);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    setSlackNotice(null);
    setPostingSlack(false);
    // Invalidate any in-flight Slack post when the selected month changes
    // (including A→B→A), so an older response cannot overwrite a newer one.
    slackPostGeneration.current += 1;
    void load({ year, month });
    return () => {
      loadGeneration.current += 1;
    };
  }, [year, month, load]);

  const markPending = (key: string) => {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const clearPending = (key: string) => {
    setPendingKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const postToSlack = async () => {
    if (postingSlack) return;
    const postedYear = year;
    const postedMonth = month;
    const generation = ++slackPostGeneration.current;
    setPostingSlack(true);
    setSlackNotice(null);
    setError(null);
    const res = await adminPostProductStoryMonthlyRatingsToSlack({
      year: postedYear,
      month: postedMonth,
    });
    if (generation !== slackPostGeneration.current) {
      return;
    }
    setPostingSlack(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to post story ratings to Slack");
      return;
    }
    const truncatedNote = res.data.truncated
      ? ` (truncated to ${res.data.posted} of ${res.data.totalStories})`
      : "";
    setSlackNotice(
      `Posted ${res.data.posted} stor${res.data.posted === 1 ? "y" : "ies"} to Slack${truncatedNote}.`,
    );
  };

  const activeReport =
    report && report.year === year && report.month === month ? report : null;
  const awaiting = loading || (report != null && activeReport == null);
  const stories = activeReport?.stories ?? [];
  const pageCount = Math.max(1, Math.ceil(stories.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStories = stories.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const rangeStart = stories.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, stories.length);
  const statValue = (value: string | number | undefined) =>
    awaiting ? "…" : activeReport == null ? "—" : String(value ?? "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Monthly story ratings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rate completed Jira stories for the selected month (1–3). Raw and
            believability-weighted averages feed the Iteration Engine. New raters
            start at weight {activeReport?.defaultWeight ?? 1}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => {
              const next = shiftMonth(year, month, -1);
              setYear(next.year);
              setMonth(next.month);
            }}
          >
            Previous month
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium">
            {formatMonthLabel(year, month)}
          </span>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => {
              const next = shiftMonth(year, month, 1);
              setYear(next.year);
              setMonth(next.month);
            }}
          >
            Next month
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
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            disabled={postingSlack || awaiting || stories.length === 0}
            onClick={() => void postToSlack()}
          >
            {postingSlack ? "Posting…" : "Post to Slack"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {slackNotice ? (
        <div
          role="status"
          className="rounded-md border border-border bg-muted/40 p-3 text-sm"
        >
          {slackNotice}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Stories"
          value={statValue(activeReport?.totalStories)}
        />
        <Stat
          label="Rated by you"
          value={
            awaiting
              ? "…"
              : activeReport == null
                ? "—"
                : `${activeReport.ratedByMeCount} / ${activeReport.totalStories}`
          }
        />
        <Stat
          label="Weight algorithm"
          value={statValue(activeReport?.algorithmVersion)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="p-3">Story</th>
              <th className="p-3">Your rating</th>
              <th className="p-3">Raw avg</th>
              <th className="p-3">Weighted avg</th>
              <th className="p-3">Raters</th>
            </tr>
          </thead>
          <tbody>
            {awaiting ? (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!awaiting
              ? pageStories.map((story) => {
                  const busy = pendingKeys.has(story.key);
                  return (
                    <tr
                      key={story.key}
                      className="border-b border-border/60 align-top"
                    >
                      <td className="p-3">
                        <div className="font-medium">
                          {story.jiraIssueUrl ? (
                            <a
                              className="text-primary underline"
                              href={story.jiraIssueUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {story.key}
                            </a>
                          ) : (
                            story.key
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          {story.summary}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {story.points} pts · resolved{" "}
                          {new Date(story.resolvedAt).toLocaleString(
                            undefined,
                            { timeZone: "UTC" },
                          )}{" "}
                          UTC
                        </div>
                      </td>
                      <td className="p-3">
                        <fieldset
                          className={`flex flex-col gap-1 border-0 p-0 m-0 ${
                            busy ? "opacity-50" : ""
                          }`}
                        >
                          <legend className="sr-only">
                            Rate {story.key}
                          </legend>
                          {(
                            [1, 2, 3] as AdminProductStoryMonthlyRatingValue[]
                          ).map((value) => {
                            const selected =
                              story.myRating?.rating === value;
                            return (
                              <label
                                key={value}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${
                                  selected
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:bg-muted"
                                }`}
                              >
                                <input
                                  type="radio"
                                  className="h-3.5 w-3.5 accent-primary"
                                  name={`story-rating-${story.key}`}
                                  value={value}
                                  checked={selected}
                                  aria-disabled={busy}
                                  onChange={() => {
                                    if (busy) return;
                                    markPending(story.key);
                                    setError(null);
                                    void adminUpsertProductStoryMonthlyRating({
                                      jiraIssueKey: story.key,
                                      year,
                                      month,
                                      rating: value,
                                    })
                                      .then((res) => {
                                        if (!res.ok) {
                                          setError(
                                            res.error ??
                                              "Failed to save rating",
                                          );
                                          return;
                                        }
                                        // Keep the row busy until the silent
                                        // refresh lands so radios don't show
                                        // the previous rating while clickable.
                                        return load({ silent: true });
                                      })
                                      .finally(() =>
                                        clearPending(story.key),
                                      );
                                  }}
                                />
                                <span>{RATING_LABELS[value]}</span>
                              </label>
                            );
                          })}
                        </fieldset>
                      </td>
                      <td className="p-3 font-medium">
                        {formatAvg(story.aggregates.rawAverage)}
                      </td>
                      <td className="p-3 font-medium">
                        {formatAvg(story.aggregates.weightedAverage)}
                      </td>
                      <td className="p-3">
                        {story.ratings.length === 0 ? (
                          <span className="text-muted-foreground">
                            None yet
                          </span>
                        ) : (
                          <ul className="space-y-1 text-xs">
                            {story.ratings.map((r) => (
                              <li key={r.raterAdminId}>
                                <span className="font-medium">
                                  {r.raterName}
                                </span>
                                : {r.rating}{" "}
                                <span className="text-muted-foreground">
                                  (w={r.weight})
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })
              : null}
            {!awaiting && activeReport && stories.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-muted-foreground">
                  No Done Jira stories for this month (or Jira is empty).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {!awaiting && stories.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {stories.length}
          </span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                disabled={safePage <= 1}
                onClick={() => setPage(Math.max(1, safePage - 1))}
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {safePage} of {pageCount}
              </span>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                disabled={safePage >= pageCount}
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-xl font-semibold">{props.value}</p>
    </div>
  );
}
