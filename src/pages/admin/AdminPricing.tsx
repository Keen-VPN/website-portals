import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminApprovePricingChange,
  adminCreatePricingChange,
  adminFetchPricingCatalog,
  adminGetPricingChange,
  adminListPricingChanges,
  adminRejectPricingChange,
  adminRunPricingDriftAudit,
  adminSubmitPricingChange,
  type AdminPricingChangeDetail,
  type AdminPricingChangeListItem,
  type AdminPricingDriftFinding,
  type AdminPricingPreview,
  type AdminPricingSku,
  type PricingChangeStatus,
  type PricingPlatform,
} from "@/auth/backend";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const PLATFORMS: (PricingPlatform | "ALL")[] = [
  "ALL",
  "WEB",
  "IOS",
  "MACOS",
  "ANDROID",
  "WINDOWS",
];

const STATUS_FILTERS: (PricingChangeStatus | "")[] = [
  "",
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "APPLYING",
  "APPLIED",
  "PARTIAL_FAILURE",
  "FAILED",
  "REJECTED",
];

function skuPrice(sku: AdminPricingSku): number {
  return typeof sku.basePrice === "number"
    ? sku.basePrice
    : Number.parseFloat(String(sku.basePrice));
}

function formatMoney(amount: number, currency = "USD"): string {
  if (!Number.isFinite(amount)) return String(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatSkuPrice(sku: AdminPricingSku): string {
  return formatMoney(skuPrice(sku), sku.currency || "USD");
}

export default function AdminPricing() {
  const { admin, can } = useAdminAuth();
  const canRead = can("pricing.read");
  const canWrite = can("pricing.write");
  const canApprove = can("pricing.approve");

  const [catalog, setCatalog] = useState<AdminPricingSku[]>([]);
  const [platformFilter, setPlatformFilter] = useState<PricingPlatform | "ALL">(
    "ALL",
  );
  const [requests, setRequests] = useState<AdminPricingChangeListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<PricingChangeStatus | "">(
    "PENDING_APPROVAL",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toPrices, setToPrices] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<AdminPricingPreview | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPricingChangeDetail | null>(null);
  const [driftFindings, setDriftFindings] = useState<
    AdminPricingDriftFinding[] | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadRequestsSeq = useRef(0);

  const loadCatalog = useCallback(async () => {
    const res = await adminFetchPricingCatalog();
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load catalog");
      setCatalog([]);
      return;
    }
    setCatalog(res.data);
  }, []);

  const loadRequests = useCallback(async () => {
    const seq = ++loadRequestsSeq.current;
    const res = await adminListPricingChanges({
      status: statusFilter || undefined,
      limit: 50,
    });
    if (seq !== loadRequestsSeq.current) return;
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load change requests");
      setRequests([]);
      return;
    }
    setRequests(res.data);
  }, [statusFilter]);

  const refresh = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    await Promise.all([loadCatalog(), loadRequests()]);
    setLoading(false);
  }, [canRead, loadCatalog, loadRequests]);

  // Catalog is independent of status filter — load once on mount / via Refresh.
  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadCatalog().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [canRead, loadCatalog]);

  useEffect(() => {
    if (!canRead) return;
    setError(null);
    void loadRequests();
  }, [canRead, loadRequests]);

  const filteredCatalog = useMemo(() => {
    if (platformFilter === "ALL") return catalog;
    return catalog.filter((sku) => sku.platform === platformFilter);
  }, [catalog, platformFilter]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedSkus = useMemo(
    () => catalog.filter((sku) => selectedIds.has(sku.id)),
    [catalog, selectedIds],
  );

  const createDraft = async () => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    setDraftId(null);

    const changes = selectedSkus.map((sku) => {
      const raw = toPrices[sku.id];
      const toPrice = Number.parseFloat(raw);
      return {
        planKey: sku.planKey,
        billingPeriod: sku.billingPeriod,
        platform: sku.platform,
        currency: sku.currency,
        fromPrice: skuPrice(sku),
        toPrice,
        trialDays: sku.trialDays,
        storeProductId: sku.storeProductId,
        storePriceId: sku.storePriceId,
      };
    });

    if (changes.length === 0) {
      setError("Select at least one catalog row");
      setBusy(false);
      return;
    }
    if (changes.some((c) => !Number.isFinite(c.toPrice) || c.toPrice <= 0)) {
      setError("Enter a valid to-price for each selected row");
      setBusy(false);
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      setBusy(false);
      return;
    }

    const res = await adminCreatePricingChange({
      title: title.trim(),
      notes: notes.trim() || undefined,
      changes,
    });
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to create draft");
      setBusy(false);
      return;
    }

    setDraftId(res.data.request.id);
    setPreview(res.data.preview);
    setNotice(
      `Draft created (${res.data.request.id}). Submit for approval when ready.`,
    );
    // Prevent accidental duplicate drafts from the same selection.
    setSelectedIds(new Set());
    setToPrices({});
    await loadRequests();
    setBusy(false);
  };

  const submitDraftById = async (id: string) => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    const res = await adminSubmitPricingChange(id);
    if (!res.ok) {
      setError(res.error ?? "Failed to submit");
      setBusy(false);
      return;
    }
    setNotice(
      "Submitted for approval. Slack preview posted if webhook is configured.",
    );
    if (draftId === id) {
      setDraftId(null);
      setPreview(null);
      setSelectedIds(new Set());
      setToPrices({});
      setTitle("");
      setNotes("");
    }
    if (detail?.id === id) {
      setDetail((prev) => res.data ?? prev);
    }
    await loadRequests();
    setBusy(false);
  };

  const submitDraft = async () => {
    if (!draftId) return;
    await submitDraftById(draftId);
  };

  const openDetail = async (id: string) => {
    setBusy(true);
    setError(null);
    const res = await adminGetPricingChange(id);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load request");
      setBusy(false);
      return;
    }
    setDetail(res.data);
    setRejectReason("");
    setBusy(false);
  };

  const approveSelected = async () => {
    if (!canApprove || !detail) return;
    setBusy(true);
    setError(null);
    const res = await adminApprovePricingChange(detail.id);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Approve failed");
      setBusy(false);
      return;
    }
    setDetail(res.data);
    setNotice(`Approved — status ${res.data.status}`);
    await Promise.all([loadCatalog(), loadRequests()]);
    setBusy(false);
  };

  const rejectSelected = async () => {
    if (!canApprove || !detail) return;
    setBusy(true);
    setError(null);
    const res = await adminRejectPricingChange(
      detail.id,
      rejectReason.trim() || undefined,
    );
    if (!res.ok || !res.data) {
      setError(res.error ?? "Reject failed");
      setBusy(false);
      return;
    }
    setDetail(res.data);
    setNotice("Rejected");
    await loadRequests();
    setBusy(false);
  };

  const runDrift = async () => {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    const res = await adminRunPricingDriftAudit();
    if (!res.ok || !res.data) {
      setError(res.error ?? "Drift audit failed");
      setBusy(false);
      return;
    }
    setDriftFindings(res.data.findings);
    setNotice(
      res.data.findings.length === 0
        ? "No pricing drift detected"
        : `Found ${res.data.findings.length} drift finding(s)`,
    );
    setBusy(false);
  };

  if (!canRead) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        You need <code>pricing.read</code> to view the pricing portal.
      </div>
    );
  }

  const isSelfCreated =
    !!detail?.createdByAdminId && detail.createdByAdminId === admin?.id;
  const detailChanges = Array.isArray(detail?.proposedChanges)
    ? detail.proposedChanges
    : [];
  const hasVisibleChanges = detailChanges.length > 0;
  const canApproveThis =
    canApprove &&
    detail?.status === "PENDING_APPROVAL" &&
    !isSelfCreated &&
    hasVisibleChanges;
  const canSubmitOpenedDraft =
    canWrite &&
    (detail?.status === "DRAFT" || detail?.status === "REJECTED") &&
    hasVisibleChanges;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Pricing</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Source of truth for Keen prices across Web/Stripe, Apple, Google Play,
            and Windows. Propose a change, submit for Slack review, then a
            different admin approves. Apple/Play store pushes stay skipped until
            sync credentials and enable flags are configured; Windows follows the
            WEB/Stripe catalog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void runDrift()}
            >
              Run drift audit
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-900 dark:text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-lg font-semibold">Catalog</h3>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Platform</span>
            <select
              value={platformFilter}
              onChange={(e) =>
                setPlatformFilter(e.target.value as PricingPlatform | "ALL")
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p === "ALL" ? "All platforms" : p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                {canWrite ? <th className="px-3 py-2">Select</th> : null}
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Store product</th>
                <th className="px-3 py-2">Store price / plan</th>
                {canWrite ? <th className="px-3 py-2">New price</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading && catalog.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 7 : 5}
                    className="px-3 py-6 text-muted-foreground"
                  >
                    Loading catalog…
                  </td>
                </tr>
              ) : filteredCatalog.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 7 : 5}
                    className="px-3 py-6 text-muted-foreground"
                  >
                    No SKUs for this filter.
                  </td>
                </tr>
              ) : (
                filteredCatalog.map((sku) => {
                  const skuLabel = `${sku.platform} ${sku.billingPeriod} ${sku.planKey}`;
                  return (
                  <tr key={sku.id} className="border-t border-border">
                    {canWrite ? (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(sku.id)}
                          onChange={() => toggleSelected(sku.id)}
                          aria-label={`Select ${skuLabel}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2 font-medium">{sku.platform}</td>
                    <td className="px-3 py-2">{sku.billingPeriod}</td>
                    <td className="px-3 py-2">{formatSkuPrice(sku)}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-xs">
                      {sku.storeProductId || "—"}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2 font-mono text-xs">
                      {sku.storePriceId || "—"}
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          disabled={!selectedIds.has(sku.id) || !!draftId}
                          value={toPrices[sku.id] ?? ""}
                          onChange={(e) =>
                            setToPrices((prev) => ({
                              ...prev,
                              [sku.id]: e.target.value,
                            }))
                          }
                          className="h-8 w-28"
                          placeholder="e.g. 7.99"
                          aria-label={`New price for ${skuLabel}`}
                        />
                      </td>
                    ) : null}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canWrite ? (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="text-lg font-semibold">Propose change</h3>
          <p className="text-sm text-muted-foreground">
            Select catalog rows above, enter new prices, then create a draft and
            submit. Creator cannot approve their own request.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pricing-title">Title</Label>
              <Input
                id="pricing-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Q4 promo pricing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricing-notes">Notes (optional)</Label>
              <Input
                id="pricing-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context for approvers"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || selectedIds.size === 0 || !!draftId}
              onClick={() => void createDraft()}
            >
              Create draft preview
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !draftId}
              onClick={() => void submitDraft()}
            >
              Submit for approval
            </Button>
          </div>
          {preview ? (
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {preview.summary}
            </pre>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-lg font-semibold">Change requests</h3>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Status</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as PricingChangeStatus | "")
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "All statuses"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Platforms</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-muted-foreground">
                    No requests for this filter.
                  </td>
                </tr>
              ) : (
                requests.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.title}</div>
                      {row.previewSummary ? (
                        <div className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                          {row.previewSummary}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.affectedPlatforms.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void openDetail(row.id)}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detail ? (
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{detail.title}</h3>
              <p className="text-sm text-muted-foreground">
                {detail.status} · {detail.id}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDetail(null)}
            >
              Close
            </Button>
          </div>

          {detail.preview?.summary ? (
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {detail.preview.summary}
            </pre>
          ) : null}

          <div>
            <h4 className="mb-2 text-sm font-semibold">Proposed changes</h4>
            {!hasVisibleChanges ? (
              <p className="text-sm text-muted-foreground">
                No proposed changes available for this request.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Plan</th>
                      <th className="px-3 py-2">Period</th>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailChanges.map((change, index) => {
                      const currency = change.currency || "USD";
                      return (
                      <tr
                        key={`${change.platform}-${change.planKey}-${change.billingPeriod}-${index}`}
                        className="border-t border-border"
                      >
                        <td className="px-3 py-2 font-medium">
                          {change.platform}
                        </td>
                        <td className="px-3 py-2">{change.planKey}</td>
                        <td className="px-3 py-2">{change.billingPeriod}</td>
                        <td className="px-3 py-2">
                          {formatMoney(change.fromPrice, currency)}
                        </td>
                        <td className="px-3 py-2">
                          {formatMoney(change.toPrice, currency)}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {canSubmitOpenedDraft ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void submitDraftById(detail.id)}
              >
                Submit for approval
              </Button>
            </div>
          ) : null}

          <div>
            <h4 className="mb-2 text-sm font-semibold">Platform results</h4>
            {detail.platformResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {detail.platformResults.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.platform}</span>: {r.status}
                    {r.message ? ` — ${r.message}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Audit</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {detail.auditEvents.map((e) => (
                <li key={e.id}>
                  {new Date(e.createdAt).toLocaleString()} · {e.action}
                  {e.actorLabel ? ` · ${e.actorLabel}` : ""}
                </li>
              ))}
            </ul>
          </div>

          {detail.status === "PENDING_APPROVAL" && canApprove ? (
            <div className="space-y-3 border-t border-border pt-3">
              {isSelfCreated ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  You created this request — another admin must approve it.
                </p>
              ) : (
                <>
                  {!hasVisibleChanges ? (
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Approval is disabled until proposed price changes are
                      visible for review. You can still reject this request.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="reject-reason">Reject reason (optional)</Label>
                    <Textarea
                      id="reject-reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={busy || !canApproveThis}
                      onClick={() => void approveSelected()}
                    >
                      Approve & apply
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void rejectSelected()}
                    >
                      Reject
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {driftFindings ? (
        <section className="space-y-2 rounded-lg border border-border p-4">
          <h3 className="text-lg font-semibold">Drift findings</h3>
          {driftFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drift.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {driftFindings.map((f, i) => (
                <li key={`${f.platform}-${f.billingPeriod}-${i}`}>{f.message}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
