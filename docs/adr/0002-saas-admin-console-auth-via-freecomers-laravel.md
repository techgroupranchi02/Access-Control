# ADR 0002: Authenticate the SaaS admin console by verifying the Freecomers admin JWT with Laravel

- **Status:** Accepted
- **Date:** 2026-11-03
- **Area:** `/api/admin/saas/*` (the SaaS console used by the Freecomers admin panel)

## Context
The routes in `backend/src/core/routes/saasAdmin.routes.js` were mounted with **no authentication**. They let a caller:
- list festivals,
- toggle SaaS access and modules,
- rewrite the group permission matrix,
- change festival settings,
- mint a **24h super-admin launch token** for any festival portal.

The launch token could also be minted with a plain `GET`. Anyone who could reach the API could therefore get platform-wide super-admin access.

Findings from tracing the callers:
- **Only caller.** The Freecomers admin panel (`freecomers_frontend`, `src/admin/services/saasAccessService.js`) is the only caller. It calls `/api/saas/*` on `admin.autovertest.com`, and nginx proxies that to `127.0.0.1:4000/api/admin/saas/*`.
- **No auth header sent.** Those calls used plain axios with no `Authorization` header.
- **The panel's existing token.** The panel already holds a Freecomers **Laravel admin JWT**. It is issued by `Freecomers_backend` with tymon/jwt-auth, `admin` guard, `admins` provider, and stored in `localStorage.cookies`. The panel's other admin services send it as a Bearer token.
- **Laravel can check it.** Laravel exposes `GET /api/v1/admin/verify-token` under `auth:admin`. It returns `200 {token_valid:true}` for a valid admin token and 401 otherwise.
- **No GET caller.** Nothing anywhere calls the `GET` form of `launch-token`.
- **Different token.** The Access-Control backend's own `authenticate` middleware only accepts *its own* HS256 JWTs. The admin panel never obtains one of these.

## Decision
1. **Add `requireFreecomersAdmin` to every `/api/admin/saas/*` route** (`backend/src/core/middleware/freecomersAdmin.middleware.js`).
   - It requires `Authorization: Bearer <Laravel admin JWT>`.
   - It validates the token by calling Laravel `GET {FREECOMERS_ADMIN_API_URL}/api/v1/admin/verify-token`, with a 5s timeout.
   - It is fail-closed:
     - no token, or a non-200 response: 401;
     - network error: 503.
   - Successful verifications are cached in memory for 60s, keyed by sha256(token) and capped at 500 entries.
   - It decodes the already-verified token's `sub` claim into `req.freecomersAdmin.id`.
2. **Remove the `GET` launch-token route.** Only `POST` remains.
3. **Launch tokens carry the identity of the requesting admin** (`admins.id = sub`), instead of always the first `admins` row.
4. **The admin panel sends the token.** `saasAccessService.js` routes every call through an axios instance that adds `Authorization: Bearer ${localStorage.cookies}`.
5. **New config value `FREECOMERS_ADMIN_API_URL`.**
   - Optional.
   - If unset, it defaults to `https://api.autovertest.com` when `FRONTEND_URL` contains `autovertest.com`, and to `https://api.freecomers.com` otherwise.
   - It is derived from `FRONTEND_URL` because the dev server runs with `NODE_ENV=production`.

## Alternatives considered
- **Share Laravel's `JWT_SECRET` and verify locally.**
  - Advantages: no network hop.
  - Rejected because:
    - it duplicates a high-value secret across services;
    - we would have to mirror tymon's claim checks (`prv` provider hash, blacklist);
    - logouts and disabled admins on Laravel would not take effect.
- **Make the panel log in to Access-Control `/api/auth` to get a local JWT.** Rejected because it adds a second login and session for the admins and needs more changes to the panel.
- **Static server-to-server API key in nginx.** Rejected because it authenticates the proxy, not the person. Anyone reaching `admin.autovertest.com/api/saas` would still get through.
- **IP allowlist only.** Rejected for the same reason: the proxy is public.

## Consequences
- **Closed hole.** Unauthenticated access to the SaaS console and launch-token minting is closed.
- **Deploy order matters.** Deploy `freecomers_frontend` first, because the added header is harmless to the old backend. Then deploy Access-Control. In the reverse order the console returns 401 until the panel is updated.
- **Dependency on Laravel.** If Laravel's API is down, the SaaS console returns 503. The festival portal itself is unaffected.
- **Revocation delay.** Revoking an admin takes effect within the 60s cache window.
- **Wrong environment means 401.** Dev and prod tokens are not interchangeable. `FREECOMERS_ADMIN_API_URL` must point at the Laravel instance that issued the panel's tokens.
- **Launch token still in the URL.** It is still delivered via `?token=` on `/login`. Moving to a short-lived, one-time code exchanged by POST is a possible follow-up.
