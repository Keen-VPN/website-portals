import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Play,
  Scale,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { isSafeHttpUrl } from "@/lib/safe-url";
import {
  adminClassActionDecision,
  adminFetchClassActionDiscoveryStatus,
  adminGetClassActionCandidate,
  adminListClassActionCandidates,
  adminListClassActionIngestion,
  adminRunClassActionDiscovery,
  adminSubmitClassActionUrl,
  type ClassActionCandidateDetail,
  type ClassActionCandidateList,
  type ClassActionCandidateSort,
  type ClassActionDiscoveryStatus,
  type ClassActionIngestionRecord,
  type ClassActionReviewStatus,
} from "@/auth/backend";
import {
  DECISIONS,
  STATUS_FILTERS,
  canSubmitDecision,
  decisionBody,
  describeFlag,
  formatDate,
  formatDateTime,
  statusBadgeClass,
  statusLabel,
  type DecisionKind,
} from "./class-action-review-ui";

const PAGE_SIZE = 25;

const panel = "rounded-2xl border border-white/10 bg-card/60 p-5";

function StatusBadge({ status }: { status: ClassActionReviewStatus }) {
  return (
    <Badge variant="outline" className={statusBadgeClass(status)}>
      {statusLabel(status)}
    </Badge>
  );
}

function SafeLink({
  href,
  children,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
}) {
  if (!href || !isSafeHttpUrl(href)) {
    return <span className="text-muted-foreground">{children}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline break-all"
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export default function AdminClassActionReview() {
  const { id } = useParams<{ id: string }>();
  return id ? <CandidateDetail id={id} /> : <CandidateList />;
}

/* -------------------------------------------------------------------------- */
/* List                                                                        */
/* -------------------------------------------------------------------------- */

function CandidateList() {
  const { can } = useAdminAuth();
  const [status, setStatus] = useState<ClassActionReviewStatus | "ALL">(
    "PENDING_REVIEW",
  );
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<ClassActionCandidateSort>("discovered_desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ClassActionCandidateList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIngestion, setShowIngestion] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedQuery, sort]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const res = await adminListClassActionCandidates({
        status,
        q: debouncedQuery,
        page,
        pageSize: PAGE_SIZE,
        sort,
        signal,
      });
      if (signal?.aborted) return;
      if (res.ok && res.data) setData(res.data);
      else setError(res.error ?? "Failed to load candidates");
      setLoading(false);
    },
    [status, debouncedQuery, page, sort],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Scale className="h-6 w-6 text-primary" />
          Class Action Review
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-assisted discovery creates candidates for review. Nothing is shown
          to customers until a reviewer approves it, and expired items are
          removed from customer results.
        </p>
      </header>

      <DiscoveryPanel
        onChanged={() => void load()}
        canDiscover={can("class_actions.discover")}
      />

      <section className={panel}>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={status === f.value ? "default" : "outline"}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
              {f.value !== "ALL" && data ? (
                <span className="ml-1.5 rounded bg-black/20 px-1.5 text-xs">
                  {data.counts[f.value] ?? 0}
                </span>
              ) : null}
            </Button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search title, defendant, case number, source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="md:max-w-md"
            aria-label="Search candidates"
          />
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as ClassActionCandidateSort)}
          >
            <SelectTrigger className="md:w-56" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discovered_desc">Newest discovered</SelectItem>
              <SelectItem value="discovered_asc">Oldest discovered</SelectItem>
              <SelectItem value="deadline_asc">Deadline (soonest)</SelectItem>
              <SelectItem value="deadline_desc">Deadline (latest)</SelectItem>
              <SelectItem value="title_asc">Title A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">Case</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Claim deadline</th>
                <th className="py-2 pr-3">Signals</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2">Discovered</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No candidates match.
                  </td>
                </tr>
              ) : (
                data?.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-white/5 align-top hover:bg-white/5"
                  >
                    <td className="py-3 pr-3">
                      <Link
                        to={`/admin/class-actions/${item.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {item.defendant ?? "Defendant unverified"}
                        {item.caseIdentifier ? ` · ${item.caseIdentifier}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={item.status} />
                        {item.published ? (
                          <span className="text-xs text-emerald-300">
                            Live to customers
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      {formatDate(item.claimDeadline)}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {item.validationOutcome === "passed" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 text-emerald-300"
                          >
                            Validated
                          </Badge>
                        ) : item.validationOutcome ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-300"
                          >
                            Warnings
                          </Badge>
                        ) : null}
                        {item.uncertaintyCount > 0 ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-300"
                          >
                            {item.uncertaintyCount} uncertain
                          </Badge>
                        ) : null}
                        {item.possibleDuplicateCount > 0 ||
                        item.linkedDuplicateOfId ? (
                          <Badge
                            variant="outline"
                            className="border-sky-500/40 text-sky-300"
                          >
                            Possible duplicate
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted-foreground">
                      {item.sourceName ?? "—"}
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">
                      {formatDate(item.discoveredAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data ? `${data.total} result${data.total === 1 ? "" : "s"}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      <section className={panel}>
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowIngestion((v) => !v)}
        >
          <span className="font-medium">
            Ingestion log (skips, duplicates, failures)
          </span>
          <span className="text-xs text-muted-foreground">
            {showIngestion ? "Hide" : "Show"}
          </span>
        </button>
        {showIngestion ? <IngestionLog /> : null}
      </section>
    </div>
  );
}

function DiscoveryPanel({
  onChanged,
  canDiscover,
}: {
  onChanged: () => void;
  canDiscover: boolean;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ClassActionDiscoveryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await adminFetchClassActionDiscoveryStatus(signal);
    if (signal?.aborted) return;
    if (res.ok && res.data) {
      setStatus(res.data);
      setError(null);
    } else {
      setError(res.error ?? "Failed to load discovery status");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    const res = await adminRunClassActionDiscovery();
    setRunning(false);
    const data = res.data;
    if (data?.status === "skipped") {
      toast({ title: "Run skipped", description: data.reason });
    } else if (!res.ok || !data || data.status === "failed") {
      toast({
        title: "Discovery run failed",
        description:
          data?.reason ?? res.error ?? "See recent runs for details.",
        variant: "destructive",
      });
    } else {
      toast({
        title:
          data.status === "partial"
            ? "Run finished with issues"
            : "Run finished",
        description: `${data.stats.created ?? 0} new, ${data.stats.enriched ?? 0} linked to existing, ${data.stats.duplicates ?? 0} duplicates.${data.operationalIssues.length ? ` Issues: ${data.operationalIssues.join(", ")}` : ""}`,
      });
    }
    void load();
    onChanged();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSafeHttpUrl(url.trim())) {
      toast({ title: "Enter a valid http(s) URL", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const res = await adminSubmitClassActionUrl(url.trim());
    setSubmitting(false);
    if (!res.ok || !res.data) {
      toast({
        title: "Submission failed",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    const ok = ["created", "enriched", "duplicate"].includes(res.data.outcome);
    toast({
      title: ok ? "Submitted" : "Not added",
      description: res.data.message,
      variant: ok ? undefined : "destructive",
    });
    setUrl("");
    void load();
    onChanged();
    if (res.data.recommendationId) {
      navigate(`/admin/class-actions/${res.data.recommendationId}`);
    }
  };

  const s = status?.settings;
  const last = status?.recentRuns[0];

  return (
    <section className={panel}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1 text-sm">
          <div className="font-medium">Discovery</div>
          {error ? <div className="text-rose-300">{error}</div> : null}
          {s ? (
            <>
              <div className="text-muted-foreground">
                {s.discoveryEnabled ? (
                  <span className="text-emerald-300">Enabled</span>
                ) : (
                  <span className="text-amber-300">Disabled</span>
                )}{" "}
                · every {s.intervalHours}h · sources:{" "}
                {s.sources.known.join(", ") || "none"}
                {s.sources.unknown.length
                  ? ` (unknown: ${s.sources.unknown.join(", ")})`
                  : ""}
              </div>
              <div className="text-muted-foreground">
                AI extraction:{" "}
                {s.aiConfigured ? (
                  <span>{s.aiModel}</span>
                ) : (
                  <span className="text-amber-300">
                    not configured (deterministic parser only)
                  </span>
                )}
              </div>
              <div className="text-muted-foreground">
                Last run:{" "}
                {last ? (
                  <>
                    <span
                      className={
                        last.status === "failed"
                          ? "text-rose-300"
                          : last.status === "partial"
                            ? "text-amber-300"
                            : "text-emerald-300"
                      }
                    >
                      {last.status}
                    </span>{" "}
                    ({last.trigger}) {formatDateTime(last.startedAt)}
                    {last.error ? ` — ${last.error}` : ""}
                    {last.operationalIssues.length
                      ? ` — issues: ${last.operationalIssues.join(", ")}`
                      : ""}
                  </>
                ) : (
                  "never"
                )}
              </div>
              <div className="text-muted-foreground">
                Last successful scheduled/manual run:{" "}
                {status?.lastSuccessfulRun
                  ? formatDateTime(status.lastSuccessfulRun.startedAt)
                  : "none yet"}
              </div>
            </>
          ) : null}
        </div>
        {canDiscover ? (
          <div className="flex w-full flex-col gap-2 md:w-96">
            <Button
              onClick={() => void runNow()}
              disabled={running || !s?.discoveryEnabled}
              title={
                s && !s.discoveryEnabled
                  ? "Discovery is disabled by configuration"
                  : undefined
              }
            >
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run discovery now
            </Button>
            <form onSubmit={(e) => void submit(e)} className="flex gap-2">
              <Input
                type="url"
                placeholder="Submit a settlement URL for review"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="Settlement URL"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={submitting || !url.trim()}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Submit"
                )}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function IngestionLog() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ClassActionIngestionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    const seq = ++reqSeq.current;
    void adminListClassActionIngestion({ page, pageSize: 20 }).then((res) => {
      if (seq !== reqSeq.current) return;
      if (res.ok && res.data) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setError(null);
      } else {
        setError(res.error ?? "Failed to load");
      }
    });
  }, [page]);

  return (
    <div className="mt-4 space-y-2 text-sm">
      {error ? <p className="text-rose-300">{error}</p> : null}
      {items.map((r) => (
        <div key={r.id} className="rounded-lg border border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{r.outcome}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(r.createdAt)}
            </span>
            {r.submittedBy ? (
              <span className="text-xs text-muted-foreground">
                submitted by {r.submittedBy.name ?? r.submittedBy.id}
              </span>
            ) : null}
          </div>
          <div className="mt-1">{r.reason}</div>
          {r.sourceUrl ? (
            <div className="mt-1 text-xs">
              <SafeLink href={r.sourceUrl}>{r.sourceUrl}</SafeLink>
            </div>
          ) : null}
          {r.matchedRecommendationId ? (
            <Link
              className="mt-1 inline-block text-xs text-primary hover:underline"
              to={`/admin/class-actions/${r.matchedRecommendationId}`}
            >
              View matched candidate
            </Link>
          ) : null}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page * 20 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
        <span className="text-xs text-muted-foreground">{total} records</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function CandidateDetail({ id }: { id: string }) {
  const { can } = useAdminAuth();
  const { toast } = useToast();
  const [detail, setDetail] = useState<ClassActionCandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DecisionKind | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const res = await adminGetClassActionCandidate(id, signal);
      if (signal?.aborted) return;
      if (res.ok && res.data) {
        setDetail(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Failed to load candidate");
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openDecision = (kind: DecisionKind) => {
    setText(kind === "notes" ? (detail?.candidate.reviewerNotes ?? "") : "");
    setPending(kind);
  };

  const confirm = async () => {
    if (!pending || !canSubmitDecision(pending, text)) return;
    setBusy(true);
    const res = await adminClassActionDecision(
      id,
      pending,
      decisionBody(pending, text),
    );
    setBusy(false);
    if (!res.ok || !res.data) {
      toast({
        title: `${DECISIONS[pending].label} failed`,
        description: res.forbidden
          ? "You do not have permission to review class actions."
          : res.error,
        variant: "destructive",
      });
      void load();
      return;
    }
    setDetail(res.data);
    toast({ title: `${DECISIONS[pending].label}: done` });
    setPending(null);
  };

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const c = detail.candidate;
  const evidence = c.evidence ?? [];
  const flags = c.uncertaintyFlags ?? [];
  const warnings = c.validationWarnings ?? [];
  const duplicates = c.duplicateMatches ?? [];
  const canReview = can("class_actions.review");
  const decisionActions = detail.allowedActions;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            {detail.customerVisible ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-300"
              >
                Live to customers
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-slate-500/40 text-slate-300"
              >
                Not visible to customers
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <p className="text-sm text-muted-foreground">
            Discovered {formatDateTime(c.discoveredAt)} from{" "}
            {c.sourceName ?? "source"} ·{" "}
            {c.extractionMethod === "ai"
              ? "AI extraction + source grounding"
              : "Deterministic parser"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSafeHttpUrl(c.sourceUrl) ? (
            <Button variant="outline" asChild>
              <a
                href={c.sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open source
              </a>
            </Button>
          ) : null}
          {canReview
            ? decisionActions.map((action) => (
                <Button
                  key={action}
                  variant={
                    DECISIONS[action].destructive ? "outline" : "default"
                  }
                  className={
                    DECISIONS[action].destructive
                      ? "border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
                      : undefined
                  }
                  disabled={
                    action === "approve" && !detail.publicationChecks.ok
                  }
                  title={
                    action === "approve" && !detail.publicationChecks.ok
                      ? "Publication checks must pass before approval"
                      : undefined
                  }
                  onClick={() => openDecision(action)}
                >
                  {action === "approve" ? (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  ) : null}
                  {action === "reject" ? (
                    <XCircle className="mr-2 h-4 w-4" />
                  ) : null}
                  {DECISIONS[action].label}
                </Button>
              ))
            : null}
          {canReview ? (
            <Button variant="outline" onClick={() => openDecision("notes")}>
              <FileText className="mr-2 h-4 w-4" />
              {DECISIONS.notes.label}
            </Button>
          ) : null}
        </div>
      </header>

      <section
        className={`rounded-2xl border p-4 text-sm ${
          detail.publicationChecks.ok
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <div className="font-medium">
          {detail.publicationChecks.ok
            ? `Publication checks pass (${detail.publicationChecks.evaluatedFor}).`
            : `Publication checks failing (${detail.publicationChecks.evaluatedFor}):`}
        </div>
        {detail.publicationChecks.failures.length ? (
          <ul className="mt-1 list-disc pl-5">
            {detail.publicationChecks.failures.map((f) => (
              <li key={f.code}>{f.message}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4" /> Source-backed facts
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Only values found verbatim in the retrieved source are shown here.
            Missing values could not be verified.
          </p>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Case name">{c.title}</Field>
            <Field label="Defendant">{c.partnerName}</Field>
            <Field label="Case / docket number">{c.caseIdentifier}</Field>
            <Field label="Claim deadline">
              {c.claimDeadline ? formatDate(c.claimDeadline) : null}
            </Field>
            <Field label="Settlement amount (reported)">
              {c.settlementAmount}
            </Field>
            <Field label="Potential payment (reported)">
              {c.potentialPayment}
            </Field>
            <Field label="Source">
              <SafeLink href={c.sourceUrl}>
                {c.sourceName ?? c.sourceUrl}
              </SafeLink>
            </Field>
            <Field label="Official claim URL">
              {c.claimUrl ? (
                <SafeLink href={c.claimUrl}>{c.claimUrl}</SafeLink>
              ) : null}
            </Field>
            <Field label="Retrieved">{formatDateTime(c.retrievedAt)}</Field>
          </dl>
          {c.eligibilitySummary ? (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Eligibility (verbatim source text)
              </div>
              <blockquote className="mt-1 whitespace-pre-line border-l-2 border-white/20 pl-3 text-sm">
                {c.eligibilitySummary}
              </blockquote>
            </div>
          ) : null}

          <h3 className="mb-2 mt-6 text-sm font-semibold">Evidence quotes</h3>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No evidence recorded.
            </p>
          ) : (
            <ul className="space-y-2">
              {evidence.map((e, i) => (
                <li
                  key={`${e.field}-${i}`}
                  className={`rounded-lg border p-2 text-sm ${
                    e.verified
                      ? "border-white/10"
                      : "border-rose-500/40 bg-rose-500/5"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{e.field}</Badge>
                    {e.verified ? (
                      <span className="text-emerald-300">Found in source</span>
                    ) : (
                      <span className="text-rose-300">
                        NOT found in source — ignored
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      via {e.origin === "ai" ? "AI" : "parser"}
                    </span>
                  </div>
                  <q className="italic">{e.quote}</q>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border-2 border-dashed border-violet-500/50 bg-violet-500/5 p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-violet-200">
              <Bot className="h-4 w-4" /> AI-generated summary
            </h2>
            <p className="mb-3 text-xs text-violet-200/70">
              Written by {c.aiModel ?? "the AI model"}
              {c.aiExtractedAt ? ` on ${formatDateTime(c.aiExtractedAt)}` : ""}.
              Not verified, not shown to customers, and not legal advice. Check
              every claim against the source.
            </p>
            <p className="whitespace-pre-line text-sm">
              {c.aiSummary ?? (
                <span className="text-muted-foreground">
                  No AI summary (AI extraction was not used).
                </span>
              )}
            </p>
          </section>

          <section className={panel}>
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-300" /> Unverified
              information & warnings
            </h2>
            {flags.length === 0 && warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {flags.map((f) => (
                  <li key={f} className="text-amber-200">
                    {describeFlag(f)}
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`w-${i}`}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          <section className={panel}>
            <h2 className="mb-3 font-semibold">Possible duplicates</h2>
            {detail.duplicateOf ? (
              <p className="mb-2 text-sm">
                Linked as duplicate of{" "}
                <Link
                  className="text-primary hover:underline"
                  to={`/admin/class-actions/${detail.duplicateOf.id}`}
                >
                  {detail.duplicateOf.title}
                </Link>
              </p>
            ) : null}
            {duplicates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No similar records found at discovery time.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {duplicates.map((d) => (
                  <li
                    key={`${d.kind}-${d.id}`}
                    className="rounded-lg border border-white/10 p-2"
                  >
                    {d.kind === "recommendation" ? (
                      <Link
                        className="font-medium hover:text-primary"
                        to={`/admin/class-actions/${d.id}`}
                      >
                        {d.title}
                      </Link>
                    ) : (
                      <span className="font-medium">Perk: {d.title}</span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {d.reason.replace(/_/g, " ")} · score {d.score} ·{" "}
                      {d.status}
                      {d.caseIdentifierConflict
                        ? " · different case numbers"
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={panel}>
            <h2 className="mb-3 font-semibold">Reviewer determination</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <StatusBadge status={c.status} />
              </Field>
              <Field label="Reviewed by">
                {detail.reviewedBy
                  ? (detail.reviewedBy.name ?? detail.reviewedBy.email)
                  : c.reviewedVia === "slack"
                    ? "Slack approver"
                    : null}
              </Field>
              <Field label="Reviewed at">
                {c.reviewedAt ? formatDateTime(c.reviewedAt) : null}
              </Field>
              <Field label="Via">{c.reviewedVia}</Field>
              {c.expiredReason ? (
                <Field label="Expired reason">{c.expiredReason}</Field>
              ) : null}
            </dl>
            <div className="mt-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">
                {c.reviewerNotes ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className={panel}>
        <h2 className="mb-3 font-semibold">Source captures</h2>
        <div className="space-y-3">
          {detail.captures.map((cap) => (
            <details
              key={cap.id}
              className="rounded-lg border border-white/10 p-3 text-sm"
            >
              <summary className="cursor-pointer">
                <span className="font-medium">
                  {cap.pageTitle ?? cap.canonicalUrl}
                </span>{" "}
                <span className="text-xs text-muted-foreground">
                  {cap.isPrimary ? "primary" : "additional source"} ·{" "}
                  {cap.retrievalOutcome}
                  {cap.httpStatus ? ` ${cap.httpStatus}` : ""} ·{" "}
                  {formatDateTime(cap.retrievedAt)}
                </span>
                {cap.conflicts && cap.conflicts.length ? (
                  <Badge
                    variant="outline"
                    className="ml-2 border-rose-500/40 text-rose-300"
                  >
                    {cap.conflicts.length} conflict
                    {cap.conflicts.length === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </summary>
              <div className="mt-2 space-y-2">
                <SafeLink href={cap.finalUrl ?? cap.sourceUrl}>
                  {cap.finalUrl ?? cap.sourceUrl}
                </SafeLink>
                {cap.conflicts?.map((cf, i) => (
                  <div key={i} className="text-xs text-rose-200">
                    {cf.field}: existing “{cf.existing ?? "—"}” vs this source “
                    {cf.incoming ?? "—"}”
                  </div>
                ))}
                {cap.snapshotText ? (
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-xs text-muted-foreground">
                    {cap.snapshotText}
                    {cap.snapshotTruncated ? "\n…(truncated)" : ""}
                  </pre>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className={panel}>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" /> History
        </h2>
        <ol className="space-y-2 text-sm">
          {detail.history.map((h) => (
            <li key={h.id} className="border-l-2 border-white/15 pl-3">
              <div>
                <span className="font-medium">{h.action}</span>
                {h.fromStatus || h.toStatus ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({h.fromStatus ?? "—"} → {h.toStatus ?? "—"})
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateTime(h.createdAt)} ·{" "}
                {h.actorType === "admin"
                  ? (h.admin?.name ?? h.admin?.email ?? "admin")
                  : h.actorType === "slack"
                    ? `Slack ${h.slackUserId ?? ""}`
                    : "system"}
              </div>
              {typeof h.metadata?.reason === "string" ? (
                <div className="mt-0.5 whitespace-pre-line">
                  Reason: {h.metadata.reason}
                </div>
              ) : null}
              {h.notes ? (
                <div className="mt-0.5 whitespace-pre-line">{h.notes}</div>
              ) : null}
            </li>
          ))}
        </ol>
        {detail.relatedIngestion.length ? (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold">
              Related ingestion records
            </h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {detail.relatedIngestion.map((r) => (
                <li key={r.id}>
                  {formatDateTime(r.createdAt)} · {r.outcome} · {r.reason}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => (!open && !busy ? setPending(null) : undefined)}
      >
        {pending ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{DECISIONS[pending].title}</AlertDialogTitle>
              <AlertDialogDescription>
                {DECISIONS[pending].description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="space-y-1 text-sm">
              <span>{DECISIONS[pending].input.label}</span>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={
                  DECISIONS[pending].input.field === "reason" ? 500 : 4000
                }
              />
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <Button
                variant={
                  DECISIONS[pending].destructive ? "destructive" : "default"
                }
                disabled={busy || !canSubmitDecision(pending, text)}
                onClick={() => void confirm()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {DECISIONS[pending].confirmLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/admin/class-actions"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> All candidates
    </Link>
  );
}
