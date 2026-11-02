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

function sourceLabel(source: AdminGeekbotExpectedMember["source"]): string {
  switch (source) {
    case "db":
      return "Dashboard";
    case "env":
      return "Env fallback";
    case "default":
      return "Default";
    default:
      return "—";
  }
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
    return Array.from({ length: total }, (_, i) => {
      const day = i + 1;
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { day, key, hasUpdate: withUpdate.has(key) };
    });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Geekbot expected updates
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Assign monthly expected update counts per team member. Submitted
            days come from Slack/Geekbot automatically; calendar chips below
            show which dates already have an update.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev}>
            Previous
          </Button>
          <div className="min-w-[9rem] text-center text-sm font-medium">
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
            className="w-[10.5rem]"
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
          {canWrite ? (
            <Button size="sm" onClick={() => openEdit(null)}>
              Add / edit target
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>People with target</CardDescription>
                <CardTitle className="text-2xl">
                  {report.summary.peopleWithTarget}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total expected</CardDescription>
                <CardTitle className="text-2xl">
                  {report.summary.totalExpected}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total submitted</CardDescription>
                <CardTitle className="text-2xl">
                  {report.summary.totalSubmitted}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total missing</CardDescription>
                <CardTitle className="text-2xl">
                  {report.summary.totalMissing}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {!report.geekbotDailyUpdatesConfigured ? (
            <Card className="border-amber-500/30">
              <CardContent className="py-4 text-sm text-muted-foreground">
                Slack/Geekbot daily updates are not configured, so submitted
                days may show as zero. Targets can still be assigned.
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Team members</CardTitle>
                <CardDescription>
                  Expected counts for {formatMonthLabel(year, month)}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">Name</th>
                      <th className="pb-2 pr-3 font-medium">Expected</th>
                      <th className="pb-2 pr-3 font-medium">Submitted</th>
                      <th className="pb-2 pr-3 font-medium">Missing</th>
                      <th className="pb-2 pr-3 font-medium">Source</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.members.map((member) => {
                      const selected = member.personName === selectedName;
                      const pending = pendingNames.has(member.personName);
                      return (
                        <tr
                          key={member.personName}
                          className={[
                            "border-b border-white/5",
                            selected ? "bg-primary/10" : "",
                          ].join(" ")}
                        >
                          <td className="py-2.5 pr-3">
                            <button
                              type="button"
                              className="text-left font-medium hover:underline"
                              onClick={() => setSelectedName(member.personName)}
                            >
                              {member.personName}
                            </button>
                            {member.updatedByAdminName ? (
                              <div className="text-xs text-muted-foreground">
                                by {member.updatedByAdminName}
                                {member.updatedAt
                                  ? ` · ${new Date(member.updatedAt).toLocaleString()}`
                                  : ""}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {member.expectedCount ?? "—"}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {member.submittedDays}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">
                            {member.missingDays ?? "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            {sourceLabel(member.source)}
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-2">
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
                {report.members.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    No team members for this month yet. Add a target to start
                    the roster.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily updates</CardTitle>
                <CardDescription>
                  {selectedMember
                    ? `${selectedMember.personName} · read-only from Slack/Geekbot`
                    : "Select a team member"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedMember ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      {selectedMember.submittedDays} day
                      {selectedMember.submittedDays === 1 ? "" : "s"} with an
                      update
                      {selectedMember.expectedCount != null
                        ? ` · target ${selectedMember.expectedCount}`
                        : ""}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {monthDays.map((d) => (
                        <div
                          key={d.key}
                          title={`${d.key}${d.hasUpdate ? " · update submitted" : " · no update"}`}
                          className={[
                            "flex aspect-square items-center justify-center rounded-md border text-xs tabular-nums",
                            d.hasUpdate
                              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-100"
                              : "border-white/10 bg-white/5 text-muted-foreground",
                          ].join(" ")}
                        >
                          {d.day}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/60" />
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
