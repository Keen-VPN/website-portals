import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminFetchResearchStudies,
  adminPreviewUserInterviewInvitation,
  adminSendUserInterviewInvitation,
  type AdminResearchStudy,
} from "@/auth/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  userId: string;
  defaultEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
};

export function AdminInterviewInvitationDialog({
  userId,
  defaultEmail,
  open,
  onOpenChange,
  onSent,
}: Props) {
  const [studies, setStudies] = useState<AdminResearchStudy[]>([]);
  const [studyId, setStudyId] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [schedulingUrl, setSchedulingUrl] = useState("");
  const [incentiveLabel, setIncentiveLabel] = useState("");
  const [subject, setSubject] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [forceResend, setForceResend] = useState(false);
  const [loadingStudies, setLoadingStudies] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const studiesAbort = useRef<AbortController | null>(null);

  const selectedStudy = studies.find((s) => s.id === studyId) ?? null;

  const loadStudies = useCallback(async () => {
    studiesAbort.current?.abort();
    const controller = new AbortController();
    studiesAbort.current = controller;
    setLoadingStudies(true);
    const res = await adminFetchResearchStudies({ signal: controller.signal });
    if (controller.signal.aborted) return;
    setLoadingStudies(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Failed to load studies");
      return;
    }
    const eligible = res.data.filter(
      (s) => s.status === "ACTIVE" || s.status === "DRAFT",
    );
    setStudies(eligible);
    if (!studyId && eligible.length > 0) {
      setStudyId(eligible[0].id);
    }
  }, [studyId]);

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail);
    setError(null);
    setMessage(null);
    setForceResend(false);
    void loadStudies();
    return () => studiesAbort.current?.abort();
  }, [open, defaultEmail, loadStudies]);

  useEffect(() => {
    if (!selectedStudy) return;
    setIncentiveLabel(selectedStudy.incentiveLabel);
    setSchedulingUrl(selectedStudy.schedulingUrl ?? "");
  }, [selectedStudy]);

  function composeBody() {
    return {
      studyId,
      email: email.trim() || undefined,
      schedulingUrl: schedulingUrl.trim() || undefined,
      incentiveLabel: incentiveLabel.trim() || undefined,
      subject: subject.trim() || undefined,
      personalMessage: personalMessage.trim() || undefined,
      forceResend,
    };
  }

  async function handlePreview() {
    if (!studyId) {
      setError("Select a study");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await adminPreviewUserInterviewInvitation(userId, composeBody());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Preview failed");
      return;
    }
    setMessage(
      `Preview sent to your admin inbox. Recipient would be ${res.data?.recipientEmail ?? email}.`,
    );
  }

  async function handleSend() {
    if (!studyId) {
      setError("Select a study");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await adminSendUserInterviewInvitation(userId, composeBody());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Send failed");
      return;
    }
    setMessage("Interview invitation sent.");
    onSent();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request interview</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-destructive">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
              {message}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="interview-study">Study</Label>
            <select
              id="interview-study"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={studyId}
              onChange={(e) => setStudyId(e.target.value)}
              disabled={loadingStudies || busy}
            >
              {studies.length === 0 ? (
                <option value="">
                  {loadingStudies ? "Loading…" : "No active studies"}
                </option>
              ) : (
                studies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status.toLowerCase()})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-email">Recipient email</Label>
            <Input
              id="interview-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-incentive">Incentive (shown in email)</Label>
            <Input
              id="interview-incentive"
              value={incentiveLabel}
              onChange={(e) => setIncentiveLabel(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-scheduling">Scheduling link</Label>
            <Input
              id="interview-scheduling"
              type="url"
              placeholder="Calendly URL"
              value={schedulingUrl}
              onChange={(e) => setSchedulingUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-subject">Subject (optional)</Label>
            <Input
              id="interview-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              placeholder="Default subject used if empty"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-message">Personal message (optional)</Label>
            <Textarea
              id="interview-message"
              rows={4}
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              disabled={busy}
            />
          </div>
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={forceResend}
              onChange={(e) => setForceResend(e.target.checked)}
              disabled={busy}
            />
            Force resend (ignore 14-day dedupe for this study)
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handlePreview()}
            disabled={busy || !studyId}
          >
            Preview to my inbox
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={busy || !studyId}>
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
