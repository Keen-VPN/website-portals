import type {
  ClassActionReviewAction,
  ClassActionReviewStatus,
} from "@/auth/backend";

export const STATUS_FILTERS: {
  value: ClassActionReviewStatus | "ALL";
  label: string;
}[] = [
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
  { value: "ALL", label: "All" },
];

export function statusLabel(status: ClassActionReviewStatus): string {
  return (
    STATUS_FILTERS.find((s) => s.value === status)?.label ?? String(status)
  );
}

export function statusBadgeClass(status: ClassActionReviewStatus): string {
  switch (status) {
    case "PENDING_REVIEW":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300";
    case "APPROVED":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    case "REJECTED":
      return "border-rose-500/40 bg-rose-500/15 text-rose-300";
    case "EXPIRED":
    default:
      return "border-slate-500/40 bg-slate-500/15 text-slate-300";
  }
}

export type DecisionKind = ClassActionReviewAction | "notes";

export interface DecisionConfig {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  /** Which free-text input the dialog collects, and whether it is required. */
  input: { field: "notes" | "reason"; label: string; required: boolean };
}

export const DECISIONS: Record<DecisionKind, DecisionConfig> = {
  approve: {
    label: "Approve",
    title: "Approve and publish this class action?",
    description:
      "Customers will see this perk once approved. Confirm you verified the case name, eligibility and claim deadline on the source.",
    confirmLabel: "Approve & publish",
    destructive: false,
    input: {
      field: "notes",
      label: "Reviewer notes (optional)",
      required: false,
    },
  },
  reject: {
    label: "Reject",
    title: "Reject this candidate?",
    description:
      "It will not be published. Rejections can only be reversed with an explicit, audited reopen.",
    confirmLabel: "Reject",
    destructive: true,
    input: {
      field: "notes",
      label: "Reason / notes (optional)",
      required: false,
    },
  },
  expire: {
    label: "Mark expired",
    title: "Mark this class action expired?",
    description:
      "It is removed from all customer results immediately, including the closed archive.",
    confirmLabel: "Mark expired",
    destructive: true,
    input: {
      field: "reason",
      label: "Why is it expired? (required, e.g. source says claims closed)",
      required: true,
    },
  },
  reopen: {
    label: "Reopen for review",
    title: "Reverse the decision and return to Pending review?",
    description:
      "This unpublishes the perk if it is live. The reversal is recorded in the audit history.",
    confirmLabel: "Reopen",
    destructive: true,
    input: {
      field: "notes",
      label: "Why are you reopening it? (required)",
      required: true,
    },
  },
  notes: {
    label: "Add notes",
    title: "Update reviewer notes",
    description: "Notes are saved to the candidate and recorded in history.",
    confirmLabel: "Save notes",
    destructive: false,
    input: { field: "notes", label: "Reviewer notes", required: true },
  },
};

export function canSubmitDecision(kind: DecisionKind, text: string): boolean {
  return !DECISIONS[kind].input.required || text.trim().length > 0;
}

export function decisionBody(
  kind: DecisionKind,
  text: string,
): { notes?: string; reason?: string } {
  const value = text.trim();
  if (!value) return {};
  return DECISIONS[kind].input.field === "reason"
    ? { reason: value }
    : { notes: value };
}

const FLAG_LABELS: Record<string, string> = {
  defendant_unknown: "Defendant could not be verified in the source",
  case_identifier_unknown: "No case/docket number found in the source",
  eligibility_unknown: "Eligibility text could not be verified",
  claim_deadline_unknown: "Claim deadline could not be verified",
  claim_deadline_conflict: "Sources disagree on the claim deadline",
  deadline_is_not_claim_deadline:
    "Proposed date is a hearing/objection/exclusion date, not the claim deadline",
  claim_deadline_ambiguous: "Deadline wording is ambiguous",
  claim_deadline_quote_date_mismatch:
    "Deadline quote does not contain the proposed date",
};

export function describeFlag(flag: string): string {
  if (FLAG_LABELS[flag]) return FLAG_LABELS[flag];
  const unsupportedQuote = /^unsupported_quote:(.+)$/.exec(flag);
  if (unsupportedQuote) {
    return `A quote for "${unsupportedQuote[1]}" was not found in the source text`;
  }
  const unsupported = /^(.+)_unsupported$/.exec(flag);
  if (unsupported)
    return `Proposed ${unsupported[1]} is not supported by the source`;
  return flag;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
