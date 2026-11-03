import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  adminCreateInterviewGuideNote,
  adminFetchWeeklyInterviewGuide,
  adminGenerateWeeklyInterviewQuestions,
  type AdminInterviewGuideWeekly,
  type AdminResearchQuestion,
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
  if (Number.isNaN(date.getTime())) return shiftWeek(mondayUtc(), deltaWeeks);
  date.setUTCDate(date.getUTCDate() + deltaWeeks * 7);
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  if (!WEEK_START_RE.test(weekStart)) return weekStart;
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function QuestionBlock(props: {
  question: AdminResearchQuestion;
  badge?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono font-medium text-foreground">
          {props.question.publicId}
        </span>
        {props.badge ? (
          <span className="rounded border border-border px-1.5 py-0.5">
            {props.badge}
          </span>
        ) : null}
        {props.question.category ? (
          <span className="rounded border border-border px-1.5 py-0.5">
            {props.question.category.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-medium">{props.question.prompt}</p>
      {props.question.purpose ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Purpose: {props.question.purpose}
        </p>
      ) : null}
      {props.question.followUp ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Follow-up: {props.question.followUp}
        </p>
      ) : null}
    </div>
  );
}

export default function AdminInterviewGuide() {
  const { can } = useAdminAuth();
  const canRead = can("research.read");
  const canWrite = can("research.write");

  const [weekStart, setWeekStart] = useState(mondayUtc);
  const [guide, setGuide] = useState<AdminInterviewGuideWeekly | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [transcriptId, setTranscriptId] = useState("");
  const [noteQuestionId, setNoteQuestionId] = useState("");
  const loadGeneration = useRef(0);
  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const week = weekStartRef.current;
    const generation = ++loadGeneration.current;
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
      setGuide(null);
      setError(null);
    }
    const res = await adminFetchWeeklyInterviewGuide({ weekStart: week });
    if (generation !== loadGeneration.current) return;
    if (!res.ok || !res.data) {
      if (!silent) setGuide(null);
      setError(res.error ?? "Failed to load interview guide");
      setLoading(false);
      return;
    }
    if (res.data.weekStart !== weekStartRef.current) return;
    setGuide(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Drop a stale RQ selection when the week changes so notes cannot
    // attach to a question that is no longer in the active guide.
    setNoteQuestionId("");
    if (!canRead) {
      setLoading(false);
      return;
    }
    void load();
    return () => {
      loadGeneration.current += 1;
    };
  }, [canRead, weekStart, load]);

  const activeGuide =
    guide && guide.weekStart === weekStart ? guide : null;
  const awaiting = loading || (guide != null && activeGuide == null);
  // Initial/week fetch failed: generate stays disabled until the guide loads.
  const loadFailed = !loading && !activeGuide && error != null;

  if (!canRead) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        You do not have permission to view research tools.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Interview guide</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Structured weekly guide for KeenVPN user interviews: introduction,
            standard questions, AI weekly research questions (with stable RQ
            IDs), and notes linked to transcripts.
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
          {canWrite ? (
            <button
              type="button"
              disabled={busy || awaiting || !activeGuide}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              title={
                (activeGuide?.aiWeeklyQuestions.length ?? 0) > 0
                  ? "Adds another AI batch for this week (force=true); does not replace existing questions"
                  : "Generate AI weekly research questions for this week"
              }
              onClick={() => {
                if (!activeGuide || awaiting) return;
                const requestedWeek = weekStart;
                // Only trust force once the guide for this week is loaded.
                const force = activeGuide.aiWeeklyQuestions.length > 0;
                setBusy(true);
                setError(null);
                void adminGenerateWeeklyInterviewQuestions({
                  weekStart: requestedWeek,
                  force,
                })
                  .then(async (res) => {
                    if (weekStartRef.current !== requestedWeek) return;
                    if (!res.ok) {
                      setError(res.error ?? "Generate failed");
                      return;
                    }
                    if (res.data?.skipped) {
                      setError(
                        res.data.message ??
                          "AI questions already exist for this week.",
                      );
                    }
                    // Keep the button busy until refresh finishes so a second
                    // click cannot infer force:false from a stale/empty guide.
                    await load({ silent: true });
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {(activeGuide?.aiWeeklyQuestions.length ?? 0) > 0
                ? "Generate more AI questions"
                : "Generate AI questions"}
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Week of {formatWeekLabel(weekStart)} · Internal
      </p>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          {loadFailed ? (
            <button
              type="button"
              disabled={busy || loading}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-50"
              onClick={() => {
                setBusy(true);
                void load()
                  .catch(() => undefined)
                  .finally(() => setBusy(false));
              }}
            >
              Retry load
            </button>
          ) : null}
        </div>
      ) : null}

      {awaiting ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {loadFailed ? (
        <p className="text-sm text-muted-foreground">
          The interview guide for this week could not be loaded. Retry to enable
          generating AI questions.
        </p>
      ) : null}

      {!awaiting && activeGuide ? (
        <div className="space-y-8">
          <section className="space-y-2">
            <h3 className="text-lg font-semibold">1. Introduction</h3>
            <p className="rounded-md border border-border bg-muted/20 p-4 text-sm leading-relaxed">
              {activeGuide.introduction}
            </p>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">2. Standard questions</h3>
              <p className="text-sm text-muted-foreground">
                These stay relatively consistent across interviews.
              </p>
            </div>
            <div className="space-y-2">
              {activeGuide.standardQuestions.map((q) => (
                <QuestionBlock key={q.id} question={q} />
              ))}
              {activeGuide.standardQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No standard questions yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">
                3. AI-generated weekly questions
              </h3>
              <p className="text-sm text-muted-foreground">
                Generated from Iteration Engine gaps analytics cannot answer.
                Each has a category, research purpose, and stable RQ id for
                evaluation.
              </p>
            </div>
            <div className="space-y-2">
              {activeGuide.aiWeeklyQuestions.map((q) => (
                <QuestionBlock key={q.id} question={q} badge="AI" />
              ))}
              {activeGuide.aiWeeklyQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {canWrite
                    ? "None for this week yet. Click Generate AI questions."
                    : "None for this week yet."}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">4. Interview notes</h3>
              <p className="text-sm text-muted-foreground">
                Capture findings and optionally link a research question and
                transcript UUID from Research.
              </p>
            </div>
            <div className="space-y-2">
              {activeGuide.notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString(undefined, {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                    {n.researchQuestion
                      ? ` · ${n.researchQuestion.publicId}`
                      : n.researchQuestionId
                        ? ` · question: ${n.researchQuestionId}`
                        : null}
                    {n.transcript
                      ? ` · transcript: ${n.transcript.title}`
                      : n.transcriptId
                        ? ` · transcript: ${n.transcriptId}`
                        : null}
                    {n.participant
                      ? ` · participant: ${n.participant.email}`
                      : null}
                  </p>
                </div>
              ))}
              {activeGuide.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : null}
            </div>
            {canWrite ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <textarea
                  aria-label="Interview notes"
                  className="min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="Interview notes…"
                  value={noteBody}
                  disabled={savingNote}
                  onChange={(e) => setNoteBody(e.target.value)}
                />
                <select
                  aria-label="Optional research question"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  value={noteQuestionId}
                  disabled={savingNote}
                  onChange={(e) => setNoteQuestionId(e.target.value)}
                >
                  <option value="">Optional: link to research question</option>
                  {[
                    ...activeGuide.aiWeeklyQuestions,
                    ...activeGuide.standardQuestions,
                  ].map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.publicId}
                      {q.category
                        ? ` · ${q.category.replace(/_/g, " ")}`
                        : ""}{" "}
                      — {q.prompt.slice(0, 80)}
                      {q.prompt.length > 80 ? "…" : ""}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Optional transcript UUID"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="Optional transcript UUID"
                  value={transcriptId}
                  disabled={savingNote}
                  onChange={(e) => setTranscriptId(e.target.value)}
                />
                <button
                  type="button"
                  disabled={savingNote || !noteBody.trim()}
                  className="w-fit rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => {
                    const requestedWeek = weekStart;
                    const submittedBody = noteBody.trim();
                    const submittedTranscript = transcriptId.trim();
                    const activeQuestionIds = new Set([
                      ...activeGuide.aiWeeklyQuestions.map((q) => q.id),
                      ...activeGuide.standardQuestions.map((q) => q.id),
                    ]);
                    const submittedQuestionId = activeQuestionIds.has(
                      noteQuestionId,
                    )
                      ? noteQuestionId.trim()
                      : "";
                    setSavingNote(true);
                    setError(null);
                    void adminCreateInterviewGuideNote({
                      weekStart: requestedWeek,
                      body: submittedBody,
                      transcriptId: submittedTranscript || undefined,
                      researchQuestionId: submittedQuestionId || undefined,
                    })
                      .then((res) => {
                        if (!res.ok || !res.data) {
                          if (weekStartRef.current === requestedWeek) {
                            setError(res.error ?? "Failed to save note");
                          }
                          return;
                        }
                        // Always clear the submitted draft so switching weeks
                        // mid-save cannot leave text that duplicates on re-save.
                        setNoteBody("");
                        setTranscriptId("");
                        setNoteQuestionId("");

                        if (weekStartRef.current !== requestedWeek) return;

                        const saved = res.data;
                        // Treat the mutation as success: append locally so a
                        // failed silent refresh cannot hide the saved note or
                        // invite a duplicate retry.
                        setGuide((prev) => {
                          if (!prev || prev.weekStart !== requestedWeek) {
                            return prev;
                          }
                          if (prev.notes.some((n) => n.id === saved.id)) {
                            return prev;
                          }
                          return {
                            ...prev,
                            notes: [
                              ...prev.notes,
                              {
                                id: saved.id,
                                body: saved.body,
                                participantId: saved.participantId,
                                participant: null,
                                transcriptId: saved.transcriptId,
                                transcript: null,
                                researchQuestionId: saved.researchQuestionId,
                                researchQuestion: saved.researchQuestion,
                                createdByAdminId: saved.createdByAdminId,
                                createdAt: saved.createdAt,
                                updatedAt: saved.updatedAt,
                              },
                            ],
                          };
                        });
                        void load({ silent: true });
                      })
                      .finally(() => setSavingNote(false));
                  }}
                >
                  Save note
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
