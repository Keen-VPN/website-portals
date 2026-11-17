import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  adminFetchUserEngagementProfile,
  adminFetchUserEmailPreview,
  adminGetUserAuthEmail,
  adminRequestUserAuthEmailChange,
  adminResendUserAuthEmailChange,
  adminCancelUserAuthEmailChange,
  type AdminUserEngagementProfile,
  type AdminUserEmailPreview,
  type AdminUserEmailRecord,
  type AdminUserReviewActivityRecord,
  type AdminUserTimelineEvent,
  type AuthEmailPending,
} from "@/auth/backend";
import { formatDuration } from "@/lib/format-duration";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
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
import { AdminInterviewInvitationDialog } from "./AdminInterviewInvitationDialog";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimelineMetadata(event: AdminUserTimelineEvent) {
  if (event.type === "vpn_activity_summary" && event.metadata) {
    const total = event.metadata.totalSessions;
    const limit = event.metadata.recentDetailLimit;
    if (typeof total === "number" && typeof limit === "number") {
      return `${total} total sessions · showing last ${limit}`;
    }
  }
  return event.metadata ? JSON.stringify(event.metadata) : null;
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs capitalize">
      {value.replaceAll("_", " ")}
    </span>
  );
}

function MeasureTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Block remote images/scripts so preview cannot fire tracking pixels. */
function wrapEmailPreviewHtml(html: string): string {
  const csp =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';\">";
  const withBlankTargets = html.replace(
    /<a\b([^>]*?)>/gi,
    (match, attrs: string) => {
      let next = attrs;
      if (!/\btarget=/i.test(next)) {
        next += ' target="_blank"';
      }
      if (!/\brel=/i.test(next)) {
        next += ' rel="noopener noreferrer"';
      }
      return `<a${next}>`;
    },
  );
  if (/<head[\s>]/i.test(withBlankTargets)) {
    return withBlankTargets.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
  }
  return `<!DOCTYPE html><html><head>${csp}</head><body>${withBlankTargets}</body></html>`;
}

function EmailTable({
  userId,
  emails,
}: {
  userId: string;
  emails: AdminUserEmailRecord[];
}) {
  const [preview, setPreview] = useState<AdminUserEmailPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewRequestRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => previewAbortRef.current?.abort(), []);

  const openPreview = async (email: AdminUserEmailRecord) => {
    if (!email.previewAvailable) return;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;

    setPreviewError(null);
    setPreviewLoadingId(email.id);
    const result = await adminFetchUserEmailPreview(
      userId,
      email.category,
      email.id,
      { signal: controller.signal },
    );
    if (requestId !== previewRequestRef.current) return;
    setPreviewLoadingId(null);
    if (!result.ok || !result.data) {
      if (result.error === "Request aborted") return;
      setPreviewError(result.error ?? "Failed to load email preview");
      return;
    }
    setPreview(result.data);
    setPreviewOpen(true);
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Category</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Sent</th>
              <th className="p-3">Delivery</th>
              <th className="p-3">Opened</th>
              <th className="p-3">Clicked</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr key={email.id} className="border-t border-border">
                <td className="p-3 text-muted-foreground">
                  {formatCategory(email.category)}
                </td>
                <td className="p-3">
                  {email.previewAvailable ? (
                    <button
                      type="button"
                      className="text-left text-sky-400 underline-offset-2 hover:underline disabled:opacity-60"
                      disabled={previewLoadingId === email.id}
                      onClick={() => void openPreview(email)}
                    >
                      {previewLoadingId === email.id
                        ? "Loading…"
                        : email.subject}
                    </button>
                  ) : (
                    email.subject
                  )}
                </td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatDateTime(email.sentAt)}
                </td>
                <td className="p-3">
                  <StatusBadge value={email.deliveryStatus} />
                </td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatDateTime(email.openedAt)}
                </td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatDateTime(email.clickedAt)}
                </td>
              </tr>
            ))}
            {emails.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">
                  No tracked emails for this user yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {previewError ? (
        <p className="mt-2 text-sm text-destructive">{previewError}</p>
      ) : null}
      <Dialog open={previewOpen && preview != null} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          {preview ? (
            <>
              <DialogHeader className="space-y-1 border-b border-border p-4 pr-12 text-left">
                <p className="text-sm text-muted-foreground">
                  {formatCategory(preview.category)}
                </p>
                <DialogTitle className="text-base font-medium">
                  {preview.subject}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {preview.reconstructed ? (
                      <p>
                        Reconstructed preview; may differ from the email
                        actually sent.
                      </p>
                    ) : null}
                    {preview.note ? <p>{preview.note}</p> : null}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <iframe
                title={preview.subject}
                srcDoc={wrapEmailPreviewHtml(preview.html)}
                className="min-h-[60vh] w-full flex-1 bg-white"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
              />
              <DialogFooter className="border-t border-border p-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewActivityTable({
  rows,
}: {
  rows: AdminUserReviewActivityRecord[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-3">Event</th>
            <th className="p-3">When</th>
            <th className="p-3">Platform</th>
            <th className="p-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.eventName}-${row.occurredAt}-${index}`}
              className="border-t border-border"
            >
              <td className="p-3">{row.label}</td>
              <td className="p-3 whitespace-nowrap text-muted-foreground">
                {formatDateTime(row.occurredAt)}
              </td>
              <td className="p-3">{row.platform ?? "—"}</td>
              <td className="p-3 text-xs text-muted-foreground">
                {row.properties
                  ? JSON.stringify(row.properties)
                  : "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-4 text-muted-foreground">
                No review or rating activity recorded.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function TimelineList({ events }: { events: AdminUserTimelineEvent[] }) {
  return (
    <div className="rounded-lg border border-border">
      <ul className="divide-y divide-border">
        {events.map((event) => {
          const metadataText = formatTimelineMetadata(event);
          return (
          <li
            key={event.id}
            className="flex flex-wrap items-start justify-between gap-3 p-4"
          >
            <div>
              <p className="font-medium">{event.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.type} · {event.source}
              </p>
              {metadataText ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {metadataText}
                </p>
              ) : null}
            </div>
            <p className="whitespace-nowrap text-sm text-muted-foreground">
              {formatDateTime(event.occurredAt)}
            </p>
          </li>
          );
        })}
        {events.length === 0 ? (
          <li className="p-4 text-muted-foreground">No timeline events.</li>
        ) : null}
      </ul>
    </div>
  );
}

export default function AdminUserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { can } = useAdminAuth();
  const canWriteAuthEmail = can("users.write");
  const canRequestInterview = can("research.write");
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [profile, setProfile] = useState<AdminUserEngagementProfile | null>(
    null,
  );
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [pendingAuthEmail, setPendingAuthEmail] =
    useState<AuthEmailPending | null>(null);
  const [newAuthEmail, setNewAuthEmail] = useState("");
  const [authEmailError, setAuthEmailError] = useState<string | null>(null);
  const [authEmailMessage, setAuthEmailMessage] = useState<string | null>(null);
  const [authEmailSaving, setAuthEmailSaving] = useState(false);
  const [authEmailReady, setAuthEmailReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const authEmailLoadId = useRef(0);
  const authEmailMutationId = useRef(0);

  const loadAuthEmail = useCallback(async (forUserId: string) => {
    const loadId = ++authEmailLoadId.current;
    const res = await adminGetUserAuthEmail(forUserId);
    if (loadId !== authEmailLoadId.current) return;
    if (res.success) {
      setAuthEmail(res.email ?? null);
      setPendingAuthEmail(res.pending ?? null);
      setAuthEmailError(null);
      setAuthEmailReady(true);
    } else {
      setAuthEmailError(res.error ?? "Failed to load auth email");
      setAuthEmailReady(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setError("Missing user id");
      setLoading(false);
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    authEmailLoadId.current += 1;
    authEmailMutationId.current += 1;
    setAuthEmail(null);
    setPendingAuthEmail(null);
    setAuthEmailError(null);
    setAuthEmailMessage(null);
    setNewAuthEmail("");
    setAuthEmailSaving(false);
    setAuthEmailReady(false);

    setLoading(true);
    setError(null);
    setProfile(null);

    const res = await adminFetchUserEngagementProfile(userId, {
      signal: controller.signal,
    });

    if (controller.signal.aborted || activeRequest.current !== controller) {
      return;
    }

    if (!res.ok || !res.data) {
      setProfile(null);
      setError(res.error ?? "Failed to load user profile");
      setLoading(false);
      activeRequest.current = null;
      void loadAuthEmail(userId);
      return;
    }

    setProfile(res.data);
    setLoading(false);
    activeRequest.current = null;
    void loadAuthEmail(userId);
  }, [loadAuthEmail, userId]);

  useEffect(() => {
    void load();
    return () => {
      activeRequest.current?.abort();
      authEmailLoadId.current += 1;
      authEmailMutationId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setInterviewDialogOpen(false);
  }, [userId]);

  const user = profile?.user;
  const profileMatchesRoute = Boolean(
    userId && user && user.id === userId,
  );

  async function handleAdminAuthEmailChange(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || !authEmailReady || !newAuthEmail.trim()) return;
    const forUserId = userId;
    const mutationId = authEmailMutationId.current;
    const trimmed = newAuthEmail.trim().toLowerCase();
    if (authEmail && trimmed === authEmail.trim().toLowerCase()) {
      setAuthEmailError("That is already this user's current login email.");
      return;
    }
    setAuthEmailSaving(true);
    setAuthEmailError(null);
    setAuthEmailMessage(null);
    const res = await adminRequestUserAuthEmailChange(forUserId, trimmed);
    if (mutationId !== authEmailMutationId.current) return;
    setAuthEmailSaving(false);
    if (!res.success) {
      setAuthEmailError(res.error ?? "Failed to start email change");
      return;
    }
    if (res.pending) {
      setPendingAuthEmail(res.pending);
    }
    setNewAuthEmail("");
    setAuthEmailMessage(
      res.message ?? "Verification email sent to the new address.",
    );
    void loadAuthEmail(forUserId);
  }

  async function handleAdminAuthEmailResend() {
    if (!userId || !authEmailReady) return;
    const forUserId = userId;
    const mutationId = authEmailMutationId.current;
    setAuthEmailSaving(true);
    setAuthEmailError(null);
    setAuthEmailMessage(null);
    const res = await adminResendUserAuthEmailChange(forUserId);
    if (mutationId !== authEmailMutationId.current) return;
    setAuthEmailSaving(false);
    if (!res.success) {
      setAuthEmailError(res.error ?? "Failed to resend verification");
      return;
    }
    if (res.pending) {
      setPendingAuthEmail(res.pending);
    }
    setAuthEmailMessage(res.message ?? "Verification email resent.");
    void loadAuthEmail(forUserId);
  }

  async function handleAdminAuthEmailCancel() {
    if (!userId || !authEmailReady) return;
    const forUserId = userId;
    const mutationId = authEmailMutationId.current;
    setAuthEmailSaving(true);
    setAuthEmailError(null);
    setAuthEmailMessage(null);
    const res = await adminCancelUserAuthEmailChange(forUserId);
    if (mutationId !== authEmailMutationId.current) return;
    setAuthEmailSaving(false);
    if (!res.success) {
      setAuthEmailError(res.error ?? "Failed to cancel email change");
      return;
    }
    setPendingAuthEmail(null);
    setAuthEmailMessage(res.message ?? "Pending email change cancelled.");
    void loadAuthEmail(forUserId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/admin/overview"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to overview
          </Link>
          <h2 className="mt-2 text-2xl font-bold">User profile</h2>
          {user ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {user.name ? `${user.name} · ` : ""}
              {user.email} · {user.provider} · joined{" "}
              {user.createdAt.slice(0, 10)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {userId ? (
            <Link
              to={`/admin/user-sessions/${userId}`}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              View sessions
            </Link>
          ) : null}
          {canRequestInterview && profileMatchesRoute ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setInterviewDialogOpen(true)}
            >
              Request interview
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Longest session</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading || !user
              ? "…"
              : formatDuration(user.longestSessionSeconds)}
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 md:col-span-2">
          <p className="text-sm text-muted-foreground">Subscription</p>
          {profile?.subscription ? (
            <p className="mt-1 text-sm">
              {profile.subscription.status}
              {profile.subscription.planName
                ? ` · ${profile.subscription.planName}`
                : ""}
              {profile.subscription.billingPeriod
                ? ` · ${profile.subscription.billingPeriod}`
                : ""}
              {profile.subscription.cancelAtPeriodEnd
                ? " · auto-renew off"
                : ""}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? "…" : "No subscription on file"}
            </p>
          )}
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-lg font-semibold">Login environments</h3>
          <p className="text-sm text-muted-foreground">
            Platforms this account has authenticated on. Downloads and anonymous
            visits are not counted.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Unable to load authenticated environments.
          </p>
        ) : (profile?.loginEnvironments?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No authenticated environments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Environment</th>
                  <th className="py-2 font-medium">Last authenticated</th>
                </tr>
              </thead>
              <tbody>
                {profile?.loginEnvironments?.map((env) => (
                  <tr key={env.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{env.label}</td>
                    <td className="py-2">
                      {formatDateTime(env.lastAuthenticatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-lg font-semibold">Subscription measures</h3>
          <p className="text-sm text-muted-foreground">
            Sign up, trial, subscription started, renewals (repeat purchase),
            and churn for this user. Cancel-with-time-left is not churn —
            expiration is.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MeasureTile
              label="Signed up"
              value={formatDateTime(
                profile?.subscriptionMeasures?.signedUpAt ??
                  profile?.user.createdAt ??
                  null,
              )}
            />
            <MeasureTile
              label="Trial started"
              value={formatDateTime(
                profile?.subscriptionMeasures?.trialStartedAt ?? null,
              )}
            />
            <MeasureTile
              label="Subscription started"
              value={formatDateTime(
                profile?.subscriptionMeasures?.firstPaidAt ?? null,
              )}
            />
            <MeasureTile
              label="Renewals"
              value={
                profile?.subscriptionMeasures
                  ? String(profile.subscriptionMeasures.renewalCount)
                  : "—"
              }
              hint={
                profile?.subscriptionMeasures?.lastRenewalAt
                  ? `Last ${formatDateTime(profile.subscriptionMeasures.lastRenewalAt)}`
                  : undefined
              }
            />
            <MeasureTile
              label="Cancel requested"
              value={formatDateTime(
                profile?.subscriptionMeasures?.cancelRequestedAt ?? null,
              )}
            />
            <MeasureTile
              label="Churned (expired)"
              value={formatDateTime(
                profile?.subscriptionMeasures?.churnedAt ?? null,
              )}
            />
            <MeasureTile
              label="Reactivated"
              value={formatDateTime(
                profile?.subscriptionMeasures?.reactivatedAt ?? null,
              )}
            />
            <MeasureTile
              label="Payment failures / refunds"
              value={
                profile?.subscriptionMeasures
                  ? `${profile.subscriptionMeasures.paymentFailureCount} / ${profile.subscriptionMeasures.refundCount}`
                  : "—"
              }
            />
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-lg font-semibold">Authentication email</h3>
          <p className="text-sm text-muted-foreground">
            Support recovery: start a pending change and send verification only
            to the new inbox (for users who lost access to their old email). This
            updates sign-in codes and magic links; linked Google/Apple identities
            still open the same account.
          </p>
        </div>
        <p className="text-sm">
          Current:{" "}
          <span className="font-medium">
            {authEmail ?? user?.email ?? (loading ? "…" : "—")}
          </span>
        </p>
        {pendingAuthEmail ? (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              Pending verification for{" "}
              <span className="font-medium text-foreground">
                {pendingAuthEmail.newEmail}
              </span>{" "}
              (expires {formatDateTime(pendingAuthEmail.expiresAt)})
            </p>
            {canWriteAuthEmail ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!authEmailReady || authEmailSaving}
                  onClick={() => void handleAdminAuthEmailResend()}
                >
                  {authEmailSaving ? "Working…" : "Resend verification"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!authEmailReady || authEmailSaving}
                  onClick={() => void handleAdminAuthEmailCancel()}
                >
                  Cancel change
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {authEmailError ? (
          <div className="space-y-1">
            <p className="text-sm text-destructive">{authEmailError}</p>
            {!authEmailReady && userId ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => void loadAuthEmail(userId)}
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {authEmailMessage ? (
          <p className="text-sm text-muted-foreground">{authEmailMessage}</p>
        ) : null}
        {canWriteAuthEmail ? (
          !authEmailReady ? (
            authEmailError ? null : (
              <p className="text-sm text-muted-foreground">
                Loading authentication email…
              </p>
            )
          ) : pendingAuthEmail ? null : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => void handleAdminAuthEmailChange(event)}
            >
              <div className="min-w-[240px] flex-1 space-y-1">
                <Label htmlFor="admin-auth-email">New authentication email</Label>
                <Input
                  id="admin-auth-email"
                  type="email"
                  value={newAuthEmail}
                  onChange={(e) => setNewAuthEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={authEmailSaving || !newAuthEmail.trim()}>
                {authEmailSaving ? "Sending…" : "Send verification"}
              </Button>
            </form>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            You need users.write permission to start an auth email change.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Email timeline</h3>
          <p className="text-sm text-muted-foreground">
            Lifecycle emails with delivery tracking (trial reminder, retention,
            contextual). Welcome, auth, referral, and subscription emails are
            not yet logged here.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : userId ? (
          <EmailTable userId={userId} emails={profile?.emails ?? []} />
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Review activity</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ReviewActivityTable rows={profile?.reviewActivity ?? []} />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Activity timeline</h3>
          <p className="text-sm text-muted-foreground">
            Chronological lifecycle events. VPN connect/disconnect shows the most
            recent sessions when activity is high.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <TimelineList events={profile?.timeline ?? []} />
        )}
      </section>

      {profileMatchesRoute && userId && user ? (
        <AdminInterviewInvitationDialog
          userId={userId}
          defaultEmail={user.email}
          open={interviewDialogOpen}
          onOpenChange={setInterviewDialogOpen}
          onSent={() => void load()}
        />
      ) : null}
    </div>
  );
}
