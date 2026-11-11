# FestiPlus — Access Control

FestiPlus is a multi-tenant film-festival operating system run by **Freecomers**. A festival team uses it to run an edition end to end:

- **Submissions:** take in films and move them through a staged review pipeline (Screening → Consideration → Official Selection → Jury & Voting → Finalist → Winner).
- **Team:** manage members, jury and volunteers, with group-based permissions.
- **Audience:** register delegates, issue QR badges, check people in at screenings, and collect audience votes.
- **Payouts:** track submission fees and settlements to the festival's bank account.

| Environment | URL |
| --- | --- |
| Production | `ffestiplus.freecomers.com` |
| Development | `ffestiplus.autovertest.com` (and other `*.autovertest.com` hosts) |

## Tech stack

| Part | Stack |
| --- | --- |
| `backend/` | Node.js, Express 4 (CommonJS), MySQL via `mysql2/promise`, JWT auth |
| `frontend/` | React 19, Vite, React Router 7, plain `.jsx` (no TypeScript), oxlint |
| CI/CD | Jenkins (`Jenkinsfile`), pm2, nginx |

## Repository layout

```
Access-Control/
├── backend/
│   ├── migrations/          # NNN_description.js, run by run_all_migrations.js
│   ├── seeders/             # demo / canonical seed data
│   ├── src/
│   │   ├── app.js           # Express bootstrap
│   │   ├── config/          # environment, database pool, plugin loader
│   │   ├── core/
│   │   │   ├── routes/      # API routers (/api/...)
│   │   │   ├── controllers/ # request handlers
│   │   │   ├── services/    # auth, permissions, QR credentials, Kashish sync, ...
│   │   │   └── middleware/  # authenticate, requirePermission, requireModule, security
│   │   ├── plugins/         # custom per-festival plugins
│   │   └── scripts/         # maintenance scripts (incl. sync_specs_to_database.js)
│   └── ecosystem.config.cjs # pm2 config
├── frontend/
│   └── src/
│       ├── App.jsx          # routes
│       ├── index.css        # global styles and --fc-* design tokens
│       ├── config/          # plugin registry
│       └── core/            # pages, components, context, hooks, services, utils
├── docs/
│   ├── design.md            # UI design rules
│   └── adr/                 # Architecture Decision Records
├── CLAUDE.md                # detailed architecture notes and conventions
└── Jenkinsfile
```

## Getting started

### Prerequisites

- Node.js 22 (the version CI and the servers run)
- MySQL 8 with an InnoDB database using utf8mb4. Some tables are shared with the wider Freecomers platform (see [Database](#database)).

### 1. Backend

```bash
cd backend
cp .env.example .env      # then fill in the values (see below)
npm install
npm run migrate           # create / update the schema and sync permissions
npm run seed              # optional: demo data (demo password: Demo@12345)
npm run dev               # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The Vite dev server forwards `/api` to `http://127.0.0.1:4000`, so you can leave `VITE_API_URL` unset when developing locally.

## Configuration

### Backend (`backend/.env`)

| Key | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | MySQL connection |
| `APP_PORT` | API port (default `4000`) |
| `NODE_ENV` | `development` or `production` |
| `FRONTEND_URL` | Public URL of the frontend. Also used to pick the default Freecomers API host. |
| `JWT_SECRET_KEY` | Secret for signing access tokens. Use a long random value in production. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` | Google sign-in |
| `FREECOMERS_API_URL` | This environment's Freecomers Laravel API, used for media URLs, the login fallback and admin-token checks. If unset, it is derived from `FRONTEND_URL`. |
| `FREECOMERS_ADMIN_API_URL` | Optional override used only for admin-panel token checks |
| `KASHISH_API_URL`, `KASHISH_API_KEY` | The Kashish voting app's API |
| `KASHISH_SYNC_INTERVAL_SEC` | How often votes are pulled while a voting window is open (default `120`; `0` disables auto-sync) |

### Frontend (`frontend/.env`)

| Key | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL (default `/api`) |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in client ID |

Never commit `.env` files or secrets.

## Commands

| Where | Command | What it does |
| --- | --- | --- |
| `backend/` | `npm run dev` | Start the API |
| `backend/` | `npm start` | Start the API with `NODE_ENV=production` |
| `backend/` | `npm run migrate` | Run all migrations, then sync modules, pages and permissions |
| `backend/` | `npm run seed` | Load demo seed data |
| `backend/` | `npm run setup` | `migrate` followed by `seed` |
| `frontend/` | `npm run dev` | Start the Vite dev server |
| `frontend/` | `npm run build` | Production build into `frontend/dist` |
| `frontend/` | `npm run lint` | Lint with oxlint |

There is no automated test suite yet. Check changes by running the app, and lint the frontend before pushing.

## How it works

### Tenancy

Each festival edition is a row in `events` (`event_id`). In code, "festival", "edition" and "event" mean the same thing. The frontend sends the current edition in the `X-Event-Id` header, and every query must be scoped by that event.

### Auth and permissions

- **Tokens:** login returns a JWT. It lasts 24 hours, or 30 days with "Remember me". The frontend sends it as `Authorization: Bearer <token>`.
- **Platform admins** (`admins` table) can do everything.
- **Festival users:**
  - Their access comes from their group in each event: **admin**, **volunteer** or **jury**. Event owners and approved festival claims also get access.
  - Routes are protected with `requirePermission('module.action')` and `requireModule(key)`.
  - Group permissions live in `backend/src/scripts/sync_specs_to_database.js`. To add or change a permission, edit that file; `npm run migrate` applies it.

### Modules

Features are modules (`core`, `addon` or `custom`) that are switched on per event. Custom plugins live in `backend/src/plugins/<dir>`, mounted at `/api/plugins/<module_key>`. Each one must also be registered in `frontend/src/config/pluginRegistry.js`.

### Main API areas

| Area | Paths |
| --- | --- |
| Auth | `/api/auth` |
| Events and team | `/api/events`, `/api/team` |
| Submissions and reviews | `/api/submissions`, `/api/reviews` |
| Audience | `/api/registration`, `/api/attendance`, `/api/voting`, `/api/audience` |
| Payouts | `/api/payouts`, `/api/payments` |
| Public, no login | `/api/public/vote/:token`, `/api/public/results/:eventId` |
| SaaS console (Freecomers admin panel) | `/api/admin/saas` |

[CLAUDE.md](CLAUDE.md) has the full route map.

### QR badges

Delegate badges encode a random UUID. Staff look badges up by a 6-digit badge number that is unique within each event. Always create and look up badges through `core/services/qrCredential.service.js`, and render QR codes locally with `components/common/QrCode.jsx`. See [ADR 0001](docs/adr/0001-qr-credential-uuid-and-festival-serial.md).

### Badge & pass templates

Each festival designs its passes in Settings › Badges & Passes (`/settings/badges`): a built-in layout or its own uploaded artwork. Staff print them as Pass + QR, Pass only or QR only, on a card printer or A4 sheets, from Bulk QR, the Audience list or Assign QR. All printing goes through `core/utils/passRenderer.js`. See [ADR 0005](docs/adr/0005-pass-templates.md).

## Database

- **Migrations:**
  - Migrations live in `backend/migrations/` and run in the order listed in `run_all_migrations.js`.
  - Every migration must be **idempotent**, because CI runs `npm run migrate` on each deploy.
  - When you add a migration, add it to the `MIGRATION_SCRIPTS` list too.
- **Shared Freecomers tables:** `admins`, `users`, the base `events` table, `film_festivals*`, `saas_attendees`, `saas_qr`, `delegate_reviews` and `countries` belong to the shared Freecomers database. Other Freecomers apps also write to some of them, such as `saas_qr`. Only make additive changes to them.
- **Queries:** always use `?` placeholders.

## Frontend conventions

- **Design rules:** UI follows [docs/design.md](docs/design.md).
  - Use colours only from the `--fc-*` tokens, so every screen works in light and dark mode.
  - Take icons from `core/components/common/Icons.jsx`.
  - Don't use emoji on staff screens.
- **Phone support:** screens must work at phone width (≤ 640px). Phone styles are `@media (max-width: 640px)` blocks in `src/index.css`. On phones, tables are restyled into card lists.
- **API calls:** go through `core/services/api.js`, which adds the auth token and event headers and redirects to `/login` on a 401.

## Deployment

Jenkins deploys on every push:

| Branch | Target |
| --- | --- |
| `main` | Production |
| any other branch | Development |

The pipeline runs these steps:

1. `npm ci`
2. Build the frontend.
3. Rsync to the server.
4. `npm run migrate`
5. `pm2 reload access-control-backend`
6. Reload nginx.

CORS and CSP allowed domains are set in `backend/src/core/middleware/security.middleware.js`. Update them when adding a new domain.

## Documentation

- [CLAUDE.md](CLAUDE.md): detailed architecture, conventions and domain glossary
- [docs/design.md](docs/design.md): UI design system
- Architecture Decision Records:
  - [0001: QR credential UUID and festival serial](docs/adr/0001-qr-credential-uuid-and-festival-serial.md)
  - [0002: SaaS admin console auth via Freecomers Laravel](docs/adr/0002-saas-admin-console-auth-via-freecomers-laravel.md)
  - [0003: Kashish vote verification and results publication](docs/adr/0003-kashish-vote-verification-and-results-publication.md)

Add a new ADR in `docs/adr/` (`NNNN-kebab-title.md`) for any significant design decision.
