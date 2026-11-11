/**
 * Migration 019: QR sequence number per festival (docs/adr/0001, Amendment 3)
 *
 * Every badge gets a permanent running number within its event: #1, #2, #3 … in creation order.
 *   saas_qr.sequence_no     the number (nullable, so Laravel / festease_backend inserts keep working;
 *                           rows they create are numbered later by qrCredential.assignMissingSequences)
 * The next number is the event's highest sequence_no + 1 (qrCredential.numberRows, under a
 * per-event lock); there is no separate counter table.
 *
 * Existing rows are numbered 1…n per event in qr_id (creation) order. Deleting or losing a badge
 * never renumbers the others.
 *
 * Additive and idempotent.
 */

const { query } = require('../src/config/database');

async function columnExists(table, column) {
  const rows = await query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(table, index) {
  const rows = await query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function up() {
  console.log('[Migration 019] QR sequence numbers: starting...');

  if (!(await columnExists('saas_qr', 'sequence_no'))) {
    await query('ALTER TABLE saas_qr ADD COLUMN sequence_no INT UNSIGNED NULL DEFAULT NULL');
    console.log('[Migration 019] ✓ Added saas_qr.sequence_no');
  }

  // An earlier dev build kept a counter table; it is no longer used
  await query('DROP TABLE IF EXISTS qr_sequence_counters');

  // Number rows that don't have one yet, after any number the event already uses
  const result = await query(`
    UPDATE saas_qr q
    JOIN (
      SELECT s.qr_id,
             ROW_NUMBER() OVER (PARTITION BY s.event_id ORDER BY s.qr_id) + COALESCE(m.max_seq, 0) AS seq
      FROM saas_qr s
      LEFT JOIN (SELECT event_id, MAX(sequence_no) AS max_seq FROM saas_qr WHERE sequence_no IS NOT NULL GROUP BY event_id) m
        ON m.event_id = s.event_id
      WHERE s.sequence_no IS NULL AND s.event_id IS NOT NULL
    ) n ON n.qr_id = q.qr_id
    SET q.sequence_no = n.seq
  `);
  console.log(`[Migration 019] ✓ Numbered ${result.affectedRows || 0} existing badges`);

  if (!(await indexExists('saas_qr', 'uk_event_sequence'))) {
    await query('ALTER TABLE saas_qr ADD UNIQUE KEY uk_event_sequence (event_id, sequence_no)');
    console.log('[Migration 019] ✓ Added unique key (event_id, sequence_no)');
  }

  console.log('[Migration 019] ✓ Completed.');
}

async function down() {
  try { await query('ALTER TABLE saas_qr DROP INDEX uk_event_sequence'); } catch (e) { }
  try { await query('ALTER TABLE saas_qr DROP COLUMN sequence_no'); } catch (e) { }
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
