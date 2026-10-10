import { describe, expect, it } from "vitest";
import {
  canSubmitDecision,
  decisionBody,
  describeFlag,
  formatDate,
} from "./class-action-review-ui";

describe("class-action review UI helpers", () => {
  it("requires a reason to expire and a note to reopen", () => {
    expect(canSubmitDecision("expire", "  ")).toBe(false);
    expect(canSubmitDecision("expire", "Claims closed")).toBe(true);
    expect(canSubmitDecision("reopen", "")).toBe(false);
    expect(canSubmitDecision("approve", "")).toBe(true);
    expect(canSubmitDecision("reject", "")).toBe(true);
  });

  it("never sends reviewer identity or status — only notes/reason", () => {
    expect(decisionBody("approve", " checked ")).toEqual({ notes: "checked" });
    expect(decisionBody("expire", "closed")).toEqual({ reason: "closed" });
    expect(decisionBody("reject", "")).toEqual({});
  });

  it("describes uncertainty flags for reviewers", () => {
    expect(describeFlag("deadline_is_not_claim_deadline")).toContain("hearing");
    expect(describeFlag("unsupported_quote:eligibility")).toContain(
      "eligibility",
    );
    expect(describeFlag("defendant_unsupported")).toContain("defendant");
    expect(describeFlag("something_new")).toBe("something_new");
  });

  it("formats deadlines in UTC (stored as end-of-day UTC)", () => {
    expect(formatDate("2030-03-05T23:59:59.000Z")).toMatch(/2030/);
    expect(formatDate(null)).toBe("—");
  });
});
