# Admin Research runbook

Use **Admin → Research** (`/admin/research`) for Fireflies transcripts and interview studies ($50 gift-card tracking).

## Fireflies title format (meeting type)

Backend classifies transcripts from the Fireflies **title** and folder rules (`meeting-type.util.ts` on the API). For user interviews, titles should clearly indicate a customer interview so auto-match can run.

| Pattern (title) | Typical `meetingType` |
|-----------------|------------------------|
| Contains `user interview`, `customer interview`, etc. | `USER_INTERVIEW` |
| Team standup / check-in wording | `TEAM_CHECKIN` |
| Other internal briefings | `PERFORMANCE`, `SEO_BRIEFING`, etc. |
| Unmatched | `OTHER` |

**Webhook:** `POST /api/webhooks/fireflies` on the MCP/API host. Requires `FF_FIREFLIES_INGEST_ENABLED=true` and `FIREFLIES_API_KEY`.

## Auto-match checklist (Studies tab)

Auto-match links a participant to a transcript when **all** of the following hold:

1. Participant email appears in the transcript **attendees** JSON.
2. Transcript `meetingType` is **USER_INTERVIEW**.
3. Transcript `ingestionStatus` is **SUCCEEDED** (body fetched from Fireflies).
4. Transcript `occurredAt` is within **±48 hours** of the participant’s `scheduledAt` or `completedAt` (whichever is set).
5. Among matches, the **newest** transcript by `occurredAt` wins.

If auto-match fails, link manually from the participant **Actions** column: **Link transcript…** when none is linked, or **Change transcript…** to replace an existing link. Paste the Keen transcript **UUID** from the Transcripts tab (not the Fireflies meeting id).

## Gift card ($50) workflow

1. Create or select an **ACTIVE** study with incentive label (default **$50 gift card**).
2. Add participant or send **Request interview** from the user admin profile.
3. Set scheduling URL on the study; Calendly webhook can mark **SCHEDULED** when `utm_content=<studyId>` is on the link.
4. After the call, set status **COMPLETED** (manually or via your scheduling flow).
5. **Auto-match**, **Link transcript…**, or **Change transcript…** so the row shows a linked transcript.
6. Click **Mark $50 paid** — writes the incentive ledger (prevents double pay).
7. Read-only admins see **Linked and paid** when transcript is linked, status is COMPLETED, and incentive is PAID.

## Transcripts tab

- **50 rows per page** with **Load more** (offset pagination).
- **Hide failed ingestions** hides webhook test noise (e.g. `test_00000000`); uncheck to audit failures.
- **View** opens full transcript text in the UI.
- **Delete** removes an **unlinked** failed row (cosmetic cleanup).

## Permissions

| Permission | Access |
|------------|--------|
| `research.read` | Studies, transcripts, transcript detail, status hints |
| `research.write` | Create/delete studies & participants, link transcripts, mark paid, reconcile, delete unlinked transcripts |
