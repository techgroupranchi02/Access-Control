/**
 * Migration 014: QR credential = UUID payload + random 6-digit serial per event (docs/adr/0001)
 *
 * saas_qr is shared with the Freecomers Laravel backend and festease_backend, so this
 * migration is strictly additive and idempotent (Jenkins runs migrate on every deploy):
 *
 * 1. Adds nullable `saas_qr.serial_no CHAR(6)` (rows created by other services stay NULL).
 * 2. Backfills legacy 6-digit codes: serial_no = old qr_data, qr_data = new UUID v4.
 *    Linked saas_attendees.qr_token values are moved to the new UUID as well.
 *    Already-printed 6-digit stickers keep working through the serial lookup.
 * 3. Adds UNIQUE KEY uk_event_serial (event_id, serial_no).
 *
 * Not touched: legacy prefixed codes (BISFF2026-…, ZDFC2026-…), Laravel UUID rows.
 * `qr_data` (UNIQUE `qr_data`) and `saas_attendees.qr_token` (UNIQUE `uq_qr_token`)
 * are already uniquely indexed in production.
 */

const crypto = require('crypto');
const { query, getConnection } = require('../src/config/database');

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(table, index) {
  const rows = await query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function up() {
  console.log('[Migration 014] QR credential serial: starting...');

  // 1. Column
  if (!(await columnExists('saas_qr', 'serial_no'))) {
    await query('ALTER TABLE saas_qr ADD COLUMN serial_no CHAR(6) NULL DEFAULT NULL AFTER qr_data');
    console.log('[Migration 014] ✓ Added saas_qr.serial_no');
  } else {
    console.log('[Migration 014] • saas_qr.serial_no already exists');
  }

  // 2. Backfill legacy 6-digit codes (row by row, each in its own transaction)
  const legacy = await query(
    `SELECT qr_id, qr_data, attendee_id FROM saas_qr
     WHERE serial_no IS NULL AND qr_data REGEXP '^[0-9]{6}$'`
  );
  let moved = 0;
  for (const row of legacy) {
    const newUuid = crypto.randomUUID();
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE saas_qr SET serial_no = ?, qr_data = ? WHERE qr_id = ? AND serial_no IS NULL',
        [row.qr_data, newUuid, row.qr_id]
      );
      if (row.attendee_id) {
        await conn.execute(
          'UPDATE saas_attendees SET qr_token = ? WHERE attendee_id = ? AND qr_token = ?',
          [newUuid, row.attendee_id, row.qr_data]
        );
      }
      await conn.commit();
      moved++;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
  console.log(`[Migration 014] ✓ Backfilled ${moved} legacy 6-digit code(s) into serial_no`);

  // 3. Per-event uniqueness of serial_no (NULLs allowed)
  if (!(await indexExists('saas_qr', 'uk_event_serial'))) {
    const dupes = await query(
      `SELECT event_id, serial_no, COUNT(*) c FROM saas_qr
       WHERE serial_no IS NOT NULL GROUP BY event_id, serial_no HAVING c > 1 LIMIT 5`
    );
    if (dupes.length > 0) {
      throw new Error(`[Migration 014] Duplicate (event_id, serial_no) found, resolve before adding key: ${JSON.stringify(dupes)}`);
    }
    await query('ALTER TABLE saas_qr ADD UNIQUE KEY uk_event_serial (event_id, serial_no)');
    console.log('[Migration 014] ✓ Added UNIQUE KEY uk_event_serial (event_id, serial_no)');
  } else {
    console.log('[Migration 014] • uk_event_serial already exists');
  }

  console.log('[Migration 014] ✓ Completed.');
}

async function down() {
  // Backfilled UUIDs are not reverted (old 6-digit codes remain resolvable via serial_no).
  try { await query('ALTER TABLE saas_qr DROP INDEX uk_event_serial'); } catch (e) { }
  try { await query('ALTER TABLE saas_qr DROP COLUMN serial_no'); } catch (e) { }
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
