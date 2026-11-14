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
| 2026-11-14 | Production: enter the KASHISH schedule in Settings › Audience › Screenings (16 shows, Nov 20–22; dev festival 40 has them to copy) and link each film's Kashish movie ID to its show | Festival team | Votes for films not linked to a show don't count ("Film not on the schedule"). Shorts packages need each short's Kashish movie ID. |
| 2026-11-14 | Ask Kashish for a films list endpoint (movie IDs and titles for event EF3j920261), and whether shorts are voted on individually or as a package | Team | Until then films can only be picked once they have a vote, or added by ID. |
| 2026-11-14 | Production server time zone must be IST (attendance windows use the server's local time) | DevOps | Check `timedatectl` on the production host. |
| 2026-11-12 | Ask Kashish to rotate the API key printed in their guide, then update `KASHISH_API_KEY` in dev and prod `.env` | Team | The guide's examples show our live key. |
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
