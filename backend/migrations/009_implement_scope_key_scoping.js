/**
 * Migration 009: Implement scope_key Row-Level Scoping
 * 
 * Adds `scope_key` VARCHAR(100) NOT NULL DEFAULT 'all' to:
 * - `module_groups_permissions`
 * - `event_custom_group_permissions`
 * 
 * Applies default scoping rules:
 * - Admin: 'all'
 * - Jury: 'assigned' for submissions/reviews, 'jury_panel' for jury/ballots/scoring
 * - Volunteer: 'assigned' for tasks, 'all' for team coordination
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 009] Starting scope_key schema migration...');

  // 1. Check & Alter `module_groups_permissions`
  const mgpCols = (await query('SHOW COLUMNS FROM `module_groups_permissions`')).map(c => c.Field);
  if (!mgpCols.includes('scope_key')) {
    console.log('[Migration 009] Adding `scope_key` to `module_groups_permissions`...');
    await query(`
      ALTER TABLE \`module_groups_permissions\`
      ADD COLUMN \`scope_key\` VARCHAR(100) NOT NULL DEFAULT 'all' AFTER \`permission_id\`,
      ADD INDEX \`idx_mgp_scope\` (\`scope_key\`)
    `);

    // Safely update unique index
    try {
      await query('ALTER TABLE `module_groups_permissions` DROP INDEX `unique_mg_perm`');
    } catch (e) {
      console.log('[Migration 009] Note on dropping unique_mg_perm:', e.message);
    }

    try {
      await query(`
        ALTER TABLE \`module_groups_permissions\`
        ADD UNIQUE KEY \`unique_mg_perm_scope\` (\`module_group_id\`, \`permission_id\`, \`scope_key\`)
      `);
    } catch (e) {
      console.log('[Migration 009] Note on adding unique_mg_perm_scope:', e.message);
    }
    console.log('[Migration 009] ✓ `module_groups_permissions` altered successfully.');
  } else {
    console.log('[Migration 009] `module_groups_permissions` already has `scope_key`.');
  }

  // 2. Check & Alter `event_custom_group_permissions`
  const ecgpCols = (await query('SHOW COLUMNS FROM `event_custom_group_permissions`')).map(c => c.Field);
  if (!ecgpCols.includes('scope_key')) {
    console.log('[Migration 009] Adding `scope_key` to `event_custom_group_permissions`...');
    await query(`
      ALTER TABLE \`event_custom_group_permissions\`
      ADD COLUMN \`scope_key\` VARCHAR(100) NOT NULL DEFAULT 'all' AFTER \`permission_id\`,
      ADD INDEX \`idx_ecgp_scope\` (\`scope_key\`)
    `);

    try {
      await query('ALTER TABLE `event_custom_group_permissions` DROP INDEX `unique_custom_perm`');
    } catch (e) {
      console.log('[Migration 009] Note on dropping unique_custom_perm:', e.message);
    }

    try {
      await query(`
        ALTER TABLE \`event_custom_group_permissions\`
        ADD UNIQUE KEY \`unique_custom_perm_scope\` (\`custom_group_id\`, \`permission_id\`, \`scope_key\`)
      `);
    } catch (e) {
      console.log('[Migration 009] Note on adding unique_custom_perm_scope:', e.message);
    }
    console.log('[Migration 009] ✓ `event_custom_group_permissions` altered successfully.');
  } else {
    console.log('[Migration 009] `event_custom_group_permissions` already has `scope_key`.');
  }

  // 3. Seed / Update standard scope defaults for module_groups_permissions
  console.log('[Migration 009] Applying standard scope rules for built-in groups...');

  // Jury group (group_id = 4 or group_key = 'jury')
  // Submissions & Reviews -> 'assigned'
  await query(`
    UPDATE module_groups_permissions mgp
    JOIN module_groups mg ON mg.id = mgp.module_group_id
    JOIN \`groups\` g ON g.id = mg.group_id
    JOIN permissions p ON p.id = mgp.permission_id
    SET mgp.scope_key = 'assigned'
    WHERE g.group_key = 'jury'
      AND (
        p.permission_key LIKE 'submission:%' OR p.permission_key LIKE 'submission.%'
        OR p.permission_key LIKE 'review:%' OR p.permission_key LIKE 'review.%'
        OR p.permission_key LIKE 'screening:%' OR p.permission_key LIKE 'screening.%'
      )
  `);

  // Jury Ballots & Voting -> 'jury_panel'
  await query(`
    UPDATE module_groups_permissions mgp
    JOIN module_groups mg ON mg.id = mgp.module_group_id
    JOIN \`groups\` g ON g.id = mg.group_id
    JOIN permissions p ON p.id = mgp.permission_id
    SET mgp.scope_key = 'jury_panel'
    WHERE g.group_key = 'jury'
      AND (
        p.permission_key LIKE 'jury:%' OR p.permission_key LIKE 'jury.%'
        OR p.permission_key LIKE 'voting:%' OR p.permission_key LIKE 'voting.%'
        OR p.permission_key LIKE 'ballot:%' OR p.permission_key LIKE 'ballot.%'
      )
  `);

  // Volunteer group (group_id = 2 or group_key = 'volunteer')
  // Tasks -> 'assigned'
  await query(`
    UPDATE module_groups_permissions mgp
    JOIN module_groups mg ON mg.id = mgp.module_group_id
    JOIN \`groups\` g ON g.id = mg.group_id
    JOIN permissions p ON p.id = mgp.permission_id
    SET mgp.scope_key = 'assigned'
    WHERE g.group_key = 'volunteer'
      AND (
        p.permission_key LIKE 'task:%' OR p.permission_key LIKE 'task.%'
      )
  `);

  // Admin group (group_id = 1 or group_key = 'admin')
  // Ensure all are 'all'
  await query(`
    UPDATE module_groups_permissions mgp
    JOIN module_groups mg ON mg.id = mgp.module_group_id
    JOIN \`groups\` g ON g.id = mg.group_id
    SET mgp.scope_key = 'all'
    WHERE g.group_key = 'admin'
  `);

  console.log('[Migration 009] ✓ Migration 009 completed successfully.');
}

async function down() {
  console.log('[Migration 009] Reverting migration 009...');
  try {
    await query('ALTER TABLE `module_groups_permissions` DROP COLUMN `scope_key`');
    await query('ALTER TABLE `event_custom_group_permissions` DROP COLUMN `scope_key`');
  } catch (e) {
    console.error('[Migration 009] Error during rollback:', e.message);
  }
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
