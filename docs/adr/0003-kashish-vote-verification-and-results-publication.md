# ADR 0003: Verify Kashish app votes on Freecomers and publish only approved results

- **Status:** Accepted
- **Date:** 2026-11-03
- **Area:** Audience addon: voting, the Kashish integration, results

## Context
On event day, delegates vote in the external **Kashish app** after each film bundle. The *Kashish Audience Journey* brief sets the rules:
- Freecomers is the judge.
- A vote counts only from a **registered delegate who checked in** at the hall door.
- There is one vote per delegate per film, and the first vote is final.
- Every attempt is kept on record.
- Results become public only after the festival team approves them.

The flow also asks that each vote record the delegate's unique QR/badge number and the time of voting.

The Kashish Votes API (`GET https://kashish-admin.vercel.app/api/v1/votes`) returns three objects per vote:
- `user {id, email, name, countryCode, mobileNumber}`
- `movie {id, title}`
- `vote {stars, source, timestamp}`

**It does not send the delegate's badge number.** It is pull-only and has no webhook.

The sync before this change had five problems:
- it ran only when someone clicked the button;
- it marked every Kashish vote `is_attendance_verified = 1` without checking anything;
- it **auto-created an attendee and a badge** for any voter it couldn't match;
- it stored no badge on the vote;
- nothing published results to Kashish or to a winners screen.

## Decision
1. **Verify every Kashish vote on our side.** This is `syncEventVotes()` in `kashish-sync.controller.js`, used by both the manual button and the auto-sync.
   - **Film:** found through `kashish_movie_mappings`, or an exact normalised title match. If no film matches, the outcome is `unmapped_film`.
   - **Delegate:** matched by email, then by the last 10 digits of the phone with formatting ignored, against this event's `saas_attendees`. **No attendee is ever auto-created.** Mappings left over from the old auto-create logic are ignored. If no delegate matches, the outcome is `unregistered`, and the vote is kept as a receipt only (`audience_votes.attendee_id` is NOT NULL).
   - **Attendance:** the delegate must have a `screening_checkins` row for a screening block that contains the film. If the film isn't in any block, a check-in at any screening of the event counts, matching the brief's "one scan at the hall door unlocks voting".
     - Not checked in: the vote is stored as `flagged_suspicious`, so it shows in the Flagged tab and is not counted.
     - Checked in: `valid`, with `screening_block_id` set.
   - **Duplicates:** if the delegate already has a vote for the film (for example from `/vote`), the first vote stands and the outcome is `duplicate`.
2. **The badge is stored on every vote.** `audience_votes.qr_id` (migration 015) is the delegate's `saas_qr` row when the vote is accepted, for both Kashish and `/vote` votes. The badge number comes from a join to `saas_qr.serial_no`. The vote time is Kashish's `vote.timestamp`, stored in `created_at`.
3. **Every Kashish vote gets a receipt** in `kashish_vote_receipts`, unique per `(event_id, kashish_vote_id)`.
   - It holds the outcome, reason and raw payload.
   - Re-syncs are idempotent: `counted` and `duplicate` are final.
   - Other outcomes are re-evaluated on each sync, so a late registration or a late or offline check-in promotes a flagged vote to valid.
   - Staff view them through `GET /api/kashish-sync/receipts`, which needs `voting.audit_fraud`.
4. **Auto-sync.** `core/services/kashishSyncScheduler.js` runs `syncEventVotes` every `KASHISH_SYNC_INTERVAL_SEC` seconds (default 120, minimum 30, 0 disables), only for events with a screening voting window **open**.
   - A per-event lock stops runs from overlapping, including with the manual button.
   - Each run is logged in `kashish_sync_logs` with `synced_by_user_id = NULL`.
   - The sync request no longer accepts its own API key; it always uses `KASHISH_API_KEY`.
5. **Results go out only after approval.** `GET /api/public/results/:eventId` needs no login and is rate-limited.
   - Before the team clicks *Approve & Publish*, it returns `403 {status: "results_not_approved"}`.
   - After approval it returns the winner (the first eligible film) and the ranked standings: title, director, votes, average and score.
   - The **Kashish app pulls from this endpoint**, and the **winners screen** `/results/:eventId` uses it. That page is public, made for a projector, polls every 30 seconds, and switches from "pending" to the winners when results are approved.
   - No API key is needed, because only approved data that is already public is served.
6. **The admin leaderboard** refreshes every 15 seconds while its tab is open.

## Alternatives considered
- **Ask Kashish to send the badge number, or to log users in through Freecomers.** This is the better long-term design and is the brief's open question 9. It needs changes in the Kashish app. Our email/phone matching works today without it, and if Kashish later adds a badge field, it plugs straight into the delegate-matching step.
- **A Kashish webhook for real-time votes.** Not offered by their API. A 2-minute pull is enough for voting after each bundle, and a webhook can feed `syncEventVotes`-style processing later.
- **Keep auto-creating unknown voters.** Rejected, because it counts votes from people who never registered or entered the hall, against the brief.
- **Put a secret key on the results endpoint.** Unnecessary, because the endpoint serves nothing before approval.

## Consequences
- **Votes can stay uncounted.** A Kashish vote from a delegate who registered on Kashish with a different email or phone than on Freecomers is `unregistered` until those details match. Staff can see these in the receipts list.
- **Flagged votes are not counted.** Votes from delegates who weren't scanned in appear in the Flagged tab. Once a check-in exists they're counted automatically on the next sync.
- **Approval does not freeze the standings.** Approval is a flag, so votes that arrive after approval while a window is still open will still change them. The team should **close voting before approving**.
- **There is no minimum number of ratings.** `recalculateScores` marks every film eligible ("no minimum quorum per Kashish Scoring Guide"). The brief's suggested 10-rating minimum is still an open decision for the festival.
- **The dev database receives real Kashish votes every 2 minutes** while a window is open. Set `KASHISH_SYNC_INTERVAL_SEC=0` to turn this off.
