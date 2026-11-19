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

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Linear EOM projection: MTD × daysInMonth / dayOfMonth (day 15/30 → 2×). */
export function projectMonthEndFromMtd(
  mtdPoints: number,
  dayOfMonth: number,
  daysInMonth: number,
): number {
  if (dayOfMonth <= 0 || daysInMonth <= 0) return mtdPoints;
  return Math.round((mtdPoints * daysInMonth) / dayOfMonth);
}

export function monthKeyUtcPlus1(parts: {
  year: number;
  month: number;
}): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}
