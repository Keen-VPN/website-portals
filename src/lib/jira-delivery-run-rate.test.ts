import { describe, expect, it } from "vitest";
import {
  calendarDateInUtcPlus1,
  daysInCalendarMonth,
  monthKeyUtcPlus1,
  projectMonthEndFromMtd,
} from "./jira-delivery-run-rate";

describe("jira-delivery-run-rate", () => {
  it("on day 15 of a 30-day month, projected month-end is 2 × MTD", () => {
    expect(projectMonthEndFromMtd(40, 15, 30)).toBe(80);
    expect(daysInCalendarMonth(2026, 11)).toBe(30);
  });

  it("uses UTC+1 calendar parts around the month rollover hour", () => {
    // 2026-10-31 23:30 UTC = 2026-11-01 00:30 UTC+1
    const afterRollover = calendarDateInUtcPlus1(
      new Date("2026-10-31T23:30:00.000Z"),
    );
    expect(afterRollover).toEqual({ year: 2026, month: 11, day: 1 });
    expect(monthKeyUtcPlus1(afterRollover)).toBe("2026-11");

    // 2026-10-31 22:30 UTC = 2026-10-31 23:30 UTC+1
    const beforeRollover = calendarDateInUtcPlus1(
      new Date("2026-10-31T22:30:00.000Z"),
    );
    expect(beforeRollover).toEqual({ year: 2026, month: 10, day: 31 });
    expect(monthKeyUtcPlus1(beforeRollover)).toBe("2026-10");
  });
});
