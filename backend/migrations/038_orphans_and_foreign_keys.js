/**
 * Migration 038: clean orphan rows and add foreign keys between Access-Control tables (API review D7).
 *
 * Foreign keys (both tables belong to Access-Control; never to or from a Freecomers table):
 *   screening_checkins.screening_block_id            -> screening_blocks.id  ON DELETE RESTRICT
 *     (the app already refuses to delete a show that has scans: deleteScreeningBlock answers 409)
 *   screening_block_kashish_films.screening_block_id -> screening_blocks.id  ON DELETE CASCADE
 *   task_assignees.task_id                           -> tasks.id             ON DELETE CASCADE
 *   chat_messages.channel_id                         -> chat_channels.id     ON DELETE CASCADE
 *   sponsor_deliverables.sponsor_id                  -> sponsors.id          ON DELETE CASCADE
 * (pass_template_elements -> pass_templates already has fk_pte_template.)
 *
 * Orphans: rows of a CASCADE link whose parent is gone are leftover link rows and are removed. Scans whose
 * show is gone are attendance history, so they are never deleted: that one foreign key is skipped with a
 * warning and the count, for someone to look at. Also removed: pages rows for modules that no longer exist,
 * and task_assignees rows for users that no longer exist (users is a Freecomers table, so no foreign key).
 *
 * Every removed row is first written to backend/logs/db-backups/038_orphans_<timestamp>.json (logs/ survives
 * deploys); nothing is removed if the backup can't be written. A foreign key MySQL refuses (for example a
 * column type that differs on another database) is skipped with a warning instead of failing the deploy.
 * Idempotent.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../src/config/database');

const LINKS = [
  { name: 'fk_checkins_block', table: 'screening_checkins', column: 'screening_block_id', parent: 'screening_blocks', onDelete: 'RESTRICT', removeOrphans: false },
  { name: 'fk_block_kashish_films_block', table: 'screening_block_kashish_films', column: 'screening_block_id', parent: 'screening_blocks', onDelete: 'CASCADE', removeOrphans: true },
  { name: 'fk_task_assignees_task', table: 'task_assignees', column: 'task_id', parent: 'tasks', onDelete: 'CASCADE', removeOrphans: true },
  { name: 'fk_chat_messages_channel', table: 'chat_messages', column: 'channel_id', parent: 'chat_channels', onDelete: 'CASCADE', removeOrphans: true },
  { name: 'fk_sponsor_deliverables_sponsor', table: 'sponsor_deliverables', column: 'sponsor_id', parent: 'sponsors', onDelete: 'CASCADE', removeOrphans: true }
];

// Orphans cleaned without adding a foreign key
const CLEANUPS = [
  { label: 'pages for removed modules', table: 'pages', column: 'module_id', parent: 'modules' },
  { label: 'task assignees for removed users', table: 'task_assignees', column: 'user_id', parent: 'users' }
];

async function tableExists(table) {
  const rows = await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
  return rows.length > 0;
}

async function fkExists(table, name) {
  const rows = await query(
    'SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1',
    [table, name]
  );
  return rows.length > 0;
}

async function hasFkOnColumn(table, column, parent) {
  const rows = await query(
    'SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ? LIMIT 1',
    [table, column, parent]
  );
  return rows.length > 0;
}

const orphanSql = (t, c, p) =>
  `FROM \`${t}\` c LEFT JOIN \`${p}\` par ON par.id = c.\`${c}\` WHERE c.\`${c}\` IS NOT NULL AND par.id IS NULL`;

async function up() {
  console.log('[Migration 038] Orphans and foreign keys: starting...');

  // 1. Find orphans
  const toRemove = [];
  const blocked = [];
  for (const l of LINKS) {
    if (!(await tableExists(l.table)) || !(await tableExists(l.parent))) { l.skip = 'table missing'; continue; }
    const rows = await query(`SELECT c.* ${orphanSql(l.table, l.column, l.parent)}`);
    if (!rows.length) continue;
    if (l.removeOrphans) toRemove.push({ ...l, rows });
    else blocked.push({ ...l, count: rows.length });
  }
  for (const c of CLEANUPS) {
    if (!(await tableExists(c.table)) || !(await tableExists(c.parent))) continue;
    const rows = await query(`SELECT c.* ${orphanSql(c.table, c.column, c.parent)}`);
    if (rows.length) toRemove.push({ ...c, rows });
  }

  // 2. Back up, then remove
  if (toRemove.length) {
    const backup = { migration: '038_orphans_and_foreign_keys', taken_at: new Date().toISOString(), orphans: toRemove.map((o) => ({ table: o.table, column: o.column, parent: o.parent, rows: o.rows })) };
    const dir = path.resolve(__dirname, '../logs/db-backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `038_orphans_${backup.taken_at.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    if (JSON.parse(fs.readFileSync(file, 'utf8')).orphans.length !== toRemove.length) throw new Error('Backup check failed; nothing removed.');
    console.log(`[Migration 038] ✓ Backed up ${toRemove.reduce((n, o) => n + o.rows.length, 0)} orphan row(s) to ${file}`);
    for (const o of toRemove) {
      const res = await query(`DELETE c ${orphanSql(o.table, o.column, o.parent)}`);
      console.log(`[Migration 038] ✓ Removed ${res.affectedRows} orphan row(s) from ${o.table} (${o.column} -> ${o.parent})`);
    }
  } else {
    console.log('[Migration 038] • No orphan rows to remove');
  }

  // 3. Foreign keys
  for (const l of LINKS) {
    if (l.skip) { console.log(`[Migration 038] • ${l.table}: ${l.skip}, skipped`); continue; }
    if (await fkExists(l.table, l.name) || await hasFkOnColumn(l.table, l.column, l.parent)) {
      console.log(`[Migration 038] • ${l.table}.${l.column} already has a foreign key to ${l.parent}`);
      continue;
    }
    const b = blocked.find((x) => x.table === l.table && x.column === l.column);
    if (b) {
      console.warn(`[Migration 038] ⚠ ${l.table}: ${b.count} row(s) point to a ${l.parent} row that no longer exists; foreign key ${l.name} NOT added. These are kept (attendance history); review them by hand.`);
      continue;
    }
    try {
      await query(`ALTER TABLE \`${l.table}\` ADD CONSTRAINT \`${l.name}\` FOREIGN KEY (\`${l.column}\`) REFERENCES \`${l.parent}\` (id) ON DELETE ${l.onDelete} ON UPDATE CASCADE`);
      console.log(`[Migration 038] ✓ Added ${l.name}: ${l.table}.${l.column} -> ${l.parent}.id ON DELETE ${l.onDelete}`);
    } catch (err) {
      console.warn(`[Migration 038] ⚠ ${l.name} not added: ${err.message}`);
    }
  }
  console.log('[Migration 038] ✓ Completed.');
}

async function down() {
  for (const l of LINKS) {
    try { await query(`ALTER TABLE \`${l.table}\` DROP FOREIGN KEY \`${l.name}\``); } catch (e) { }
  }
}

module.exports = { up, down, LINKS };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
