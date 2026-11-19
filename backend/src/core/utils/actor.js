/**
 * Who is acting on a request (docs/adr/0007-freecomers-admin-identity.md).
 *
 * `req.user.id` is a `users` table id, or null for a Freecomers admin (auth.middleware.js › toRequestUser).
 * Never fall back to a fixed id such as 1: users.id 1 is a real person.
 */

const { query } = require('../../config/database');

/** The signed-in person's users.id, or null (Freecomers admin, or no user). */
function actorUserId(req) {
  const id = req?.user?.id;
  return Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

/** The Freecomers admin's admins.id, or null for everyone else. */
function actorAdminId(req) {
  return req?.user?.isFreecomersAdmin && req.user.adminId ? Number(req.user.adminId) : null;
}

/**
 * For NOT NULL user columns: the signed-in person's users.id, else the festival owner's account
 * (events.user_id), so an admin action is never recorded as an unrelated user. Pair it with the matching
 * `*_admin_id` column where the table has one, so the action shows as "Freecomers Admin".
 */
async function requiredActorUserId(req, eventId = null) {
  const own = actorUserId(req);
  if (own) return own;
  const event = eventId || req?.headers?.['x-event-id'] || req?.headers?.['x-edition-id'] || req?.headers?.['x-festival-id'] || req?.query?.eventId;
  if (!event) return null;
  const rows = await query('SELECT user_id FROM events WHERE event_id = ? LIMIT 1', [event]);
  return rows[0]?.user_id || null;
}

/** [actor_user_id, actor_admin_id] for a submission_logs row (actor_user_id is NOT NULL). */
async function logActor(req, eventId = null) {
  return [await requiredActorUserId(req, eventId), actorAdminId(req)];
}

/** Label for an action recorded with an admin id. */
const FREECOMERS_ADMIN_LABEL = 'Freecomers Admin';

module.exports = { actorUserId, actorAdminId, requiredActorUserId, logActor, FREECOMERS_ADMIN_LABEL };
