/**
 * Migration 035: drop the unused early-schema tables (API review D1).
 *
 * attendances, email_templates, features, festival_features, festivals, payout_milestones,
 * permission_group_items and permission_groups come from the first schema (archived migrations 001–004,
 * migration 006 and the pre-merge seeder). Checked on 24 Nov 2026: nothing reads or writes them in
 * Access-Control, the Freecomers Laravel app (Freecomers_backend, TheFreecomers_backend) or festease_backend,
 * which all use this database (Laravel's `festivals` relation is film_festivals, its attendance model is
 * saas_attendances). No view, trigger or routine uses them, and no other table has a foreign key to them.
 *
 * Added 25 Nov 2026: pipeline_states (migration 006). current_stage was never written; voting_open was only
 * written by POST /api/reviews/toggle-voting, which no screen called, and GET /api/reviews/pipeline returned it
 * as pipelineState, which the dashboard never read. The route, the handler and the read were removed with it.
 *
 * Before dropping, every table is written (definition and rows) to
 * backend/logs/db-backups/035_unused_tables_<timestamp>.json (logs/ survives deploys: the Jenkins rsync
 * excludes it). Nothing is dropped if the backup can't be written. A table that another table now points to
 * is skipped with a warning. Idempotent: tables already gone are skipped.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../src/config/database');

// Children first (festival_features -> festivals/features, permission_group_items -> permission_groups)
const TABLES = [
  'festival_features',
  'permission_group_items',
  'attendances',
  'email_templates',
  'features',
  'festivals',
  'payout_milestones',
  'permission_groups',
  'pipeline_states'
];

async function existing() {
  const rows = await query(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${TABLES.map(() => '?').join(',')})`,
    TABLES
  );
  const found = new Set(rows.map((r) => r.t));
  return TABLES.filter((t) => found.has(t));
}

/** Tables outside this list that have a foreign key to `table`. */
async function outsideReferences(table) {
  const rows = await query(
    `SELECT DISTINCT TABLE_NAME AS t FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ? AND TABLE_NAME NOT IN (${TABLES.map(() => '?').join(',')})`,
    [table, ...TABLES]
  );
  return rows.map((r) => r.t);
}

async function up() {
  console.log('[Migration 035] Drop unused tables: starting...');
  const tables = await existing();
  if (!tables.length) {
    console.log('[Migration 035] • None of the unused tables exist, nothing to do');
    return;
  }

  // 1. Back up everything first
  const backup = { migration: '035_drop_unused_tables', taken_at: new Date().toISOString(), tables: {} };
  for (const t of tables) {
    const [create] = await query(`SHOW CREATE TABLE \`${t}\``);
    const rows = await query(`SELECT * FROM \`${t}\``);
    backup.tables[t] = { create: create['Create Table'], rows };
  }
  const dir = path.resolve(__dirname, '../logs/db-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `035_unused_tables_${backup.taken_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Object.keys(written.tables).length !== tables.length) throw new Error('Backup check failed; nothing dropped.');
  console.log(`[Migration 035] ✓ Backed up ${tables.length} table(s) to ${file}`);

  // 2. Drop, children first; skip anything something else now depends on
  for (const t of tables) {
    const refs = await outsideReferences(t);
    if (refs.length) {
      console.warn(`[Migration 035] ⚠ ${t} is referenced by ${refs.join(', ')}; not dropped`);
      continue;
    }
    await query(`DROP TABLE IF EXISTS \`${t}\``);
    console.log(`[Migration 035] ✓ Dropped ${t} (${backup.tables[t].rows.length} row(s) backed up)`);
  }
  console.log('[Migration 035] ✓ Completed.');
}

async function down() {
  // Restore from the backup file by hand if ever needed: each entry has the CREATE TABLE and its rows.
}

module.exports = { up, down, TABLES };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
