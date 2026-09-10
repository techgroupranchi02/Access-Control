/**
 * Seed Data
 * Populates festivals, features, permissions, roles, and demo users.
 * 
 * Run: node seeders/001_seed_data.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

async function seed() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log('[Seeder] Connected to database');

  // ── 1. FEATURES ────────────────────────────────────────────────────
  console.log('[Seeder] Seeding features...');
  const features = [
    { key: 'submission', type: 'core', name: 'Submission', desc: 'Manage festival submissions', route: '/submission', icon: 'file-text', order: 1 },
    { key: 'team', type: 'core', name: 'Team', desc: 'Manage team members', route: '/team', icon: 'users', order: 2 },
    { key: 'jury', type: 'core', name: 'Jury', desc: 'Manage jury panels and evaluations', route: '/jury', icon: 'award', order: 3 },
    { key: 'customA', type: 'custom', name: 'Custom A', desc: 'Custom plugin A page', route: '/custom-a', icon: 'puzzle', component: 'CustomAPage', pluginDir: 'customA', order: 10 },
  ];

  for (const f of features) {
    await connection.execute(
      `INSERT IGNORE INTO features (feature_key, feature_type, name, description, route, icon, component_name, plugin_dir, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.key, f.type, f.name, f.desc, f.route, f.icon, f.component || null, f.pluginDir || null, f.order]
    );
  }
  console.log('[Seeder] ✓ features');

  // ── 2. FESTIVALS ───────────────────────────────────────────────────
  console.log('[Seeder] Seeding festivals...');
  await connection.execute(
    `INSERT IGNORE INTO festivals (name, slug, description) VALUES (?, ?, ?)`,
    ['Festival A', 'fest-a', 'Festival A — Core workflow + Jury enabled']
  );
  await connection.execute(
    `INSERT IGNORE INTO festivals (name, slug, description) VALUES (?, ?, ?)`,
    ['Festival B', 'fest-b', 'Festival B — Core workflow + CustomA enabled']
  );
  console.log('[Seeder] ✓ festivals');

  // Get IDs
  const [festRows] = await connection.execute(`SELECT id, slug FROM festivals`);
  const festMap = {};
  for (const r of festRows) festMap[r.slug] = r.id;

  const [featRows] = await connection.execute(`SELECT id, feature_key FROM features`);
  const featMap = {};
  for (const r of featRows) featMap[r.feature_key] = r.id;

  // ── 3. FESTIVAL ↔ FEATURE MAPPINGS ────────────────────────────────
  console.log('[Seeder] Seeding festival-feature mappings...');
  const festivalFeatures = [
    // FestA: submission ✅, team ✅, jury ✅, customA ❌
    { fest: 'fest-a', feat: 'submission', enabled: true },
    { fest: 'fest-a', feat: 'team', enabled: true },
    { fest: 'fest-a', feat: 'jury', enabled: true },
    { fest: 'fest-a', feat: 'customA', enabled: false },
    // FestB: submission ✅, team ✅, jury ❌, customA ✅
    { fest: 'fest-b', feat: 'submission', enabled: true },
    { fest: 'fest-b', feat: 'team', enabled: true },
    { fest: 'fest-b', feat: 'jury', enabled: false },
    { fest: 'fest-b', feat: 'customA', enabled: true },
  ];

  for (const ff of festivalFeatures) {
    await connection.execute(
      `INSERT IGNORE INTO festival_features (festival_id, feature_id, is_enabled) VALUES (?, ?, ?)`,
      [festMap[ff.fest], featMap[ff.feat], ff.enabled]
    );
  }
  console.log('[Seeder] ✓ festival_features');

  // ── 4. PERMISSIONS ─────────────────────────────────────────────────
  console.log('[Seeder] Seeding permissions...');
  const permissions = [
    // Submission permissions
    { key: 'submission:read', name: 'View Submissions', resource: 'submission', action: 'read', scope: 'page' },
    { key: 'submission:update', name: 'Edit Submissions', resource: 'submission', action: 'update', scope: 'section' },
    { key: 'submission:delete', name: 'Delete Submissions', resource: 'submission', action: 'delete', scope: 'element' },
    // Team permissions (page-level only)
    { key: 'team:read', name: 'View Team', resource: 'team', action: 'read', scope: 'page' },
    { key: 'team:update', name: 'Edit Team', resource: 'team', action: 'update', scope: 'section' },
    { key: 'team:delete', name: 'Delete Team Members', resource: 'team', action: 'delete', scope: 'element' },
    // Jury permissions
    { key: 'jury:read', name: 'View Jury', resource: 'jury', action: 'read', scope: 'page' },
    { key: 'jury:update', name: 'Edit Jury', resource: 'jury', action: 'update', scope: 'section' },
    { key: 'jury:delete', name: 'Delete Jury Members', resource: 'jury', action: 'delete', scope: 'element' },
    // CustomA permissions
    { key: 'customA:read', name: 'View Custom A', resource: 'customA', action: 'read', scope: 'page' },
    { key: 'customA:update', name: 'Edit Custom A', resource: 'customA', action: 'update', scope: 'section' },
    { key: 'customA:delete', name: 'Delete Custom A Items', resource: 'customA', action: 'delete', scope: 'element' },
    // Admin permission
    { key: 'admin:access', name: 'Admin Access', resource: 'admin', action: 'read', scope: 'page' },
  ];

  for (const p of permissions) {
    await connection.execute(
      `INSERT IGNORE INTO permissions (permission_key, name, description, resource, action, scope)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [p.key, p.name, p.name, p.resource, p.action, p.scope]
    );
  }
  console.log('[Seeder] ✓ permissions');

  // Get permission IDs
  const [permRows] = await connection.execute(`SELECT id, permission_key FROM permissions`);
  const permMap = {};
  for (const r of permRows) permMap[r.permission_key] = r.id;

  // ── 5. PERMISSION GROUPS ───────────────────────────────────────────
  console.log('[Seeder] Seeding permission groups...');
  const groups = [
    { name: 'Core Submission Group', slug: 'core-submission-group', desc: 'Permissions for Submission feature' },
    { name: 'Core Team Group', slug: 'core-team-group', desc: 'Permissions for Team feature' },
    { name: 'Core Jury Group', slug: 'core-jury-group', desc: 'Permissions for Jury feature' },
    { name: 'CustomGroupX', slug: 'custom-group-x', desc: 'Permissions for Custom A feature' },
    { name: 'Admin Group', slug: 'admin-group', desc: 'Admin access permissions' },
  ];

  for (const g of groups) {
    await connection.execute(
      `INSERT IGNORE INTO permission_groups (name, slug, description) VALUES (?, ?, ?)`,
      [g.name, g.slug, g.desc]
    );
  }
  console.log('[Seeder] ✓ permission_groups');

  // Get group IDs
  const [groupRows] = await connection.execute(`SELECT id, slug FROM permission_groups`);
  const groupMap = {};
  for (const r of groupRows) groupMap[r.slug] = r.id;

  // ── 6. PERMISSION GROUP ITEMS ──────────────────────────────────────
  console.log('[Seeder] Seeding permission group items...');
  const groupItems = [
    { group: 'core-submission-group', perms: ['submission:read', 'submission:update', 'submission:delete'] },
    { group: 'core-team-group', perms: ['team:read', 'team:update', 'team:delete'] },
    { group: 'core-jury-group', perms: ['jury:read', 'jury:update', 'jury:delete'] },
    { group: 'custom-group-x', perms: ['customA:read', 'customA:update', 'customA:delete'] },
    { group: 'admin-group', perms: ['admin:access'] },
  ];

  for (const gi of groupItems) {
    for (const pKey of gi.perms) {
      await connection.execute(
        `INSERT IGNORE INTO permission_group_items (permission_group_id, permission_id) VALUES (?, ?)`,
        [groupMap[gi.group], permMap[pKey]]
      );
    }
  }
  console.log('[Seeder] ✓ permission_group_items');

  // ── 7. FEATURE ↔ PERMISSION GROUP MAPPING ─────────────────────────
  console.log('[Seeder] Seeding feature-permission-group mappings...');
  const featureGroups = [
    { feat: 'submission', group: 'core-submission-group' },
    { feat: 'team', group: 'core-team-group' },
    { feat: 'jury', group: 'core-jury-group' },
    { feat: 'customA', group: 'custom-group-x' },
  ];

  for (const fg of featureGroups) {
    await connection.execute(
      `INSERT IGNORE INTO feature_permission_groups (feature_id, permission_group_id) VALUES (?, ?)`,
      [featMap[fg.feat], groupMap[fg.group]]
    );
  }
  console.log('[Seeder] ✓ feature_permission_groups');

  // ── 8. ROLES ───────────────────────────────────────────────────────
  console.log('[Seeder] Seeding roles...');
  const roles = [
    { name: 'Admin', slug: 'admin', desc: 'Full access — all permissions', isSystem: true },
    { name: 'Manager', slug: 'manager', desc: 'Read + Update access — no delete', isSystem: false },
    { name: 'Viewer', slug: 'viewer', desc: 'Read-only access', isSystem: false },
  ];

  for (const r of roles) {
    await connection.execute(
      `INSERT IGNORE INTO roles (name, slug, description, is_system) VALUES (?, ?, ?, ?)`,
      [r.name, r.slug, r.desc, r.isSystem]
    );
  }
  console.log('[Seeder] ✓ roles');

  // Get role IDs
  const [roleRows] = await connection.execute(`SELECT id, slug FROM roles`);
  const roleMap = {};
  for (const r of roleRows) roleMap[r.slug] = r.id;

  // ── 9. ROLE ↔ PERMISSION MAPPING ──────────────────────────────────
  console.log('[Seeder] Seeding role permissions...');

  // Admin gets ALL permissions
  const allPermKeys = Object.keys(permMap);
  for (const pKey of allPermKeys) {
    await connection.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [roleMap['admin'], permMap[pKey]]
    );
  }

  // Manager gets read + update permissions (no delete, no admin)
  const managerPerms = allPermKeys.filter(k => (k.endsWith(':read') || k.endsWith(':update')) && k !== 'admin:access');
  for (const pKey of managerPerms) {
    await connection.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [roleMap['manager'], permMap[pKey]]
    );
  }

  // Viewer gets read-only permissions (no admin)
  const viewerPerms = allPermKeys.filter(k => k.endsWith(':read') && k !== 'admin:access');
  for (const pKey of viewerPerms) {
    await connection.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [roleMap['viewer'], permMap[pKey]]
    );
  }
  console.log('[Seeder] ✓ role_permissions');

  // ── 10. DEMO USERS ─────────────────────────────────────────────────
  console.log('[Seeder] Seeding demo users...');
  const demoPassword = await bcrypt.hash('Demo@12345', BCRYPT_ROUNDS);

  const users = [
    { name: 'Admin User', email: 'admin@demo.com' },
    { name: 'Manager User', email: 'manager@demo.com' },
    { name: 'Viewer User', email: 'viewer@demo.com' },
  ];

  for (const u of users) {
    await connection.execute(
      `INSERT IGNORE INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
      [u.name, u.email, demoPassword]
    );
  }
  console.log('[Seeder] ✓ users');

  // Get user IDs
  const [userRows] = await connection.execute(`SELECT id, email FROM users`);
  const userMap = {};
  for (const r of userRows) userMap[r.email] = r.id;

  // ── 11. USER ↔ FESTIVAL ↔ ROLE ASSIGNMENTS ────────────────────────
  console.log('[Seeder] Seeding user-festival-role assignments...');

  // Assign each user their role for BOTH festivals
  const assignments = [
    { email: 'admin@demo.com', role: 'admin' },
    { email: 'manager@demo.com', role: 'manager' },
    { email: 'viewer@demo.com', role: 'viewer' },
  ];

  for (const a of assignments) {
    for (const festSlug of ['fest-a', 'fest-b']) {
      await connection.execute(
        `INSERT IGNORE INTO user_festival_roles (user_id, festival_id, role_id) VALUES (?, ?, ?)`,
        [userMap[a.email], festMap[festSlug], roleMap[a.role]]
      );
    }
  }
  console.log('[Seeder] ✓ user_festival_roles');

  console.log('\n[Seeder] ══════════════════════════════════════');
  console.log('[Seeder] All seed data inserted successfully!');
  console.log('[Seeder] ══════════════════════════════════════');
  console.log('[Seeder] Demo accounts:');
  console.log('[Seeder]   admin@demo.com   / Demo@12345  (Full access)');
  console.log('[Seeder]   manager@demo.com / Demo@12345  (Read + Update)');
  console.log('[Seeder]   viewer@demo.com  / Demo@12345  (Read only)');
  console.log('[Seeder] ══════════════════════════════════════\n');

  await connection.end();
}

seed().catch((err) => {
  console.error('[Seeder] Failed:', err.message);
  process.exit(1);
});
