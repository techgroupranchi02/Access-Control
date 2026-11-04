/**
 * QR Credential Service (docs/adr/0001)
 *
 * Badge credentials live in `saas_qr`:
 *   - qr_data   : UUID v4, encoded in the QR image (machine credential, globally unique)
 *   - serial_no : random 6-digit code printed on the badge, typed when the camera fails
 *                 (human credential, UNIQUE per event via uk_event_serial)
 *
 * Legacy rows from other services (BISFF2026-…, ZDFC2026-…, Laravel UUIDs without serial)
 * still resolve by exact `qr_data`. The delegate label `KB26-xxxx` and raw attendee ids are
 * NOT credentials and are never resolved here.
 */

const crypto = require('crypto');
const { query } = require('../../config/database');

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

/**
 * Creates `count` saas_qr rows for an event, each with a fresh UUID and a random serial
 * unique within the event. Uniqueness is enforced by the database (INSERT IGNORE + read-back),
 * so concurrent callers are safe. Returns [{ qr_id, qr_data, serial_no }] in creation order.
 */
async function createQrRows(eventId, count, { attendeeId = null, festivalId = null } = {}) {
  const created = [];
  const fest = festivalId == null ? eventId : festivalId;

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
 * Returns { qr_id, qr_data, serial_no, attendee_id, matched_by } or null.
 */
async function findQrRow(eventId, rawCode) {
  const code = normalizeCredential(rawCode);
  if (!code) return null;

  let rows = await query(
    `SELECT qr_id, qr_data, serial_no, attendee_id FROM saas_qr
     WHERE qr_data = ? AND (event_id = ? OR festival_id = ?) LIMIT 1`,
    [code, eventId, eventId]
  );
  if (rows.length > 0) return { ...rows[0], matched_by: 'qr_data' };

  if (isSerial(code)) {
    rows = await query(
      `SELECT qr_id, qr_data, serial_no, attendee_id FROM saas_qr
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
 * Returns { attendee, qr, matchedBy, strong } or null.
 *   strong = true only for an exact UUID match (safe as a sole credential, e.g. public voting).
 */
async function resolveAttendee(eventId, rawCode) {
  const code = normalizeCredential(rawCode);
  if (!code) return null;

  const qr = await findQrRow(eventId, code);
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
     WHERE sa.qr_token = ? AND (sa.event_id = ? OR sa.festival_id = ?) LIMIT 1`,
    [code, eventId, eventId]
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
    'SELECT serial_no FROM saas_qr WHERE attendee_id = ? AND serial_no IS NOT NULL ORDER BY qr_id DESC LIMIT 1',
    [attendeeId]
  );
  return rows.length > 0 ? rows[0].serial_no : null;
}

module.exports = {
  isUuid,
  isSerial,
  normalizeCredential,
  createQrRows,
  createQrRow,
  findQrRow,
  resolveAttendee,
  phoneLast4Matches,
  getBadgeSerial,
};
