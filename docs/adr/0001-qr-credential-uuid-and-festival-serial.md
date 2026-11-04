# ADR 0001: QR credentials use a UUID payload and a random 6-digit serial per festival (event)

- **Status:** Accepted
- **Date:** 2026-11-03
- **Area:** Audience addon: registration and badges, attendance, voting

## Context
Delegate badges carry a QR code. That code is used for three things:
1. Gate check-in at screenings (`POST /api/attendance/scan`).
2. Authenticating a ballot in audience voting (`/api/public/vote/:token/submit`).
3. Pre-printed sticker stock that is assigned to delegates at the desk.

When the camera can't read the QR (low light, a damaged sticker), volunteers type the code by hand. So the human-readable code is a credential too.

The current implementation has these problems:
- **Weak, racy generation.** `bulkGenerateQRs` (`backend/src/core/controllers/audience.controller.js`) makes 6-digit codes with `Math.random()`. It loads every existing `qr_data` from every festival into memory on each call and checks uniqueness only in the app. There is no unique index on `saas_qr.qr_data`, so two generation requests running at the same time can insert duplicates. The global space of 900k values is shared across all festivals.
- **Mixed formats.** Other issuance paths write UUIDs or `kashish_<hex>` strings into the same column.
- **Guessable credentials accepted.** The delegate serial `KB26-<attendee_id>` comes from an auto-increment id, so it is sequential. Even so, attendance scan and voting accept it as a credential, along with the raw `attendee_id`, and voting also accepts the last 10 digits of a phone number. Anyone who has seen one badge can enumerate the rest.
- **Unindexed lookups.** Scan and vote resolve a code with OR chains over `qr_token`, `qr_data`, `attendee_id` and `JSON_EXTRACT(custom_data,'$.serial_no')`, which forces full scans. The scan query isn't scoped to the event.
- **No effective rate limiting.** The global limit is 50k requests per 15 minutes, and the credential endpoints have no limiter of their own.

We also considered whether random codes "don't scale". They do. The collision probability of a new random code is N/space, so at 100k codes in a 900k space you get about 11% retries, which is cheap. A uniquely indexed lookup is O(log n) whether codes are random or sequential. What actually limits scale is the implementation above, plus the fact that a small shared space gets denser and easier to guess as it fills.

## Decision
Separate the **machine credential** from the **human credential**, and make both unguessable.

1. **`saas_qr.qr_data` = UUID v4** (`crypto.randomUUID()`).
   - This is what the QR image encodes.
   - It carries 122 random bits, so generation needs no collision check.
   - It gets `UNIQUE KEY uk_qr_data (qr_data)`.
2. **`saas_qr.serial_no` = random 6-digit number, unique per festival** (`crypto.randomInt(100000, 1000000)`).
   - It is printed large on the badge and typed when the camera fails.
   - It gets `UNIQUE KEY uk_event_serial (event_id, serial_no)`. See Amendment 1 for why this is scoped by `event_id`.
   - It is **random, not sequential**, because it works as a credential.
   - Generation inserts with `INSERT IGNORE` and tops up any shortfall. The database enforces uniqueness.
3. **Stock counting** uses a cosmetic print-position label ("#001", "#002", …) printed on the sticker sheet. It is never stored or accepted as a credential. Live inventory comes from the software pool stats.
4. **Accepted credentials:**
   - **Attendance:** a UUID (`qr_data`), or `serial_no` within the current festival. Lookups are explicit equality queries on indexed columns and are scoped by event.
   - **Voting:** a scanned UUID, or `serial_no` plus a second factor (the last 4 digits of the delegate's phone).
   - **No longer accepted:** `KB26-xxxx`, raw `attendee_id`, and phone `LIKE` matching. `KB26-xxxx` may stay as an internal or admin label.
5. **One issuance helper.** Every path (bulk generate, issue-qr, Kashish import, desk assignment) creates rows through a single helper. Desk assignment resolves a UUID or serial to an existing stock row. It no longer silently creates rows for unknown codes.
6. **Rate limits** on `/api/attendance/scan`, `/api/registration/qr/check/:code` and `/api/public/vote/*`.

## Alternatives considered
- **Sequential codes (100001, 100002, …).** These make physical counting easy. We rejected them because they are trivially guessable, which enables gate fraud and ballot stuffing. A one-digit typo also silently checks in a different real attendee, where a random code would fail with "not found".
- **Keep random 6-digit codes as the only credential, with fixes.** We rejected this because the global 900k space gets denser as festivals grow, and a short code would have to work as both the QR payload and the typed code.
- **8-digit or 6-digit plus check-digit codes as the only credential.** These are workable, but unnecessary once the QR carries a UUID and the serial is scoped per festival. A check digit can still be added to `serial_no` later if typos become a problem.

## Consequences
- **Positive:**
  - Generation is O(count) with no full-table load.
  - Duplicates are prevented by the database, including under concurrency.
  - Lookups use indexes.
  - Credentials can't be enumerated.
  - The QR formats are unified.
- **Migration required.**
  - Add the `serial_no` column and both unique keys, after checking for and resolving existing duplicates.
  - Backfill: existing 6-digit `qr_data` values move into `serial_no`, and `qr_data` gets a fresh UUID.
  - Stickers already printed encode the old 6-digit value. They keep working because scan falls back to the `serial_no` lookup.
  - `saas_qr` belongs to the shared Freecomers schema, so the migration must be additive and idempotent.
- **QR density.** A 36-character payload is slightly denser (QR version 3). That is fine at sticker size.
- **Inventory counting** depends on the dashboard and the printed position label rather than on code arithmetic.
- **Voting by typed serial** now asks for a second factor, which is a small extra step for delegates.

## Amendment 1: findings during implementation (2026-11-03)
The production data and the other writers of `saas_qr` changed some details of the decision above.

**What we found**
- **`qr_data` is already unique.** It has `UNIQUE KEY qr_data` in the live schema, and `saas_attendees.qr_token` has `UNIQUE uq_qr_token`. The "no unique index" risk only applied to the in-app pre-check. No new key is needed on `qr_data`.
- **Three services write to `saas_qr`:**
  - This backend.
  - The Freecomers Laravel backend, which issues badges from the delegate pass flow as UUIDs with no serial.
  - `festease_backend` (pm2 `saasbackend`, currently stopped). It wrote about 2,300 sequential legacy codes (`BISFF2026-NNNNN`, `ZDFC2026-NNNN`), which are likely already printed.
  - So `serial_no` is **nullable**, and rows from other writers stay valid.
- **`festival_id` is inconsistent.** Event 40 has rows with `festival_id` 29 and 40. The tenant key everywhere in this app is `event_id`.
- **`serial_no` already has a meaning.** The name is used for the `KB26-xxxx` delegate label in `custom_data` and in every API response.

**What changed in the decision**
1. **Uniqueness is per event.** The key is `UNIQUE KEY uk_event_serial (event_id, serial_no)`, not per `festival_id`.
2. **The API exposes the column as `badge_serial`.** The DB column stays `saas_qr.serial_no`. In API responses, `serial_no` keeps meaning the KB26 delegate label (display only).
3. **Legacy prefixed codes keep working.** They resolve by exact `qr_data` match. On public voting they count as *weak* credentials, so they need the phone second factor. Only an exact UUID match counts as *strong*.
4. **Migration 014** (`backend/migrations/014_qr_credential_serial.js`) is additive and idempotent:
   - It adds `serial_no`.
   - It moves the 55 legacy 6-digit `qr_data` values into `serial_no`, gives them new UUIDs, and moves linked `qr_token` values to the new UUIDs.
   - It adds `uk_event_serial`.
5. **One service.** All issuance and lookup goes through `backend/src/core/services/qrCredential.service.js`:
   - `createQrRows` inserts with INSERT IGNORE, reads back what landed, and retries any serial collisions.
   - `findQrRow` and `resolveAttendee` look up by credential.
   - `phoneLast4Matches` checks the second factor.
6. **Rate limits count failed attempts only** (`skipSuccessfulRequests`). Venue Wi-Fi puts many voters behind one IP, so plain per-IP limits would block real voters.
   - Public vote: 60 failures per IP per 10 min, and 8 failures per badge per 15 min.
   - Staff gate scan and badge check: 100 failures per user per 5 min.

**Follow-ups (not done here)**
- **QR images are rendered by `api.qrserver.com`.** Every badge credential (UUID) is sent to a third party when it is displayed or printed. Generate the images locally instead, for example with the `qrcode` npm package.
- **festease and Laravel.** If `festease_backend` is ever restarted, or Laravel issuance is kept, they should create rows with a `serial_no` too. Until then, their badges can only be scanned, not typed.
