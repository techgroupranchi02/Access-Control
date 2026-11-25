/**
 * Migration 037: drop redundant indexes (API review D6).
 *
 * Each index below is the leading part of a unique index on the same table, so MySQL uses that one for the
 * same lookups; the extra index only slows down writes. Before dropping, the migration re-checks the live
 * schema: the index must still exist, must not be unique, and another index must still start with exactly
 * its columns. Anything that no longer matches is skipped, and an index MySQL refuses to drop (for example
 * because a foreign key needs it) is skipped with a warning instead of failing the deploy.
 *
 * Access-Control tables only; the 4 redundant indexes on Freecomers tables (audience_categories,
 * festival_bank_accounts, saas_attendees, saas_qr) are left to the Freecomers team. Some of these indexes are
 * still declared in the CREATE TABLE of older migrations (005, 007, 008, 010, 028); that only matters on a new
 * database, where this migration then drops them. Idempotent.
 *
 * Kept on purpose: screening_checkins.idx_checkin_event (event_id). InnoDB stores the row id in every
 * secondary index, so this index is really (event_id, id) and serves the attendance log's
 * `event_id = ? AND id <= ?` anchor as a range scan; the (event_id, attendee_id, scanned_at) index can't.
 */

const { query } = require('../src/config/database');

const INDEXES = [
  ['audience_votes', 'idx_votes_event'],
  ['award_category_jury', 'idx_event'],
  ['award_category_nominations', 'idx_event'],
  ['event_custom_group_permissions', 'fk_ecgp_cgroup'],
  ['event_module_settings', 'idx_ems_event_module'],
  ['event_user_limits', 'fk_eul_event'],
  ['events_modules', 'idx_event'],
  ['festival_review_criteria', 'idx_criteria_event'],
  ['festival_review_round_configs', 'idx_rev_configs_event'],
  ['festival_review_states', 'idx_rev_states_event'],
  ['kashish_movies', 'idx_kashish_movies_event'],
  ['module_groups', 'fk_mg_group'],
  ['module_groups_permissions', 'fk_mgp_module_group'],
  ['screening_block_films', 'idx_block_films_block'],
  ['user_event_custom_groups', 'fk_uecg_user'],
  ['user_event_groups', 'idx_user']
];

async function tableIndexes(table) {
  const rows = await query(
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [table]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.INDEX_NAME)) map.set(r.INDEX_NAME, { unique: Number(r.NON_UNIQUE) === 0, cols: [] });
    map.get(r.INDEX_NAME).cols.push(r.COLUMN_NAME);
  }
  return map;
}

async function up() {
  console.log('[Migration 037] Drop redundant indexes: starting...');
  let dropped = 0;
  for (const [table, name] of INDEXES) {
    const idx = await tableIndexes(table);
    const me = idx.get(name);
    if (!me) { console.log(`[Migration 037] • ${table}.${name} not present`); continue; }
    if (me.unique) { console.warn(`[Migration 037] ⚠ ${table}.${name} is unique; kept`); continue; }
    const cover = [...idx].find(([n, v]) => n !== name && v.cols.length >= me.cols.length && me.cols.every((c, k) => v.cols[k] === c));
    if (!cover) { console.warn(`[Migration 037] ⚠ ${table}.${name} is no longer covered by another index; kept`); continue; }
    try {
      await query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
      dropped++;
      console.log(`[Migration 037] ✓ Dropped ${table}.${name} (${me.cols.join(', ')}); covered by ${cover[0]}`);
    } catch (err) {
      console.warn(`[Migration 037] ⚠ ${table}.${name} not dropped: ${err.message}`);
    }
  }
  console.log(`[Migration 037] ✓ Completed (${dropped} dropped).`);
}

async function down() {
  // Recreate by hand if ever needed, e.g. ALTER TABLE audience_votes ADD INDEX idx_votes_event (event_id).
}

module.exports = { up, down, INDEXES };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
