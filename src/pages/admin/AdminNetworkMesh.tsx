import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  adminFetchNodeMeshRun,
  adminFetchNodeMeshRuns,
  adminStartNodeMeshRun,
  type AdminNodeMeshRun,
  type AdminNodeMeshRunDetail,
} from "@/auth/backend";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  downloadMbps: {
    label: "Download Mbps",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

function nodeShortLabel(
  node?: { id?: string; region?: string | null; city?: string | null },
): string {
  const loc = node?.region ?? node?.city ?? "node";
  const id = node?.id?.slice(0, 6);
  return id ? `${loc} (${id})` : loc;
}

function formatEdgeLabel(
  source?: { id?: string; region?: string | null; city?: string | null },
  dest?: { id?: string; region?: string | null; city?: string | null },
): string {
  return `${nodeShortLabel(source)} → ${nodeShortLabel(dest)}`;
}

const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export default function AdminNetworkMesh() {
  const { can } = useAdminAuth();
  const canRun = can("nodes.mesh.run");
  const canRead = can("nodes.mesh.read");

  const [runs, setRuns] = useState<AdminNodeMeshRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminNodeMeshRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    const res = await adminFetchNodeMeshRuns();
    setLoading(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load runs");
      return;
    }
    setRuns(res.data);
    if (!selectedRunId && res.data.length > 0) {
      setSelectedRunId(res.data[0].id);
    }
  }, [canRead, selectedRunId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setDetail(null);
    setError(null);

    const refresh = async () => {
      setLoading(true);
      const [detailRes, runsRes] = await Promise.all([
        adminFetchNodeMeshRun(selectedRunId),
        adminFetchNodeMeshRuns(),
      ]);
      if (cancelled) return;
      setLoading(false);

      if (runsRes.ok && runsRes.data) {
        setRuns(runsRes.data);
      }
      if (!detailRes.ok || !detailRes.data) {
        setError(detailRes.error ?? "Failed to load run");
        return undefined;
      }
      setDetail(detailRes.data);
      setError(null);
      return detailRes.data.status;
    };

    const isTerminalStatus = (status: string | undefined) =>
      status !== undefined && TERMINAL_RUN_STATUSES.has(status);

    let timer: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      timer = window.setInterval(() => {
        void refresh().then((nextStatus) => {
          if (cancelled) return;
          if (isTerminalStatus(nextStatus) && timer) {
            window.clearInterval(timer);
            timer = undefined;
          }
        });
      }, 8000);
    };

    void (async () => {
      const status = await refresh();
      if (cancelled || isTerminalStatus(status)) {
        return;
      }
      startPolling();
    })();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [selectedRunId]);

  const chartRows = useMemo(() => {
    if (!detail?.results) return [];
    return detail.results
      .filter((r) => r.status === "success" && r.downloadMbps != null)
      .sort((a, b) => (a.downloadMbps ?? 0) - (b.downloadMbps ?? 0))
      .slice(0, 12)
      .map((r) => ({
        label: formatEdgeLabel(
          r.sourceNode
            ? { ...r.sourceNode, id: r.sourceNodeId }
            : { id: r.sourceNodeId },
          r.destNode ? { ...r.destNode, id: r.destNodeId } : { id: r.destNodeId },
        ),
        downloadMbps: r.downloadMbps ?? 0,
      }));
  }, [detail]);

  const startRun = async () => {
    setStarting(true);
    setError(null);
    const res = await adminStartNodeMeshRun({ concurrency: 2 });
    setStarting(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to start mesh run");
      return;
    }
    setSelectedRunId(res.data.id);
    await loadRuns();
  };

  if (!canRead) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view node mesh tests.
      </div>
    );
  }

  const progress =
    detail && detail.totalTests > 0
      ? Math.round((detail.completedTests / detail.totalTests) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Node mesh speed tests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            On-demand bi-directional iperf between all online VPN nodes. Run
            off-peak; requires iperf3 and an updated node-daemon on each node.
          </p>
        </div>
        {canRun ? (
          <Button onClick={() => void startRun()} disabled={starting}>
            {starting ? "Starting…" : "Start full mesh"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            Runs
          </p>
          <ul className="space-y-1 text-sm">
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1.5 text-left ${
                    selectedRunId === run.id
                      ? "bg-primary/15 font-medium"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <span className="block truncate">{run.id.slice(0, 8)}…</span>
                  <span className="text-xs text-muted-foreground">
                    {run.status} · {run.completedTests}/{run.totalTests}
                  </span>
                </button>
              </li>
            ))}
            {!loading && runs.length === 0 ? (
              <li className="text-muted-foreground">No runs yet.</li>
            ) : null}
          </ul>
        </div>

        <div className="space-y-4">
          {detail ? (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    Status:{" "}
                    <strong className="text-foreground">{detail.status}</strong>
                  </span>
                  <span>
                    Nodes: <strong>{detail.nodeCount}</strong>
                  </span>
                  <span>
                    Progress:{" "}
                    <strong>
                      {detail.completedTests}/{detail.totalTests} ({progress}
                      %)
                    </strong>
                  </span>
                  <span>
                    Failed: <strong>{detail.failedTests}</strong>
                  </span>
                </div>
              </div>

              {chartRows.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-72 w-full">
                  <BarChart data={chartRows} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={70}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tickLine={false} axisLine={false} width={40} />
                    <ChartTooltip />
                    <Bar
                      dataKey="downloadMbps"
                      fill="var(--color-downloadMbps)"
                      radius={4}
                    />
                  </BarChart>
                </ChartContainer>
              ) : null}

              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Dest</th>
                      <th className="px-3 py-2">Down Mbps</th>
                      <th className="px-3 py-2">Up Mbps</th>
                      <th className="px-3 py-2">Latency ms</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.results.map((row) => (
                      <tr key={row.id} className="border-b border-border/60">
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.sourceNode?.region ?? row.sourceNodeId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.destNode?.region ?? row.destNodeId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2">
                          {row.downloadMbps?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.uploadMbps?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.latencyMs?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-3 py-2">{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {loading ? "Loading…" : "Select a run or start a new mesh test."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
