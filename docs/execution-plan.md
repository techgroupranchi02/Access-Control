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

- **Bring `.env.example` up to date.** It lists only the database, app and JWT keys; it should list every key in the [README](../README.md#configuration).
- **Replace `frontend/README.md`.** It is still the default Vite template; point it to the root README.
- **Optional: move Edit Member to its own page** (`/team/:id/edit`), like Add Team Member and Add Custom Group.

## Needs action

| Since | Item | Owner | Notes |
| --- | --- | --- | --- |
| — | Remove the 50 test badges created by mistake on event 40 | DB admin | `DELETE FROM saas_qr WHERE event_id = 40 AND qr_id BETWEEN 90578 AND 90627 AND attendee_id IS NULL;` |
| — | Set `FREECOMERS_API_URL` in the production `.env` | DevOps | If it is unset, it falls back to a host worked out from `FRONTEND_URL`. |
| — | Deploy the pending Laravel and Next.js fixes to production | DevOps | Production deploy only; they are not in this repo. |

## Done

Newest first.

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
