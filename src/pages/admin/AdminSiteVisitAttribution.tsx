import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  adminFetchSiteVisitAttributionReport,
  type AdminSiteVisitAttributionReport,
} from "@/auth/backend";
import {
  defaultAdminReportFromValue,
  defaultAdminReportToValue,
  isAdminReportDateRangeValid,
} from "@/lib/admin-utils";

const TILE_LABELS: Array<{ key: string; label: string }> = [
  { key: "visits", label: "Visits" },
  { key: "visits_full", label: "Accepted analytics" },
  { key: "visits_anon", label: "Anonymous" },
  { key: "trials", label: "Trials" },
  { key: "trials_per_100_visits", label: "Trials / 100 visits" },
];

function formatChange(change: number | null | undefined): string {
  if (change == null || Number.isNaN(change)) return "";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change}% vs prior`;
}

export default function AdminSiteVisitAttribution() {
  const [fromInput, setFromInput] = useState(defaultAdminReportFromValue);
  const [toInput, setToInput] = useState(defaultAdminReportToValue);
  const [report, setReport] = useState<AdminSiteVisitAttributionReport | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    if (!from.trim() || !to.trim()) {
      setReport(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!isAdminReportDateRangeValid(from, to)) {
      activeRequest.current?.abort();
      activeRequest.current = null;
      setReport(null);
      setError("From date must be on or before To date.");
      setLoading(false);
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    setLoading(true);
    setError(null);

    const response = await adminFetchSiteVisitAttributionReport({
      from,
      to,
      signal: controller.signal,
    });

    if (controller.signal.aborted || activeRequest.current !== controller) {
      return;
    }

    if (!response.ok || !response.data) {
      setReport(null);
      setError(response.error ?? "Failed to load site visit attribution");
      setLoading(false);
      activeRequest.current = null;
      return;
    }

    setReport(response.data);
    setLoading(false);
    activeRequest.current = null;
  }, []);

  useEffect(() => {
    void load(fromInput, toInput);
    return () => activeRequest.current?.abort();
  }, [load, fromInput, toInput]);

  const tiles = report?.tiles;
  const channels = report?.channels ?? [];
  const landing = report?.landing ?? [];
  const funnel = report?.funnel ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Site visit attribution
        </h2>
        <p className="text-sm text-muted-foreground">
          Marketing-site visits and trials from the landing tracker (proxied
          server-side). Sign-up first-touch pages remain on{" "}
          <Link
            to="/admin/landing-attribution"
            className="text-primary underline-offset-4 hover:underline"
          >
            Landing Pages
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">From (UTC)</span>
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">To (UTC)</span>
          <input
            type="date"
            className="rounded-md border border-border bg-background px-3 py-2"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load(fromInput, toInput)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!error && report?.live ? (
        <p className="text-sm text-muted-foreground">
          Live now: {report.live.visitors ?? 0} visitors ·{" "}
          {report.live.views ?? 0} views
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TILE_LABELS.map(({ key, label }) => {
          const tile = tiles?.[key];
          return (
            <div
              key={key}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold">
                {loading ? "—" : (tile?.value ?? 0)}
              </p>
              {!loading && tile ? (
                <p className="text-xs text-muted-foreground">
                  {formatChange(tile.change)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-medium">Channel</th>
              <th className="p-3 font-medium text-right">Visits</th>
              <th className="p-3 font-medium text-right">Share</th>
              <th className="p-3 font-medium text-right">Trials (first)</th>
              <th className="p-3 font-medium text-right">Trials (last)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : error ? null : channels.length ? (
              channels.map((row) => (
                <tr
                  key={row.channel}
                  className="border-b border-border last:border-0"
                >
                  <td className="p-3">{row.channel}</td>
                  <td className="p-3 text-right">{row.visits}</td>
                  <td className="p-3 text-right">{row.share}%</td>
                  <td className="p-3 text-right">{row.trials_first}</td>
                  <td className="p-3 text-right">{row.trials_last}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  No visits in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-sm font-medium">
            Landing pages
          </div>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Page</th>
                <th className="p-3 font-medium text-right">Visits</th>
                <th className="p-3 font-medium text-right">Trials</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={3}>
                    Loading…
                  </td>
                </tr>
              ) : landing.length ? (
                landing.slice(0, 40).map((row) => (
                  <tr
                    key={row.page}
                    className="border-b border-border last:border-0"
                  >
                    <td className="p-3 font-mono text-xs sm:text-sm">
                      {row.page}
                    </td>
                    <td className="p-3 text-right">{row.visits}</td>
                    <td className="p-3 text-right">{row.trials}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={3}>
                    No landing pages yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-sm font-medium">
            Funnel (accepted analytics)
          </div>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Step</th>
                <th className="p-3 font-medium text-right">Count</th>
                <th className="p-3 font-medium text-right">Of first</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={3}>
                    Loading…
                  </td>
                </tr>
              ) : funnel.length ? (
                funnel.map((row) => (
                  <tr
                    key={row.step}
                    className="border-b border-border last:border-0"
                  >
                    <td className="p-3">{row.step}</td>
                    <td className="p-3 text-right">{row.count}</td>
                    <td className="p-3 text-right">{row.of_first}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={3}>
                    No funnel data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
