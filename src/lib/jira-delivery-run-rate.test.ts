import { describe, expect, it } from "vitest";
import {
  calendarDateInUtcPlus1,
  monthKeyUtcPlus1,
  projectMonthEndFromMtd,
} from "./jira-delivery-run-rate";

describe("jira-delivery-run-rate", () => {
  it("projects month-end as exactly 2 × MTD on any report day", () => {
    expect(projectMonthEndFromMtd(40)).toBe(80);
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
