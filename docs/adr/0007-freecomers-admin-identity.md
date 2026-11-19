# ADR 0007: Freecomers admin identity is not a users id

- **Status:** Accepted
- **Date:** 2026-11-19
- **Area:** Auth, audit attribution
- **Relation:** Freecomers admin sign-in is described in [ADR 0002](0002-saas-admin-console-auth-via-freecomers-laravel.md).

## Context
- **How a Freecomers admin signs in to FestiPlus:**
  - **Launch Festival Portal** (`saasAdmin.controller.js` › `generateLaunchToken`);
  - the `admins` table password login;
  - Google login (`auth.service.js`).
- **What the token carries:** all three signed `id = admins.id`, with `role: 'admin'` and `isSuperAdmin: true`. Everywhere else, `req.user.id` / `user.id` means a `users` table id.
- **The collision:** on dev `admins.id = 1`, and `users.id = 1` is a real person (SHASHANK). With the Freecomers admin signed in:
  - Team marked SHASHANK as "your logged-in account", so his Delete was disabled.
  - QR scans showed "Scanned by SHASHANK".
  - Every admin action (submission logs, print logs, approvals, tasks, chat) was recorded as him.
- **Write sites also defaulted to user 1:** `|| 1`, `: 1`.
- **Separate leak, same root idea:** `getProfile` treated `users.id 1`, and "admin of any festival", as a platform admin. It added that user to `user_event_groups` as **admin** of whichever festival they opened, and the festival comes from a request header. On dev, SHASHANK had become Admin of two other festivals.

## Decision
1. **`req.user.id` is a `users.id` or `null`.**
   - `auth.middleware.js` › `toRequestUser` turns a Freecomers-admin token into `id: null, userIds: [], adminId, isFreecomersAdmin: true`.
   - Only those issuers use `role: 'admin'` + `isSuperAdmin`, so tokens already issued are covered.
   - `/auth/me` and the admin login responses return `id: null, adminId, isFreecomersAdmin`.
2. **`backend/src/core/utils/actor.js` decides who acted:**
   - `actorUserId(req)`: the users.id, or null.
   - `actorAdminId(req)`: the admin's id, or null.
   - `requiredActorUserId(req, eventId)`: for NOT NULL user columns; falls back to the festival owner's `events.user_id`, a real account read per festival.
   - `logActor(req)`: `[actor_user_id, actor_admin_id]` for `submission_logs`.
   - **Never fall back to a fixed id.**
3. **"Freecomers Admin" where an action is shown by name.**
   - Migration 029 adds nullable `screening_checkins.scanned_by_admin_id`, `submission_logs.actor_admin_id`, `qr_print_log.printed_by_admin_id` and `kashish_results_publications.published_by_admin_id` (additive).
   - When the admin column is set, the name shows as "Freecomers Admin" (`FREECOMERS_ADMIN_LABEL`): Attendance scan log and its search, print status, submission activity, published results.
4. **Actions that need a real person refuse an admin (403):** jury scorecards and ballots, sending chat messages.
5. **Automatic Admin membership is only for the festival's owner** (`events.user_id`). The `allUserIds.includes(1)` and "admin of any festival" rules are removed.

## Consequences
- **Admin actions:** they are never attributed to an unrelated user. In NOT NULL user columns of shared tables (e.g. `saas_attendees.registered_by_user_id`), an admin action is recorded under the festival owner's account.
- **Admin column:** where the table has one, it is the source of truth for display.
- **Old data:** existing rows written before this change (e.g. older scans "by SHASHANK") cannot be told apart and are unchanged.
- **Production:** `admins.id` may collide with a different user there. Check `user_event_groups` for Admin rows of `users.id = (SELECT MIN(id) FROM admins)` (execution plan › Needs action).
- **The Freecomers admin's own lists:** "my tasks", "my chats" and "my assignments" are empty for an admin.
