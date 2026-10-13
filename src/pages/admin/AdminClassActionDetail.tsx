import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  adminClassActionReviewDecision,
  adminFetchClassActionCandidate,
  type AdminClassActionCandidateDetail,
} from "@/auth/backend";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { isSafeHttpUrl } from "@/lib/safe-url";

function formatMarketSize(value: number | null | undefined): string {
  if (value == null || value < 1) return "Not available";
  return value.toLocaleString("en-US");
}

export default function AdminClassActionDetail() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { can } = useAdminAuth();
  const canRead = can("class_actions.read");
  const canReview = can("class_actions.review");

  const [detail, setDetail] = useState<AdminClassActionCandidateDetail | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const candidateIdRef = useRef(candidateId);
  candidateIdRef.current = candidateId;

  useEffect(() => {
    setDetail(null);
    setNotes("");
    setError(null);
    setLoading(true);
  }, [candidateId]);

  const load = useCallback(async () => {
    if (!canRead || !candidateId) {
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    const requestedId = candidateId;
    const res = await adminFetchClassActionCandidate(requestedId);
    if (seq !== loadSeq.current) return;
    if (candidateIdRef.current !== requestedId) return;
    if (res.ok && res.data) {
      if (res.data.candidate.id !== requestedId) return;
      setDetail(res.data);
    } else {
      setDetail(null);
      if (res.status === 404) {
        setError("This recommendation was not found or may have been removed.");
      } else if (res.status === 403) {
        setError("You do not have permission to view this recommendation.");
      } else {
        setError(res.error ?? "Failed to load recommendation");
      }
    }
    setLoading(false);
  }, [canRead, candidateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runDecision = async (action: "approve" | "reject") => {
    if (!candidateId || !canReview) return;
    setBusy(true);
    setError(null);
    const requestedId = candidateId;
    const res = await adminClassActionReviewDecision(
      requestedId,
      action,
      notes.trim() || undefined,
    );
    setBusy(false);
    if (candidateIdRef.current !== requestedId) return;
    if (res.ok && res.data) {
      if (res.data.candidate.id !== requestedId) return;
      setDetail(res.data);
      setNotes("");
    } else {
      setError(res.error ?? `Failed to ${action}`);
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Class action review</h2>
        <p className="text-sm text-muted-foreground">
          Your admin role does not include class-action review access.
        </p>
      </div>
    );
  }

  if (!candidateId) {
    return (
      <p className="text-sm text-destructive">Missing recommendation id.</p>
    );
  }

  const c = detail?.candidate;
  const canApprove =
    detail?.allowedActions.includes("approve") ?? false;
  const canReject = detail?.allowedActions.includes("reject") ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/class-actions">← All candidates</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error && !detail ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : c && detail ? (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">{c.title}</h2>
              <Badge variant="secondary">{c.status.replace(/_/g, " ")}</Badge>
              {detail.customerVisible ? (
                <Badge>Live for members</Badge>
              ) : (
                <Badge variant="outline">Inactive draft</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground break-all">{c.id}</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border border-border p-4 space-y-2 text-sm">
              <h3 className="font-semibold">Settlement details</h3>
              <p>
                <span className="text-muted-foreground">Potential payment:</span>{" "}
                {c.potentialPayment ?? c.settlementAmount ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Market size:</span>{" "}
                {formatMarketSize(c.marketSizeEstimate)}
              </p>
              {c.marketSizeEstimateSource ? (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  Internal source: {c.marketSizeEstimateSource}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Claim deadline:</span>{" "}
                {c.claimDeadline ? c.claimDeadline.slice(0, 10) : "—"}
              </p>
              {c.eligibilitySummary ? (
                <p className="whitespace-pre-wrap">
                  <span className="text-muted-foreground">Who may qualify:</span>{" "}
                  {c.eligibilitySummary}
                </p>
              ) : null}
              {c.summary ? (
                <p className="whitespace-pre-wrap">
                  <span className="text-muted-foreground">Summary:</span>{" "}
                  {c.summary}
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border border-border p-4 space-y-2 text-sm">
              <h3 className="font-semibold">Links</h3>
              {isSafeHttpUrl(c.sourceUrl) ? (
                <p>
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Settlement source
                  </a>
                </p>
              ) : null}
              {c.claimUrl && isSafeHttpUrl(c.claimUrl) ? (
                <p>
                  <a
                    href={c.claimUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Submit claim
                  </a>
                </p>
              ) : null}
              {detail.perk ? (
                <p>
                  <Link
                    to={`/admin/perks?perkId=${encodeURIComponent(detail.perk.id)}`}
                    className="text-primary hover:underline"
                  >
                    Linked perk: {detail.perk.title} (
                    {detail.perk.isActive ? "active" : "inactive"})
                  </Link>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {detail.perk.id}
                  </span>
                </p>
              ) : null}
            </section>
          </div>

          {!detail.publicationChecks.ok ? (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <h3 className="font-semibold">Publication checks</h3>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {detail.publicationChecks.failures.map((f) => (
                  <li key={f.code}>{f.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {canReview && (canApprove || canReject) ? (
            <section className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-semibold">Review decision</h3>
              <Textarea
                placeholder="Optional reviewer notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                {canApprove ? (
                  <Button
                    disabled={busy}
                    onClick={() => void runDecision("approve")}
                  >
                    Approve & publish
                  </Button>
                ) : null}
                {canReject ? (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void runDecision("reject")}
                  >
                    Reject
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {detail.history.length > 0 ? (
            <section className="rounded-lg border border-border p-4 text-sm">
              <h3 className="font-semibold mb-2">History</h3>
              <ul className="space-y-2">
                {detail.history.slice(0, 12).map((e) => (
                  <li key={e.id} className="border-t border-border pt-2">
                    <span className="font-medium">{e.action}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.createdAt.slice(0, 19).replace("T", " ")} UTC
                    </span>
                    {e.admin ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.admin.email}
                      </span>
                    ) : null}
                    {e.notes ? (
                      <p className="text-muted-foreground mt-1">{e.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
