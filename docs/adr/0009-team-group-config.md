# ADR 0009: Team › Group Config

- **Status:** Accepted
- **Date:** 2026-11-23
- **Area:** Team, permissions
- **Relation:** who changed a group is recorded as in [ADR 0007](0007-freecomers-admin-identity.md); invites that use a group are from [ADR 0008](0008-team-invitations.md).

## Context
- The Team page had **Add Custom Group**. It could only create groups:
  - there was no way to edit or delete a custom group in the UI;
  - the default groups' permissions were not shown anywhere.
- **Default groups** (Admin, Jury, Volunteer) are the same for every festival. Their grants are in `module_groups_permissions`, which `sync_specs_to_database.js` rebuilds from the spec on every `npm run migrate`. A per-festival edit would be wiped on the next deploy.
- **Custom groups** belong to one festival:
  - `event_custom_groups.event_id`, with grants in `event_custom_group_permissions` (permission, scope) and members in `user_event_custom_groups`;
  - hidden per-user groups named `user_<id>_custom` exist and must stay hidden.
- **Problems found:**
  - Create accepted any scope string and raw permission ids.
  - A request without the festival header created the group in festival 1.
  - Permission checks didn't confirm that a membership's group belonged to the same festival as the membership.
  - A custom group could include `team:manage`. Its members could then make anyone, themselves included, a festival Admin.

## Decision
1. **Group Config replaces Add Custom Group.**
   - `/team/groups`: the overview.
   - `/team/groups/view/:key`, where key is `admin` / `jury` / `volunteer` / `custom_<id>`: one group read-only, with its members.
   - `/team/groups/new` and `/team/groups/:id`: create and edit.
   - Code: `components/team/GroupConfig.jsx`, plus the form in `TeamPage.jsx`.
   - Anyone with `team:view` can look. Only festival Admins can change groups: a Freecomers admin, the festival owner, or the Admin group (`teamGroups.isFestivalAdmin`).
2. **Default groups are read-only.** To give someone a different set, **Duplicate as custom group**; new groups can also start from any group ("Start from").
3. **Custom groups can be edited and deleted** (`teamGroups.service.js`):
   - **Validation** (`validateGroupInput`):
     - name 2–60 characters, not a default group's name or `user_<id>_custom`, and unique within the festival in any case;
     - description up to 300 characters;
     - permissions by key only, which must exist; scope one of `all` / `jury_panel` / `assigned`;
     - at least one permission.
   - **Writes** run in a transaction.
   - **Edit page:** shows what changes and which members get it right away.
   - **Two admins editing at once:** migration 032 adds `updated_at` and `updated_by_user_id` / `updated_by_admin_id`. A save sends the `updatedAt` it started from, and a stale one gets 409.
   - **Delete:** shows the members and pending invites first (`GET /custom-groups/:id/usage`). Members keep their default groups; anyone with no default group left gets Volunteer. The group is removed from invites, and an invite left with nothing becomes Volunteer.
4. **A custom group belongs to one festival only.**
   - Every endpoint needs the festival header (400 otherwise) and looks the group up by `id` and `event_id`, so another festival's group is 404.
   - Permission checks, profiles and member counts join `event_custom_groups … AND ecg.event_id = uecg.event_id` (`permission.middleware.js`, `permission.service.js`, `auth.service.js`, `team.controller.js`), so a stray cross-festival row grants nothing.
5. **Escalation rule (`assertCanGrant`):** only festival Admins can give someone the Admin group, or a custom group that includes a sensitive permission (`team:manage`, `settings:manage`). This covers adding and editing members and editing invites. The permission list marks those permissions **Sensitive**, and marks permissions of modules the festival hasn't turned on **Module off**.

## API
- `GET /api/team/groups` (`team:view`) returns:
  - `defaultGroups` and `customGroups` (permissions, scopes, members, invite count, last change);
  - `enabledModules`, `sensitivePermissions`, `scopes`, `canManage` and `limits`.
- `GET /api/team/custom-groups`, `GET /api/team/custom-groups/:id` and `GET /api/team/custom-groups/:id/usage` (`team:view`).
- These need `team:manage` and festival Admin:
  - `POST /api/team/custom-groups` `{ name, description, permissions: [{ key, scopeKey }] }`;
  - `PUT /api/team/custom-groups/:id` (the same, plus `expectedUpdatedAt`);
  - `DELETE /api/team/custom-groups/:id`.

## Consequences
- Admins can change a custom group without recreating it. The changes reach its members at their next request; their menus update after a reload.
- Default groups can still only change through the spec (`sync_specs_to_database.js`).
- Two festivals can each have a group with the same name.
