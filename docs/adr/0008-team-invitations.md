# ADR 0008: Team invitations for people without a Freecomers account

- **Status:** Accepted
- **Date:** 2026-11-23
- **Area:** Team, auth
- **Relation:** who acted is recorded per [ADR 0007](0007-freecomers-admin-identity.md); outgoing email uses the setup from [ADR 0006](0006-festiplus-delegate-confirmation-email.md).

## Context
- **Team access needs an account.** It is a row in `user_event_groups` / `user_event_custom_groups`, keyed by `users.id`, and login's role gate (`auth.service.js` › `checkFestivalRoles`) reads only those rows. Team › Add Team Member could only add people who already had a Freecomers account, and it showed a hard-coded `next.autovertest.com/signin` hint (wrong on production).
- **Requirement:** add someone who has no account yet, email them to register on Freecomers, then let them sign in to FestiPlus with the same email and password.
- **Freecomers account status** (`users.status`, set by Laravel `SocialAuthController` / `NewAccountPopupController`):
  - 0 = signed up, email OTP not verified;
  - 2 = email verified, onboarding (interests / profile) not finished;
  - 1 = onboarding finished;
  - 3 = deactivated.
  FestiPlus accepted only 1, so a person who verified their email but skipped onboarding passed the Laravel password check and then got "User account not found or deactivated".
- **Emails aren't unique in `users`:** one person can have an individual and an organization account with the same email.
- **Same controller, older problem:** `team.update` wrote `users.email` and `individuals.name` for any user id, without checking the person was in the festival. That let any festival admin change any Freecomers user's login email.

## Decision
1. **FestiPlus keeps a pending invite; Freecomers stays the only place accounts are made.**
   - Table `team_invitations` (migration 031, FestiPlus-owned):
     - one row per festival + email (unique);
     - groups as JSON, using the same keys as the Team page;
     - status `pending` / `accepted` / `revoked`;
     - inviter (`invited_by_user_id` / `invited_by_admin_id`, ADR 0007);
     - send count, last sent, last send error, `expires_at`;
     - accepted user and time.
   - Rejected: FestiPlus creating the account with a "set password" link. It would write to the shared `users` table and skip Laravel's OTP, consent and onboarding.
2. **The invite is claimed at sign-in.**
   - `teamInvites.claimInvitations(email, userId, allUserIds)` runs in `login` and `loginWithGoogle`, before the role gate. It turns every pending, unexpired invite for that email (festival not deleted) into team access for the account that signed in.
   - A conditional `UPDATE … WHERE status = 'pending'` means two logins at once claim it only once.
   - If the person was added directly in the meantime, their groups are kept.
   - Groups that no longer exist are dropped. If none are left, they join as Volunteer.
3. **A verified email is enough to sign in.**
   - `core/utils/userStatus.js` › `SIGN_IN_STATUSES = [1, 2]` and `canSignInSql()` are used by login, Google login, `getProfile` and the linked-account lookups (`edition.service.js`, `permission.middleware.js`, `permission.service.js`, `review.controller.js`).
   - 0 and 3 still can't sign in.
4. **Who gets an invite and who is added directly:**
   - No account, or only an unverified (0) one → invite. The email says either "create your Freecomers account with this exact email" or "finish verifying".
   - Status 1 or 2 → added directly, plus a "You've been added" email with the sign-in link.
   - Deactivated (3) and Freecomers admin emails are refused.
   - An unverified duplicate of an email that already has a working account is hidden from search.
5. **Seats.**
   - The limit comes from the SaaS console's `event_user_limits.max_users`, with 25 when none is set (`teamSeatLimit`).
   - Usage is distinct members plus pending, unexpired invites, so claims never go over the limit.
6. **Invite lifetime and resending.**
   - Invites last 14 days (`INVITE_VALID_DAYS`). Resend renews an expired invite if a seat is free.
   - Resend waits 5 minutes between sends (`RESEND_COOLDOWN_MIN`), unless the last send failed.
   - When sending fails, the invite is still saved and the reason is shown.
   - **Copy invite** gives the same text to share another way.
7. **Links come from env.** Freecomers signup and sign-in come from `FREECOMERS_SITE_URL` (`/signup`, `/signin`); the FestiPlus sign-in link comes from `FRONTEND_URL` (`/login`). The signup link has no `redirect`, because Freecomers onboarding handles external redirects inconsistently.
8. **Login messages.** If an email has a pending invite but no account that can sign in, login says what to do on Freecomers (create or verify the account). It doesn't name the festival.
9. **`team.update` changes only festival groups.** Name and email belong to the Freecomers account. `update` and `remove` return 404 for people who aren't in the festival. The new and changed team endpoints refuse a missing festival header instead of falling back to festival 1.

## API
- `POST /api/team`:
  - `{ userId | email, groups }` adds an account, and returns `email: { sent, reason }`.
  - `{ email, invite: true, groups }` creates an invite, and returns `invitation` and `email`.
- `GET /api/team` also returns `invitations`, `seatsAllocated` (members + invites), `seatLimit` and `links`.
- `GET /api/team/search` returns `accountState` per account, plus `invite` when the query is an email: `canInvite`, `alreadyInvited` and the account state.
- `GET /api/team/invitations` (`team:view`).
- These need `team:manage`:
  - `POST /api/team/invitations/:id/resend`;
  - `PUT /api/team/invitations/:id` `{ groups }`;
  - `DELETE /api/team/invitations/:id`;
  - `GET /api/team/invitations/:id/text`.

## Consequences
- People can be invited before they have an account, and they join the team at their first sign-in, with nothing left for staff to do.
- People who skipped Freecomers onboarding can now use FestiPlus.
- An invite is tied to the exact email. If the person signs up with another address, staff cancel the invite and invite or add the right one.
- Freecomers signup doesn't pre-fill the email. That would be a small change in `freecomers_frontend_next` (separate team).
