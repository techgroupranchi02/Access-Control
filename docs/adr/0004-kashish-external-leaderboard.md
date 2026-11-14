# ADR 0004: Leaderboard from Kashish-app votes for films that aren't in Submissions

- **Status:** Accepted
- **Date:** 2026-11-10
- **Area:** Audience addon: voting, the Kashish integration, results
- **Relation:** Extends [ADR 0003](0003-kashish-vote-verification-and-results-publication.md). ADR 0003 still applies to festivals that use FestiPlus films; this ADR covers festivals with `voting_source = 'kashish'`.

## Context
KASHISH x BENGALURU 2026 wants only a leaderboard from FestiPlus:
- Checked-in delegates vote in the **Kashish Pride app**.
- Nobody votes through FestiPlus screening windows, the projected QR or `/vote`.

The festival's films are **not** FestiPlus submissions, and they are not listed on the Freecomers festival page. The team asked that we use the film names from Kashish and not create or link rows in our event tables.

The ADR 0003 sync maps every Kashish vote to a `submissions` row. For KASHISH none map, so all 78 votes were dropped as `unmapped_film`, and the leaderboard showed only test submissions.

The Kashish API sends, per vote: `id`, `user {id, email, name, countryCode, mobileNumber}`, `movie {id, title}` and `vote {stars, source, timestamp, status}`. It has no festival or edition filter: the live feed mixes votes from June to October 2026.

## Decision
1. **A per-festival vote source.**
   - It lives in `audience_settings.settings_json.voting_source`: `freecomers` (default, ADR 0003) or `kashish`.
   - It is set in Settings › Audience › Voting Rules, together with an optional voting period (`kashish_voting_from` / `kashish_voting_to`, stored as ISO UTC).
   - Nothing is hard-coded to an event.
2. **Kashish films stay external.**
   - Votes are stored in `kashish_external_votes`, keyed by Kashish's movie ID and title.
   - The `kashish` path never reads or writes `submissions`, `audience_votes`, `audience_voting_scores` or `kashish_movie_mappings`.
3. **Verification is kept, adapted to external films.** A vote counts only if, in this order:
   - its stars are 1–5;
   - Kashish marks it "Verified Vote";
   - it was cast inside the voting period;
   - the voter matches a registered delegate of the festival by **email, then mobile number** (shared helper `matchKashishUserToAttendee`; never auto-creates attendees);
   - that delegate has **any** check-in at the festival, since the films aren't in our screening blocks;
   - it is the voter's first counted vote for that film.

   Every vote keeps its outcome and a reason, and is re-evaluated on every sync. Votes that disappear from the API stop counting.
4. **Scoring** uses the same Bayesian formula as ADR 0003: `W = v/(v+m)·R + m/(v+m)·C`, with `m` from settings and `C` the mean of counted votes. Ties go to more votes, then the higher average. Standings are computed on read; no score table is needed.
5. **Published results are frozen snapshots.**
   - Approve & Publish stores the current standings in `kashish_results_publications`.
   - `GET /api/public/results/:eventId` serves the latest snapshot and returns 403 before the first publish.
   - The leaderboard flags when live standings have changed since publishing, and "Publish again" makes a new snapshot.
6. **FestiPlus voting is off** for these festivals. `open-voting` and the public `/vote` read and submit return 403. The Voting page shows only Leaderboard and Sync status.
7. **Auto-sync** runs for Kashish-source festivals until a day after the voting period ends, in addition to festivals with an open screening window. It uses the same per-event lock and `kashish_sync_logs`.

## Consequences
- **Matching depends on registration data.** A voter counts only if they registered for the festival with the same email or phone they use in the Kashish app. On dev, none of the 58 current voters exists as a delegate, so dev shows 0 counted votes. The Sync status tab shows the reason for every skipped vote.
- **The feed isn't scoped by festival.** Until Kashish adds an edition filter, the voting period is the only way to exclude other editions' or test votes. We asked the Kashish team for this; see [docs/kashish-votes-api-requirements.md](../kashish-votes-api-requirements.md).
- **No director or category is shown**, because Kashish sends only an ID and title. A films endpoint from Kashish would add them.
- **Personal data:** email and mobile are used only for matching. Matches stay in `kashish_user_mappings`; `kashish_external_votes` holds no email or phone.
- **Old data is untouched.** `kashish_vote_receipts` rows from the ADR 0003 path stay in place and are unused for Kashish-source festivals.

## Alternatives rejected
- **Creating hidden submissions for Kashish films.** Rejected: it adds records to our event tables, which the team explicitly ruled out.
- **Trusting Kashish's "Verified Vote" alone.** Rejected by the team, which wants FestiPlus registration and check-in verification.
- **Live (unfrozen) public results.** Rejected: late votes could change announced winners.

## Amendment 1: Event filter and incremental sync (2026-11-12)

**Context.** The Kashish API added an `eventId` filter (and `eventId` on every vote) and `updatedSince` incremental sync, returning `sync.syncedAt`. The Kashish team confirmed that votes are never updated after they're cast, that only `scan` votes are sent to us, and that the rate limit is 50. The live feed mixed 77 untagged June–October votes with 3 votes tagged `EF3j920261` (KASHISH x BENGALURU 2026).

**Decision**
1. **Kashish event ID per festival.** Stored in `audience_settings.settings_json.kashish_event_id` and set in Settings › Audience › Voting Rules (letters, digits, `-`, `_`, up to 64 characters). Every fetch passes `eventId` and `source=scan`. If the ID is empty, the feed is read unfiltered and the Sync tab warns about it.
2. **Incremental sync.** `kashish_sync_state` stores the last `syncedAt` per festival.
   - **Scheduled runs (every 2 minutes):** they pass it back as `updatedSince` and fetch only new votes.
   - **Full sync:** it reads the event's whole feed. It runs on **Sync now**, the first time, and whenever the event ID changes.
   - There is no periodic full sync, because votes never change.
3. **Re-checking without re-fetching.** Voter email, name, mobile and country are stored on `kashish_external_votes`. Every run re-evaluates all stored votes, so late registrations and check-ins still count.
4. **`removed` outcome.** After a full sync, stored votes that aren't in the event feed become `removed`. They are kept for audit, excluded from standings and from the per-film list, and shown as "Not in this event". On the first run, event 40 got 78 removed rows, 1 counted and 2 unregistered.
5. **Guards.** A vote tagged with a different event, or one that isn't a scan vote, is stored as `invalid` with its reason.
6. **Rate limit.** An HTTP 429 is retried once after 5 seconds; after that the run stops with `KASHISH_RATE_LIMITED`, and the next run carries on.
7. **No key in code.** `KASHISH_API_KEY` must come from `.env`. The old fallback was removed because the guide published that key.

Migration: `023_kashish_sync_state.js`.

## Amendment 2: Per-show attendance windows (2026-11-14)

**Context.** Any check-in at the festival, at any time, made every vote count. So a delegate scanned in for Show X, who left and later voted for Show Y using a photo of Y's voting QR sent by a friend, had that vote counted. The client's rules for KASHISH x BENGALURU 2026 tie each vote to attendance at the film's own show, scanned at the door within a time window.

**Decision**
1. **Attendance window per show.** It runs from `attendance_window_before_min` minutes before the start to `attendance_window_end_before_min` minutes before the end. Both are festival settings in Voting Rules and default to 15, so a 1:00–2:00 PM show takes attendance from 12:45 to 1:45 PM. Times are the festival's local wall-clock times (`screening_date`, `start_time`, `end_time`), read in the server's time zone (IST). The code is `showWindows.service.js`.
2. **A vote counts** only when the voter (matched as before) has a scan inside the window of a show that includes that film, **and** that scan came before the vote. Voting later the same day or on a later day is fine until the voting period ends. The scan's time decides, not the show the volunteer had selected.
   - New outcomes: `unscheduled` (the film is on no voting show) and `voted_before_checkin`.
   - `not_checked_in` now means not scanned in during a window of that film's shows; the reason names the show and its window.
   - `checkin_block_id` records the show that matched.
3. **Schedule editor:** Settings › Audience › Screenings (`ScreeningsEditor.jsx`), needing `audience.manage_settings`. It sets date, start and end (or running time), type, Audience Choice voting on/off (off for ceremonies, panels and talks) and venue. For Kashish-source festivals it also sets the Kashish films in each show.
   - Films are stored in `screening_block_kashish_films` (Kashish movie ID and title; a film may play in more than one show).
   - Films are picked from those seen in votes, or added by Kashish movie ID, because Kashish has no films list API yet.
   - The API: `PUT` and `DELETE /api/audience/screenings/:id`, an extended `POST`, and `GET /api/audience/screenings/kashish-movies`.
   - A show with scans or votes can't be deleted; change its time or turn its voting off instead.
4. **Rescheduling.** A delayed show is edited in place and its window moves with it. Saving a show or the Voting Rules re-checks the stored votes at once (`recheckStoredExternalVotes`: no Kashish call, same per-event lock). Scheduled syncs keep re-checking everything every run.
5. **Every scan is kept.** `screening_checkins` loses its one-row-per-show unique key, so re-entry, delays and people asked to come back are all recorded.
   - Each scan stores `scan_status` `valid` (inside the selected show's window) or `outside_window`.
   - The scanner says which: "Counts for TINY TAILS", or "Recorded, but it's before the attendance window … scan them again between …", and names another show whose window is open.
   - A repeat of the same badge at the same show within 30 s is treated as scanner bounce.
   - The Attendance page opens on the show whose window is open now and shows the window and its status.
6. Delegates already checked in are no longer refused as "Badge not issued" on a later scan.

Migration: `026_show_attendance_windows.js` (`voting_enabled`, `screening_block_kashish_films`, the scans index change, `outside_window`, and the two vote outcomes).
