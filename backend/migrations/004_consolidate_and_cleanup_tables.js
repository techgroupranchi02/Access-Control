/**
 * Migration 004: Consolidate and Clean Up Redundant Tables
 * 
 * Target Clean Schema:
 * - events (renamed from festivals / editions)
 * - modules (renamed from features)
 * - events_modules (renamed/migrated from edition_modules / festival_features)
 * - groups (renamed from roles)
 * - group_permissions (renamed from role_permissions)
 * - user_event_groups (renamed/migrated from user_edition_groups / user_festival_roles)
 * - permissions
 * - users
 * 
 * Removed Tables:
 * - user_festival_roles
 * - user_edition_groups
 * - roles
 * - role_permissions
 * - festivals
 * - features
 * - feature_permission_groups
 * - permission_groups
 * - permission_group_items
 * - festival_features
 * - edition_modules
 * - editions (VIEW)
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 004] Starting table consolidation and cleanup...');

  // 1. Create `events_modules` table
  await query(`
    CREATE TABLE IF NOT EXISTS \`events_modules\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`event_id\` INT NOT NULL,
      \`module_id\` INT NOT NULL,
      \`is_enabled\` TINYINT(1) DEFAULT '1',
      \`config\` JSON DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_event_module\` (\`event_id\`, \`module_id\`),
      KEY \`idx_event\` (\`event_id\`),
      KEY \`idx_module\` (\`module_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 004] ✓ Created `events_modules` table');

  // Copy data from edition_modules if it exists
  try {
    await query(`
      INSERT IGNORE INTO events_modules (id, event_id, module_id, is_enabled, config)
      SELECT id, edition_id, module_id, is_enabled, config FROM edition_modules;
    `);
    console.log('[Migration 004] ✓ Sifted data from `edition_modules` to `events_modules`');
  } catch (err) {
    console.log('[Migration 004] Note on edition_modules:', err.message);
  }

  // 2. Create `user_event_groups` table
  await query(`
    CREATE TABLE IF NOT EXISTS \`user_event_groups\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`event_id\` INT NOT NULL,
      \`group_id\` INT NOT NULL,
      \`assigned_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`unique_user_event_group\` (\`user_id\`, \`event_id\`, \`group_id\`),
      KEY \`idx_user\` (\`user_id\`),
      KEY \`idx_event\` (\`event_id\`),
      KEY \`idx_group\` (\`group_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 004] ✓ Created `user_event_groups` table');

  // Copy data from user_edition_groups
  try {
    await query(`
      INSERT IGNORE INTO user_event_groups (id, user_id, event_id, group_id, assigned_at)
      SELECT id, user_id, edition_id, group_id, assigned_at FROM user_edition_groups;
    `);
    console.log('[Migration 004] ✓ Sifted data from `user_edition_groups` to `user_event_groups`');
  } catch (err) {
    console.log('[Migration 004] Note on user_edition_groups:', err.message);
  }

  // Copy any unmigrated roles from user_festival_roles
  try {
    await query(`
      INSERT IGNORE INTO user_event_groups (user_id, event_id, group_id, assigned_at)
      SELECT user_id, festival_id, role_id, assigned_at FROM user_festival_roles;
    `);
    console.log('[Migration 004] ✓ Sifted data from `user_festival_roles` to `user_event_groups`');
  } catch (err) {
    console.log('[Migration 004] Note on user_festival_roles:', err.message);
  }

  // 3. Drop unwanted legacy tables and view
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  const tablesToDrop = [
    'feature_permission_groups',
    'permission_group_items',
    'permission_groups',
    'festival_features',
    'edition_modules',
    'user_festival_roles',
    'user_edition_groups',
    'role_permissions',
    'roles',
    'festivals',
    'features',
  ];

  for (const table of tablesToDrop) {
    await query(`DROP TABLE IF EXISTS \`${table}\`;`);
    console.log(`[Migration 004] ✓ Dropped table \`${table}\``);
  }

  await query('DROP VIEW IF EXISTS `editions`;');
  console.log('[Migration 004] ✓ Dropped view `editions`');

  await query('SET FOREIGN_KEY_CHECKS = 1;');

  console.log('[Migration 004] ✓ All unwanted tables dropped successfully.');
}

module.exports = { up };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
