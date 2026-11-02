import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adminDeleteGeekbotExpectedUpdate,
  adminFetchGeekbotExpectedUpdates,
  adminUpsertGeekbotExpectedUpdate,
  type AdminGeekbotExpectedMember,
  type AdminGeekbotExpectedMonthReport,
} from "@/auth/backend";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function currentMonthYear(): { month: number; year: number; label: string } {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  return {
    month,
    year,
    label: `${year}-${String(month).padStart(2, "0")}`,
  };
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first offset for day 1 (0 = Monday). */
function mondayFirstOffset(year: number, month: number): number {
  const sundayFirst = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

function sourceLabel(source: AdminGeekbotExpectedMember["source"]): string {
  switch (source) {
    case "db":
      return "Dashboard";
    case "env":
      return "Env";
    case "default":
      return "Default";
    default:
      return "—";
  }
}

function formatShortTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function progressPercent(submitted: number, expected: number | null): number {
  if (expected == null || expected <= 0) return 0;
  return Math.min(100, Math.round((submitted / expected) * 100));
}

export default function AdminGeekbotExpectedUpdates() {
  const { can } = useAdminAuth();
  const canWrite = can("users.write");
  const initial = useMemo(() => currentMonthYear(), []);
  const maxMonth = initial;

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [report, setReport] = useState<AdminGeekbotExpectedMonthReport | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCount, setEditCount] = useState("25");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingNames, setPendingNames] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const loadGeneration = useRef(0);
  const yearRef = useRef(year);
  const monthRef = useRef(month);
  yearRef.current = year;
  monthRef.current = month;

  const load = useCallback(
    async (options?: { year?: number; month?: number; silent?: boolean }) => {
      const targetYear = options?.year ?? yearRef.current;
      const targetMonth = options?.month ?? monthRef.current;
      const silent = options?.silent === true;
      const generation = ++loadGeneration.current;
      if (!silent) {
        setLoading(true);
        setReport(null);
        setError(null);
        setActionError(null);
      }
      const res = await adminFetchGeekbotExpectedUpdates({
        year: targetYear,
        month: targetMonth,
      });
      if (generation !== loadGeneration.current) return;
      if (!res.ok || !res.data) {
        if (!silent) setReport(null);
        setError(res.error ?? "Failed to load expected updates");
        setLoading(false);
        return;
      }
      const data = res.data;
      if (data.year !== yearRef.current || data.month !== monthRef.current) {
        return;
      }
      setReport(data);
      setLoading(false);
      setSelectedName((prev) => {
        if (prev && data.members.some((m) => m.personName === prev)) {
          return prev;
        }
        return data.members[0]?.personName ?? null;
      });
    },
    [],
  );

  useEffect(() => {
    void load({ year, month });
    return () => {
      loadGeneration.current += 1;
    };
  }, [year, month, load]);

  const goPrev = () => {
    const next = shiftMonth(year, month, -1);
    setYear(next.year);
    setMonth(next.month);
  };

  const goNext = () => {
    const next = shiftMonth(year, month, 1);
    if (
      next.year > maxMonth.year ||
      (next.year === maxMonth.year && next.month > maxMonth.month)
    ) {
      return;
    }
    setYear(next.year);
    setMonth(next.month);
  };

  const selectedMember = useMemo(
    () => report?.members.find((m) => m.personName === selectedName) ?? null,
    [report, selectedName],
  );

  const monthDays = useMemo(() => {
    const total = daysInMonth(year, month);
    const withUpdate = new Set(selectedMember?.daysWithUpdate ?? []);
    const leading = mondayFirstOffset(year, month);
    const cells: (
      | { kind: "pad"; key: string }
      | { kind: "day"; day: number; key: string; hasUpdate: boolean }
    )[] = [];
    for (let i = 0; i < leading; i += 1) {
      cells.push({ kind: "pad", key: `pad-${i}` });
    }
    for (let day = 1; day <= total; day += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        kind: "day",
        day,
        key,
        hasUpdate: withUpdate.has(key),
      });
    }
    return cells;
  }, [year, month, selectedMember]);

  const openEdit = (member?: AdminGeekbotExpectedMember | null) => {
    setSaveError(null);
    setActionError(null);
    setEditName(member?.personName ?? "");
    setEditCount(
      member?.expectedCount != null ? String(member.expectedCount) : "25",
    );
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const personName = editName.trim();
    const expectedCount = Number(editCount);
    if (!personName) {
      setSaveError("Team member name is required");
      return;
    }
    if (
      !Number.isInteger(expectedCount) ||
      expectedCount < 1 ||
      expectedCount > 366
    ) {
      setSaveError("Expected updates must be an integer from 1 to 366");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setActionError(null);
    setPendingNames((prev) => new Set(prev).add(personName));
    const res = await adminUpsertGeekbotExpectedUpdate({
      personName,
      year,
      month,
      expectedCount,
    });
    setPendingNames((prev) => {
      const next = new Set(prev);
      next.delete(personName);
      return next;
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error ?? "Save failed");
      return;
    }
    setEditOpen(false);
    setSelectedName(personName);
    await load({ silent: true });
  };

  const removeTarget = async (member: AdminGeekbotExpectedMember) => {
    if (!canWrite || member.source !== "db") return;
    if (
      !window.confirm(
        `Remove dashboard target for ${member.personName}? Env fallback may still apply.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setPendingNames((prev) => new Set(prev).add(member.personName));
    const res = await adminDeleteGeekbotExpectedUpdate({
      personName: member.personName,
      year,
      month,
    });
    setPendingNames((prev) => {
      const next = new Set(prev);
      next.delete(member.personName);
      return next;
    });
    if (!res.ok) {
      setActionError(res.error ?? "Delete failed");
      return;
    }
    await load({ silent: true });
  };

  const selectedProgress = selectedMember
    ? progressPercent(
        selectedMember.submittedDays,
        selectedMember.expectedCount,
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Geekbot expected updates
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Assign monthly expected update counts per team member. Submitted
            days are read from Slack/Geekbot; the calendar shows which dates
            already have an update.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <Button variant="outline" size="sm" onClick={goPrev}>
            Previous
          </Button>
          <div className="min-w-[10rem] px-2 text-center text-sm font-semibold">
            {formatMonthLabel(year, month)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={
              year > maxMonth.year ||
              (year === maxMonth.year && month >= maxMonth.month)
            }
          >
            Next
          </Button>
          <Input
            type="month"
            className="h-9 w-[10.5rem]"
            max={maxMonth.label}
            value={`${year}-${String(month).padStart(2, "0")}`}
            onChange={(e) => {
              const value = e.target.value;
              if (!/^\d{4}-\d{2}$/.test(value)) return;
              const [y, m] = value.split("-").map(Number);
              if (
                y > maxMonth.year ||
                (y === maxMonth.year && m > maxMonth.month)
              ) {
                return;
              }
              setYear(y);
              setMonth(m);
            }}
          />
          <div className="flex-1" />
          {canWrite ? (
            <Button size="sm" onClick={() => openEdit(null)}>
              Add target
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Could not load
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {actionError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Action failed
            </CardTitle>
            <CardDescription>{actionError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loading && !report ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Loading monthly targets…
          </CardContent>
        </Card>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["People with target", report.summary.peopleWithTarget],
                ["Total expected", report.summary.totalExpected],
                ["Total submitted", report.summary.totalSubmitted],
                ["Total missing", report.summary.totalMissing],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardHeader className="space-y-1 py-4">
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          {!report.geekbotDailyUpdatesConfigured ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-4 text-sm text-muted-foreground">
                Slack/Geekbot daily updates are not configured, so submitted days
                may show as zero. Targets can still be assigned.
              </CardContent>
            </Card>
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.9fr)]">
            <Card className="min-w-0 overflow-hidden">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-base">Team members</CardTitle>
                <CardDescription>
                  Expected counts for {formatMonthLabel(year, month)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-3 py-3 text-right font-medium">
                          Expected
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                          Submitted
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                          Missing
                        </th>
                        <th className="px-3 py-3 font-medium">Progress</th>
                        <th className="px-3 py-3 font-medium">Source</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.members.map((member) => {
                        const selected = member.personName === selectedName;
                        const pending = pendingNames.has(member.personName);
                        const pct = progressPercent(
                          member.submittedDays,
                          member.expectedCount,
                        );
                        const updated = formatShortTimestamp(member.updatedAt);
                        return (
                          <tr
                            key={member.personName}
                            className={[
                              "border-b border-white/5 transition-colors",
                              selected
                                ? "bg-primary/15"
                                : "hover:bg-white/[0.03]",
                            ].join(" ")}
                          >
                            <td className="px-4 py-3 align-middle">
                              <button
                                type="button"
                                className="text-left"
                                onClick={() =>
                                  setSelectedName(member.personName)
                                }
                              >
                                <div className="font-medium text-foreground">
                                  {member.personName}
                                </div>
                                {member.updatedByAdminName ? (
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    by {member.updatedByAdminName}
                                    {updated ? ` · ${updated}` : ""}
                                  </div>
                                ) : null}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums align-middle">
                              {member.expectedCount ?? "—"}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums align-middle">
                              {member.submittedDays}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums align-middle">
                              {member.missingDays ?? "—"}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="flex min-w-[7rem] items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full bg-emerald-500/80"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                                  {pct}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                                {sourceLabel(member.source)}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="flex justify-end gap-2">
                                {canWrite ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() => openEdit(member)}
                                  >
                                    Edit
                                  </Button>
                                ) : null}
                                {canWrite && member.source === "db" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() => void removeTarget(member)}
                                  >
                                    Remove
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {report.members.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground">
                    No team members for this month yet. Add a target to start
                    the roster.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="xl:sticky xl:top-6">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="text-base">Daily updates</CardTitle>
                <CardDescription>
                  {selectedMember
                    ? selectedMember.personName
                    : "Select a team member"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {selectedMember ? (
                  <>
                    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          {selectedMember.submittedDays} day
                          {selectedMember.submittedDays === 1 ? "" : "s"}{" "}
                          submitted
                        </span>
                        <span className="tabular-nums font-medium">
                          {selectedMember.expectedCount != null
                            ? `${selectedMember.submittedDays} / ${selectedMember.expectedCount}`
                            : selectedMember.submittedDays}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-500/80"
                          style={{ width: `${selectedProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Read-only from Slack/Geekbot
                      </p>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAY_LABELS.map((label) => (
                        <div
                          key={label}
                          className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {label}
                        </div>
                      ))}
                      {monthDays.map((cell) =>
                        cell.kind === "pad" ? (
                          <div key={cell.key} className="aspect-square" />
                        ) : (
                          <div
                            key={cell.key}
                            title={`${cell.key}${cell.hasUpdate ? " · update submitted" : " · no update"}`}
                            className={[
                              "flex aspect-square items-center justify-center rounded-md border text-xs tabular-nums",
                              cell.hasUpdate
                                ? "border-emerald-500/50 bg-emerald-500/20 font-semibold text-emerald-100"
                                : "border-white/10 bg-white/[0.03] text-muted-foreground",
                            ].join(" ")}
                          >
                            {cell.day}
                          </div>
                        ),
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
                        Has update
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-white/20" />
                        No update
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Choose a team member to review their month.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (saving && !open) return;
          setEditOpen(open);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Monthly expected updates</DialogTitle>
            <DialogDescription>
              Set the expected Geekbot update count for{" "}
              {formatMonthLabel(year, month)}. Names should match Jira/Slack
              display names.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="geekbot-person">Team member</Label>
              {report && report.rosterNames.length > 0 ? (
                <Select
                  value={
                    report.rosterNames.includes(editName)
                      ? editName
                      : "__custom__"
                  }
                  onValueChange={(value) => {
                    if (value === "__custom__") {
                      setEditName("");
                      return;
                    }
                    setEditName(value);
                  }}
                >
                  <SelectTrigger id="geekbot-person">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {report.rosterNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Custom name…</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full display name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geekbot-count">Expected updates</Label>
              <Input
                id="geekbot-count"
                type="number"
                min={1}
                max={366}
                value={editCount}
                onChange={(e) => setEditCount(e.target.value)}
              />
            </div>
            {saveError ? (
              <p className="text-sm text-destructive">{saveError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
