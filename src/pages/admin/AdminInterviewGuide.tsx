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
      </div>
      <p className="mt-2 text-sm font-medium">{props.question.prompt}</p>
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
  const [noteBody, setNoteBody] = useState("");
  const [transcriptId, setTranscriptId] = useState("");
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
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              onClick={() => {
                const requestedWeek = weekStart;
                setBusy(true);
                setError(null);
                void adminGenerateWeeklyInterviewQuestions({
                  weekStart: requestedWeek,
                })
                  .then((res) => {
                    if (weekStartRef.current !== requestedWeek) return;
                    if (!res.ok) {
                      setError(res.error ?? "Generate failed");
                      return;
                    }
                    void load({ silent: true });
                    if (res.data?.skipped) {
                      setError(
                        res.data.message ??
                          "AI questions already exist for this week.",
                      );
                    }
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Generate AI questions
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Week of {formatWeekLabel(weekStart)} · Internal
      </p>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {awaiting ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
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
                These change as the Iteration Engine identifies new research
                priorities. Each has a stable RQ id for later evaluation.
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
                Capture findings and optionally link a transcript UUID from
                Research.
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
                  disabled={busy}
                  onChange={(e) => setNoteBody(e.target.value)}
                />
                <input
                  aria-label="Optional transcript UUID"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                  placeholder="Optional transcript UUID"
                  value={transcriptId}
                  disabled={busy}
                  onChange={(e) => setTranscriptId(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !noteBody.trim()}
                  className="w-fit rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => {
                    const requestedWeek = weekStart;
                    const submittedBody = noteBody.trim();
                    const submittedTranscript = transcriptId.trim();
                    setBusy(true);
                    setError(null);
                    void adminCreateInterviewGuideNote({
                      weekStart: requestedWeek,
                      body: submittedBody,
                      transcriptId: submittedTranscript || undefined,
                    })
                      .then((res) => {
                        if (weekStartRef.current !== requestedWeek) return;
                        if (!res.ok || !res.data) {
                          setError(res.error ?? "Failed to save note");
                          return;
                        }
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
                                createdByAdminId: saved.createdByAdminId,
                                createdAt: saved.createdAt,
                                updatedAt: saved.updatedAt,
                              },
                            ],
                          };
                        });
                        // Only clear if the user has not edited since submit
                        // (inputs are also disabled while busy).
                        setNoteBody((current) =>
                          current.trim() === submittedBody ? "" : current,
                        );
                        setTranscriptId((current) =>
                          current.trim() === submittedTranscript
                            ? ""
                            : current,
                        );
                        void load({ silent: true });
                      })
                      .finally(() => setBusy(false));
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
