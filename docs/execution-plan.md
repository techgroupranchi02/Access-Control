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
| 2026-11-10 | Send the Kashish API requests to the Kashish team | Team | [kashish-votes-api-requirements.md](kashish-votes-api-requirements.md). Most important: a festival/edition filter, plus keep sending email and mobile on every vote. |
| 2026-11-10 | Set the KASHISH voting period | Festival team | Settings › Audience › Voting Rules → "Voting from / to". Until it is set, votes from any date count, including 77 votes from before July. |
| — | Set `FREECOMERS_API_URL` in the production `.env` | DevOps | If it is unset, it falls back to a host worked out from `FRONTEND_URL`. |
| — | Deploy the pending Laravel and Next.js fixes to production | DevOps | Production deploy only; they are not in this repo. |

## Done

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
