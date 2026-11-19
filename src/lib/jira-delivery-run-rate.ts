/** Calendar year/month/day in UTC+1 (matches delivery / Slack run-rate). */
export function calendarDateInUtcPlus1(now = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Etc/GMT-1",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/** Boss-defined month-end run-rate: exactly double current MTD Done points. */
export function projectMonthEndFromMtd(mtdPoints: number): number {
  return mtdPoints * 2;
}

export function monthKeyUtcPlus1(parts: {
  year: number;
  month: number;
}): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}
