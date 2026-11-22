# Execution Plan

The live status of work on FestiPlus Access Control: what is in progress, what is next, what is waiting on someone, and what was recently finished.

## How to use this file

- **Starting a task:** add it to **In progress** with today's date and a one-line goal.
- **Finishing a task:** move it to **Done**, newest first. Note what changed, how it was verified, and where it stands:
  - `uncommitted`: changed on dev, not yet committed;
  - `committed`: committed, not yet on production;
  - `deployed`: live on production.
- **Waiting on a person** (a credential, a decision, a production action): put it under **Needs action** and name the owner.
- **Keep it short:**
  - one bullet per task, with file links instead of long explanations;
  - move **Done** items older than 30 days into the **Archive** section at the bottom, and delete them once they are deployed and in git history;
  - big design decisions go in an ADR under [docs/adr/](adr/), not here.

Dates are written as YYYY-MM-DD.

---

## In progress

_Nothing in progress._

## Up next

- **Make the `KB26-` delegate label dynamic.** The backend builds it with a fixed prefix when a delegate registers (`audience.controller.js`); it should come from festival settings.
- **Remove Kashish wording from the fallback registration FAQ** in `RegistrationPage.jsx` (used only when a festival hasn't saved its own FAQ).
- **Bring `.env.example` up to date.** It lists only the database, app and JWT keys; it should list every key in the [README](../README.md#configuration).
- **Replace `frontend/README.md`.** It is still the default Vite template; point it to the root README.
- **Optional: move Edit Member to its own page** (`/team/:id/edit`), like Add Team Member and Add Custom Group.

## Needs action

| Since | Item | Owner | Notes |
| --- | --- | --- | --- |
| 2026-11-20 | Production: set delegates whose category is not one of the festival's (e.g. Sarang Bhakra, BANGALORE_GENERAL) to the festival's category: preview + UPDATE query given in chat on 2026-11-20. | User | Data only; the code fix stops new ones after deploy. |
| 2026-11-20 | Production: after the next deploy, check the migrate log for `[Migration 027] … 1 change(s)` (time zone set) and `[Migration 030] ✓ festival …: N of M scan(s) re-marked`; then Attendance shows today's scans as valid inside their windows. | User | The "server time zone must be IST" item below is no longer required once this is deployed. |
| 2026-11-19 | Production: optional wider check for auto-added Admin rows, for every admins id: ``SELECT ueg.user_id, ueg.event_id, e.name FROM user_event_groups ueg JOIN `groups` g ON g.id = ueg.group_id JOIN events e ON e.event_id = ueg.event_id WHERE g.group_key = 'admin' AND ueg.user_id IN (SELECT id FROM admins);`` | User | 2026-11-19: the check for the first admins id returned no rows on production. Only needed if production has more than one admin. |
| 2026-11-19 | Production: set KASHISH's edition: `UPDATE events SET edition = 'Edition 1 · 2026' WHERE name = 'KASHISH x BENGALURU 2026' AND is_deleted = 0;` | User | Check the row with a SELECT first; one row only. Not a deploy step. |
| 2026-11-18 | Production: run the read-only check (`venues` columns; `voting_enabled`, `screening_block_kashish_films`, `data_seed_log`, `kashish_movies` present) and send the output. After the next deploy, check the deploy log for `FAILED` migrations, then press **Import films from Kashish** in Settings › Audience › Screenings if shows are still missing | DevOps / Festival team | Confirms whether migrations 026–028 ran on production. The venue fix works with any `venues` columns. |
| 2026-11-14 | Production server time zone must be IST (attendance windows use the server's local time) | DevOps | Check `timedatectl` on the production host. |
| 2026-11-12 | Ask Kashish to rotate the API key printed in their guide, then update `KASHISH_API_KEY` in dev and prod `.env` | Team | The guide's examples show our live key. Their Movies API guide (2026-11-18) prints a key again. |
| 2026-11-14 | Ask Kashish whether shorts are voted on individually or as a package | Team | The Movies API lists each short as its own film, so individual voting is assumed. |
| 2026-11-12 | On production, open Settings › Audience › Audience Voting Rules for KASHISH x BENGALURU 2026: set **Where audience votes come from** = Kashish Pride app and **Kashish event ID** = EF3j920261, then Save and run Voting › Sync status › Sync now | Festival team | Root cause of prod showing the screening-QR tabs on /voting: the vote source is per festival in each database and was set only on dev (dev festival 40; prod's KASHISH has another ID). |
| 2026-11-12 | Production backend `.env`: set `KASHISH_API_KEY` | DevOps | The code has no fallback key; without it Kashish sync stops with "API key is missing". |
| 2026-11-12 | Production: run `node migrations/run_all_migrations.js` (018–025) | DevOps | 023 `kashish_sync_state` (Kashish sync), 024 `qr_print_log` (print history) and 025 (clears stale pass days) are needed by the deployed code. |
| 2026-11-13 | Production server: check headless Chrome can start for the backend user (Chrome system libraries; the Jenkins `npm install` adds `puppeteer`, which downloads Chrome into `~/.cache/puppeteer`, and `archiver`) | DevOps | Needed by Print dialog › Card › Download PDFs. If Chrome cannot start, the button shows "Could not make the PDFs" and the backend log has `[CardPdf]`. |
| 2026-11-13 | Production backend `.env`: add the `MAIL_*` keys (same account as production Laravel) | DevOps | Without them the "Email the updated confirmation" option reports "Email isn't set up on the server". |
| 2026-11-13 | Production: fill Settings › Audience › Step 4 for KASHISH: Screening Hours, Donation Link, and the Confirmation email fields (address, organiser, donation message, app name, description, Android and iOS links) | Festival team | Used by the updated confirmation email; empty sections are left out. Dev festival 40 has the values to copy. |
| 2026-11-10 | Send the Kashish API requests to the Kashish team | Team | [kashish-votes-api-requirements.md](kashish-votes-api-requirements.md). Most important: a festival/edition filter, plus keep sending email and mobile on every vote. |
| 2026-11-10 | Set the KASHISH voting period | Festival team | Settings › Audience › Voting Rules → "Voting from / to". Until it is set, votes from any date count, including 77 votes from before July. |
| — | Set `FREECOMERS_API_URL` in the production `.env` | DevOps | If it is unset, it falls back to a host worked out from `FRONTEND_URL`. |
| — | Deploy the pending Laravel and Next.js fixes to production | DevOps | Production deploy only; they are not in this repo. |

## Done

- **2026-11-22: Voting › Leaderboard: export as CSV and PDF** (`deployed` 2026-11-22).
  - **Change:**
    - `audience.controller.js` › `exportVotingLeaderboard` and route `GET /api/voting/leaderboard/export?format=csv|pdf` (`voting.view_results`, Kashish-app festivals). It uses the same `computeExternalStandings` as the tab, so the file matches the screen.
    - CSV: rank (blank for films with no votes), film, Kashish film ID, votes, average, score; formula guard; BOM for Excel.
    - PDF: A4 with the festival name, draft/published status (and a note when votes changed since publishing), last sync, export time and time zone, scoring method, voting period, top 3 highlighted, page numbers.
    - File names say draft/published/current and the date.
    - `cardPdf.service.js` › `htmlToPdf()` (shared browser, no scripts, no network).
    - `KashishVotingBoard.jsx`: CSV and PDF buttons next to Refresh. CSS `.fc-kv-head-actions`.
    - Export responses (also the Sync status voter CSV) send `Cache-Control: no-store`.
  - **Test (dev, festival 40):** CSV and PDF return 200 with the right file names; bad format → 400; volunteer → 403. The PDF was rendered to images: dev data (all 0 votes) and sample standings in memory (ranked rows, top-3 highlight, "Published … by …"). Puppeteer in dark and light: both buttons download; at 390px the three buttons share one row with no sideways scroll.

- **2026-11-22: Voting › Sync status: see the voters behind each count** (`deployed` 2026-11-22).
  - **Why:** staff could see how many votes didn't count (not a registered delegate, not scanned in, not in the vote) but not whose they were.
  - **Change:**
    - `kashishExternalVotes.service.js` › `listExternalVotes` and `VOTE_LIST_OUTCOMES`; `kashish-sync.controller.js` › `listExternalVotes` (JSON or `format=csv`, times in the festival's time zone, spreadsheet-formula guard); route `GET /api/kashish-sync/external-votes` (`voting.audit_fraud`).
    - `KashishVoteListDialog.jsx` (new): voter name / email / mobile, film and rating, voted time, matched delegate with every scan (show, time, in/outside window), reason; search, 25 per page, Export CSV, Esc closes.
    - `KashishVotingBoard.jsx`: tiles with votes become buttons ("See voters") for users with the permission. CSS `.fc-kvl-*`, `.fc-kv-tile.is-clickable` in `index.css`.
  - **Test (dev, festival 40):** API totals match the tiles (84 / 1 / 1 / 16); search; unknown group → 400; CSV of all 84 rows with the right file name; a volunteer gets 403. Puppeteer in light and dark mode: only tiles with votes are clickable, 25 rows and paging, CSV download, Esc closes, the scan group shows the matched delegate ("Never scanned"); at 390px rows become cards with no sideways scroll.

- **2026-11-21: API and database reference with review** (document only, no code change).
  - `/var/www/Access-Control API and Database Reference.docx`. It covers all 213 endpoints (permission, handler, tables read and written, frontend caller), the tables each endpoint uses, ER diagrams (6 areas), class diagrams (6 groups) and the schema of the 89 tables Access-Control uses or owns. Built from the code and the dev schema (read-only); generator scripts are in the session scratchpad.
  - Findings, not yet fixed:
    - A1: 21 endpoints have no permission check (reviews decision/assign/complete-stage, settings flags and review stages, guests check-in, sponsors, payouts). The festival comes from a header, so any signed-in user can call them for any festival.
    - A2: when the header is missing, 60 places fall back to festival 1 and 5 to festival 40.
    - A3: `GET /api/admin/permission-groups` always returns 500 (it calls a missing function).
    - A4: placeholder news, analytics and plugin endpoints.
    - D1: 8 unused tables.
    - D2: `delegate_reviews` and `event_module_settings` have no migration.
    - D3: old migration 004 drops the Freecomers `roles` table if run by hand.
    - D4–D8: unused columns, missing and redundant indexes, missing foreign keys, log retention.

- **2026-11-20: Venue Checkins: rows per page, scroll box, still pages** (`deployed` 2026-11-20).
  - **Why:** 50 rows (~2,150px) pushed the pager below the fold, and FACE2FACE's 43 scans showed as one long page with no pager. 15 rows would mean 10–20 pages for a busy show. The 15s refresh also pushed rows down on page 2+.
  - **Change:** `AttendancePage.jsx`:
    - 25 / 50 / 100 rows per page (default 25, saved in `localStorage` `fc_attendance_page_size`);
    - the table scrolls inside `.fc-ct-scroll` (capped to the screen, sticky header; none on phones);
    - the footer (count, rows per page, pager) shows whenever there are rows;
    - pages 2+ send `max_id` (newest id seen on page 1), so rows stay still, and a "N new scans · Show latest" button appears.
  - `listAttendance` takes an optional `max_id` and returns `new_since_anchor`. Shared `.fc-pg-size` / `.fc-pg-bar-left` CSS (aliases of the BulkQr classes).
  - **Test:** dev API, festival 40: `max_id` = 3rd-newest leaves out the 2 newest and returns `new_since_anchor` 2; an invalid `max_id` is ignored. Puppeteer with a mocked 60-scan list at 1400×900: 25 rows, pager in view with no window scroll, header stays put while the box scrolls; on page 2 a new scan leaves the rows still and shows "1 new scan · Show latest", which goes back to page 1; 50 persists after reload; at 390px there is no inner scroll and no sideways scroll.
- **2026-11-20: Collapsed sidebar: the edition badge ran past its card** (`deployed` 2026-11-20).
  - **Cause:** the 68px rail showed `events.edition` as one unbroken line ("Ed. 1 · 2026", ~60px) inside a ~44px card.
  - **Fix:** `Sidebar.jsx` splits the edition on its separators (`·`, `|`, `,`, `•`, dashes) into one line per part, each cut with an ellipsis if still too wide; the full edition is the tooltip. Nothing is shown when the edition isn't set. CSS: `.fc-festival-mini` / `.fc-festival-mini-tag` in `index.css`.
  - **Test:** dev, festival 40, collapsed: the badge reads "Ed. 1" / "2026" inside the card (tag 21–46px, card 8–59px).
- **2026-11-20: Delegates shown as "BANGALORE_GENERAL" (a category that doesn't exist)** (`deployed` 2026-11-20).
  - **Root cause:** a hard-coded default `bangalore_general` in FestiPlus: the desk form (`AttendeeCreatePage.jsx`) started with it and sent it when empty; a fake dropdown option "Festival Delegate (DELEGATE)" carried it when the category list hadn't loaded (`AttendeeCreatePage.jsx`, `AttendeeEditPage.jsx`); the list request's failure was swallowed; and `registerAttendee` / `updateAttendee` saved it unchecked (`delegate_category || 'bangalore_general'`). The list shows an unmatched category in capitals, hence BANGALORE_GENERAL. Bulk import had `'delegate'` hard-coded.
  - **What:** `audience.controller.js` › `categoryResolver(eventId)`: register, edit and bulk import save only the festival's own category codes (code or name match, else the first category). Frontend: every `bangalore_general` default and the fake option removed (`AttendeeCreatePage.jsx`, `AttendeeEditPage.jsx`, `RegistrationPage.jsx`); an empty choice reads "Festival's default category".
  - **Checked on dev:** desk registration with `bangalore_general` → saved `delegate`; with none → `delegate`; with the name "Festival Delegate" → `delegate`; editing a row stored as `bangalore_general` → `delegate`. Test delegates deleted. Frontend built, backend restarted.
  - **Not FestiPlus:** the Laravel registration (`Freecomers_backend` › `FilmFestivalController.php` ~8218) also falls back to a fixed "Bangalore Attendee" when no category is sent.
- **2026-11-20: No scanning after a show's attendance window closes** (`deployed` 2026-11-20). [ADR 0004, Amendment 8](adr/0004-kashish-external-leaderboard.md).
  - **What:** `audience.controller.js` › `performScreeningCheckin` refuses a scan for a closed window (409 `window_closed`, nothing recorded, names the show whose window is open). `AttendancePage.jsx`: for a closed show the camera closes, the camera button is replaced by "Attendance for … closed at …", and the badge box and Verify are disabled. Before the window opens scans are still recorded.
  - **Checked on dev:** scan for TINY TAILS (closed 12:15 PM) at 1:51 PM → 409 "… closed at 12:15 pm. Not recorded. FACE2FACE's window is open now …", 0 rows; page screenshot shows the closed message and disabled controls. Show-time edit re-marks stored scans: TINY TAILS 11:00–11:30 turned an 11:56 scan `outside_window`, restoring 11:00–12:30 turned it `valid` again.
- **2026-11-20: Production attendance "not open yet" and every scan "Outside window"; Venue Checkins paging** (`deployed` 2026-11-20). [ADR 0004, Amendment 8](adr/0004-kashish-external-leaderboard.md).
  - **Root cause:** `showWindows.service.js` › `localDate` built show times with `new Date('YYYY-MM-DDTHH:MM')`, i.e. in the server's time zone. Production runs on UTC (dev on IST), so TINY TAILS 11:00 IST became 11:00 UTC = 4:30 PM IST: the window (10:45–12:37) opened at 4:15 PM IST. The scanner compares `opens_at` with now ("not open yet"), every scan was stored `outside_window`, and the Kashish vote check would refuse those votes. The label text looked right because it used the same server hours.
  - **Pagination:** the page asked for `limit: 50` and showed only the first 50 scans; there was no paging.
  - **What:**
    - `showWindows.service.js`: festival time zone (`settings_json.timezone`, else `FESTIVAL_TIMEZONE`, else server); zone-aware `localDate` / `windowOf` / `windowJson`; `clockLabel`, `dayLabel`; `recomputeScanStatus`.
    - `audience.controller.js`: scan messages in the festival's zone; `GET /audience/settings` returns `timezone_effective`; the attendance-window save also takes `timezone`; `recheckVotesSoon` re-marks stored scans first; `GET /attendance/logs` paged (`page`, `page_size`, `total`, `total_pages`).
    - `kashishExternalVotes.service.js`: vote reasons show window times in the festival's zone.
    - `scheduleSeed.service.js` + `migrations/data/kashish-bengaluru-2026-schedule.json`: `timezone: Asia/Kolkata`, set once if the festival has none.
    - `migrations/030_recompute_scan_status.js` (new, in the runner): re-marks stored scans and re-checks Kashish votes on deploy.
    - `environment.js`: optional `FESTIVAL_TIMEZONE`.
    - `AudienceSettingsPage.jsx`: Festival time zone picker on the Screenings card. `AttendancePage.jsx`: Venue Checkins total + shared `Pagination` (50 per page).
    - `AttendancePage.jsx`: the picked show is kept after a page refresh (sessionStorage per festival, this tab only); a new tab starts on the show on now. On production the refresh also jumped to TINY TAILS because the server's "current show" used the same wrong windows (its window "opened" at 4:15 PM IST, so it stayed the next show).
  - **Checked on dev:** with Node forced to UTC and no zone set, the TINY TAILS window opened at 10:45 UTC (the production bug); with the zone from the schedule file it opens at 05:15 UTC = 10:45 IST on a UTC and on an IST server. Migration 030: 0 of 5 dev scans changed; a deliberately wrong status was restored. Paging with 120 temporary scans: 125 → 3 pages (50/50/25), no overlap, out-of-range page clamped; temporary scans deleted. Show kept on refresh (Puppeteer): picked FACE2FACE, reloaded → FACE2FACE; new tab → the current show. Frontend built, backend restarted.
- **2026-11-19: Freecomers admin was treated as SHASHANK (users.id 1); "user 1 is admin" leak** (`deployed` 2026-11-19). [ADR 0007](adr/0007-freecomers-admin-identity.md).
  - **Root cause:** every Freecomers-admin token (Launch Festival Portal, admins-table login, Google) put `admins.id` (1) in `id`; the app reads `id` as a `users.id`, and users.id 1 is SHASHANK. So Team disabled Delete on him ("your logged-in account") and scans showed "Scanned by SHASHANK"; other admin actions were recorded as him too. Write sites also defaulted to user 1 (`|| 1`, `: 1`).
  - **Second cause found:** `auth.service.js` › `getProfile` made `users.id 1` (and "admin of any festival", using the festival from a request header) Admin of any festival opened: SHASHANK was Admin of events 1 and 250 on dev.
  - **What:**
    - `auth.middleware.js` › `toRequestUser`: admin tokens get `id: null`, `adminId`, `isFreecomersAdmin`. `/auth/me` and login responses likewise; `auth.controller.js` reads the profile by `adminId`.
    - New `core/utils/actor.js`. All actor writes use it: scans, attendee registration and bulk import, approvals, voids, review moderation, lost badges, print log, Kashish publications, submission logs (19 inserts), tasks. Jury scorecards/ballots and chat sends return 403 for an admin.
    - Migration 029: nullable `scanned_by_admin_id`, `actor_admin_id`, `printed_by_admin_id`, `published_by_admin_id`; reads show "Freecomers Admin" (scan log and its search, print status, submission activity, published results).
    - `getProfile`: automatic Admin membership only for the festival owner. `rateLimiter.middleware.js`: per-admin key. `TeamPage.jsx`: the self check ignores Freecomers admins.
    - Dev data: removed SHASHANK's Admin rows for events 1 and 250 (his KASHISH Jury row stays).
  - **Checked on dev (festival 40), with a token signed like `generateLaunchToken`:** `/auth/me` id null, adminId 1; Team: SHASHANK's Delete enabled, only the owner org row disabled; an admin scan stored `scanned_by_admin_id = 1`, `scanned_by_user_id = 69` (owner) and shows "Freecomers Admin" (search finds it); SHASHANK opening event 250 got no Admin row. Test scan deleted. Migration 029 run, frontend built, backend restarted.
- **2026-11-19: Festival card: KASHISH is Edition 1; no made-up edition** (`deployed` 2026-11-19).
  - **Cause:** `events.edition` was added (`migrate_to_freecomers.js`) with DEFAULT `'Edition 4 · 2026'`, so every event (13,379 on dev) shows "Edition 4 · 2026"; the Sidebar and SaaS admin list also fell back to that text.
  - **What:** dev `events.edition` for KASHISH (40) = `Edition 1 · 2026`. `Sidebar.jsx` shows the edition only when set (no fallback text); `saasAdmin.controller.js` returns `e.edition` without the fallback. `edition.service.js` › `getEditionById` (the festival config the sidebar reads) now selects `edition`; it never did, so the sidebar only ever showed the fallback text. The shared column default is left unchanged (shared table: additive changes only).
  - **Production:** run the one-row UPDATE (see Needs action).
- **2026-11-19: Settings › Audience: each tab only for users who can change it; new Manage Screenings permission** (`deployed` 2026-11-19). [ADR 0004, Amendment 7](adr/0004-kashish-external-leaderboard.md).
  - **Why:** the Volunteer Manager custom group should see only the Screenings tab in Settings.
  - **What:**
    - `sync_specs_to_database.js`: new `audience:manage_screenings` (Manage Screenings), Admin group only. Ran the sync on dev.
    - `permission.middleware.js`: `requireAnyPermission(keys)`. Screening writes, Kashish film import and film links accept Manage Audience Settings or Manage Screenings (`audience.routes.js`, `kashish-sync.routes.js`).
    - `audience.controller.js`: `PUT /audience/settings/attendance-window` saves only the two window fields; the Screenings card uses it.
    - `AudienceSettingsPage.jsx`: tabs by permission (Form Builder and Venues: Manage Audience Settings; Categories: that or Manage Delegate Categories; Voting Rules: that plus a voting permission; Screenings: that or Manage Screenings); a message when none apply.
    - `Sidebar.jsx`, `App.jsx`, `routePermissions.js`: Settings › Audience only for users who can change a tab; Settings section shown when any item in it is available; Review Stage still needs core Settings.
  - **Checked on dev (festival 40), user 6 with a temporary custom group (View Audience Hub + Manage Screenings), removed afterwards and settings restored:** only the Screenings tab with the attendance card and Import button; attendance-window save 200, Kashish films 200; `PUT /audience/settings`, registration form and new category 403; bad minutes 400. Without the group (standard Volunteer) there is no Settings section and the page redirects. Frontend built, backend restarted.
  - **Note:** a user in any custom group gets only that group's permissions (existing behaviour in `auth.service.js`), so the Volunteer Manager group must list the registration and attendance permissions too.
- **2026-11-19: Settings › Audience › Voting Rules only for users with a voting permission** (`deployed` 2026-11-19). [ADR 0004, Amendment 7](adr/0004-kashish-external-leaderboard.md).
  - **Why:** a Volunteer Manager custom group (Audience, Registration and Attendance permissions, no voting) could still change the vote source and Kashish event ID through Manage Audience Settings.
  - **What:**
    - `AudienceSettingsPage.jsx`: the Voting Rules tab shows only with a voting permission. The attendance window minutes moved to a card above the Screenings list, with its own Save; the list refreshes its windows after saving.
    - `audience.controller.js` › `updateAudienceSettings`: without a voting permission, the voting-rule fields are kept as stored.
    - `userHasPermission` moved from `pass-templates.controller.js` to `permission.middleware.js`, plus `hasAnyPermission`.
  - **Checked on dev (festival 40):** admin sees all five tabs; volunteer user 6 (no voting permission) sees four, without Voting Rules, and both see the attendance card on Screenings. A save as a user without a voting permission that tried to change `voting_source` and `kashish_event_id` kept both and saved the attendance minutes; admin could change them; settings restored identical. Frontend built, backend restarted.
- **2026-11-19: Kashish sync: `updatedSince` confirmed; automatic full sync every hour** (`deployed` 2026-11-19). [ADR 0004, Amendment 6](adr/0004-kashish-external-leaderboard.md).
  - **Analysis:** scheduled syncs already use `updatedSince` (resume point = Kashish's `sync.syncedAt` in `kashish_sync_state`). Kashish honours it: full feed 21 votes, since the last sync 0, since Nov 17 = 5. Gap: deleted votes don't come back incrementally, so they were cleaned up only by Sync now.
  - **What:** `kashishExternalVotes.service.js`: a scheduled run is full when the last full sync is older than `KASHISH_FULL_SYNC_INTERVAL_MIN` (new optional env in `environment.js`, default 60; 0 = off).
  - **Checked on dev (festival 40):** with the last full sync set back a day, the next scheduled-style run was full (21 fetched) and updated `last_full_sync_at`; the run after that was incremental (0 fetched). Backend restarted.
- **2026-11-18: Production Screenings: confirmed cause is the `venues` table** (`deployed` 2026-11-18).
  - **Confirmed from the production log:** `listScreeningBlocks error: Unknown column 'v.venue_name'`. Migration 006 creates `venues` with `CREATE TABLE IF NOT EXISTS`, so production kept its existing (shared) `venues` table, which has no `venue_name`. Dev has ours.
  - **What:** `src/core/services/venues.service.js` (new) reads the venues table's real column names once (id: venue_id/id; name: venue_name/name/title/venue/hall_name; festival: event_id, else festival_id). Every venue read goes through it: `listVenues`, `listScreeningBlocks` (no venues join any more; names attached after, and a venue failure can't break the list), the show save's venue check, the public vote page, and `schedule.controller.js` venues.
  - **Checked:** dev lists 16 shows and its venues; mocked production-style columns (`id`, `name`, `event_id`) read correctly; a table without a name column gives no venues instead of an error. Backend restarted.
  - **Still to confirm on production:** the columns of `venues` and whether 026–028 ran (see Needs action).
- **2026-11-18: Migration runner and schedule hardening (found while investigating production)** (`deployed` 2026-11-18). [ADR 0004, Amendment 5](adr/0004-kashish-external-leaderboard.md).
  - **Risk found (not the confirmed cause; see the entry above):** the migration runner stopped at the first failing migration, and Jenkins runs `npm run migrate || true`, so the deploy looked fine. Migration 014 throws when production's shared `saas_qr` has duplicate (event_id, serial_no). Everything after it was skipped: 026 (the `voting_enabled` column and `screening_block_kashish_films` table the screenings list reads → the 500) and 027 (the schedule → no shows). 027 also only ran at deploy, so a Kashish event ID saved later never got its schedule.
  - **What:**
    - `migrations/run_all_migrations.js`: runs every migration even after a failure, lists failures at the end, exit 1.
    - `migrations/014_qr_credential_serial.js`: duplicates are logged and the unique key skipped, instead of failing.
    - `src/core/services/scheduleSeed.service.js` (new): the schedule logic from 027, applied for every `migrations/data/*.json` matching the festival's Kashish event ID. `027` now calls it.
    - `audience.controller.js`: saving Voting Rules with a Kashish event ID applies the schedule (background, then votes re-checked); `POST /screenings/kashish-movies/import` applies it before the films catalog. `ScreeningsEditor.jsx`: the Import notice says how many shows were added.
  - **Checked on dev:**
    - A temporary festival with the Kashish event ID and no shows got 16 shows and 44 film links; a second run changed nothing; test rows removed.
    - The full `run_all_migrations.js` passes (exit 0). A copy of the runner with a failing script continued to the next script and exited 1.
    - Import on festival 40: 0 shows added, 44 films, 0 unmatched. Frontend build passes, backend restarted.
- **2026-11-18: Attendance camera closes after each scan** (`deployed` 2026-11-18).
  - **What:** `AttendancePage.jsx`: when the camera reads a badge, `executeCheckin` sets `isCameraActive` to false before recording, so the scanner stops at once (no double reads) and the result card stays on screen. The next badge is one tap on **Open Live Camera QR Scanner**. The hint under the camera says so. USB scanner and typing are unchanged.
  - **Checked:** lint shows no errors; the frontend build passes. The User Manual's Attendance steps (admin and volunteer) are updated. Not yet tried with a real camera on a phone.
- **2026-11-18: Lost Badge masks contact details like Assign QR** (`deployed` 2026-11-18).
  - **What:**
    - `utils/attendeeDisplay.js`: new `maskEmail()`: first 2 and last 1 characters before the @ (at most 6 dots), domain shown, e.g. sk••••••2@gmail.com.
    - `LostBadgePage.jsx`: uses the shared `maskPhone()` / `maskEmail()` instead of its own versions. Mobile is now first 3 + last 4 (was first 4 only); this applies to the search results, the delegate card, and the label of delegates without a name.
  - **Decision:** the user chose to show the last 4 digits. The screen now shows the digits the last-4 check asks for, so that check no longer proves identity (the user was told before choosing).
  - **Checked:** helper output verified; lint shows no errors; the frontend build passes; screenshots taken as admin and volunteer.
- **2026-11-18: Assign QR hides the middle of mobile numbers** (`deployed` 2026-11-18).
  - **What:**
    - `utils/attendeeDisplay.js`: new `maskPhone()` (first 3 and last 4 digits, e.g. 766•••0178). `attendeeLabel()` takes `{ maskPhone: true }` for delegates who have no name yet.
    - `AttendeeAssignQrPage.jsx`: masked in the target-delegate card, the roster, the paired success card and the breadcrumb. Search by the full number still works.
  - **Checked:** helper output verified; lint shows no errors; the frontend build passes.
- **2026-11-18: On Spot Registration no longer shows the form subtitle** (`deployed` 2026-11-18).
  - **Why:** the desk form showed "Every person wishing to attend the festival HAS to register as a delegate…". The line is meant for the public online form, not desk staff.
  - **What:** `AttendeeCreatePage.jsx` no longer renders the form subtitle or its hardcoded fallback text. The heading (the festival's form title) and the desk note stay. The subtitle setting (Settings › Audience › Form Subtitle) is unchanged, so the public form keeps it.
  - **Checked:** lint shows no errors; the frontend build passes.
- **2026-11-18: all 44 KASHISH films linked; films catalog from the Kashish Movies API** (`deployed` 2026-11-18). [ADR 0004, Amendment 4](adr/0004-kashish-external-leaderboard.md).
  - **Why:** only 4 of the 44 films had Kashish movie IDs, so votes for the other 40 would not have counted. Kashish then shared a Movies API that lists every film of the event.
  - **What:**
    - `migrations/data/kashish-bengaluru-2026-schedule.json`: all 44 movie IDs, taken from the Movies API and matched by title within each show; every film's Kashish show and slot agree with ours. Titles are now Kashish's own.
    - `kashish-api.service.js`: `fetchKashishMovies()`, plus a shared request helper (timeout, 429 retry). `environment.js`: optional `KASHISH_MOVIES_API_URL`.
    - `migrations/028_kashish_movies_catalog.js` (added to `run_all_migrations.js`): the `kashish_movies` table.
    - `kashishMovies.service.js` (new): `refreshCatalog()` and `autoLinkFilms()`, which matches by screening slot, then by show name, and only adds links.
    - `kashishExternalVotes.service.js`: `listKnownMovies()` merges the catalog with vote-only films.
    - `audience.controller.js` / `audience.routes.js`: `POST /api/audience/screenings/kashish-movies/import`. `kashish-sync.controller.js`: a full sync refreshes the catalog first.
    - `ScreeningsEditor.jsx` / `index.css`: the **Import films from Kashish** button with a result notice. The warning now reads "N Kashish films are not on any show"; the picker lists every film with its Kashish show name.
  - **Checked on dev (festival 40):**
    - Migration 027 linked 40 films and reported 0 without an ID; a second run made 0 changes. 44 links, and every voting show has its films.
    - Import: 44 catalog films, 0 newly linked, 0 unmatched. After unlinking DREAD, Import linked it back to FACE2FACE.
    - The picker lists 44 films, none off a show. A full sync refreshed the catalog. The 2 new votes (HOW'S ARCHIE?, NIPPLE) are now checked against Tiny Tails; both voters are not registered delegates.
    - Frontend build and lint pass (0 errors); backend restarted.
    - Follow-up: the Screenings header buttons stacked at desktop width; `.fc-sch-head-actions` now has `flex-shrink: 0` (seen while taking the user-manual screenshots).
- **2026-11-18: KASHISH schedule as a data migration** (`deployed` 2026-11-18). [ADR 0004, Amendment 3](adr/0004-kashish-external-leaderboard.md).
  - **What:**
    - `migrations/data/kashish-bengaluru-2026-schedule.json`: the final schedule. 16 shows; the short films are in the vote; the 4 features, the ceremonies and the panel are not; each show lists its films, with the Kashish movie ID where known.
    - `migrations/027_kashish_bengaluru_2026_schedule.js` (added to `run_all_migrations.js`):
      - finds the festival by the file's Kashish event ID;
      - creates any missing show (matched by date and start time) and sets each show's type and voting flag;
      - links every film that has an ID, then re-checks stored votes.
    - The new table `data_seed_log` records each applied item, so staff edits survive later deploys and IDs added to the file later are linked on the next run.
  - **IDs known (from the Kashish vote feed, which lists only voted films):** Mad Dog → Tiny Tails; Queering India, I Am Going to Miss You and Kuch Sapney Apne → their own shows. The other 40 IDs came later from the Kashish Movies API (see the entry above).
  - **Dev data:** "TEST – E2E" was deleted with its scan. Rohan was kept; his test vote is now "Not scanned in for the show", because MAD DOG plays in Tiny Tails on Nov 20.
  - **Checked on dev:** the migration found festival 40 and made 20 changes (16 shows recorded, 4 links). A second run made 0 changes. Stored votes were re-checked.
- **2026-11-18: desk registrations get the confirmation email; real registration source on the pass** (`deployed` 2026-11-18). [ADR 0006, Amendment 2](adr/0006-festiplus-delegate-confirmation-email.md).
  - **Why:** a delegate registered through On Spot Registration got no email, because only Laravel's online form sent one. The pass dialog also showed every delegate as "Online".
  - **What:**
    - `AttendeeCreatePage.jsx`: "Email the confirmation to {email}" checkbox, ticked by default once an email is entered. The success message says whether the email went.
    - `audience.controller.js`: `registerAttendee` sends the email when `send_confirmation` is true and returns `confirmation_email` and `registration_type`. `listAttendees` returns `registration_type`.
    - `delegateConfirmationEmail.js`: `{ updated: false }` drops "(updated)" from the subject.
    - `utils/attendeeDisplay.js`: `registrationSourceLabel()`. `RegistrationPage.jsx` shows "Online", "Online (guest)" or "On spot (desk)" in place of the fixed "Online".
    - CLAUDE.md, ADR 0006.
  - **Checked on dev:** `registerAttendee` was called directly with the mail sender stubbed, so nothing was sent; the 3 test rows were deleted afterwards.
    - With an email and ticked, 1 email was built, with the subject "Delegate Registration Confirmation — KASHISH x BENGALURU 2026 [KB26-0304]".
    - Unticked, or with no email, nothing was sent.
    - `send_confirmation` isn't stored in `custom_data`, and `registration_type` comes back as `desk`.
    - Lint shows no new warnings, the build passes and the backend was restarted. The browser click-through is still to do (the saved login had expired).
- **2026-11-18: dev reset of KASHISH delegates** (data only). All 21 delegates of festival 40 were deleted with their check-ins, in-house votes, reviews, Kashish vote records and receipts, and voter mappings. Badge 270167 went back to stock (425 in stock). A backup was kept in the session scratchpad.
- **2026-11-18: feature films out of the KASHISH Audience Choice vote** (`deployed` 2026-11-18). [ADR 0004, Amendment 2](adr/0004-kashish-external-leaderboard.md).
  - **Rule (client):** only the 40 short films are in the vote. The 4 features (Queering India, I Am Going to Miss You, The Crowd, Kuch Sapney Apne) are out, like the ceremonies and the panel.
  - **What:**
    - Dev data: `voting_enabled = 0` on the 4 feature shows of festival 40 (409, 411, 415, 420). Stored votes were then re-checked (`recheckStoredExternalVotes`).
    - `kashishExternalVotes.service.js`: a vote for a film that plays only in shows with voting off stays `unscheduled`, with the reason "Film's shows have no Audience Choice vote". No schema change.
    - `KashishVotingBoard.jsx`: the tile and column are renamed "Not in the vote / not on the schedule".
    - `computeExternalStandings`: the leaderboard (and published results) lists only films on a show with voting on, plus any film that still has counted votes. The 0-vote feature films no longer appear.
    - `kashish-sync.controller.js`: the "Sync now" message lists every skipped group with votes in it, named as on the tiles (`skippedText`). For example: "Skipped: 1 not a registered delegate, 3 not in the vote / not on the schedule."
  - **Checked on dev:** the 3 stored feature-film votes now show the new reason, and Counted no longer includes them. The standings list only MAD DOG (1 vote, from the end-to-end test: register, Assign QR, scan at TEST – E2E, then a vote in the Kashish app, counted). The message covers all 5 votes. Frontend built, backend restarted.
- **2026-11-14: Print & export menu hid under the sidebar on 14" laptops** (`deployed` 2026-11-14).
  - **Cause:** the menu was right-aligned to its button. With the sidebar open at about 1280–1366 px, the toolbar wraps, the button moves to the left of the card, and the menu extended left under the sidebar.
  - **Fix:** `BulkQrManagementPage.jsx` measures the space when the menu opens and lines it up with the button's left edge when a right-aligned menu wouldn't fit. `index.css` adds `.fc-bq-download-menu.is-left`.
  - **Checked:** at 1280, 1366, 1440, 1536, 1920 and 390 px the menu stays inside the content area and is the top element (Puppeteer).
- **2026-11-14: clearer badge printing: one "Print & export" menu, no bulk delegate print** (`deployed` 2026-11-14). [ADR 0005, Amendment 6](adr/0005-pass-templates.md).
  - **What:**
    - `BulkQrManagementPage.jsx`: "Export QR" and "Download" become one **Print & export** menu with a scope line ("425 in-stock badges in view"): Passes with QR…, QR stickers…, then Lists: CSV file, Badge list (PDF). Each option opens the dialog in its mode, titled "Passes with QR · …" or "QR stickers · …". The row's "Print this badge" becomes "Print pass".
    - `RegistrationPage.jsx`: the toolbar **Print passes** is removed. A row's pass preview still prints that delegate's pass ("Pass for <name>").
    - `AttendeeAssignQrPage.jsx`: title "Pass for <name>", plus a festival file name.
    - `PrintPassesDialog.jsx` and `passRenderer.js`: modes renamed **Pass with QR** / **QR sticker only**; **Save as PDFs**.
    - `PassTemplatesPage.jsx`: intro text updated.
    - `index.css`: menu scope, divider and disabled styles; the unused `.fc-aud-print-btn` removed.
  - **Checked on dev (Puppeteer):** the menu shows 4 options and the scope, closes on Escape and outside click, and stays inside the screen at 390 px. Passes and stickers open in the right mode with the right title. CSV downloads; the badge list opens the print window. The Audience toolbar is Add Attendee, Filters, Export CSV. Light, dark and 390 px.
- **2026-11-14: per-show attendance windows for KASHISH votes** (`deployed` 2026-11-14). [ADR 0004, Amendment 2](adr/0004-kashish-external-leaderboard.md).
  - **Rule:** a Kashish vote counts only when the delegate was scanned in during the attendance window of a show of that film (15 min before start → 15 min before end, Voting Rules), before voting. New outcomes "Film not on the schedule" and "Voted before the scan". Every scan is kept; the scanner says whether a scan is inside the window.
  - **What:** migration `026_show_attendance_windows.js`; `showWindows.service.js` (new); `kashishExternalVotes.service.js` (evaluation, `fetch: false` re-check, summary, `listKnownMovies`); `kashish-sync.controller.js` (`recheckStoredExternalVotes`); `audience.controller.js` (screenings create/edit/delete, Kashish films list, window-aware check-in, distinct counts, window settings); `audience.routes.js`; `ScreeningsEditor.jsx` (new, Settings › Audience › Screenings); `AudienceSettingsPage.jsx` (tab, window minutes); `AttendancePage.jsx` (current show, window status, In/Outside window); `KashishVotingBoard.jsx` (tiles, columns); `index.css`; CLAUDE.md, ADR 0004.
  - **Checked on dev:** scenario script with temporary rows (removed after): A scanned 1:15 → vote for X counted, vote for Y via B's QR photo → not counted; B counted; X delayed to 1:30–2:30 → C's 1:00 scan stops counting, re-scan at 1:20 → counted; vote before scan → "voted before the scan"; unlinked film → "not on the schedule", linked → re-checked. Scan API: repeat scans stored, 30 s bounce, in/outside-window messages, 2 simultaneous scans no 500. KASHISH's 16 shows entered for festival 40 through the API (windows match, e.g. TINY TAILS 10:45–11:41); dialog save/edit; light, dark, 390 px.
  - **Note:** on dev the existing Kashish votes now show "Not a registered delegate" or "Not scanned in for the show", because no scan falls in a festival-day window yet. That is the new rule working.
- **2026-11-14: On Spot Registration needs only the mobile number** (`deployed` 2026-11-14). For the offline paper-form desk: the volunteer types the mobile and the badge number; the rest of the paper form is entered later from the edit page.
  - **What:** `AttendeeCreatePage.jsx` requires only Mobile (10–15 digits); every other field is optional on this page, and Gender, Community, Attended-in-Mumbai and the 18+ certification start unselected so nothing is saved that wasn't given (Pass Type and Category keep their defaults). A mobile already registered in the festival (last 10 digits, formatting ignored, cancelled rows skipped) blocks the save in the form and with `409` from `registerAttendee`; the same email still only warns. Empty answers aren't copied into `custom_data`. `saas_attendees.name` is NOT NULL, so a mobile-only record stores `''`.
  - **Details pending:** `listAttendees` returns `details_pending` (no name or no email). The Audience list shows the mobile in place of the name with a "Details pending" pill, a **Details Pending** tab and drawer filter, and a CSV column; the tag clears once name and email are saved. The Settings › Audience form schema and the public Laravel form are unchanged (still strict).
  - **Name fallbacks** (`utils/attendeeDisplay.js` `attendeeLabel`, backend `labelOf` / `COALESCE(NULLIF(TRIM(name),''), phone)`): edit page heading, Assign QR page and modal, Lost Badge, Attendance last scan and log, badge modal, Kashish mapping/receipt views, and the assign / lost / issue messages.
  - **Files:** `backend/src/core/controllers/audience.controller.js`, `kashish-sync.controller.js`; `frontend/src/core/pages/AttendeeCreatePage.jsx`, `RegistrationPage.jsx`, `AttendeeEditPage.jsx`, `AttendeeAssignQrPage.jsx`, `LostBadgePage.jsx`, `AttendancePage.jsx`, `components/registration/AssignQrModal.jsx`, `AttendeeFilterDrawer.jsx`, `utils/attendeeDisplay.js` (new); CLAUDE.md.
  - **Checked:** `registerAttendee` called directly against the dev DB (no insert): no mobile / blank / 7 / 16 digits → 400; an existing delegate's number typed as `+91 98350-88308` → 409 naming that delegate. Frontend lint (no errors) and production build pass. Later reloaded on dev (`pm2 reload`, frontend built into `dist`): the API answers and `/registration/add` serves the new build. A click-through in the browser is still to be done.

- **2026-11-13: Download PDFs: progress bar, Stop, and 3× faster** (`deployed` 2026-11-13). [ADR 0005, Amendment 5, item 7](adr/0005-pass-templates.md).
  - **Why:** 400 cards on production looked stuck: about 77 s on the server plus a ~190 MB download, with no feedback.
  - **What:** `cardPdf.service.js` makes PDFs in batches of 40, 3 at a time, in order, streaming an uncompressed ZIP with `X-Card-Count` / `X-Card-Bytes`. `PrintPassesDialog.jsx` shows "Preparing…", then "Making PDFs: N of 400 · X of Y MB" with a bar, and the button becomes **Stop**. `index.css`: progress styles (reduced-motion aware).
  - **Checked on dev:** synthetic 400-card job 77 s → 24 s, files in order, ZIP intact; 75 badges in the dialog: progress counted up live, Stop left no download and no print record. Light, dark, 390 px.
- **2026-11-13: one PDF per card (Download PDFs)** (`deployed` 2026-11-13). [ADR 0005, Amendment 5](adr/0005-pass-templates.md).
  - **What:** Card paper in the print dialog has a **Download PDFs** button: the server makes one PDF per card (vector, true size, selectable text) from the same markup as Print and returns a ZIP (`KASHISH-x-BENGALURU-2026-Badges-001-075.zip` with `001-544237.pdf` …). Template images are loaded on the server by id; the page can reach nothing else and runs no JavaScript.
  - **Files:** `backend/src/core/services/cardPdf.service.js` (new), `audience.controller.js` (`downloadCardPdfs`), `audience.routes.js`, `app.js` (40 MB body limit for that path), `backend/package.json` (`puppeteer`, `archiver`); `frontend/src/core/components/print/PrintPassesDialog.jsx`, `utils/passRenderer.js` (`passFontsUrl`), `index.css`; CLAUDE.md, ADR 0005.
  - **Checked on dev (print-log calls blocked so print history is unchanged):** #010–#012 gave 3 PDFs, each 1 page at 105 × 151.7 mm with the artwork, QR and selectable badge number; all 75 in 14 s (32 MB ZIP); upload ~0.5 KB per card gzipped. A card pointing at a local server made no request, `<script>` didn't run, another festival's template image wasn't served, 501 cards → 400, no token → 401. Light, dark and 390 px.
  - **Note:** a Jenkins dev deploy at 15:24 replaced the uncommitted work with branch `new_saas`; it was re-applied and re-checked at 15:45. Commit it to keep it across deploys.
- **2026-11-13: updated confirmation email uses the first email's design** (`deployed` 2026-11-13). [ADR 0006, Amendment 1](adr/0006-festiplus-delegate-confirmation-email.md).
  - **What:** `delegateConfirmationEmail.js` copies the Laravel template's markup and styles (pill, serif heading, 3-column row, venue pin, schedule box, donation QR and button, app QR codes, footer). Text the template has written in now comes from new Settings › Audience › Step 4 › Confirmation email fields (address, organiser, help desk email, donation message, app name, description and links). QR codes come from the local `qrcode` package and are sent, with the venue pin (`backend/src/assets/email/pin-filled.png`), as inline images. Festival 40's dev settings were filled with the same text as the Laravel email.
  - **Checked:** preview rendered at 700 px and 380 px alongside the Laravel email; resent to KB26-0300 (sk0807812@gmail.com) from the edit page with "Email the updated confirmation" ticked (SMTP `250 OK`); settings fields saved and reloaded, light and dark.
- **2026-11-13: pass type edits kept the old days; FestiPlus emails the updated confirmation** (`deployed` 2026-11-13). [ADR 0006](adr/0006-festiplus-delegate-confirmation-email.md).
  - **Root cause:** switching a delegate to Full-Festival Pass only hid the day checkboxes; the edit form still sent the old days and the backend merged them into `custom_data.pass_days`. The public confirmation (Freecomers site, via Laravel `my-delegate-pass`) prints `pass_days` when it isn't empty, so it showed "Full-Festival Pass · Nov 21st".
  - **What:**
    - only a Day Pass keeps days: edit and on-spot forms, plus the backend (`updateAttendee`, `registerAttendee`);
    - migration `025_clear_stale_pass_days.js` fixed 11 delegates on dev (including KB26-0300);
    - FestiPlus can send email (`mail.service.js`, nodemailer, `MAIL_*` keys);
    - the edit form has "Email the updated confirmation to {email}", ticked when the pass details change; the email (`delegateConfirmationEmail.js`) takes everything from festival records;
    - Settings › Audience › Step 4 gains Screening Hours and Donation Link (festival 40's dev donation link set to Laravel's).
  - **Where:** `audience.controller.js`, `mail.service.js`, `delegateConfirmationEmail.js`, `environment.js`, `package.json`, migration 025, `AttendeeEditPage.jsx`, `RegistrationPage.jsx`, `AudienceSettingsPage.jsx`, `index.css`, `.env.example`, CLAUDE.md, ADR 0006.
  - **Checked:** migration ran twice (11 then 0). Puppeteer on KB26-0300: Day Pass + Nov 21st with the email unticked saved without email; back to Full-Festival with it ticked saved `pass_days: []` and emailed sk0807812@gmail.com (SMTP `250 OK`). Laravel `my-delegate-pass` now returns `pass_days: []`. On-spot API test saved `[]` for a full pass (temporary delegate deleted). Light, dark and phone checked.
- **2026-11-12: why production /voting showed the screening-QR tabs, plus a note on that layout** (`deployed` 2026-11-13).
  - **Root cause:** prod serves the same frontend bundle as dev and a current backend. `/voting` picks its layout from `GET /api/voting/leaderboard` → `source`, which comes from the festival's `audience_settings.voting_source` in that environment's database. It was set to `kashish` only on dev (festival 40); prod's KASHISH (a different ID; prod has no festival 40) still had the default. Not a code bug; fix is in Needs action.
  - **Change:** the screening-QR layout of `VotingPage.jsx` now shows admins (`settings.manage`) a note linking to "Where audience votes come from" in Settings › Audience › Voting Rules.
  - **Checked:** Puppeteer: festival 14 (screening QR) shows the note in light and dark; festival 40 (Kashish) shows the Kashish board without it.
- **2026-11-12: artwork bleed and printing on pre-cut cards** (`deployed` 2026-11-12). [ADR 0005, Amendment 4](adr/0005-pass-templates.md).
  - **What:**
    - artwork templates get a bleed (`config.bleedMm`, 0–12.7 mm): the template size is the card, and the larger artwork is centred and cropped at the card edge;
    - editor: Bleed field (None / 3 mm / ¼ in), artwork size in mm and inches, the preview shows the bleed dimmed with a dashed cut line, and size or bleed changes keep elements on the same spot of the artwork;
    - print dialog: Paper = A4 sheet or Card (e.g. "Card 4 × 6 in"), one card per page at the card size, remembered per viewer.
  - **Where:** `passTemplates.service.js` (`sanitizeConfig`), `passRenderer.js` (`bleedOf`, `inchLabel`, `renderElements`), `PassTemplateEditor.jsx`, `PrintPassesDialog.jsx`, `index.css`.
  - **Checked:** a temporary 4 × 6 in template with ¼ in bleed: the editor showed "101.6 × 152.4 mm (4 × 6 in) + 6.35 mm bleed" with the cut line on the artwork's own crop marks; printing as Card gave 3 pages of `@page 101.6mm 152.4mm` with the artwork at 114.3 × 165.1 mm offset −6.35 mm; converting template 13 (not saved) kept both elements on the same artwork spot. Light, dark and phone checked. Temporary template and test print rows deleted.
- **2026-11-12: fix the flickering ⓘ popover in the print dialog** (`deployed` 2026-11-12). The popover sat inside the dialog's scrolling body and overflowed it, adding a scrollbar that moved the icon away from the pointer, so it opened and closed repeatedly. It is now `InfoPopover` in `PrintPassesDialog.jsx`: portalled to `<body>` with `position: fixed`, below the icon or above when there's no room; hover only for a real mouse (touch browsers send a mouseleave right after a tap). Checked with Puppeteer: visible for 1.5 s straight with no layout change at 1887 light, 1440 dark and 390 phone (tap); opens above near the bottom; closes when the mouse leaves.
- **2026-11-12: "Margins" switch, on by default** (`deployed` 2026-11-12). [ADR 0005, Amendment 2](adr/0005-pass-templates.md), item 7. "No margins" renamed **Margins** (on = 8 mm margin, 4 mm cut gaps); on every time the dialog opens, and a saved "off" from before is ignored. Tooltip and the shrink fallback ("Turn margins off instead (100%)") reworded. `PrintPassesDialog.jsx`, `passRenderer.js`. Checked with Puppeteer: on at open even with an old saved "off", switching off changes the fit to 97.9%, reopening is on again.
- **2026-11-12: print dialog closes only with ×** (`deployed` 2026-11-12). [ADR 0005, Amendment 3](adr/0005-pass-templates.md), item 5. No closing on an outside click, Escape or Print; Cancel removed; after Print the footer shows "Sent N … (#range) to print." and the warning refreshes. `PrintPassesDialog.jsx`, `index.css`. Checked with Puppeteer at desktop and phone width; test print rows deleted (Saurav's 75 real QR only prints kept).
- **2026-11-12: sticker sequence number reads bottom to top** (`deployed` 2026-11-12). The #001 label beside the QR on QR only stickers is turned 180° (still on the right, centred). `passRenderer.js` (`.pps-index`). Checked in the editor's QR only preview.
- **2026-11-12: choose the badge range in the print dialog** (`deployed` 2026-11-12). [ADR 0005, Amendment 3](adr/0005-pass-templates.md), item 3.
  - **What:** "Badges to print" From / To fields, filled in with the whole list; count, footer range, preview, page count and the printed-before warning follow the range; "All badges" resets; From above To shows an error, selects nothing and disables Print.
  - **Where:** `PrintPassesDialog.jsx`, `index.css` (`.fc-pp-seq-*`).
  - **Checked:** Puppeteer: #005–#006 gave 2 passes; after printing them, #001–#010 showed "2 of 10 badges were printed before: #005–#006"; 20 → 10 showed the error with 0 passes and Print disabled; light, dark and phone checked. Test print rows deleted.
- **2026-11-12: badge range and "printed before" warning in the print dialog** (`deployed` 2026-11-12). [ADR 0005, Amendment 3](adr/0005-pass-templates.md).
  - **What:**
    - the footer shows the badge numbers in the print ("Badges #001–#075") and the preview shows page 1's range; Bulk QR prints in number order;
    - each Print press is recorded per badge in the new `qr_print_log` table (migration `024_qr_print_log.js`), from Bulk QR, Audience and Assign QR;
    - badges printed before get a warning (count, range, last time, who, mode) with "Leave out the N already printed".
  - **Where:** `qrPrintLog.service.js`, `audience.controller.js` (`getQrPrintStatus`, `logQrPrints`), `audience.routes.js`, `PrintPassesDialog.jsx`, `BulkQrManagementPage.jsx`, `index.css`.
  - **Checked:** Puppeteer: printed #001–#004 → reopening showed "All 4 badges were printed before"; the full stock showed "4 of 75 … #001–#004", and Leave out gave 71 passes, #005–#075; light, dark and phone checked; desk volunteer gets 200. The 4 test rows were deleted.
  - **Deploy:** run migration 024.
- **2026-11-12: grid in the pass template editor preview** (`deployed` 2026-11-12).
  - **What:**
    - a Grid switch and a spacing choice (1, 2, 5 or 10 mm) in the preview header; lines run from the pass's top-left corner, with every 10 mm drawn stronger and the centre lines dashed;
    - a centre line turns solid when the selected element is exactly centred, grid on or off;
    - dragging snaps an element's centre onto the pass centre (Alt places it freely);
    - the choice is remembered per browser; on screen only, never printed.
  - **Where:** `PassTemplateEditor.jsx` (`GridOverlay`), `index.css` (`.fc-pte-guides`, `.fc-pte-grid-*`).
  - **Checked:** Puppeteer at 1916 light, 1440 dark and 390 phone: 52 lines at 5 mm on a 105 × 151.69 mm pass, the snap leaves the element 0.01 px from centre, no horizontal scroll.
- **2026-11-12: Kashish API update: event filter and incremental sync** (`deployed` 2026-11-12). [ADR 0004, Amendment 1](adr/0004-kashish-external-leaderboard.md).
  - **What:**
    - `kashish_event_id` setting (Voting Rules; KASHISH = EF3j920261);
    - fetches pass `eventId` and `source=scan`;
    - scheduled runs use `updatedSince`; Sync now does a full sync that marks votes outside the event `removed`;
    - guards for other-event and non-scan votes;
    - 429 retry;
    - voter details stored for re-checks;
    - Sync tab shows the event ID, sync times and "Not in this event";
    - hard-coded API key fallback removed;
    - migration `023_kashish_sync_state.js`.
  - **Files:** `kashish-api.service.js`, `kashishExternalVotes.service.js`, `kashish-sync.controller.js`, `audience.controller.js`, `environment.js`, `AudienceSettingsPage.jsx`, `KashishVotingBoard.jsx`.
  - **Verified on dev:**
    - first full sync fetched 3 votes and marked 78 old ones removed (1 counted kept);
    - the next scheduled run sent `source=scan&eventId=EF3j920261&updatedSince=…` and got 0 new votes;
    - guards and 429 retry tested with a stubbed API;
    - the leaderboard lists only this event's films;
    - settings field and Sync tab checked in light and dark mode.

- **2026-11-11: Element rotation in 45° steps, line height and "Centre on the pass"** (`deployed` 2026-11-11).
  - **What:** [PassElementProperties.jsx](../frontend/src/core/components/print/PassElementProperties.jsx), [passRenderer.js](../frontend/src/core/utils/passRenderer.js), `passTemplates.service.js`:
    - rotation offers 0–315° in 45° steps (45° steps turn the whole box, and its editor outline turns too);
    - line height control for text;
    - Centre horizontally / vertically / both buttons.
  - **Verified on dev on a copy of the Delegate Pass:** 45° saved and rendered, line height 1.6 applied, centring exact; other angles rejected (stored as 0°).

- **2026-11-11: Themed "No margins" info popover** (`deployed` 2026-11-11). The ⓘ uses a light/dark popover instead of the browser's native tooltip (hover, keyboard focus or tap), and the print dialog footer now follows dark mode. Verified on dev in light, dark and phone.

- **2026-11-11: Print dialog ignores layouts saved before the margins default** (`deployed` 2026-11-11). Saved layouts move to `fc_print_passes_prefs_v2` and the old key is removed once, so browsers that had "No margins" saved now start with margins. New choices are still remembered. Verified on dev by simulating an old saved "No margins, 2 × 2" layout.

- **2026-11-11: Standard margins are the default again** (`deployed` 2026-11-11), at the user's request. The compact "No margins" switch starts off; a viewer's saved choice still wins. Verified on dev with fresh prefs: Delegate Pass 1 per page, QR only 12 per page, no "doesn't fit" box.

- **2026-11-11: "No margins" on by default, as a compact switch** (`deployed` 2026-11-11).
  - **What:** [PrintPassesDialog.jsx](../frontend/src/core/components/print/PrintPassesDialog.jsx):
    - a small right-aligned switch under Portrait / Landscape, with the printer-edge warning moved to an ⓘ tooltip;
    - the old card and the orange warning box removed;
    - a saved preference still wins.
  - **Verified on dev:**
    - Delegate Pass defaults to 2 × 2 at 100% (cells at 0 / 105 mm, 7 pages);
    - switch off + 2 × 2 shows Shrink to fit, and the choice is remembered after printing;
    - QR only gives 12 per page;
    - light, dark and phone checked.

- **2026-11-11: Print dialog simplified to A4 only** (`deployed` 2026-11-11).
  - **What:** [PrintPassesDialog.jsx](../frontend/src/core/components/print/PrintPassesDialog.jsx):
    - the Card printer / Paper option is removed, so prints are always A4;
    - margins are a "No margins" toggle switch instead of tabs.
  - **Verified on dev:**
    - no Paper or Card printer option;
    - with the switch on, 2 × 2 Delegate Passes fit at 100% (cells at 0 / 105 mm, 7 pages);
    - light, dark and phone checked.

- **2026-11-11: Removed "Pass only" from the print dialog** (`deployed` 2026-11-11). The dialog offers Pass + QR (the default everywhere, including Bulk QR → Export QR) and QR only; the template editor preview matches. Verified on dev: Bulk QR and Audience both open on Pass + QR.

- **2026-11-11: Bulk QR toolbar** (`deployed` 2026-11-11). [BulkQrManagementPage.jsx](../frontend/src/core/pages/BulkQrManagementPage.jsx).
  - **What:**
    - "Print badges" renamed **Export QR**;
    - "Export CSV" became a **Download** menu with CSV (unchanged file) and PDF (an A4 badge list in the print dialog, saved with "Save as PDF").
  - **Verified on dev:**
    - CSV: 25 rows plus a header;
    - PDF list: 25 rows;
    - the dialog is titled "Export QR: in stock badges";
    - phone has no sideways scroll.

- **2026-11-11: A4 grids beyond true size** (`deployed` 2026-11-11).
  - **What:** [passRenderer.js](../frontend/src/core/utils/passRenderer.js) `sheetLayout()` and [PrintPassesDialog.jsx](../frontend/src/core/components/print/PrintPassesDialog.jsx):
    - columns × rows up to 6 × 8, with ✓ marking what fits at true size;
    - a new Margins option (Standard / None);
    - Shrink to fit, with Print disabled until the grid fits.
  - **Verified on dev with the 105 × 145.55 mm Delegate Pass, 2 × 2 on A4:**
    - standard margins block printing until a choice is made;
    - Shrink to fit → 91%, 4 per page, 7 pages;
    - No margins → 100% with cells at 0 / 105 mm, 7 A4 pages in the PDF;
    - QR-only default unchanged (12 per page); phone checked.

- **2026-11-11: Print dialog QR Settings and page layout** (`deployed` 2026-11-11). [ADR 0005, Amendment 2](adr/0005-pass-templates.md).
  - **What:**
    - "QR only stickers" moved from templates to the print dialog as festival-wide **QR Settings** (`pass_print_settings`, migration `022_pass_print_settings.js`, run on dev), with admin-only Save as festival default;
    - no Template picker for QR only;
    - A4 orientation and columns × rows with a page preview and page count;
    - starter "QR sticker" renamed "Small QR pass".
  - **Verified on dev:**
    - KASHISH's settings carried over (58 mm);
    - a volunteer gets 403 on save, and 999 mm is clamped to 150;
    - 58 mm stickers: 12 per page portrait; 2 × 3 → 6 per page, 25 stickers → 5 A4 pages (PDF checked); 40 mm → 24 per page;
    - A6 passes: 2 per page landscape, 1 portrait;
    - card printer hides the layout; the editor sticker card is gone;
    - phone and dark mode checked.

- **2026-11-11: Pass template elements** (`deployed` 2026-11-11). [ADR 0005, Amendment 1](adr/0005-pass-templates.md).
  - **What:**
    - both design types are now a background plus Text / Image / Checklist elements (`pass_template_elements`, `pass_template_assets`, migration `021_pass_template_elements.js`, run on dev: 7 templates converted);
    - 7 fonts, merge fields, `accent` / `category` colours;
    - built-in layout generator with "Rearrange for me"; elements scale with the pass size;
    - new editor (element buttons, layers list, properties panel);
    - one renderer path, and print waits for fonts and fits text.
  - **Verified on dev:**
    - API: each type, validation (type, outside the pass, unknown merge field, another event's image, empty checklist); a volunteer gets 403;
    - UI on a copy of the Delegate Pass: added text in Playfair, festival logo, uploaded image, checklist and rotated text; reordered; saved and reloaded;
    - Audience print: Nov 21st and 22nd ticked; QR present in Pass + QR, absent in Pass only;
    - PDF at 105 × 145.55 mm with the Inter and Playfair Display fonts embedded;
    - built-in: accent change recolours the band; A6 → CR80 keeps elements inside; Rearrange works;
    - Bulk QR stickers unchanged; phone and dark mode checked.

- **2026-11-11: Pass template editor layout** (`deployed` 2026-11-11). [PassTemplateEditor.jsx](../frontend/src/core/components/print/PassTemplateEditor.jsx), `index.css` (`.fc-pte-*`).
  - **What:**
    - form and preview split 60:40, with minimum widths so laptops stay usable;
    - the preview fills the sticky panel's height, and its scale comes from the measured box;
    - mode toggle and "Preview with" share one row;
    - text fields capped at 420 px;
    - the design-type switch shows only on New template.
  - **Verified on dev:**
    - at 1916 px the portrait Delegate Pass preview grew from 352 × 488 to 465 × 644 px, with the whole pass visible on load;
    - the form at 1100 px is 480 px wide instead of 318;
    - dragging updates the mm values;
    - phone stacks with no sideways scroll; dark mode checked.

- **2026-11-11: Removed the `qr_sequence_counters` table** (`deployed` 2026-11-11), at the user's request. The next badge number is now the event's highest `sequence_no` + 1, assigned under a per-event lock in [qrCredential.service.js](../backend/src/core/services/qrCredential.service.js). Migration 019 no longer creates the table (and drops it where an earlier dev build made it). Verified on dev: 6 parallel batches on a test event got #1–#40 with no gaps or duplicates, and the next batch continued at #41; test rows removed.

- **2026-11-10: Cleared all QR badges for event 40 (KASHISH x BENGALURU 2026) on dev**, at the user's request. Deleted 112 `saas_qr` rows (#1–#112, including the 50 test badges), so new badges start again at #1. No votes or receipts referenced them; delegate 262's link to a lost badge was cleared by the foreign key (`SET NULL`).

- **2026-11-10: Correct `festival_id` on `saas_qr` / `saas_attendees`** (`deployed` 2026-11-11).
  - **Problem:** FestiPlus wrote the event id (40) where Laravel and festease_backend write `film_festivals.film_festival_id` (29). 26 queries also filtered with `event_id = ? OR festival_id = ?` using the same value, which can pull in another festival's rows (film festival #40 is event 51).
  - **Fix:**
    - inserts use the new `festivalIds.service.js`;
    - all 26 filters now use `event_id` only;
    - migration `020_fix_saas_festival_id.js` corrected 110 badges and 7 delegates on dev (only rows with this mistake; `updated_at` preserved);
    - removed a hard-coded `dr.event_id = 40` from the delegate reviews queries.
  - **Verified:** pool, delegate list and detail, badge check, categories, venues and the Kashish summary return the same data as before.

- **2026-11-10: QR sequence number per festival** (`deployed` 2026-11-11). [ADR 0001, Amendment 3](adr/0001-qr-credential-uuid-and-festival-serial.md).
  - **What:**
    - `saas_qr.sequence_no` (migration `019_qr_sequence.js`, run on dev);
    - Bulk QR "No." column, `#45` search, #from–#to range (Print badges follows it), "Show this batch" after generating, CSV column;
    - stickers print the real number;
    - optional template field.
  - **Verified on dev:**
    - migration re-run is a no-op;
    - 20 parallel counter reservations gave contiguous, non-overlapping blocks;
    - `#5` search finds exactly badge #5;
    - the range #1–#10 printed stickers #010, #009, #006 and #001, with lost badges skipped;
    - phone and dark mode.

- **2026-11-10: Badge & pass templates** (`deployed` 2026-11-11). [ADR 0005](adr/0005-pass-templates.md).
  - **What:**
    - new Settings › Badges & Passes (`/settings/badges`) with a built-in layout editor and an uploaded-artwork editor (draggable boxes);
    - the shared print dialog (Pass + QR / Pass only / QR only, card printer or A4) in Bulk QR, the Audience list ("Print passes"), the pass dialog and the Assign QR success screen;
    - migration `018_pass_templates.js` (run on dev);
    - hard-coded festival name, venue and dates removed from the pass dialog.
  - **Verified on dev:**
    - API create, update, duplicate, default, archive, validation and permissions;
    - Bulk QR printed 98 stickers / 98 passes / 98 passes without QR;
    - category matching (11 artwork + 9 default);
    - card PDF pages at 85.6 × 54 mm, with the artwork QR box at its saved mm position;
    - phone and dark mode.

Newest first.

### 2026-11-10: Bulk QR stock as a table (`deployed` 2026-11-11)
- **Table instead of QR cards:** [BulkQrManagementPage.jsx](../frontend/src/core/pages/BulkQrManagementPage.jsx) lists badges with columns Badge no., Status (In stock / Assigned / Lost), Delegate, Added and Actions.
  - **Actions:** View QR icon, plus Pair with delegate (in stock) or Open delegate (assigned).
  - Legacy codes are tagged.
  - Uses the shared Pagination with 25 / 50 / 100 rows per page.
  - On phones each row becomes a card.
- **View QR dialog:** large QR, status, and a **Print this badge** button (reuses the sticker template). Lost badges can't be printed.
- **Fix:** Print Sticker Sheets now skips lost badges.
- **Verified on dev:** every tab, dialog open and close (Esc), single print = 1 sticker, All-tab sheet = 108 of 112 (the 4 lost skipped), dark mode, 393px with no sideways scroll; lint shows 0 errors.

### 2026-11-10: Audience page pagination (`deployed` 2026-11-11)
- **What changed:** production's 187 delegates showed 19 page buttons in a row, overflowing on phones. There is a new reusable [Pagination.jsx](../frontend/src/core/components/common/Pagination.jsx):
  - desktop shows `‹ Previous 1 … 4 5 6 … 19 Next ›`, always 7 slots, so the buttons don't shift;
  - phones show `‹ Previous · Page 5 of 19 · Next ›`;
  - changing page scrolls back to the top of the list.
- **Used in** [RegistrationPage.jsx](../frontend/src/core/pages/RegistrationPage.jsx) (`/audience`).
- **Verified on dev** by repeating the delegate list in the browser to 200 rows (no data written): no sideways scroll at 393px or desktop.

### 2026-11-10: Registration › Lost Badge (`deployed` 2026-11-11)
- **Database:** `saas_qr` has new `is_lost`, `lost_at` and `lost_by_user_id` columns (migration [017](../backend/migrations/017_saas_qr_lost_flag.js), run on dev).
- **New Lost Badge tab** (`/registration/lost-badge`): the volunteer finds the delegate by name, phone, email or badge number. They enter the last 4 mobile digits (checked by the server, 5 wrong tries per 15 min), mark the badge lost, then Assign new badge opens Assign QR prefilled.
- **A lost badge is refused everywhere:** gate check-in, voting, badge check and pairing. It never returns to stock and keeps its owner and history.
- **Admin Revoke QR** marks the badge lost instead of deleting it. Bulk QR has a Lost filter and status.
- **Files:**
  - backend: [qrCredential.service.js](../backend/src/core/services/qrCredential.service.js), [audience.controller.js](../backend/src/core/controllers/audience.controller.js), [audience.routes.js](../backend/src/core/routes/audience.routes.js), [rateLimiter.middleware.js](../backend/src/core/middleware/rateLimiter.middleware.js);
  - frontend: [LostBadgePage.jsx](../frontend/src/core/pages/LostBadgePage.jsx), [RegistrationHeader.jsx](../frontend/src/core/components/registration/RegistrationHeader.jsx), [AttendeeAssignQrPage.jsx](../frontend/src/core/pages/AttendeeAssignQrPage.jsx), [RegistrationPage.jsx](../frontend/src/core/pages/RegistrationPage.jsx), [BulkQrManagementPage.jsx](../frontend/src/core/pages/BulkQrManagementPage.jsx);
  - docs: [ADR 0001, Amendment 2](adr/0001-qr-credential-uuid-and-festival-serial.md).
- **Verified on dev** with test delegate #298 (Ruchi) and a volunteer account:
  - The API checks (search by badge number, wrong/right digits, lost badge refused at check-in, badge check, pairing and voting, re-pair, history, pool status, admin revoke) and the full UI flow on desktop and 393px all pass.
  - #298 now has badge #168821.
  - Lint shows 0 errors.

### 2026-11-10: KASHISH leaderboard from Kashish-app votes (`deployed` 2026-11-11)
- **New setting:** a per-festival "Where audience votes come from" option (FestiPlus / Kashish Pride app), with an optional voting period, in Settings › Audience › Voting Rules. KASHISH (event 40) on dev is set to Kashish, with no period yet.
- **Leaderboard:** uses Kashish's own film names, with no link to Submissions.
- **Which votes count:** only from a registered delegate (email, then phone) who has checked in, inside the voting period.
- **Publishing:** published results are frozen; the page shows "Publish again" when votes change.
- **Voting page:** in this mode it shows only Leaderboard and Sync status. Sync status gives a plain reason for every skipped vote. FestiPlus `/vote` and open-voting return 403.
- **Files:**
  - backend: [kashishExternalVotes.service.js](../backend/src/core/services/kashishExternalVotes.service.js), [kashish-sync.controller.js](../backend/src/core/controllers/kashish-sync.controller.js), [audience.controller.js](../backend/src/core/controllers/audience.controller.js), [kashishSyncScheduler.js](../backend/src/core/services/kashishSyncScheduler.js), migration [016](../backend/migrations/016_kashish_external_leaderboard.js) (run on dev);
  - frontend: [KashishVotingBoard.jsx](../frontend/src/core/components/voting/KashishVotingBoard.jsx), [VotingPage.jsx](../frontend/src/core/pages/VotingPage.jsx), [AudienceSettingsPage.jsx](../frontend/src/core/pages/AudienceSettingsPage.jsx);
  - docs: [ADR 0004](adr/0004-kashish-external-leaderboard.md).
- **Verified on dev:**
  - Migration is idempotent; a repeat sync writes nothing new.
  - The 78 votes are all accounted for, and no submissions, audience votes, scores or movie mappings are written.
  - Bayesian scores were checked by hand with a temporary voter link, since removed.
  - Publish, freeze, "changed since" and the public 403 work. The voting period, the invalid-range check and the `/vote` block work.
  - Other festivals are unchanged.
  - Desktop and 393px screenshots look right; lint shows 0 errors.
- **Dev note:** 0 of 58 Kashish voters exist as delegates in the dev database, so dev shows 0 counted votes.

### 2026-11-05: README and execution plan (`deployed` 2026-11-10)
- Added [README.md](../README.md), covering setup, configuration, commands, architecture overview, database rules and deployment.
- Added this file.

### 2026-11-05: Mobile layouts for the remaining screens (`deployed` 2026-11-10)
- **Submissions › Under Review** (Official Selection, Jury & Voting, Finalist, Winner):
  - tables turn into one card per film on phones;
  - award filter pills become one swipeable row;
  - headers stack.
  - Files: [JuryVotingBoard.jsx](../frontend/src/core/components/submissions/JuryVotingBoard.jsx), [FinalistsBoard.jsx](../frontend/src/core/components/submissions/FinalistsBoard.jsx), [WinnersBoard.jsx](../frontend/src/core/components/submissions/WinnersBoard.jsx), [NominationsBoard.jsx](../frontend/src/core/components/submissions/NominationsBoard.jsx).
- **Submissions › Activity Log:** 2×2 stat boxes, compact filters, swipeable action pills, and Stream view only on phones. File: [ActivityLogBoard.jsx](../frontend/src/core/components/submissions/ActivityLogBoard.jsx).
- **Settings › Review Stage:** 2-column stage details. In the create/edit form, name and status are stacked, and touch-friendly arrows reorder stages. File: [InPageReviewStateBuilder.jsx](../frontend/src/core/components/settings/InPageReviewStateBuilder.jsx).
- **Settings › Audience:** FAQ rows no longer overflow, field labels use the full width, and the header is tidier. File: [AudienceSettingsPage.jsx](../frontend/src/core/pages/AudienceSettingsPage.jsx).
- **Verified** with headless screenshots at 393px: no sideways scrolling. Desktop is unchanged.

### 2026-11-05: Payouts: settlement bank account dialog (`deployed` 2026-11-10)
- Clicking the "Settlement: …" pill opens the bank details: holder, bank, masked account number, IFSC, type, masked PAN and verification status.
- Removed the hard-coded fallbacks ("State Bank of India", "••••8399", festival name).
- **Verified** in light and dark mode, on desktop and phone.
- File: [PaymentsPage.jsx](../frontend/src/core/pages/PaymentsPage.jsx).

### 2026-11-05: Submissions: bulk selection bar (`deployed` 2026-11-10)
- The bar now shows on phones. It has a two-row layout and follows the light/dark theme instead of always being dark.
- **Root cause of the hidden bar:** a `forwards` fade-in animation left a transform on the page, which broke `position: fixed`.
- Files: [SubmissionPage.jsx](../frontend/src/core/pages/SubmissionPage.jsx), [JuryVotingBoard.jsx](../frontend/src/core/components/submissions/JuryVotingBoard.jsx), [index.css](../frontend/src/index.css).

### 2026-11-05: Payouts mobile layout (`deployed` 2026-11-10)
- Phone layout for the banner, KPIs, tabs and toolbar. Phones show Grid view only; List view is desktop only.

### 2026-11-05: Team module (`deployed` 2026-11-10)
- **Mobile layout** for the members table.
- **Own pages:** Add Team Member (`/team/add`) and Add Custom Group (`/team/groups/new`) moved from dialogs to separate pages with a redesigned layout.
- **Expand All / Collapse All** in the permission lists now works.
- Files: [TeamPage.jsx](../frontend/src/core/pages/TeamPage.jsx), [App.jsx](../frontend/src/App.jsx).

### 2026-11-05: Attendance: auto-refresh (`deployed` 2026-11-10)
- Removed the manual Refresh button. Logs now refresh every 15 seconds and when the tab becomes visible again.
- File: [AttendancePage.jsx](../frontend/src/core/pages/AttendancePage.jsx).

### 2026-11-04: QR codes rendered locally (`deployed`, ec36409)
- QR images are made in the browser with the `qrcode` package; badge data is no longer sent to `api.qrserver.com`.

### 2026-11-04: Volunteers can't open the full delegate list (`deployed`, 4c23b8c)
- `/audience` and Bulk QR stock now need the `registration:view_roster` permission. Volunteers keep Registration and Attendance.

---

## Archive

_Empty._
