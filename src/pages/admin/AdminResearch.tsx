import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  adminAddInterviewParticipant,
  adminAssociateInterviewTranscript,
  adminCreateResearchStudy,
  adminFetchResearchStudies,
  adminFetchResearchStudy,
  adminFetchResearchTranscripts,
  adminLinkInterviewTranscript,
  adminMarkInterviewIncentivePaid,
  adminReconcileFirefliesTranscripts,
  adminUpdateInterviewParticipantStatus,
  adminUpdateResearchStudy,
  type AdminInterviewParticipant,
  type AdminMeetingTranscript,
  type AdminResearchStudy,
} from "@/auth/backend";

const MEETING_TYPES = [
  { value: "", label: "All types" },
  { value: "USER_INTERVIEW", label: "User interview" },
  { value: "TEAM_CHECKIN", label: "Team check-in" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "SEO_BRIEFING", label: "SEO briefing" },
  { value: "CHIEF_OF_STAFF_BRIEFING", label: "Chief of Staff briefing" },
  { value: "DESIGN_BRIEFING", label: "Design briefing" },
  { value: "OTHER", label: "Other" },
];

const RECRUIT_SOURCES = [
  "CUSTOMER_OUTREACH",
  "LINKEDIN",
  "PERPLEXITY",
  "BOARDY",
  "OTHER",
] as const;

const PARTICIPANT_STATUSES = [
  "SOURCED",
  "INVITED",
  "SCHEDULED",
  "COMPLETED",
  "NO_SHOW",
  "DECLINED",
  "CANCELED",
] as const;

export default function AdminResearch() {
  const { can } = useAdminAuth();
  const canRead = can("research.read");
  const canWrite = can("research.write");

  const [tab, setTab] = useState<"transcripts" | "studies">("studies");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [meetingType, setMeetingType] = useState("");
  const [q, setQ] = useState("");
  const [transcripts, setTranscripts] = useState<AdminMeetingTranscript[]>([]);
  const [transcriptTotal, setTranscriptTotal] = useState(0);

  const [studies, setStudies] = useState<AdminResearchStudy[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [studyDetail, setStudyDetail] = useState<
    (AdminResearchStudy & { participants: AdminInterviewParticipant[] }) | null
  >(null);

  const [newStudyName, setNewStudyName] = useState("");
  const [newStudyUrl, setNewStudyUrl] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantSource, setParticipantSource] =
    useState<(typeof RECRUIT_SOURCES)[number]>("CUSTOMER_OUTREACH");
  const loadTranscripts = useCallback(async () => {
    setError(null);
    const res = await adminFetchResearchTranscripts({
      meetingType: meetingType || undefined,
      q: q.trim() || undefined,
      limit: 50,
    });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load transcripts");
      return;
    }
    setTranscripts(res.data.items);
    setTranscriptTotal(res.data.total);
  }, [meetingType, q]);

  const loadStudies = useCallback(async () => {
    setError(null);
    const res = await adminFetchResearchStudies();
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load studies");
      return;
    }
    setStudies(res.data);
  }, []);

  const loadStudyDetail = useCallback(async (id: string) => {
    setError(null);
    const res = await adminFetchResearchStudy(id);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load study");
      return;
    }
    setStudyDetail(res.data);
    setSelectedStudyId(id);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void loadStudies();
    void loadTranscripts();
  }, [canRead, loadStudies, loadTranscripts]);

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
          <h2 className="text-2xl font-bold">Research</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fireflies transcripts for the Iteration Engine, plus interview
            recruitment with $50 gift-card tracking. Paste a Calendly link as
            the study scheduling URL; with the Calendly webhook enabled,
            bookings auto-mark participants Scheduled (use{" "}
            <code className="text-xs">utm_content=&lt;studyId&gt;</code> on the
            link when you run multiple studies).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              tab === "studies" ? "bg-muted" : "hover:bg-muted"
            }`}
            onClick={() => setTab("studies")}
          >
            Studies
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              tab === "transcripts" ? "bg-muted" : "hover:bg-muted"
            }`}
            onClick={() => setTab("transcripts")}
          >
            Transcripts
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {tab === "transcripts" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={meetingType}
              onChange={(e) => setMeetingType(e.target.value)}
            >
              {MEETING_TYPES.map((t) => (
                <option key={t.value || "all"} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Search title or transcript…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              onClick={() => void loadTranscripts()}
            >
              Search
            </button>
            {canWrite ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  void adminReconcileFirefliesTranscripts()
                    .then((res) => {
                      if (!res.ok) setError(res.error ?? "Reconcile failed");
                      else void loadTranscripts();
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Reconcile Fireflies
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {transcriptTotal} transcript{transcriptTotal === 1 ? "" : "s"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="p-3">Title</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.map((t) => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="p-3">
                      <div className="font-medium">{t.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {t.id}
                      </div>
                    </td>
                    <td className="p-3">{t.meetingType}</td>
                    <td className="p-3">
                      {new Date(t.occurredAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      {t.ingestionStatus}
                      {t.lastError ? (
                        <div className="max-w-xs truncate text-xs text-destructive">
                          {t.lastError}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {transcripts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-muted-foreground"
                    >
                      No transcripts yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          {canWrite ? (
            <div className="flex flex-wrap gap-2 rounded-lg border border-border p-4">
              <input
                className="min-w-[180px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Study name"
                value={newStudyName}
                onChange={(e) => setNewStudyName(e.target.value)}
              />
              <input
                className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Scheduling link (Calendly etc.)"
                value={newStudyUrl}
                onChange={(e) => setNewStudyUrl(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !newStudyName.trim()}
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  void adminCreateResearchStudy({
                    name: newStudyName.trim(),
                    schedulingUrl: newStudyUrl.trim() || undefined,
                    status: "ACTIVE",
                    incentiveCents: 5000,
                    incentiveLabel: "$50 gift card",
                  })
                    .then((res) => {
                      if (!res.ok) setError(res.error ?? "Create failed");
                      else {
                        setNewStudyName("");
                        setNewStudyUrl("");
                        void loadStudies();
                        if (res.data) void loadStudyDetail(res.data.id);
                      }
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Create study
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="rounded-lg border border-border">
              <ul className="divide-y divide-border">
                {studies.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left text-sm hover:bg-muted ${
                        selectedStudyId === s.id ? "bg-muted" : ""
                      }`}
                      onClick={() => void loadStudyDetail(s.id)}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.status} · {s._count?.participants ?? 0} participants
                      </div>
                    </button>
                  </li>
                ))}
                {studies.length === 0 ? (
                  <li className="p-3 text-sm text-muted-foreground">
                    No studies yet.
                  </li>
                ) : null}
              </ul>
            </div>

            <div className="space-y-4">
              {!studyDetail ? (
                <p className="text-sm text-muted-foreground">
                  Select a study to manage participants, scheduling, and
                  incentives.
                </p>
              ) : (
                <>
                  <div className="rounded-lg border border-border p-4">
                    <h3 className="text-lg font-semibold">{studyDetail.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Incentive: {studyDetail.incentiveLabel} (
                      {studyDetail.incentiveCents}¢)
                    </p>
                    {studyDetail.schedulingUrl ? (
                      <a
                        className="mt-2 inline-block text-sm text-primary underline"
                        href={studyDetail.schedulingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open scheduling link
                      </a>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No scheduling link set.
                      </p>
                    )}
                    {canWrite ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                          placeholder="Update scheduling URL"
                          defaultValue={studyDetail.schedulingUrl ?? ""}
                          id="study-scheduling-url"
                        />
                        <button
                          type="button"
                          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                          onClick={() => {
                            const el = document.getElementById(
                              "study-scheduling-url",
                            ) as HTMLInputElement | null;
                            void adminUpdateResearchStudy(studyDetail.id, {
                              schedulingUrl: el?.value?.trim() || null,
                            }).then((res) => {
                              if (!res.ok) setError(res.error ?? "Update failed");
                              else void loadStudyDetail(studyDetail.id);
                            });
                          }}
                        >
                          Save link
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {canWrite ? (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-border p-4">
                      <input
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Email"
                        value={participantEmail}
                        onChange={(e) => setParticipantEmail(e.target.value)}
                      />
                      <input
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        placeholder="Name"
                        value={participantName}
                        onChange={(e) => setParticipantName(e.target.value)}
                      />
                      <select
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={participantSource}
                        onChange={(e) =>
                          setParticipantSource(
                            e.target.value as (typeof RECRUIT_SOURCES)[number],
                          )
                        }
                      >
                        {RECRUIT_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!participantEmail.trim()}
                        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                        onClick={() => {
                          void adminAddInterviewParticipant(studyDetail.id, {
                            email: participantEmail.trim(),
                            name: participantName.trim() || undefined,
                            recruitSource: participantSource,
                          }).then((res) => {
                            if (!res.ok) setError(res.error ?? "Add failed");
                            else {
                              setParticipantEmail("");
                              setParticipantName("");
                              void loadStudyDetail(studyDetail.id);
                            }
                          });
                        }}
                      >
                        Add participant
                      </button>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-muted/40">
                        <tr>
                          <th className="p-3">Participant</th>
                          <th className="p-3">Source</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Incentive</th>
                          <th className="p-3">Transcript</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studyDetail.participants.map((p) => (
                          <tr key={p.id} className="border-b border-border/60">
                            <td className="p-3">
                              <div>{p.name || "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.email}
                              </div>
                            </td>
                            <td className="p-3">{p.recruitSource}</td>
                            <td className="p-3">
                              {canWrite ? (
                                <select
                                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                                  value={p.status}
                                  onChange={(e) => {
                                    void adminUpdateInterviewParticipantStatus(
                                      p.id,
                                      { status: e.target.value },
                                    ).then((res) => {
                                      if (!res.ok)
                                        setError(res.error ?? "Update failed");
                                      else void loadStudyDetail(studyDetail.id);
                                    });
                                  }}
                                >
                                  {PARTICIPANT_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                p.status
                              )}
                            </td>
                            <td className="p-3">{p.incentiveStatus}</td>
                            <td className="p-3">
                              {p.transcript ? (
                                <span className="text-xs">
                                  {p.transcript.title}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-3">
                              {canWrite ? (
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    className="text-left text-xs text-primary underline"
                                    onClick={() => {
                                      void adminAssociateInterviewTranscript(
                                        p.id,
                                      ).then((res) => {
                                        if (!res.ok)
                                          setError(res.error ?? "Match failed");
                                        else if (!res.data?.matched)
                                          setError(
                                            "No matching user_interview transcript found",
                                          );
                                        else
                                          void loadStudyDetail(studyDetail.id);
                                      });
                                    }}
                                  >
                                    Auto-match transcript
                                  </button>
                                  <button
                                    type="button"
                                    className="text-left text-xs text-primary underline"
                                    onClick={() => {
                                      const raw = window.prompt(
                                        "Transcript UUID to link",
                                      );
                                      if (!raw?.trim()) return;
                                      void adminLinkInterviewTranscript(
                                        p.id,
                                        raw.trim(),
                                      ).then((res) => {
                                        if (!res.ok)
                                          setError(res.error ?? "Link failed");
                                        else
                                          void loadStudyDetail(studyDetail.id);
                                      });
                                    }}
                                  >
                                    Link transcript…
                                  </button>
                                  {p.status === "COMPLETED" &&
                                  p.incentiveStatus === "PENDING" ? (
                                    <button
                                      type="button"
                                      className="text-left text-xs text-primary underline"
                                      onClick={() => {
                                        void adminMarkInterviewIncentivePaid(
                                          p.id,
                                        ).then((res) => {
                                          if (!res.ok)
                                            setError(
                                              res.error ?? "Payment mark failed",
                                            );
                                          else
                                            void loadStudyDetail(studyDetail.id);
                                        });
                                      }}
                                    >
                                      Mark $50 paid
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                        {studyDetail.participants.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="p-4 text-muted-foreground"
                            >
                              No participants yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
