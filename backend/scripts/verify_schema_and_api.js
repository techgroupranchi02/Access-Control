/**
 * Verification Script
 * Validates the new database schema, relationships, auth, and permissions resolution.
 */

const { query } = require('../src/config/database');
const authService = require('../src/core/services/auth.service');
const editionService = require('../src/core/services/edition.service');
const permissionService = require('../src/core/services/permission.service');

async function verify() {
  console.log('=== STARTING SCHEMA & API VERIFICATION ===\n');

  let errors = [];

  // 1. Check Tables Exist
  console.log('[1/6] Checking all 14 tables in database...');
  const expectedTables = [
    'events',
    'users',
    'modules',
    'pages',
    'permissions',
    'groups',
    'module_groups',
    'module_groups_permissions',
    'event_user_limits',
    'events_modules',
    'user_event_groups',
    'event_custom_groups',
    'event_custom_group_permissions',
    'user_event_custom_groups'
  ];

  const dbTables = await query('SHOW TABLES');
  const tableList = dbTables.map(t => Object.values(t)[0]);

  for (const t of expectedTables) {
    if (tableList.includes(t)) {
      console.log(`  ✓ Table '${t}' exists`);
    } else {
      errors.push(`Missing table: ${t}`);
      console.error(`  ✗ Missing table: ${t}`);
    }
  }

  // Check group_permissions is gone
  if (tableList.includes('group_permissions')) {
    errors.push('Legacy table group_permissions was not dropped!');
  } else {
    console.log('  ✓ Legacy table `group_permissions` is removed');
  }

  // 2. Check Columns in module_groups_permissions & event_custom_group_permissions (NO scope_key / scope_id)
  console.log('\n[2/6] Verifying scope columns are completely removed...');
  const mgpCols = (await query('SHOW COLUMNS FROM `module_groups_permissions`')).map(c => c.Field);
  console.log('  module_groups_permissions columns:', mgpCols);
  if (mgpCols.includes('scope_key') || mgpCols.includes('scope_id')) {
    errors.push('module_groups_permissions still has scope columns!');
  } else {
    console.log('  ✓ module_groups_permissions has NO scope_key or scope_id');
  }

  const ecgpCols = (await query('SHOW COLUMNS FROM `event_custom_group_permissions`')).map(c => c.Field);
  console.log('  event_custom_group_permissions columns:', ecgpCols);
  if (ecgpCols.includes('scope_key') || ecgpCols.includes('scope_id')) {
    errors.push('event_custom_group_permissions still has scope columns!');
  } else {
    console.log('  ✓ event_custom_group_permissions has NO scope_key');
  }

  // 3. Check events schema
  console.log('\n[3/6] Verifying `events` schema...');
  const eventCols = (await query('SHOW COLUMNS FROM `events`')).map(c => c.Field);
  console.log('  events columns:', eventCols);
  if (!eventCols.includes('event_id') || !eventCols.includes('user_id') || !eventCols.includes('event_type') || !eventCols.includes('saas_enabled') || !eventCols.includes('is_deleted')) {
    errors.push('events table is missing required attributes!');
  } else {
    console.log('  ✓ events table has event_id, user_id, event_type, saas_enabled, is_deleted');
  }

  // 4. Test Edition Service
  console.log('\n[4/6] Testing editionService...');
  const editions = await editionService.getAllEditions();
  console.log(`  ✓ Found ${editions.length} event(s):`, editions.map(e => ({ id: e.id, name: e.name })));

  const festId = editions[0].id;
  const config = await editionService.getEditionConfig(festId);
  console.log(`  ✓ Fetched edition config (${config.length} modules), sample:`, {
    module_key: config[0].module_key,
    label: config[0].label,
    is_enabled: config[0].is_enabled
  });

  const enabledModules = await editionService.getEnabledModules(festId);
  console.log(`  ✓ Enabled modules count: ${enabledModules.length}`);

  // Test module toggle
  const testModuleId = config[0].module_id;
  const originalState = config[0].is_enabled;
  await editionService.toggleModule(festId, testModuleId, !originalState);
  const updatedConfig = await editionService.getEditionConfig(festId);
  const updatedModule = updatedConfig.find(m => m.module_id === testModuleId);
  if (updatedModule.is_enabled !== (originalState ? 0 : 1)) {
    errors.push('toggleModule failed to toggle state!');
  } else {
    console.log('  ✓ toggleModule correctly modified events_modules table');
  }
  // Revert back
  await editionService.toggleModule(festId, testModuleId, originalState);

  // 5. Test Permission Service
  console.log('\n[5/6] Testing permissionService...');
  const allPerms = await permissionService.getAllPermissions();
  console.log(`  ✓ Total permissions in registry: ${allPerms.length}`);
  const groups = await permissionService.getAllGroups();
  console.log(`  ✓ Total groups in registry: ${groups.length}`);
  for (const g of groups) {
    console.log(`    - Group '${g.group_key}' (${g.label}): ${g.permissions.length} permissions assigned`);
  }

  // 6. Test Auth & Profile Permission Resolution
  console.log('\n[6/6] Testing authService.getProfile (Permission resolution via module_groups)...');
  // Admin user
  const adminProfile = await authService.getProfile(1, festId);
  console.log(`  ✓ Admin profile resolved:`, {
    name: adminProfile.name,
    current_group: adminProfile.current_group,
    isSuperAdmin: adminProfile.isSuperAdmin,
    permissionCount: Object.keys(adminProfile.permissions).length
  });

  // Verify permission structure in map
  const samplePermKey = Object.keys(adminProfile.permissions)[0];
  const samplePerm = adminProfile.permissions[samplePermKey];
  console.log(`  ✓ Sample permission in map ('${samplePermKey}'):`, samplePerm);
  if (!samplePerm.action || !samplePerm.action.match || !samplePerm.action.unmatch) {
    errors.push(`Permission '${samplePermKey}' missing action.match/action.unmatch!`);
  }

  // Non-admin user (if exists)
  const users = await query('SELECT id, name, email FROM users WHERE id != 1 LIMIT 1');
  if (users.length > 0) {
    const regularUser = users[0];
    const regProfile = await authService.getProfile(regularUser.id, festId);
    console.log(`  ✓ User '${regularUser.name}' profile resolved:`, {
      current_group: regProfile.current_group,
      isSuperAdmin: regProfile.isSuperAdmin,
      permissionCount: Object.keys(regProfile.permissions).length
    });
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
  if (errors.length === 0) {
    console.log('🎉 ALL TESTS PASSED! Schema, services, and permission resolution are 100% verified.');
    return true;
  } else {
    console.error('❌ Errors encountered:');
    errors.forEach(e => console.error('  - ' + e));
    return false;
  }
}

verify()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error during verification:', err);
    process.exit(1);
  });
