/**
 * Migration 011: Remove Separate Jury Addon Module
 * 
 * Context:
 * Film review scoring, judge assignments, and evaluation pipelines are fully
 * managed under the core 'submissions' module. The standalone 'jury' addon module
 * (id=10, module_key='jury', routes: /discover-jury, /jury/:userId/review-dashboard)
 * is redundant.
 * 
 * This migration:
 * 1. Removes the 'jury' module from `events_modules` (festival provisioning)
 * 2. Removes the 'jury' module pages (/discover-jury, etc.) from `pages`
 * 3. Removes module-level permissions for module_id = 10 from `module_groups_permissions`
 * 4. Removes `module_groups` associated with module_id = 10
 * 5. Removes the 6 scoped permissions from `permissions` where module_id = 10
 * 6. Removes the 'jury' record from `modules`
 * 
 * CRITICAL SAFETY:
 * - Keeps the 'jury' group intact in `groups` (id=4, group_key='jury')
 * - Keeps all user assignments in `user_event_groups` intact
 * - Keeps all submission scoring, reviews, assignments, and ballots intact
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 011] Removing separate Jury addon module...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  const juryModules = await query("SELECT id, module_key, label FROM modules WHERE module_key = 'jury'");
  if (juryModules.length === 0) {
    console.log('[Migration 011] No module with module_key = "jury" found. Already clean.');
    await query('SET FOREIGN_KEY_CHECKS = 1;');
    return;
  }

  for (const m of juryModules) {
    const modId = m.id;
    console.log(`[Migration 011] Processing module ID ${modId} (${m.label})...`);

    // 1. Remove from events_modules
    const emRes = await query('DELETE FROM events_modules WHERE module_id = ?', [modId]);
    console.log(`[Migration 011] ✓ Removed from events_modules (${emRes.affectedRows || 0} rows)`);

    // 2. Remove from event_module_settings if table exists
    try {
      const emsRes = await query('DELETE FROM event_module_settings WHERE module_id = ?', [modId]);
      console.log(`[Migration 011] ✓ Removed from event_module_settings (${emsRes.affectedRows || 0} rows)`);
    } catch (e) {
      // Table may not exist or have module_id
    }

    // 3. Remove pages
    const pagesRes = await query('DELETE FROM pages WHERE module_id = ?', [modId]);
    console.log(`[Migration 011] ✓ Removed from pages (${pagesRes.affectedRows || 0} rows)`);

    // 4. Remove module_groups_permissions and module_groups
    const mgRows = await query('SELECT id FROM module_groups WHERE module_id = ?', [modId]);
    if (mgRows.length > 0) {
      const mgIds = mgRows.map(r => r.id);
      const placeholders = mgIds.map(() => '?').join(',');
      const mgpRes = await query(`DELETE FROM module_groups_permissions WHERE module_group_id IN (${placeholders})`, mgIds);
      console.log(`[Migration 011] ✓ Removed from module_groups_permissions (${mgpRes.affectedRows || 0} rows)`);

      const mgRes = await query('DELETE FROM module_groups WHERE module_id = ?', [modId]);
      console.log(`[Migration 011] ✓ Removed from module_groups (${mgRes.affectedRows || 0} rows)`);
    }

    // 5. Remove scoped permissions
    const permRes = await query('DELETE FROM permissions WHERE module_id = ?', [modId]);
    console.log(`[Migration 011] ✓ Removed from permissions (${permRes.affectedRows || 0} rows)`);

    // 6. Delete module from modules
    await query('DELETE FROM modules WHERE id = ?', [modId]);
    console.log(`[Migration 011] ✓ Deleted module record id = ${modId} from modules`);
  }

  // Verify 'jury' group is untouched
  const juryGroup = await query("SELECT id, group_key, label FROM `groups` WHERE group_key = 'jury'");
  console.log('[Migration 011] ✓ Verified "jury" user group is intact:', juryGroup);

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 011] Jury addon module removal completed successfully.');
}

async function down() {
  console.log('[Migration 011] Down migration not automated. Re-run sync_specs_to_database.js if needed.');
}

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration 011] Error:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
