# CLAUDE.md

Guidance for working in this repository.

## Overview
- **FestiPlus**: a multi-tenant film-festival SaaS run by **Freecomers**.
  - Production domains: `ffestiplus.freecomers.com`.
  - Dev and staging domains: `*.autovertest.com`.
- **Monorepo layout**:
  - `backend/`: Express 4, CommonJS, `mysql2/promise` on MySQL (InnoDB, utf8mb4).
  - `frontend/`: React 19 and Vite, ESM, plain `.jsx` with no TypeScript.
  - `Jenkinsfile`: CI/CD.
- **Tests**: there are none. Frontend lint is `npm run lint` (oxlint, `frontend/.oxlintrc.json`). The backend has no linter.

## Commands
```bash
# backend (port 4000)
cd backend && npm run dev          # node src/app.js
npm run migrate                    # migrations/run_all_migrations.js
npm run seed                       # seeders/001_seed_data.js (demo pw: Demo@12345)

# frontend (port 5173, proxies /api -> 127.0.0.1:4000)
cd frontend && npm run dev
npm run build
npm run lint
```

## Backend architecture
- **Bootstrap** (`backend/src/app.js`):
  - Middleware order: helmet, CORS allowlist, permissions policy, general rate limiter, JSON body (10mb), cookie-parser.
  - `start()` tests the DB connection, then runs `loadPlugins(app)`, then adds the error and 404 handlers.
- **Route files** live in `backend/src/core/routes/`. The main mounts are:
  - `/api/auth` (also `/api/v1/auth`), `/api/events`, `/api/submissions`, `/api/team`, `/api/admin/saas`, `/api/admin`.
  - `/api/modules/:moduleKey/settings`, served by the "Format B" settings engine.
  - `modules.routes.js` exports several sub-routers: `/api/reviews`, `/api/calendar` (also mounted as `/api/schedule`), `/api/tasks`, `/api/departments`, `/api/guests`, `/api/chat`, `/api/sponsors`, `/api/payouts`, `/api/payments`, `/api/settings`, `/api/news`, `/api/analytics`.
  - `audience.routes.js`: `/api/audience`, `/api/attendance`, `/api/voting`, `/api/registration`, plus the **unauthenticated** `/api/public/vote/:token` and `/api/public/*`.
  - `/api/kashish-sync`.
- **Plugins**:
  - `backend/src/config/pluginLoader.js` reads `modules` rows where `type='custom'` and `plugin_dir` is set.
  - It mounts `src/plugins/<dir>/<dir>.routes.js` at `/api/plugins/<module_key>`.
  - Every plugin must also be registered in `frontend/src/config/pluginRegistry.js`.
- **Modules**:
  - Each module is a row in the `modules` table, with type `core`, `addon` or `custom`.
  - A module is enabled for an event when a row exists in `events_modules`.
  - Pages and permissions live in DB tables, which `src/scripts/sync_specs_to_database.js` keeps in sync.
- **Code layers**:
  - `core/controllers/`: async `(req, res)` functions that call `query()` directly.
  - `core/services/`: shared logic for auth, editions, permissions, scoping, plugins and the Kashish API.

## Auth and permissions
- **JWT**:
  - HS256, signed with `JWT_SECRET_KEY`. Lifetime is 24h, or 30 days when "Remember me" is ticked at login (`jwtExpiresIn` / `jwtRememberExpiresIn` in `config/environment.js`).
  - The `authenticate` middleware (`core/middleware/auth.middleware.js`) checks `Authorization: Bearer` first, then the `__Host-access-token` or `access-token` cookie.
  - The frontend stores the token in `localStorage.authToken`.
- **User types**:
  - **Platform admin**: a row in the `admins` table. Gets `role:'admin'` and `isSuperAdmin:true`.
  - **Festival users**: rows in the shared `users` table. Access comes from `user_event_groups` (admin, volunteer or jury), event ownership, or approved `film_festivals_claims`.
- **Route guards** (`core/middleware/permission.middleware.js`):
  - `requirePermission('module.action')`: `.` and `:` mean the same thing, and so do `view` and `read`. It sets `req.permissionScope.scopeKey` to `all`, `jury_panel` or `assigned`.
  - `requireModule(key)`: checks the event has the module enabled.
  - **Full delegate list:** `/audience` and Bulk QR stock need `registration:view_roster`. Admin has it and volunteers don't, so volunteers only get Registration (spot registration and Assign QR) and Attendance.
    - Frontend check: `hooks/useCanViewRoster.js`.
    - `registration:view` stays with volunteers for desk lookups.
    - Permissions come only from `sync_specs_to_database.js`, which runs on every `npm run migrate`. It deletes permissions that aren't in the spec and rebuilds each group's grants, so add new keys there, not in a separate migration.
- **SaaS console** (`/api/admin/saas/*`):
  - Called by the separate Freecomers admin panel (`/var/www/freecomers_frontend`) through nginx `admin.*/api/saas/`.
  - Guarded by `requireFreecomersAdmin` (`core/middleware/freecomersAdmin.middleware.js`), not by `authenticate`. It checks the panel's **Laravel** admin JWT by calling `GET {FREECOMERS_ADMIN_API_URL}/api/v1/admin/verify-token`. See [ADR 0002](docs/adr/0002-saas-admin-console-auth-via-freecomers-laravel.md).
- **Launch-token SSO**: `POST /api/admin/saas/festivals/:id/launch-token` (`generateLaunchToken`) creates a 24h super-admin JWT for the requesting admin. The frontend's `AuthContext` reads it from `?token=`.

## Multi-tenancy
- The tenant is `events.event_id`. "Festival", "edition" and "event" mean the same thing in code. The legacy `festivals` and `editions` tables were renamed to `events`.
- The current tenant comes from the `X-Event-Id`, `X-Edition-Id` or `X-Festival-Id` header, or the matching query param.
  - **Pitfall:** many controllers' `getEventId(req)` silently fall back to `1`. Always scope queries by event explicitly.

## Database
- **Connection**:
  - `backend/src/config/database.js` exports `query(sql, params)` (uses `pool.execute`), `getConnection()` for transactions, and `testConnection()`.
  - Always use `?` placeholders.
- **Migrations**:
  - Files are named `backend/migrations/NNN_snake_description.js`, and each is a standalone node script.
  - They **must be idempotent** (`IF NOT EXISTS`, column checks), because Jenkins runs `npm run migrate` on every deploy.
  - **Add each new migration to the `MIGRATION_SCRIPTS` array** in `migrations/run_all_migrations.js` by hand. The runner currently starts at 005.
- **Shared Freecomers tables**: these come from the shared Freecomers DB, not from migrations. Never alter them destructively:
  - `admins`, `users`, the base `events` table, `film_festivals*`, `saas_attendees`, `saas_qr`, `delegate_reviews`, `countries`.

## Frontend
- **Entry and providers**: `src/main.jsx` loads `src/App.jsx`. Providers wrap in this order: `ThemeProvider` > `AuthProvider` > `FestivalProvider` > `BrowserRouter`.
- **Route gating**: routes go through `ProtectedRoute`, then `Layout`, then `ModuleGate` or `PermissionGate`. The only public routes are `/login` and `/vote/:token`.
- **API client**: `src/core/services/api.js` is an axios instance with `baseURL = VITE_API_URL || '/api'`.
  - It adds the event headers and the Bearer token.
  - On a 401 it clears storage and redirects to `/login`.
- **Folders**:
  - `src/core/pages/*Page.jsx`: large page components that mostly use inline styles and CSS variables (`--fc-*`).
  - `src/core/components/`, `src/core/context/`, `src/core/hooks/`.
- **QR scanning** uses `html5-qrcode` in `AttendancePage.jsx`, `AttendeeAssignQrPage.jsx` and `components/registration/AssignQrModal.jsx`.
- **QR rendering** is local: use `components/common/QrCode.jsx` (`<QrCode value size />`, or `qrSvgMarkup()` for print HTML), built on the `qrcode` package. Never use an external QR image service: it is slow and sends badge credentials off-site.

## Conventions
- **Routers**: create the router, call `router.use(authenticate)`, add `requireModule(...)`, then add `requirePermission(...)` on each route.
- **Errors**: return `res.status(4xx|500).json({ error: '...' })`. Successful responses do not share one shape, so match the neighbouring endpoints.
- **Log lines**: prefix them with a tag such as `[PluginLoader]` or `[Permission]`.

## Domain glossary
- **Audience addon** (`audience`): registration and badges, attendance, voting and delegate reviews.
  - Code: `core/controllers/audience.controller.js` and `audience.routes.js`.
- **Delegates**: registered attendees in `saas_attendees`, grouped by `audience_categories`.
  - **Pass days:** only a Day Pass (pass type containing "Day Pass", `isDayPass()`) keeps `custom_data.pass_days`; every other pass saves `[]`. The public confirmation on the Freecomers site prints `pass_days` when it isn't empty.
  - **Updated confirmation email:** the edit form's "Email the updated confirmation" checkbox sends it from FestiPlus (`delegateConfirmationEmail.js`, `mail.service.js`); Laravel still sends the first one at registration. See [ADR 0006](docs/adr/0006-festiplus-delegate-confirmation-email.md).
- **QR badges**: `saas_qr` rows, which are issued, assigned, revoked or bulk-generated as pre-printed stock. See [ADR 0001](docs/adr/0001-qr-credential-uuid-and-festival-serial.md).
  - **Lost badges** (ADR 0001, Amendment 2): `saas_qr.is_lost` / `lost_at` / `lost_by_user_id`.
    - A lost badge is refused at check-in, voting and pairing, and never returns to stock.
    - Mark badges lost only through `qrCredential.markBadgesLost()`. This covers the Registration › Lost Badge tab (`/registration/lost-badge`, with a last-4-mobile-digits check) and admin Revoke QR.
    - Any new "current badge" query must add `AND is_lost = 0`.
  - `qr_data` is a UUID, encoded in the QR image.
  - `serial_no` is a random 6-digit badge number, unique per `event_id`. The API returns it as **`badge_serial`**.
  - `serial_no` in API responses is still the `KB26-xxxx` delegate label, which is display only and **never a credential**.
  - Always create and look up badges through `core/services/qrCredential.service.js`.
  - `sequence_no` is the badge's permanent running number within its event (#1, #2 …, ADR 0001 Amendment 3), stored in `saas_qr.sequence_no`. `createQrRows()` assigns the event's highest number + 1 under a per-event lock; there is no counter table. Display only; never compute it from `qr_id`.
  - `saas_qr` is also written by Laravel and by `festease_backend`, so keep schema changes additive.
  - **`festival_id` on saas_* tables is `film_festivals.film_festival_id`, not the event id** (event 40 = film festival 29).
    - Filter saas_* rows by `event_id` only; never `event_id = ? OR festival_id = ?` with the same value.
    - When inserting, write `festival_id` from `getFilmFestivalId(eventId)` in `core/services/festivalIds.service.js`.
- **Pass templates** (Settings › Badges & Passes, `/settings/badges`): `pass_templates`, one festival can have several. See [ADR 0005](docs/adr/0005-pass-templates.md).
  - Every template is a background plus **elements** in `pass_template_elements` (type `text` / `image` / `checklist`, name, position JSON in mm, metadata JSON, sort_order). Design types: `layout` (colour background; elements placed by `buildLayoutElements()`) and `artwork` (uploaded design). See ADR 0005 Amendment 1.
    - Text uses merge fields (`{{name}}`, `{{custom.<field>}}` …) and one of 7 fonts; images are `upload` (`pass_template_assets`), `festival_logo` or `badge_qr`; colours can be `accent` or `category`.
    - Each template prints as Pass + QR or QR only, on A4 (orientation, margins and columns × rows; `sheetLayout()`) or one pre-cut card per page at the pass size.
    - Artwork templates can have a bleed (`config.bleedMm`): the template size is the card, the artwork covers card + bleed and is cropped at the card edge (`bleedOf()`). See ADR 0005 Amendment 4.
    - The print dialog lets staff pick a badge range (From / To), shows it (#001–#075) and records each Print press per badge in `qr_print_log` (`qrPrintLog.service.js`); badges printed before get a warning with "Leave out". See ADR 0005 Amendment 3.
    - QR-only stickers don't use a template: they follow the festival's **QR Settings** (`pass_print_settings`, set in the print dialog; saving the default needs `settings.manage`).
  - API: `/api/pass-templates` (`pass-templates.controller.js`, validation and starters in `passTemplates.service.js`). Listing needs `registration.view`; changes need `settings.manage`.
  - Print badges and passes only through `frontend/src/core/utils/passRenderer.js` and `components/print/PrintPassesDialog.jsx`. Never hard-code festival text (name, venue, dates) on a pass; it comes from the festival's records or the template.
- **Screening blocks**: venue time slots with a film playlist (`screening_blocks`, `screening_block_films`).
- **Attendance**: gate check-ins recorded in `screening_checkins`.
- **Audience voting**: done through `/vote/:token`, stored in `audience_votes`, with scores in `audience_voting_scores`.
- **Jury ballots**: kept separately in `jury_ballots`.
- **Review stages**: submissions move through a 6-stage pipeline: Screening, Consideration, Official Selection, Jury & Voting, Finalist, Winner.
- **Kashish**: the external app delegates vote in. See [ADR 0003](docs/adr/0003-kashish-vote-verification-and-results-publication.md).
  - **Kashish-source festivals** (`audience_settings.settings_json.voting_source = 'kashish'`, set in Settings › Audience › Voting Rules) rank films by Kashish's own movie ID and title, with no link to `submissions`. See [ADR 0004](docs/adr/0004-kashish-external-leaderboard.md).
    - Code: `core/services/kashishExternalVotes.service.js`.
    - Tables: `kashish_external_votes` and `kashish_results_publications`.
    - A vote counts only from a registered delegate (matched by email, then phone) who has checked in, inside the voting period.
    - Votes are fetched for the festival's **Kashish event ID** (`settings_json.kashish_event_id`, KASHISH = `EF3j920261`), scan votes only. Scheduled runs use `updatedSince` (state in `kashish_sync_state`); "Sync now" is a full sync that marks votes outside the event `removed`. See ADR 0004 Amendment 1.
    - Published results are frozen snapshots.
    - FestiPlus `/vote` is off for these festivals.
  - Votes are pulled from its API by `syncEventVotes()` in `kashish-sync.controller.js`, which runs automatically every `KASHISH_SYNC_INTERVAL_SEC` while a voting window is open (`core/services/kashishSyncScheduler.js`), plus a manual button.
  - A vote counts only for a registered, checked-in delegate. Attendees are never auto-created. Every vote gets a row in `kashish_vote_receipts`, and `audience_votes.qr_id` records the badge it was cast with.
- **Results**: `GET /api/public/results/:eventId` and the public winners screen `/results/:eventId` show standings only after the team approves them; before that the endpoint returns 403.

## Deployment
- **Jenkins**: pushes to `main` deploy to prod, and any other branch deploys to dev.
  - Steps: `npm ci`, build the frontend, rsync, `npm run migrate || true`, `pm2 reload access-control-backend`, reload nginx.
- **pm2**: `backend/ecosystem.config.cjs` runs one instance on port 4000.
- **Backend env keys**: `DB_*`, `APP_PORT`, `NODE_ENV`, `FRONTEND_URL`, `JWT_SECRET_KEY`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URL`, `KASHISH_API_KEY`, `KASHISH_API_URL`, `KASHISH_SYNC_INTERVAL_SEC` (default 120; 0 disables auto-sync), and `FREECOMERS_API_URL`.
  - `FREECOMERS_API_URL` is this environment's Freecomers Laravel API, used for media/avatar URLs, the login fallback and admin JWT checks.
    - If unset, it follows `FRONTEND_URL`: autovertest gives `api.autovertest.com`, anything else gives `api.freecomers.com`.
    - Never hard-code either host; use `env.freecomersApiUrl` and `utils/media.utils.js`.
  - `FREECOMERS_ADMIN_API_URL` optionally overrides it for admin JWT checks only.
  - `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`: outgoing email, the same keys and account as the Laravel `.env`. Without `MAIL_HOST` no email is sent.
  - `FREECOMERS_SITE_URL`: the public Freecomers site for festival page links. If unset: `next.autovertest.com` on autovertest, `freecomers.com` otherwise.
- **Frontend env keys**: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.
- **CORS and CSP domains** are hardcoded in `core/middleware/security.middleware.js`.

## Docs
`docs/` holds the project specs, execution plans and Architecture Decision Records.
- **Keep [docs/execution-plan.md](docs/execution-plan.md) current.** It is the live task tracker.
  - When a task starts, add it under **In progress**.
  - When it finishes, move it to **Done** (newest first), with the files changed, how it was verified, and its status: `uncommitted`, `committed` or `deployed`.
  - Anything waiting on a person goes under **Needs action**, with an owner.
  - Move **Done** entries older than 30 days to the **Archive** section.
- **UI work must follow [docs/design.md](docs/design.md)**: colours only from `--fc-*` tokens, so every screen works in light and dark; icons only from `common/Icons.jsx`; no emoji on staff screens.
- ADRs live in `docs/adr/NNNN-kebab-title.md`. Read the relevant ADRs before changing that area, and add a new ADR for any significant decision.

## Known risks (not yet fixed)
- The Kashish API key printed in Kashish's own guide is still the live key until Kashish rotates it (the code no longer has a fallback; it comes from `.env`).
- The rate limits are effectively off: the general limit is 50000 requests per 15 minutes, and credential and public-vote endpoints have no limiter of their own.
