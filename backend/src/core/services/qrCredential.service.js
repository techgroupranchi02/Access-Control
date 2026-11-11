/**
 * QR Credential Service (docs/adr/0001)
 *
 * Badge credentials live in `saas_qr`:
 *   - qr_data   : UUID v4, encoded in the QR image (machine credential, globally unique)
 *   - serial_no : random 6-digit code printed on the badge, typed when the camera fails
 *                 (human credential, UNIQUE per event via uk_event_serial)
 *
 *   - sequence_no : running number per event (#1, #2 …) in creation order, permanent and never
 *                 reused (ADR 0001, Amendment 3). Display only, NOT a credential.
 *
 * Legacy rows from other services (BISFF2026-…, ZDFC2026-…, Laravel UUIDs without serial)
 * still resolve by exact `qr_data`. The delegate label `KB26-xxxx` and raw attendee ids are
 * NOT credentials and are never resolved here.
 */

const crypto = require('crypto');
const { query, getConnection } = require('../../config/database');
const { getFilmFestivalId } = require('./festivalIds.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIAL_RE = /^\d{6}$/;
const MAX_ROUNDS = 10;

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function isSerial(value) {
  return SERIAL_RE.test(String(value || ''));
}

function generateSerial() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Trims input and extracts `code=` from a scanned URL, if present.
 */
function normalizeCredential(raw) {
  let value = raw == null ? '' : String(raw).trim();
  const match = value.match(/[?&]code=([A-Za-z0-9-]+)/);
  if (match) value = match[1];
  return value;
}

// ── Sequence numbers (ADR 0001, Amendment 3) ─────────────────────────────────

/**
 * Gives the listed rows (in this order) the next sequence numbers of their event: the event's
 * highest sequence_no + 1 onwards. Must run inside withSequenceLock, so two callers never read
 * the same highest number. Only rows still without a number are touched.
 */
async function numberRows(conn, eventId, qrIds) {
  if (!qrIds.length) return new Map();
  const [[row]] = await conn.query('SELECT COALESCE(MAX(sequence_no), 0) AS last_seq FROM saas_qr WHERE event_id = ?', [eventId]);
  const first = Number(row.last_seq) + 1;
  const assigned = new Map(qrIds.map((id, i) => [Number(id), first + i]));

  for (let i = 0; i < qrIds.length; i += 500) {
    const chunk = qrIds.slice(i, i + 500);
    const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
    const params = chunk.flatMap((id) => [id, assigned.get(Number(id))]);
    await conn.query(
      `UPDATE saas_qr SET sequence_no = CASE qr_id ${cases} END
       WHERE qr_id IN (${chunk.map(() => '?').join(', ')}) AND sequence_no IS NULL`,
      [...params, ...chunk]
    );
  }
  return assigned;
}

/**
 * Runs fn(conn) in a transaction while holding this event's numbering lock (a MySQL named lock),
 * so concurrent generators queue up. The lock is released only after the commit, so the next
 * caller sees the numbers just written. The unique key (event_id, sequence_no) is the backstop.
 */
async function withSequenceLock(eventId, fn) {
  const conn = await getConnection();
  const lockArgs = [`:qr_seq:${Number(eventId)}`];
  let locked = false;
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(CONCAT(DATABASE(), ?), 15) AS ok', lockArgs);
    if (Number(lock.ok) !== 1) throw new Error('Badge numbering is busy for this festival. Please try again.');
    locked = true;
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    if (locked) await conn.query('SELECT RELEASE_LOCK(CONCAT(DATABASE(), ?))', lockArgs).catch(() => {});
    conn.release();
  }
}

/**
 * Numbers any rows of this event that have no sequence number yet (for example rows inserted by
 * Laravel / festease_backend), in qr_id order. Cheap no-op when nothing is missing.
 */
async function assignMissingSequences(eventId) {
  const missing = await query('SELECT 1 FROM saas_qr WHERE event_id = ? AND sequence_no IS NULL LIMIT 1', [eventId]);
  if (missing.length === 0) return 0;
  return withSequenceLock(eventId, async (conn) => {
    const [rows] = await conn.query(
      'SELECT qr_id FROM saas_qr WHERE event_id = ? AND sequence_no IS NULL ORDER BY qr_id LIMIT 5000',
      [eventId]
    );
    await numberRows(conn, eventId, rows.map((r) => r.qr_id));
    return rows.length;
  });
}

/**
 * Creates `count` saas_qr rows for an event, each with a fresh UUID and a random serial
 * unique within the event. Uniqueness is enforced by the database (INSERT IGNORE + read-back),
 * so concurrent callers are safe. Each row gets the event's next sequence number.
 * Returns [{ qr_id, qr_data, serial_no, sequence_no }] in creation order.
 */
async function createQrRows(eventId, count, { attendeeId = null, festivalId = null } = {}) {
  const created = [];
  // festival_id is film_festivals.film_festival_id (what Laravel / festease_backend write), not the event id
  const fest = festivalId == null ? await getFilmFestivalId(eventId) : festivalId;
  // Rows other systems added first keep their place in the order
  await assignMissingSequences(eventId);

  for (let round = 0; round < MAX_ROUNDS && created.length < count; round++) {
    const needed = count - created.length;
    const candidates = [];
    const seenSerials = new Set();
    while (candidates.length < needed) {
      const serial = generateSerial();
      if (seenSerials.has(serial)) continue;
      seenSerials.add(serial);
      candidates.push({ qr_data: crypto.randomUUID(), serial_no: serial });
    }

    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, NOW(), NOW())').join(', ');
      const params = chunk.flatMap(c => [c.qr_data, c.serial_no, eventId, fest, attendeeId]);
      await query(
        `INSERT IGNORE INTO saas_qr (qr_data, serial_no, event_id, festival_id, attendee_id, created_at, updated_at)
         VALUES ${placeholders}`,
        params
      );

      // Read back which candidates actually landed (rows dropped by IGNORE = serial collisions)
      const inPh = chunk.map(() => '?').join(', ');
      const landed = await query(
        `SELECT qr_id, qr_data, serial_no FROM saas_qr WHERE qr_data IN (${inPh})`,
        chunk.map(c => c.qr_data)
      );
      const byUuid = new Map(landed.map(r => [r.qr_data, r]));
      for (const c of chunk) {
        const row = byUuid.get(c.qr_data);
        if (row) created.push(row);
      }
    }
  }

  if (created.length > 0) {
    const assigned = await withSequenceLock(eventId, (conn) => numberRows(conn, eventId, created.map((r) => r.qr_id)));
    created.forEach((r) => { r.sequence_no = assigned?.get(Number(r.qr_id)) ?? null; });
  }

  if (created.length < count) {
    const err = new Error(`Could only allocate ${created.length} of ${count} unique badge serials for this event.`);
    err.code = 'SERIAL_SPACE_EXHAUSTED';
    err.created = created;
    throw err;
  }
  return created;
}

async function createQrRow(eventId, opts = {}) {
  const [row] = await createQrRows(eventId, 1, opts);
  return row;
}

/**
 * Finds a saas_qr row in this event by its QR payload (exact qr_data) or by its 6-digit serial.
 * Returns { qr_id, qr_data, serial_no, sequence_no, attendee_id, is_lost, lost_at, matched_by } or null.
 * Callers must refuse rows with is_lost = 1 (ADR 0001, Amendment 2).
 */
async function findQrRow(eventId, rawCode) {
  const code = normalizeCredential(rawCode);
  if (!code) return null;

  let rows = await query(
    `SELECT qr_id, qr_data, serial_no, sequence_no, attendee_id, is_lost, lost_at FROM saas_qr
     WHERE qr_data = ? AND event_id = ? LIMIT 1`,
    [code, eventId]
  );
  if (rows.length > 0) return { ...rows[0], matched_by: 'qr_data' };

  if (isSerial(code)) {
    rows = await query(
      `SELECT qr_id, qr_data, serial_no, sequence_no, attendee_id, is_lost, lost_at FROM saas_qr
       WHERE event_id = ? AND serial_no = ? LIMIT 1`,
      [eventId, code]
    );
    if (rows.length > 0) return { ...rows[0], matched_by: 'serial' };
  }
  return null;
}

const ATTENDEE_COLUMNS = 'sa.attendee_id, sa.event_id, sa.name, sa.email, sa.phone, sa.delegate_category, sa.status, sa.qr_token, sa.custom_data';

/**
 * Resolves a typed or scanned credential to an attendee of this event.
 * Order: QR payload (saas_qr.qr_data) → attendee qr_token → 6-digit serial.
 * Returns { attendee, qr, matchedBy, strong }, { lost: true, lost_at, qr } for a badge reported
 * lost, or null.
 *   strong = true only for an exact UUID match (safe as a sole credential, e.g. public voting).
 */
async function resolveAttendee(eventId, rawCode) {
  const code = normalizeCredential(rawCode);
  if (!code) return null;

  const qr = await findQrRow(eventId, code);
  if (qr && Number(qr.is_lost) === 1) {
    return { lost: true, lost_at: qr.lost_at, qr };
  }
  if (qr && qr.attendee_id) {
    const rows = await query(
      `SELECT ${ATTENDEE_COLUMNS} FROM saas_attendees sa WHERE sa.attendee_id = ? LIMIT 1`,
      [qr.attendee_id]
    );
    if (rows.length > 0) {
      return { attendee: rows[0], qr, matchedBy: qr.matched_by, strong: qr.matched_by === 'qr_data' && isUuid(code) };
    }
  }

  const byToken = await query(
    `SELECT ${ATTENDEE_COLUMNS} FROM saas_attendees sa
     WHERE sa.qr_token = ? AND sa.event_id = ? LIMIT 1`,
    [code, eventId]
  );
  if (byToken.length > 0) {
    return { attendee: byToken[0], qr: null, matchedBy: 'qr_token', strong: isUuid(code) };
  }
  return null;
}

/**
 * Second factor for weak credentials: the last 4 digits of the attendee's phone.
 */
function phoneLast4Matches(attendeePhone, input) {
  const given = String(input || '').replace(/\D/g, '');
  const stored = String(attendeePhone || '').replace(/\D/g, '');
  if (given.length < 4 || stored.length < 4) return false;
  return given.slice(-4) === stored.slice(-4);
}

/**
 * Display serial for an attendee's badge (saas_qr.serial_no of their linked row), or null.
 */
async function getBadgeSerial(attendeeId) {
  const rows = await query(
    'SELECT serial_no FROM saas_qr WHERE attendee_id = ? AND serial_no IS NOT NULL AND is_lost = 0 ORDER BY qr_id DESC LIMIT 1',
    [attendeeId]
  );
  return rows.length > 0 ? rows[0].serial_no : null;
}

/** Staff / voter-facing text for a badge that was reported lost. */
function lostBadgeMessage(lostAt) {
  const d = lostAt ? new Date(lostAt) : null;
  const when = d && !Number.isNaN(d.getTime())
    ? ` on ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
    : '';
  return `This badge was reported lost${when}. Ask the delegate for their new badge.`;
}

/**
 * Marks every active badge of a delegate in this event as lost (ADR 0001, Amendment 2) and closes
 * the second credential path (saas_attendees.qr_token). The rows keep attendee_id and serial_no,
 * so history stays and the 6-digit number is never reissued.
 * Used by the Lost Badge tab (report-lost) and the admin "Revoke QR" action.
 *
 * @returns {Promise<{ lostSerials: string[], count: number }>}
 */
async function markBadgesLost(eventId, attendeeId, userId) {
  const active = await query(
    `SELECT qr_id, serial_no FROM saas_qr
     WHERE attendee_id = ? AND event_id = ? AND is_lost = 0`,
    [attendeeId, eventId]
  );
  if (active.length > 0) {
    await query(
      `UPDATE saas_qr SET is_lost = 1, lost_at = CURRENT_TIMESTAMP, lost_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE qr_id IN (${active.map(() => '?').join(',')})`,
      [userId || null, ...active.map(r => r.qr_id)]
    );
  }
  await query(
    `UPDATE saas_attendees
     SET qr_token = NULL, status = CASE WHEN status = 'badge_issued' THEN 'registered' ELSE status END
     WHERE attendee_id = ? AND event_id = ?`,
    [attendeeId, eventId]
  );
  return { lostSerials: active.map(r => r.serial_no).filter(Boolean), count: active.length };
}

/** Badges of a delegate that were reported lost, newest first. */
async function getLostBadges(eventId, attendeeId) {
  return query(
    `SELECT qr_id, serial_no AS badge_serial, lost_at, lost_by_user_id FROM saas_qr
     WHERE attendee_id = ? AND event_id = ? AND is_lost = 1
     ORDER BY lost_at DESC, qr_id DESC`,
    [attendeeId, eventId]
  );
}

module.exports = {
  lostBadgeMessage,
  markBadgesLost,
  getLostBadges,
  isUuid,
  isSerial,
  normalizeCredential,
  createQrRows,
  createQrRow,
  assignMissingSequences,
  findQrRow,
  resolveAttendee,
  phoneLast4Matches,
  getBadgeSerial,
};
