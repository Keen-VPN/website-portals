import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminFetchClassActionCandidates,
  type AdminClassActionCandidateListItem,
  type AdminClassActionCandidateStatus,
} from "@/auth/backend";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const PAGE_SIZE = 25;

function formatMarketSize(value: number | null): string {
  if (value == null || value < 1) return "Not available";
  return value.toLocaleString("en-US");
}

function statusBadge(status: AdminClassActionCandidateStatus) {
  const variant =
    status === "PENDING_REVIEW"
      ? "secondary"
      : status === "APPROVED"
        ? "default"
        : status === "REJECTED"
          ? "destructive"
          : "outline";
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

export default function AdminClassActions() {
  const { can } = useAdminAuth();
  const canRead = can("class_actions.read");

  const [status, setStatus] =
    useState<AdminClassActionCandidateStatus | "ALL">("PENDING_REVIEW");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminClassActionCandidateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    const res = await adminFetchClassActionCandidates({
      status,
      q: q || undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    if (seq !== loadSeq.current) return;
    if (res.ok && res.data) {
      const newTotal = res.data.total;
      const newPageCount = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
      if (page > newPageCount) {
        setItems([]);
        setTotal(newTotal);
        setPage(newPageCount);
        return;
      }
      setItems(res.data.items);
      setTotal(newTotal);
    } else {
      setItems([]);
      setTotal(0);
      if (res.status === 403) {
        setError("You do not have permission to view class-action candidates.");
      } else {
        setError(res.error ?? "Failed to load candidates");
      }
    }
    setLoading(false);
  }, [canRead, page, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Class action review</h2>
          <p className="text-sm text-muted-foreground">
            AI-discovered settlements awaiting human verification before
            members can see them.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={status}
          onValueChange={(value) => {
            setPage(1);
            setStatus(value as AdminClassActionCandidateStatus | "ALL");
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING_REVIEW">Pending review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="ALL">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex flex-1 min-w-[200px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(qDraft.trim());
          }}
        >
          <Input
            id="class-action-candidate-search"
            aria-label="Search class-action candidates"
            placeholder="Search title, defendant, case id, source…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
          />
          <Button type="submit">Search</Button>
        </form>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Settlement</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Market size</th>
              <th className="px-4 py-3 font-medium">Claim deadline</th>
              <th className="px-4 py-3 font-medium">Discovered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  No candidates match this filter.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/class-actions/${row.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.title}
                    </Link>
                    {row.defendant ? (
                      <p className="text-xs text-muted-foreground">
                        {row.defendant}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">
                    {formatMarketSize(row.marketSizeEstimate)}
                  </td>
                  <td className="px-4 py-3">
                    {row.claimDeadline
                      ? row.claimDeadline.slice(0, 10)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.discoveredAt.slice(0, 10)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
