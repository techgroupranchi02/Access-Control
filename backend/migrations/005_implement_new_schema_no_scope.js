/**
 * Migration 005: Implement New Schema Without Scope Key
 * 
 * Target Schema:
 * 1. events: event_id PK, user_id, name, description, event_type, saas_enabled, is_deleted, timestamps
 * 2. users: (no changes)
 * 3. modules: id, module_key (50), label (50), description (150), type, icon, plugin_dir, route, display_order, created_at
 * 4. pages: id, module_id, page_key, route, permission_id, display_order, created_at
 * 5. permissions: id, permission_key (100), label (255), description, module_id, page_id, actions_match, actions_unmatch, created_at
 * 6. groups: id, group_key (100), label (255), description, is_system, created_at
 * 7. module_groups: id, group_id, module_id, name, UNIQUE(group_id, module_id)
 * 8. module_groups_permissions: id, module_group_id, permission_id, UNIQUE(module_group_id, permission_id)
 * 9. event_user_limits: event_user_limit_id, event_id, module_group_id, max_users, UNIQUE(event_id, module_group_id)
 * 10. events_modules: id, event_id, module_id, UNIQUE(event_id, module_id)
 * 11. user_event_groups: id, user_id, event_id, group_id, assigned_at, UNIQUE(user_id, event_id, group_id)
 * 12. event_custom_groups: id, event_id, name, description, created_at
 * 13. event_custom_group_permissions: id, custom_group_id, permission_id, UNIQUE(custom_group_id, permission_id)
 * 14. user_event_custom_groups: id, user_id, event_id, custom_group_id, assigned_at, UNIQUE(user_id, event_id, custom_group_id)
 * 
 * Removes:
 * - group_permissions (migrated to module_groups + module_groups_permissions)
 * - scope_key / scope_id (completely removed as decided)
 */

const { query } = require('../src/config/database');

async function getColumns(tableName) {
  const rows = await query(`SHOW COLUMNS FROM \`${tableName}\``);
  return rows.map(r => r.Field);
}

async function getIndexes(tableName) {
  const rows = await query(`SHOW INDEX FROM \`${tableName}\``);
  return rows.map(r => r.Key_name);
}

async function up() {
  console.log('[Migration 005] Starting new schema migration (without scope_key)...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Update `events` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 1. Updating `events` table...');
  const eventCols = await getColumns('events');

  if (eventCols.includes('id') && !eventCols.includes('event_id')) {
    await query(`ALTER TABLE \`events\` CHANGE COLUMN \`id\` \`event_id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`);
    console.log('[Migration 005] ✓ Renamed `events.id` -> `event_id`');
  }

  const updatedEventCols = await getColumns('events');
  if (!updatedEventCols.includes('user_id')) {
    await query(`ALTER TABLE \`events\` ADD COLUMN \`user_id\` BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER \`event_id\``);
  }
  if (!updatedEventCols.includes('event_type')) {
    await query(`ALTER TABLE \`events\` ADD COLUMN \`event_type\` ENUM('film_festival','webinar','workshop','seminar','screening','other') NOT NULL DEFAULT 'film_festival' AFTER \`description\``);
  }
  if (!updatedEventCols.includes('saas_enabled')) {
    await query(`ALTER TABLE \`events\` ADD COLUMN \`saas_enabled\` TINYINT(1) NOT NULL DEFAULT 1 AFTER \`event_type\``);
    if (updatedEventCols.includes('is_active')) {
      await query(`UPDATE \`events\` SET \`saas_enabled\` = \`is_active\``);
    }
  }
  if (!updatedEventCols.includes('is_deleted')) {
    await query(`ALTER TABLE \`events\` ADD COLUMN \`is_deleted\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`saas_enabled\``);
  }

  // Modify description to LONGTEXT
  await query(`ALTER TABLE \`events\` MODIFY COLUMN \`description\` LONGTEXT NOT NULL`);

  // Drop is_active if present
  if (updatedEventCols.includes('is_active')) {
    await query(`ALTER TABLE \`events\` DROP COLUMN \`is_active\``);
  }

  console.log('[Migration 005] ✓ `events` schema updated');

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Update `modules` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 2. Updating `modules` table...');
  const moduleCols = await getColumns('modules');

  if (moduleCols.includes('name') && !moduleCols.includes('label')) {
    await query(`ALTER TABLE \`modules\` CHANGE COLUMN \`name\` \`label\` VARCHAR(50) DEFAULT NULL`);
    console.log('[Migration 005] ✓ Renamed `modules.name` -> `label`');
  }

  await query(`ALTER TABLE \`modules\` MODIFY COLUMN \`module_key\` VARCHAR(50) NOT NULL`);
  await query(`ALTER TABLE \`modules\` MODIFY COLUMN \`label\` VARCHAR(50) DEFAULT NULL`);
  await query(`ALTER TABLE \`modules\` MODIFY COLUMN \`description\` VARCHAR(150) DEFAULT NULL`);

  const updatedModuleCols = await getColumns('modules');
  if (updatedModuleCols.includes('component_name')) {
    await query(`ALTER TABLE \`modules\` DROP COLUMN \`component_name\``);
  }
  if (updatedModuleCols.includes('config')) {
    await query(`ALTER TABLE \`modules\` DROP COLUMN \`config\``);
  }
  console.log('[Migration 005] ✓ `modules` schema updated');

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Create `pages` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 3. Creating `pages` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`pages\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`module_id\` INT NOT NULL,
      \`page_key\` VARCHAR(255) NOT NULL,
      \`route\` VARCHAR(255) NOT NULL,
      \`permission_id\` INT DEFAULT NULL,
      \`display_order\` INT DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`fk_page_module\` (\`module_id\`),
      KEY \`fk_page_permission\` (\`permission_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `pages` table created/ready');

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Update `permissions` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 4. Updating `permissions` table...');
  const permCols = await getColumns('permissions');

  if (permCols.includes('name') && !permCols.includes('label')) {
    await query(`ALTER TABLE \`permissions\` CHANGE COLUMN \`name\` \`label\` VARCHAR(255) DEFAULT NULL`);
    console.log('[Migration 005] ✓ Renamed `permissions.name` -> `label`');
  }

  await query(`ALTER TABLE \`permissions\` MODIFY COLUMN \`permission_key\` VARCHAR(100) NOT NULL`);
  await query(`ALTER TABLE \`permissions\` MODIFY COLUMN \`label\` VARCHAR(255) DEFAULT NULL`);

  const updatedPermCols = await getColumns('permissions');
  if (!updatedPermCols.includes('module_id')) {
    await query(`ALTER TABLE \`permissions\` ADD COLUMN \`module_id\` INT DEFAULT NULL AFTER \`description\``);
    await query(`ALTER TABLE \`permissions\` ADD KEY \`fk_perm_module\` (\`module_id\`)`);
  }
  if (!updatedPermCols.includes('page_id')) {
    await query(`ALTER TABLE \`permissions\` ADD COLUMN \`page_id\` INT DEFAULT NULL AFTER \`module_id\``);
    await query(`ALTER TABLE \`permissions\` ADD KEY \`fk_perm_page\` (\`page_id\`)`);
  }
  if (!updatedPermCols.includes('actions_match')) {
    await query(`ALTER TABLE \`permissions\` ADD COLUMN \`actions_match\` ENUM('view','active') NOT NULL DEFAULT 'view' AFTER \`page_id\``);
  }
  if (!updatedPermCols.includes('actions_unmatch')) {
    await query(`ALTER TABLE \`permissions\` ADD COLUMN \`actions_unmatch\` ENUM('hide','inactive') NOT NULL DEFAULT 'hide' AFTER \`actions_match\``);
  }

  // Populate module_id and actions_match/actions_unmatch for existing permissions
  const modules = await query(`SELECT id, module_key FROM \`modules\``);
  const moduleMap = {};
  for (const m of modules) {
    moduleMap[m.module_key.toLowerCase()] = m.id;
  }

  const existingPerms = await query(`SELECT id, permission_key, description FROM \`permissions\``);
  for (const p of existingPerms) {
    let matchedModuleId = null;
    const key = p.permission_key.toLowerCase();

    if (key === '*') {
      matchedModuleId = null;
    } else {
      const parts = key.includes(':') ? key.split(':') : key.split('.');
      const prefix = parts[0];

      if (moduleMap[prefix]) {
        matchedModuleId = moduleMap[prefix];
      } else if (prefix === 'task' && moduleMap['tasks']) {
        matchedModuleId = moduleMap['tasks'];
      } else if (prefix === 'submission' && moduleMap['submissions']) {
        matchedModuleId = moduleMap['submissions'];
      } else if (prefix === 'customa' && moduleMap['customa']) {
        matchedModuleId = moduleMap['customa'];
      } else if (prefix === 'customb' && moduleMap['customb']) {
        matchedModuleId = moduleMap['customb'];
      } else if (prefix === 'customc' && moduleMap['customc']) {
        matchedModuleId = moduleMap['customc'];
      }
    }

    // Determine actions_match & actions_unmatch
    let match = 'active';
    let unmatch = 'inactive';
    if (key.includes('view') || key.includes('read') || key.includes('access') || key === '*') {
      match = 'view';
      unmatch = 'hide';
    }

    await query(
      `UPDATE \`permissions\` SET \`module_id\` = ?, \`actions_match\` = ?, \`actions_unmatch\` = ? WHERE \`id\` = ?`,
      [matchedModuleId, match, unmatch, p.id]
    );
  }

  // Clean up obsolete columns in permissions
  const finalPermCols = await getColumns('permissions');
  if (finalPermCols.includes('resource')) {
    await query(`ALTER TABLE \`permissions\` DROP COLUMN \`resource\``);
  }
  if (finalPermCols.includes('action')) {
    await query(`ALTER TABLE \`permissions\` DROP COLUMN \`action\``);
  }
  if (finalPermCols.includes('scope')) {
    await query(`ALTER TABLE \`permissions\` DROP COLUMN \`scope\``);
  }

  console.log('[Migration 005] ✓ `permissions` schema updated and mapped to modules');

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Populate initial `pages` for modules
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 5. Populating initial `pages`...');
  for (const m of modules) {
    const existingPage = await query(`SELECT id FROM \`pages\` WHERE \`module_id\` = ?`, [m.id]);
    if (existingPage.length === 0) {
      // Find a matching primary read/view permission for this module
      const viewPerm = await query(
        `SELECT id FROM \`permissions\` WHERE \`module_id\` = ? AND (\`permission_key\` LIKE '%:view' OR \`permission_key\` LIKE '%:read' OR \`permission_key\` LIKE '%.view' OR \`permission_key\` LIKE '%.read') LIMIT 1`,
        [m.id]
      );
      const permId = viewPerm[0] ? viewPerm[0].id : null;

      await query(
        `INSERT INTO \`pages\` (module_id, page_key, route, permission_id, display_order) VALUES (?, ?, ?, ?, ?)`,
        [m.id, `${m.module_key}_main`, `/${m.module_key}`, permId, 1]
      );
    }
  }
  console.log('[Migration 005] ✓ `pages` populated');

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Update `groups` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 6. Updating `groups` table...');
  const groupCols = await getColumns('groups');

  if (groupCols.includes('name') && !groupCols.includes('label')) {
    await query(`ALTER TABLE \`groups\` CHANGE COLUMN \`name\` \`label\` VARCHAR(255) DEFAULT NULL`);
    console.log('[Migration 005] ✓ Renamed `groups.name` -> `label`');
  }

  await query(`ALTER TABLE \`groups\` MODIFY COLUMN \`group_key\` VARCHAR(100) NOT NULL`);
  await query(`ALTER TABLE \`groups\` MODIFY COLUMN \`label\` VARCHAR(255) DEFAULT NULL`);

  const updatedGroupCols = await getColumns('groups');
  if (updatedGroupCols.includes('user_limit')) {
    await query(`ALTER TABLE \`groups\` DROP COLUMN \`user_limit\``);
  }
  console.log('[Migration 005] ✓ `groups` schema updated');

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Create `module_groups` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 7. Creating `module_groups` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`module_groups\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`group_id\` INT NOT NULL,
      \`module_id\` INT NOT NULL,
      \`name\` VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_group_module\` (\`group_id\`, \`module_id\`),
      KEY \`fk_mg_group\` (\`group_id\`),
      KEY \`fk_mg_module\` (\`module_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `module_groups` table ready');

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Create `module_groups_permissions` table (WITHOUT scope_key / scope_id)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 8. Creating `module_groups_permissions` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`module_groups_permissions\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`module_group_id\` INT NOT NULL,
      \`permission_id\` INT NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_mg_perm\` (\`module_group_id\`, \`permission_id\`),
      KEY \`fk_mgp_module_group\` (\`module_group_id\`),
      KEY \`fk_mgp_permission\` (\`permission_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `module_groups_permissions` table ready (no scope)');

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Migrate data from old `group_permissions` into `module_groups` + `module_groups_permissions`
  // ──────────────────────────────────────────────────────────────────────────
  const tables = await query(`SHOW TABLES LIKE 'group_permissions'`);
  if (tables.length > 0) {
    console.log('[Migration 005] 9. Migrating data from legacy `group_permissions`...');
    const legacyGPs = await query(`
      SELECT gp.group_id, gp.permission_id, p.module_id, p.permission_key, g.label as group_label
      FROM group_permissions gp
      JOIN permissions p ON p.id = gp.permission_id
      JOIN \`groups\` g ON g.id = gp.group_id
    `);

    for (const row of legacyGPs) {
      let targetModuleIds = [];
      if (row.module_id) {
        targetModuleIds.push(row.module_id);
      } else {
        // If permission has no module_id (e.g. wildcard '*'), link across all active modules
        targetModuleIds = modules.map(m => m.id);
      }

      for (const mId of targetModuleIds) {
        // Find or create module_group
        let mgRows = await query(
          `SELECT id FROM \`module_groups\` WHERE \`group_id\` = ? AND \`module_id\` = ?`,
          [row.group_id, mId]
        );
        let mgId = mgRows[0] ? mgRows[0].id : null;

        if (!mgId) {
          const mObj = modules.find(m => m.id === mId);
          const mgName = `${row.group_label || 'Group'} - ${mObj ? mObj.module_key : 'Module'}`;
          const insertRes = await query(
            `INSERT INTO \`module_groups\` (group_id, module_id, name) VALUES (?, ?, ?)`,
            [row.group_id, mId, mgName]
          );
          mgId = insertRes.insertId;
        }

        // Insert into module_groups_permissions (no scope)
        await query(
          `INSERT IGNORE INTO \`module_groups_permissions\` (module_group_id, permission_id) VALUES (?, ?)`,
          [mgId, row.permission_id]
        );
      }
    }

    console.log('[Migration 005] ✓ Migrated group_permissions to module_groups & module_groups_permissions');
    await query(`DROP TABLE IF EXISTS \`group_permissions\``);
    console.log('[Migration 005] ✓ Dropped legacy `group_permissions` table');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Create `event_user_limits` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 10. Creating `event_user_limits` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`event_user_limits\` (
      \`event_user_limit_id\` INT NOT NULL AUTO_INCREMENT,
      \`event_id\` BIGINT UNSIGNED NOT NULL,
      \`module_group_id\` INT NOT NULL,
      \`max_users\` INT NOT NULL,
      PRIMARY KEY (\`event_user_limit_id\`),
      UNIQUE KEY \`uq_event_mg\` (\`event_id\`, \`module_group_id\`),
      KEY \`fk_eul_event\` (\`event_id\`),
      KEY \`fk_eul_mg\` (\`module_group_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `event_user_limits` table ready');

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Simplify `events_modules` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 11. Simplifying `events_modules` table...');
  const emCols = await getColumns('events_modules');
  if (emCols.includes('is_enabled')) {
    // Delete rows where is_enabled is 0 (presence = enabled)
    await query(`DELETE FROM \`events_modules\` WHERE \`is_enabled\` = 0 OR \`is_enabled\` IS NULL`);
    await query(`ALTER TABLE \`events_modules\` DROP COLUMN \`is_enabled\``);
  }
  if (emCols.includes('config')) {
    await query(`ALTER TABLE \`events_modules\` DROP COLUMN \`config\``);
  }
  await query(`ALTER TABLE \`events_modules\` MODIFY COLUMN \`event_id\` BIGINT UNSIGNED NOT NULL`);
  console.log('[Migration 005] ✓ `events_modules` simplified (presence = enabled)');

  // ──────────────────────────────────────────────────────────────────────────
  // 12. Create `event_custom_groups` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 12. Creating `event_custom_groups` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`event_custom_groups\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`event_id\` BIGINT UNSIGNED NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`description\` TEXT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`fk_ecg_event\` (\`event_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `event_custom_groups` table ready');

  // ──────────────────────────────────────────────────────────────────────────
  // 13. Create `event_custom_group_permissions` table (WITHOUT scope_key)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 13. Creating `event_custom_group_permissions` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`event_custom_group_permissions\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`custom_group_id\` INT NOT NULL,
      \`permission_id\` INT NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_cgroup_perm\` (\`custom_group_id\`, \`permission_id\`),
      KEY \`fk_ecgp_cgroup\` (\`custom_group_id\`),
      KEY \`fk_ecgp_perm\` (\`permission_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `event_custom_group_permissions` table ready (no scope)');

  // ──────────────────────────────────────────────────────────────────────────
  // 14. Create `user_event_custom_groups` table
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Migration 005] 14. Creating `user_event_custom_groups` table...');
  await query(`
    CREATE TABLE IF NOT EXISTS \`user_event_custom_groups\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT UNSIGNED NOT NULL,
      \`event_id\` BIGINT UNSIGNED NOT NULL,
      \`custom_group_id\` INT NOT NULL,
      \`assigned_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_user_event_cgroup\` (\`user_id\`, \`event_id\`, \`custom_group_id\`),
      KEY \`fk_uecg_user\` (\`user_id\`),
      KEY \`fk_uecg_event\` (\`event_id\`),
      KEY \`fk_uecg_cgroup\` (\`custom_group_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 005] ✓ `user_event_custom_groups` table ready');

  // ──────────────────────────────────────────────────────────────────────────
  // 15. Ensure `user_event_groups` columns use BIGINT UNSIGNED
  // ──────────────────────────────────────────────────────────────────────────
  await query(`ALTER TABLE \`user_event_groups\` MODIFY COLUMN \`user_id\` BIGINT UNSIGNED NOT NULL`);
  await query(`ALTER TABLE \`user_event_groups\` MODIFY COLUMN \`event_id\` BIGINT UNSIGNED NOT NULL`);
  console.log('[Migration 005] ✓ `user_event_groups` validated');

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 005] 🎉 Migration completed successfully!');
}

module.exports = { up };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration 005] ❌ Error:', err);
      process.exit(1);
    });
}
