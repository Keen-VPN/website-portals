import { useEffect, useRef, useState } from "react";
import {
  adminFetchResearchTranscriptById,
  type AdminMeetingTranscript,
} from "@/auth/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminResearchTranscriptDetailDialogProps {
  transcriptId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminResearchTranscriptDetailDialog({
  transcriptId,
  open,
  onOpenChange,
}: AdminResearchTranscriptDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminMeetingTranscript | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !transcriptId) {
      setDetail(null);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    void adminFetchResearchTranscriptById(transcriptId, {
      signal: controller.signal,
    }).then((res) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!res.ok || !res.data) {
        setError(res.error ?? "Failed to load transcript");
        setDetail(null);
        return;
      }
      setDetail(res.data);
    });

    return () => controller.abort();
  }, [open, transcriptId]);

  const attendeesText =
    detail?.attendees != null
      ? JSON.stringify(detail.attendees, null, 2)
      : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail?.title ?? "Transcript"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : detail ? (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Type</dt>
                <dd>{detail.meetingType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ingestion</dt>
                <dd>{detail.ingestionStatus}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Occurred</dt>
                <dd>{new Date(detail.occurredAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fireflies id</dt>
                <dd className="font-mono text-xs break-all">
                  {detail.externalMeetingId}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Keen id</dt>
                <dd className="font-mono text-xs break-all">{detail.id}</dd>
              </div>
            </dl>
            {detail.lastError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {detail.lastError}
              </p>
            ) : null}
            <div>
              <h4 className="mb-1 font-medium">Attendees</h4>
              <pre className="max-h-32 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                {attendeesText}
              </pre>
            </div>
            <div>
              <h4 className="mb-1 font-medium">Transcript text</h4>
              {detail.transcriptText?.trim() ? (
                <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                  {detail.transcriptText}
                </pre>
              ) : (
                <p className="text-muted-foreground">
                  No transcript body (failed ingest or not fetched yet).
                </p>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
