/**
 * Team invitations (docs/adr/0008-team-invitations.md).
 *
 * Team access is a row in user_event_groups / user_event_custom_groups, which needs a users.id. Someone
 * without a Freecomers account gets a pending row in `team_invitations` instead and an email telling them to
 * create their Freecomers account with that email. The first time that email signs in to FestiPlus
 * (password or Google), claimInvitations() turns every pending invite into team access.
 *
 * Accounts are only ever created by Freecomers (OTP, consent, onboarding); FestiPlus never writes to the
 * shared users table here.
 */

const { query } = require('../../config/database');
const env = require('../../config/environment');
const { sendMail } = require('./mail.service');
const showWindows = require('./showWindows.service');
const { actorUserId, actorAdminId } = require('../utils/actor');
const { USER_STATUS } = require('../utils/userStatus');

/** Days an invite stays usable; Resend renews it. */
const INVITE_VALID_DAYS = 14;
/** Minimum gap between two sends of the same invite. */
const RESEND_COOLDOWN_MIN = 5;
/** Seat limit when the SaaS console hasn't set one for the festival (event_user_limits.max_users). */
const DEFAULT_SEAT_LIMIT = 25;

const STANDARD_GROUP_KEYS = ['admin', 'jury', 'volunteer'];

class InviteError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const normalizeEmail = (v) => String(v || '').trim().toLowerCase();
const isValidEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(v);
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function parseJson(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** Links used in emails and shown on the Team page. Built from env, never hard-coded. */
function accountLinks() {
  const site = env.freecomersSiteUrl;
  const app = String(env.frontendUrl || '').replace(/\/$/, '');
  return {
    signupUrl: `${site}/signup`,
    signinUrl: `${site}/signin`,
    siteUrl: site,
    loginUrl: `${app}/login`
  };
}

// ── Seats ────────────────────────────────────────────────────────────────────

/** The festival's team seat limit: set per festival in the SaaS console, else the default. */
async function teamSeatLimit(eventId) {
  const rows = await query('SELECT MAX(max_users) AS max_users FROM event_user_limits WHERE event_id = ?', [eventId]);
  const n = Number(rows[0]?.max_users);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SEAT_LIMIT;
}

/** Seats in use: distinct members plus pending, unexpired invites. */
async function seatUsage(eventId, { excludeInviteId = null } = {}) {
  const [members] = await query(
    `SELECT COUNT(DISTINCT user_id) AS n FROM (
       SELECT user_id FROM user_event_groups WHERE event_id = ?
       UNION SELECT user_id FROM user_event_custom_groups WHERE event_id = ?
     ) m`,
    [eventId, eventId]
  );
  const [invites] = await query(
    `SELECT COUNT(*) AS n FROM team_invitations
     WHERE event_id = ? AND status = 'pending' AND expires_at > NOW()${excludeInviteId ? ' AND id <> ?' : ''}`,
    excludeInviteId ? [eventId, excludeInviteId] : [eventId]
  );
  const limit = await teamSeatLimit(eventId);
  const used = Number(members.n) + Number(invites.n);
  return { members: Number(members.n), invites: Number(invites.n), used, limit, free: Math.max(0, limit - used) };
}

async function assertSeatFree(eventId, opts) {
  const usage = await seatUsage(eventId, opts);
  if (usage.used >= usage.limit) {
    throw new InviteError(403, `All ${usage.limit} team seats are in use (pending invites count too). Remove a member or cancel an invite first.`);
  }
  return usage;
}

// ── Groups ───────────────────────────────────────────────────────────────────

/**
 * Turn the Team page's group selection into valid keys for this festival: 'admin' | 'jury' | 'volunteer'
 * and 'custom_<id>' for the festival's own custom groups. Unknown keys are dropped.
 */
async function normalizeGroups(eventId, rawGroups) {
  const list = Array.isArray(rawGroups) ? rawGroups : (rawGroups ? [rawGroups] : []);
  const standard = new Set();
  const customIds = new Set();
  for (const g of list) {
    if (typeof g === 'number' && Number.isInteger(g)) { customIds.add(g); continue; }
    if (typeof g !== 'string') continue;
    const k = g.toLowerCase().trim();
    if (k.startsWith('custom_')) {
      const id = parseInt(k.slice(7), 10);
      if (Number.isInteger(id)) customIds.add(id);
    } else if (k.includes('admin')) standard.add('admin');
    else if (k.includes('jury') || k.includes('judge')) standard.add('jury');
    else if (k.includes('volunteer')) standard.add('volunteer');
  }
  const keys = STANDARD_GROUP_KEYS.filter((k) => standard.has(k));
  if (customIds.size) {
    const ids = [...customIds];
    const rows = await query(
      `SELECT id FROM event_custom_groups WHERE event_id = ? AND name NOT LIKE 'user\\_%\\_custom' AND id IN (${ids.map(() => '?').join(',')})`,
      [eventId, ...ids]
    );
    for (const r of rows) keys.push(`custom_${r.id}`);
  }
  return keys;
}

/** Display names for group keys, in the same order. */
async function groupLabels(eventId, keys) {
  if (!keys.length) return [];
  const std = keys.filter((k) => STANDARD_GROUP_KEYS.includes(k));
  const customIds = keys.filter((k) => k.startsWith('custom_')).map((k) => parseInt(k.slice(7), 10));
  const labels = new Map();
  if (std.length) {
    const rows = await query(`SELECT group_key, label FROM \`groups\` WHERE group_key IN (${std.map(() => '?').join(',')})`, std);
    for (const r of rows) labels.set(r.group_key, r.label || r.group_key);
  }
  if (customIds.length) {
    const rows = await query(`SELECT id, name FROM event_custom_groups WHERE event_id = ? AND id IN (${customIds.map(() => '?').join(',')})`, [eventId, ...customIds]);
    for (const r of rows) labels.set(`custom_${r.id}`, r.name);
  }
  return keys.filter((k) => labels.has(k)).map((k) => labels.get(k));
}

/**
 * Put a user in exactly these groups for the festival (replaces their previous groups). Accepts the same
 * values as the Team page: group keys, labels containing admin/jury/volunteer, 'custom_<id>' or custom ids.
 * Nothing selected means Volunteer.
 */
async function assignUserToGroups(userId, eventId, rawGroups) {
  const keys = await normalizeGroups(eventId, rawGroups);
  const standardKeys = keys.filter((k) => STANDARD_GROUP_KEYS.includes(k));
  const customIds = keys.filter((k) => k.startsWith('custom_')).map((k) => parseInt(k.slice(7), 10));
  // Every member needs a standard group for base festival membership (login's role gate reads it)
  if (!standardKeys.length) standardKeys.push('volunteer');

  await query('DELETE FROM user_event_groups WHERE user_id = ? AND event_id = ?', [userId, eventId]);
  await query('DELETE FROM user_event_custom_groups WHERE user_id = ? AND event_id = ?', [userId, eventId]);

  const stdRows = await query(`SELECT id FROM \`groups\` WHERE group_key IN (${standardKeys.map(() => '?').join(',')})`, standardKeys);
  for (const g of stdRows) {
    await query('INSERT IGNORE INTO user_event_groups (user_id, event_id, group_id) VALUES (?, ?, ?)', [userId, eventId, g.id]);
  }
  for (const cid of customIds) {
    await query('INSERT IGNORE INTO user_event_custom_groups (user_id, event_id, custom_group_id) VALUES (?, ?, ?)', [userId, eventId, cid]);
  }

  // Clean up any old ad-hoc override group
  const adHoc = await query('SELECT id FROM event_custom_groups WHERE event_id = ? AND name = ? LIMIT 1', [eventId, `user_${userId}_custom`]);
  if (adHoc.length) {
    await query('DELETE FROM event_custom_group_permissions WHERE custom_group_id = ?', [adHoc[0].id]);
    await query('DELETE FROM event_custom_groups WHERE id = ?', [adHoc[0].id]);
  }
  return keys.length ? keys : ['volunteer'];
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** The Freecomers account state for an email: 'none' | 'active' | 'onboarding' | 'unverified' | 'deactivated'. */
async function accountStateForEmail(email) {
  const rows = await query('SELECT status FROM users WHERE email = ?', [email]);
  if (!rows.length) return 'none';
  const statuses = rows.map((r) => (r.status === null ? USER_STATUS.ACTIVE : Number(r.status)));
  if (statuses.includes(USER_STATUS.ACTIVE)) return 'active';
  if (statuses.includes(USER_STATUS.ONBOARDING)) return 'onboarding';
  if (statuses.includes(USER_STATUS.UNVERIFIED)) return 'unverified';
  return 'deactivated';
}

async function isFreecomersAdminEmail(email) {
  const rows = await query('SELECT 1 FROM admins WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}

// ── Email ────────────────────────────────────────────────────────────────────

async function festivalName(eventId) {
  const rows = await query('SELECT name FROM events WHERE event_id = ? LIMIT 1', [eventId]);
  return rows[0]?.name || 'the festival';
}

function inviterName(req) {
  if (req?.user?.isFreecomersAdmin) return 'The Freecomers team';
  return (req?.user?.name || '').trim() || 'The festival team';
}

const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

async function formatExpiry(eventId, at) {
  let timeZone;
  try { ({ timeZone } = await showWindows.getWindowSettings(eventId)); } catch { timeZone = undefined; }
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(at));
  } catch {
    return new Date(at).toDateString();
  }
}

const BRAND = '#701a1e';
const button = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">${esc(label)}</a>`;
const linkButton = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#ffffff;color:${BRAND};text-decoration:none;font-weight:600;font-size:14px;padding:10px 21px;border-radius:8px;border:1px solid ${BRAND};">${esc(label)}</a>`;

function layout({ title, festival, bodyHtml }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title></head>
<body style="margin:0;padding:24px 10px;background-color:#f2eee9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:600px;margin-bottom:10px;" border="0" cellspacing="0" cellpadding="0">
      <tr><td align="left" style="font-size:11px;color:#78716c;">${esc(festival)} &bull; FestiPlus</td></tr>
    </table>
    <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;border:1px solid #e7ded4;" border="0" cellspacing="0" cellpadding="0">
      <tr><td style="padding:32px;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
    </table>
    <table role="presentation" width="100%" style="max-width:600px;margin-top:18px;text-align:center;font-size:11px;color:#a8a29e;" border="0" cellspacing="0" cellpadding="0">
      <tr><td>&copy; ${year} ${esc(festival)} &amp; Freecomers</td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

/** Email to someone who has no usable Freecomers account yet (none, or not verified). */
async function buildInviteEmail({ eventId, email, groupNames, inviter, expiresAt, accountState }) {
  const festival = await festivalName(eventId);
  const links = accountLinks();
  const roles = joinList(groupNames.length ? groupNames : ['Volunteer']);
  const expiry = await formatExpiry(eventId, expiresAt);
  const unverified = accountState === 'unverified';
  const subject = `You're invited to join the ${festival} team`;

  const step1Html = unverified
    ? `<p style="margin:0 0 8px;"><strong>1. Finish verifying your Freecomers account.</strong> You started signing up with <strong>${esc(email)}</strong> but haven't verified it yet. Sign in to Freecomers with this email and enter the code it sends you.</p>
       <p style="margin:0 0 22px;">${button(links.signinUrl, 'Verify on Freecomers')}</p>`
    : `<p style="margin:0 0 8px;"><strong>1. Create your free Freecomers account</strong> with this exact email address: <strong>${esc(email)}</strong></p>
       <p style="margin:0 0 22px;">${button(links.signupUrl, 'Create Freecomers account')}</p>`;

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-size:21px;color:${BRAND};">Join the ${esc(festival)} team</h1>
    <p style="margin:0 0 18px;">${esc(inviter)} has invited you to the <strong>${esc(festival)}</strong> team on FestiPlus as <strong>${esc(roles)}</strong>.</p>
    ${step1Html}
    <p style="margin:0 0 8px;"><strong>2. Sign in to FestiPlus</strong> with the same email and password, or with Google using the same email. You'll go straight to ${esc(festival)}.</p>
    <p style="margin:0 0 22px;">${linkButton(links.loginUrl, 'Sign in to FestiPlus')}</p>
    <p style="margin:0;font-size:12.5px;color:#78716c;">This invitation is for ${esc(email)} only and expires on ${esc(expiry)}. If you sign up with a different email, ask the festival team to invite that address instead. If you weren't expecting this, you can ignore it.</p>`;

  const text = [
    `Join the ${festival} team`,
    '',
    `${inviter} has invited you to the ${festival} team on FestiPlus as ${roles}.`,
    '',
    unverified
      ? `1. Finish verifying your Freecomers account (${email}): sign in at ${links.signinUrl} and enter the code it sends you.`
      : `1. Create your free Freecomers account with this exact email address (${email}): ${links.signupUrl}`,
    `2. Sign in to FestiPlus with the same email and password, or with Google using the same email: ${links.loginUrl}`,
    '',
    `This invitation is for ${email} only and expires on ${expiry}.`
  ].join('\n');

  return { subject, html: layout({ title: subject, festival, bodyHtml }), text };
}

/** Email to someone who already has an account and was just added to the team. */
async function buildAddedEmail({ eventId, groupNames, inviter }) {
  const festival = await festivalName(eventId);
  const { loginUrl } = accountLinks();
  const roles = joinList(groupNames.length ? groupNames : ['Volunteer']);
  const subject = `You've been added to the ${festival} team`;
  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-size:21px;color:${BRAND};">Welcome to the ${esc(festival)} team</h1>
    <p style="margin:0 0 18px;">${esc(inviter)} has added you to the <strong>${esc(festival)}</strong> team on FestiPlus as <strong>${esc(roles)}</strong>.</p>
    <p style="margin:0 0 22px;">Sign in with your Freecomers email and password, or with Google using the same email.</p>
    <p style="margin:0 0 22px;">${button(loginUrl, 'Sign in to FestiPlus')}</p>
    <p style="margin:0;font-size:12.5px;color:#78716c;">If you weren't expecting this, you can ignore it.</p>`;
  const text = [
    `Welcome to the ${festival} team`,
    '',
    `${inviter} has added you to the ${festival} team on FestiPlus as ${roles}.`,
    `Sign in with your Freecomers email and password, or with Google using the same email: ${loginUrl}`
  ].join('\n');
  return { subject, html: layout({ title: subject, festival, bodyHtml }), text };
}

/** Plain-text invite staff can copy into WhatsApp or their own email when sending fails. */
async function inviteText(eventId, invitation) {
  const groupNames = await groupLabels(eventId, invitation.groups);
  const state = await accountStateForEmail(invitation.email);
  const { text } = await buildInviteEmail({
    eventId, email: invitation.email, groupNames, inviter: 'The festival team',
    expiresAt: invitation.expiresAt, accountState: state
  });
  return text;
}

// ── Invitations ──────────────────────────────────────────────────────────────

async function loadRow(eventId, id) {
  const rows = await query('SELECT * FROM team_invitations WHERE id = ? AND event_id = ? LIMIT 1', [id, eventId]);
  if (!rows.length) throw new InviteError(404, 'Invitation not found.');
  return rows[0];
}

async function shape(eventId, row) {
  const groups = parseJson(row.groups_json, []);
  let invitedBy = null;
  if (row.invited_by_admin_id) invitedBy = 'Freecomers Admin';
  else if (row.invited_by_user_id) {
    const u = await query('SELECT COALESCE(i.name, o.name, u.email) AS name FROM users u LEFT JOIN individuals i ON i.user_id = u.id LEFT JOIN organizations o ON o.user_id = u.id WHERE u.id = ? LIMIT 1', [row.invited_by_user_id]);
    invitedBy = u[0]?.name || null;
  }
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const lastSent = row.last_sent_at ? new Date(row.last_sent_at) : null;
  const resendAvailableAt = lastSent ? new Date(lastSent.getTime() + RESEND_COOLDOWN_MIN * 60000) : null;
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    expired: row.status === 'pending' && expiresAt && expiresAt.getTime() <= Date.now(),
    groups,
    groupNames: await groupLabels(eventId, groups),
    accountState: await accountStateForEmail(row.email),
    invitedBy,
    sendCount: row.send_count,
    lastSentAt: lastSent,
    lastSendError: row.last_send_error || null,
    resendAvailableAt: resendAvailableAt && resendAvailableAt.getTime() > Date.now() ? resendAvailableAt : null,
    expiresAt,
    createdAt: row.created_at
  };
}

/** Pending invitations for the festival (expired ones too, flagged, so staff can resend or cancel). */
async function listPending(eventId) {
  const rows = await query("SELECT * FROM team_invitations WHERE event_id = ? AND status = 'pending' ORDER BY created_at DESC, id DESC", [eventId]);
  const out = [];
  for (const r of rows) out.push(await shape(eventId, r));
  return out;
}

async function deliver(eventId, row, req) {
  const groups = parseJson(row.groups_json, []);
  const groupNames = await groupLabels(eventId, groups);
  const accountState = await accountStateForEmail(row.email);
  let result;
  try {
    const msg = await buildInviteEmail({ eventId, email: row.email, groupNames, inviter: inviterName(req), expiresAt: row.expires_at, accountState });
    result = await sendMail({ to: row.email, ...msg });
  } catch (err) {
    console.error('[TeamInvites] Could not build or send the invite:', err.message);
    result = { sent: false, to: row.email, reason: 'The invite email could not be prepared.' };
  }
  await query(
    `UPDATE team_invitations SET last_sent_at = NOW(), send_count = send_count + ?, last_send_error = ? WHERE id = ?`,
    [result.sent ? 1 : 0, result.sent ? null : String(result.reason || 'Not sent').slice(0, 255), row.id]
  );
  return { sent: Boolean(result.sent), reason: result.sent ? null : result.reason };
}

/**
 * Invite an email that has no usable Freecomers account. Re-inviting an email whose earlier invite was
 * accepted or cancelled reuses the row. Throws InviteError (status, message).
 * @returns {Promise<{ invitation, email: { sent, reason } }>}
 */
async function createInvitation({ eventId, email: rawEmail, groups: rawGroups, req }) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new InviteError(400, 'Enter a valid email address.');
  if (await isFreecomersAdminEmail(email)) throw new InviteError(400, 'This email belongs to a Freecomers admin, who already has full access to every festival.');
  const state = await accountStateForEmail(email);
  if (state === 'deactivated') throw new InviteError(400, 'This Freecomers account is deactivated. Ask Freecomers support to reactivate it first.');
  if (state === 'active' || state === 'onboarding') throw new InviteError(409, 'This email already has a Freecomers account. Search for it and add it directly.', { code: 'has_account' });

  const groups = await normalizeGroups(eventId, rawGroups);
  if (!groups.length) groups.push('volunteer');

  const existing = await query('SELECT * FROM team_invitations WHERE event_id = ? AND email = ? LIMIT 1', [eventId, email]);
  if (existing.length && existing[0].status === 'pending') {
    throw new InviteError(409, `${email} has already been invited. Use Resend in the team list.`, { code: 'already_invited', invitationId: existing[0].id });
  }
  await assertSeatFree(eventId);

  const by = [actorUserId(req), actorAdminId(req)];
  let id;
  if (existing.length) {
    id = existing[0].id;
    await query(
      `UPDATE team_invitations SET groups_json = ?, status = 'pending', invited_by_user_id = ?, invited_by_admin_id = ?,
         send_count = 0, last_sent_at = NULL, last_send_error = NULL, expires_at = DATE_ADD(NOW(), INTERVAL ? DAY),
         accepted_user_id = NULL, accepted_at = NULL
       WHERE id = ?`,
      [JSON.stringify(groups), ...by, INVITE_VALID_DAYS, id]
    );
  } else {
    const ins = await query(
      `INSERT INTO team_invitations (event_id, email, groups_json, status, invited_by_user_id, invited_by_admin_id, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [eventId, email, JSON.stringify(groups), ...by, INVITE_VALID_DAYS]
    );
    id = ins.insertId;
  }
  const row = await loadRow(eventId, id);
  const sent = await deliver(eventId, row, req);
  console.log(`[TeamInvites] Invited ${email} to event ${eventId} as ${groups.join(', ')} (email ${sent.sent ? 'sent' : `not sent: ${sent.reason}`})`);
  return { invitation: await shape(eventId, await loadRow(eventId, id)), email: sent };
}

/** Send a pending invite again; an expired one is renewed (if a seat is free). */
async function resendInvitation({ eventId, id, req }) {
  const row = await loadRow(eventId, id);
  if (row.status !== 'pending') throw new InviteError(409, 'This invitation is no longer pending.');
  if (row.last_sent_at && !row.last_send_error) {
    const wait = new Date(row.last_sent_at).getTime() + RESEND_COOLDOWN_MIN * 60000 - Date.now();
    if (wait > 0) throw new InviteError(429, `The invite was sent a moment ago. You can resend it in ${Math.ceil(wait / 60000)} min.`);
  }
  const expired = new Date(row.expires_at).getTime() <= Date.now();
  if (expired) await assertSeatFree(eventId, { excludeInviteId: row.id });
  await query('UPDATE team_invitations SET expires_at = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?', [INVITE_VALID_DAYS, row.id]);
  const sent = await deliver(eventId, await loadRow(eventId, id), req);
  return { invitation: await shape(eventId, await loadRow(eventId, id)), email: sent };
}

async function updateInvitationGroups({ eventId, id, groups: rawGroups }) {
  const row = await loadRow(eventId, id);
  if (row.status !== 'pending') throw new InviteError(409, 'This invitation is no longer pending.');
  const groups = await normalizeGroups(eventId, rawGroups);
  if (!groups.length) throw new InviteError(400, 'Pick at least one group.');
  await query('UPDATE team_invitations SET groups_json = ? WHERE id = ?', [JSON.stringify(groups), row.id]);
  return shape(eventId, await loadRow(eventId, id));
}

async function revokeInvitation({ eventId, id }) {
  const row = await loadRow(eventId, id);
  if (row.status !== 'pending') throw new InviteError(409, 'This invitation is no longer pending.');
  await query("UPDATE team_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'", [row.id]);
  console.log(`[TeamInvites] Cancelled the invite for ${row.email} (event ${eventId})`);
}

/** An existing account was added directly: close any pending invite for the same email. */
async function markAcceptedForEmail(eventId, email, userId) {
  await query(
    "UPDATE team_invitations SET status = 'accepted', accepted_user_id = ?, accepted_at = NOW() WHERE event_id = ? AND email = ? AND status = 'pending'",
    [userId, eventId, normalizeEmail(email)]
  );
}

/**
 * Called at login (password and Google), before the role gate: turn every pending, unexpired invite for
 * this email into team access for the account that signed in. Never throws; returns the festivals joined.
 * @param {string} email
 * @param {number} userId the account that signed in
 * @param {number[]} allUserIds every account with this email (individual + organization)
 */
async function claimInvitations(email, userId, allUserIds = [userId]) {
  const claimed = [];
  try {
    const rows = await query(
      `SELECT ti.* FROM team_invitations ti
       JOIN events e ON e.event_id = ti.event_id AND e.is_deleted = 0
       WHERE ti.email = ? AND ti.status = 'pending' AND ti.expires_at > NOW()`,
      [normalizeEmail(email)]
    );
    const ids = allUserIds.length ? allUserIds : [userId];
    for (const row of rows) {
      // Conditional update: two logins at once claim it only once
      const upd = await query(
        "UPDATE team_invitations SET status = 'accepted', accepted_user_id = ?, accepted_at = NOW() WHERE id = ? AND status = 'pending'",
        [userId, row.id]
      );
      if (!upd.affectedRows) continue;
      const member = await query(
        `SELECT 1 FROM user_event_groups WHERE event_id = ? AND user_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,
        [row.event_id, ...ids]
      );
      if (member.length) { claimed.push(row.event_id); continue; } // added directly meanwhile: keep their groups
      const groups = parseJson(row.groups_json, []);
      const valid = await normalizeGroups(row.event_id, groups);
      if (!valid.length) console.warn(`[TeamInvites] Invite ${row.id}: none of its groups exist any more, added as Volunteer`);
      await assignUserToGroups(userId, row.event_id, valid);
      claimed.push(row.event_id);
      console.log(`[TeamInvites] ${row.email} accepted the invite to event ${row.event_id} as user ${userId}`);
    }
  } catch (err) {
    console.error('[TeamInvites] claimInvitations failed:', err.message);
  }
  return claimed;
}

/** For the login error: the festival name of a pending, unexpired invite for this email, or null. */
async function pendingInviteFestival(email) {
  try {
    const rows = await query(
      `SELECT e.name FROM team_invitations ti JOIN events e ON e.event_id = ti.event_id AND e.is_deleted = 0
       WHERE ti.email = ? AND ti.status = 'pending' AND ti.expires_at > NOW() ORDER BY ti.created_at DESC LIMIT 1`,
      [normalizeEmail(email)]
    );
    return rows[0]?.name || null;
  } catch {
    return null;
  }
}

/** Tell an existing account it was added to the team. Never throws. */
async function sendAddedEmail({ eventId, email, groups, req }) {
  if (!email) return { sent: false, reason: 'No email address.' };
  try {
    const groupNames = await groupLabels(eventId, await normalizeGroups(eventId, groups));
    const msg = await buildAddedEmail({ eventId, groupNames, inviter: inviterName(req) });
    const r = await sendMail({ to: email, ...msg });
    return { sent: Boolean(r.sent), reason: r.sent ? null : r.reason };
  } catch (err) {
    console.error('[TeamInvites] Could not send the added email:', err.message);
    return { sent: false, reason: 'The email could not be prepared.' };
  }
}

module.exports = {
  InviteError,
  INVITE_VALID_DAYS,
  RESEND_COOLDOWN_MIN,
  DEFAULT_SEAT_LIMIT,
  normalizeEmail,
  isValidEmail,
  accountLinks,
  teamSeatLimit,
  seatUsage,
  assertSeatFree,
  normalizeGroups,
  groupLabels,
  assignUserToGroups,
  accountStateForEmail,
  listPending,
  createInvitation,
  resendInvitation,
  updateInvitationGroups,
  revokeInvitation,
  markAcceptedForEmail,
  claimInvitations,
  pendingInviteFestival,
  sendAddedEmail,
  inviteText,
  buildInviteEmail,
  buildAddedEmail
};
