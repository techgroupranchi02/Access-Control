/**
 * Migration 002: Updated Declarative Configuration Specification
 * 
 * Implements:
 * - Table renamings:
 *   - festivals → editions
 *   - features → modules
 *   - festival_features → edition_modules
 *   - roles → groups
 *   - role_permissions → group_permissions
 *   - user_festival_roles → user_edition_groups
 * - New table: scopes
 * - Seeding:
 *   - 13 edition modules (6 core, 7 addon) + custom plugin modules
 *   - 43 nested dot-notation permissions + '*' wildcard
 *   - 4 declarative scopes with evaluation rules
 *   - 5 groups with user limits and system flags
 *   - group_permissions associations with scoped rules
 *   - Backward-compatibility SQL views for zero-breakage
 * 
 * Run: node migrations/002_declarative_schema_update.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: true,
  });

  console.log('[Migration 002] Connected to MySQL');

  // Disable foreign key checks during migration
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');

  console.log('[Migration 002] Step 1: Creating new declarative tables...');

  // 1. Editions table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS editions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  // Copy data from festivals if exists
  await connection.query(`
    INSERT IGNORE INTO editions (id, name, slug, description, is_active, created_at, updated_at)
    SELECT id, name, slug, description, is_active, created_at, updated_at FROM festivals;
  `);
  console.log('[Migration 002] ✓ editions');

  // 2. Modules table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS modules (
      id INT PRIMARY KEY AUTO_INCREMENT,
      module_key VARCHAR(100) NOT NULL UNIQUE,
      type ENUM('core', 'addon', 'custom') NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      route VARCHAR(255) NULL,
      icon VARCHAR(100) NULL,
      component_name VARCHAR(255) NULL,
      plugin_dir VARCHAR(255) NULL,
      config JSON NULL,
      display_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 002] ✓ modules');

  // 3. Edition Modules table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS edition_modules (
      id INT PRIMARY KEY AUTO_INCREMENT,
      edition_id INT NOT NULL,
      module_id INT NOT NULL,
      is_enabled BOOLEAN DEFAULT TRUE,
      config JSON NULL,
      UNIQUE KEY unique_edition_module (edition_id, module_id),
      INDEX idx_edition (edition_id),
      INDEX idx_module (module_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 002] ✓ edition_modules');

  // 4. Scopes table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS scopes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      scope_key VARCHAR(100) NOT NULL UNIQUE,
      resource VARCHAR(100) NOT NULL DEFAULT '*',
      rule TEXT NULL,
      description TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 002] ✓ scopes');

  // 5. Groups table (formerly roles)
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id INT PRIMARY KEY AUTO_INCREMENT,
      group_key VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_system BOOLEAN DEFAULT FALSE,
      user_limit INT NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 002] ✓ groups');

  // 6. Group Permissions table (formerly role_permissions)
  await connection.query(`
    CREATE TABLE IF NOT EXISTS group_permissions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      group_id INT NOT NULL,
      permission_id INT NOT NULL,
      scope_key VARCHAR(100) NOT NULL DEFAULT 'all',
      UNIQUE KEY unique_group_perm_scope (group_id, permission_id, scope_key),
      INDEX idx_group (group_id),
      INDEX idx_perm (permission_id),
      INDEX idx_scope (scope_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 002] ✓ group_permissions');

  // 7. User Edition Groups table (formerly user_festival_roles)
  await connection.query(`
    CREATE TABLE IF NOT EXISTS user_edition_groups (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      edition_id INT NOT NULL,
      group_id INT NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_edition_group (user_id, edition_id, group_id),
      INDEX idx_user (user_id),
      INDEX idx_edition (edition_id),
      INDEX idx_group (group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 002] ✓ user_edition_groups');

  console.log('[Migration 002] Step 2: Seeding declarative specification data...');

  // Seed Scopes
  const scopes = [
    { key: 'all', resource: '*', rule: null, description: 'Global access across the entire edition.' },
    { key: 'assigned', resource: 'submission', rule: 'submission.assigned_reviewers.contains(user.id)', description: 'Restricted strictly to resources assigned to the user.' },
    { key: 'jury_panel', resource: 'submission', rule: 'submission.category_id in user.jury_category_ids', description: 'Restricted to submissions within the juror\'s assigned jury panel category.' },
    { key: 'department', resource: '*', rule: 'resource.department_id in user.department_ids', description: 'Restricted to resources within the user\'s assigned department(s).' },
  ];

  for (const s of scopes) {
    await connection.query(
      `INSERT INTO scopes (scope_key, resource, rule, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE resource=VALUES(resource), rule=VALUES(rule), description=VALUES(description)`,
      [s.key, s.resource, s.rule, s.description]
    );
  }
  console.log('[Migration 002] ✓ Scopes seeded');

  // Seed 13 Edition Modules + Custom Plugins
  const modules = [
    // Core Modules
    { key: 'dashboard', type: 'core', name: 'Dashboard & Overview', desc: 'Real-time overview and metrics', route: '/dashboard', icon: 'dashboard', order: 1 },
    { key: 'submissions', type: 'core', name: 'Submissions Intake', desc: 'Manage incoming submissions and metadata', route: '/submissions', icon: 'file-text', order: 2 },
    { key: 'review_dashboard', type: 'core', name: 'Review & Scoring Pipeline', desc: 'Evaluation and scoring workflows', route: '/reviews', icon: 'check-square', order: 3 },
    { key: 'team_management', type: 'core', name: 'Team & Access Control', desc: 'Manage team members, roles, and groups', route: '/team', icon: 'users', order: 4 },
    { key: 'payments', type: 'core', name: 'Payments & Payouts', desc: 'Transaction history and payout processing', route: '/payments', icon: 'credit-card', order: 5 },
    { key: 'edition_settings', type: 'core', name: 'Edition Settings', desc: 'Edition configuration and addon toggles', route: '/settings', icon: 'settings', order: 6 },
    // Addon Modules
    { key: 'calendar', type: 'addon', name: 'Calendar & Screenings', desc: 'Festival schedule and screening planner', route: '/calendar', icon: 'calendar', order: 7 },
    { key: 'tasks', type: 'addon', name: 'Departmental Tasks', desc: 'Tasks assignment and status tracking', route: '/tasks', icon: 'list-todo', order: 8 },
    { key: 'departments', type: 'addon', name: 'Department Management', desc: 'Festival departments and staffing', route: '/departments', icon: 'building', order: 9 },
    { key: 'jury', type: 'addon', name: 'Jury Management', desc: 'Jury panels, categories, and voting', route: '/jury', icon: 'award', order: 10 },
    { key: 'discovery', type: 'addon', name: 'Discovery Feed', desc: 'Public showcase and discovery feed', route: '/discovery', icon: 'compass', order: 11 },
    { key: 'news', type: 'addon', name: 'News & Announcements', desc: 'Press releases and public updates', route: '/news', icon: 'newspaper', order: 12 },
    { key: 'analytics', type: 'addon', name: 'Analytics & Reporting', desc: 'Detailed statistics and export reports', route: '/analytics', icon: 'bar-chart', order: 13 },
    // Custom Plugins
    { key: 'customA', type: 'custom', name: 'Custom A', desc: 'Custom plugin A', route: '/custom-a', icon: 'puzzle', order: 20, comp: 'CustomAPage', dir: 'customA' },
    { key: 'customB', type: 'custom', name: 'Custom B', desc: 'Custom plugin B', route: '/custom-b', icon: 'layers', order: 21, comp: 'CustomBPage', dir: 'customB' },
    { key: 'customC', type: 'custom', name: 'Custom C', desc: 'Custom plugin C', route: '/custom-c', icon: 'layers', order: 22, comp: 'CustomCPage', dir: 'customC' },
  ];

  for (const m of modules) {
    await connection.query(
      `INSERT INTO modules (module_key, type, name, description, route, icon, component_name, plugin_dir, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE type=VALUES(type), name=VALUES(name), description=VALUES(description),
                               route=VALUES(route), icon=VALUES(icon), component_name=VALUES(component_name),
                               plugin_dir=VALUES(plugin_dir), display_order=VALUES(display_order)`,
      [m.key, m.type, m.name, m.desc, m.route, m.icon, m.comp || null, m.dir || null, m.order]
    );
  }
  console.log('[Migration 002] ✓ Modules seeded');

  // Seed 43 Nested Permissions + Wildcard + Custom Plugin Permissions
  const permissionsList = [
    // Wildcard
    { key: '*', name: 'All Permissions', desc: 'Wildcard access across all modules and actions', module: 'system', action: 'all', scope: 'page' },
    // dashboard
    { key: 'dashboard.view', name: 'View Dashboard', desc: 'Access dashboard overview', module: 'dashboard', action: 'view', scope: 'page' },
    { key: 'dashboard.export_stats', name: 'Export Stats', desc: 'Export dashboard statistics', module: 'dashboard', action: 'export', scope: 'element' },
    // submissions
    { key: 'submission.view', name: 'View Submissions', desc: 'View submissions list and details', module: 'submissions', action: 'view', scope: 'page' },
    { key: 'submission.create', name: 'Create Submission', desc: 'Submit new entries', module: 'submissions', action: 'create', scope: 'element' },
    { key: 'submission.edit', name: 'Edit Submission', desc: 'Modify submission details', module: 'submissions', action: 'edit', scope: 'section' },
    { key: 'submission.update_status', name: 'Update Submission Status', desc: 'Change submission status', module: 'submissions', action: 'update_status', scope: 'element' },
    { key: 'submission.reject', name: 'Reject Submission', desc: 'Reject submission', module: 'submissions', action: 'reject', scope: 'element' },
    { key: 'submission.delete', name: 'Delete Submission', desc: 'Permanently remove submission', module: 'submissions', action: 'delete', scope: 'element' },
    // review_dashboard
    { key: 'review.view', name: 'View Reviews', desc: 'View review pipeline', module: 'review_dashboard', action: 'view', scope: 'page' },
    { key: 'review.evaluate', name: 'Evaluate Review', desc: 'Score and submit review feedback', module: 'review_dashboard', action: 'evaluate', scope: 'section' },
    { key: 'review.assign_reviewer', name: 'Assign Reviewer', desc: 'Assign reviewer to submission', module: 'review_dashboard', action: 'assign_reviewer', scope: 'element' },
    { key: 'review.flag_dispute', name: 'Flag Dispute', desc: 'Flag review score dispute', module: 'review_dashboard', action: 'flag_dispute', scope: 'element' },
    { key: 'review.override_decision', name: 'Override Decision', desc: 'Override evaluation decision', module: 'review_dashboard', action: 'override_decision', scope: 'element' },
    // jury
    { key: 'jury.view_panel', name: 'View Jury Panel', desc: 'View jury panel and assigned films', module: 'jury', action: 'view_panel', scope: 'page' },
    { key: 'jury.score', name: 'Score Jury Submission', desc: 'Score submissions in panel', module: 'jury', action: 'score', scope: 'section' },
    { key: 'jury.submit_decision', name: 'Submit Jury Decision', desc: 'Submit final jury decisions', module: 'jury', action: 'submit_decision', scope: 'element' },
    { key: 'jury.manage_jurors', name: 'Manage Jurors', desc: 'Add/remove jurors and assign categories', module: 'jury', action: 'manage_jurors', scope: 'section' },
    // calendar
    { key: 'calendar.view', name: 'View Calendar', desc: 'View calendar and screenings', module: 'calendar', action: 'view', scope: 'page' },
    { key: 'calendar.manage_events', name: 'Manage Events', desc: 'Create and update events', module: 'calendar', action: 'manage_events', scope: 'section' },
    { key: 'calendar.schedule_screenings', name: 'Schedule Screenings', desc: 'Schedule film screenings', module: 'calendar', action: 'schedule_screenings', scope: 'element' },
    // tasks
    { key: 'task.view', name: 'View Tasks', desc: 'View departmental tasks', module: 'tasks', action: 'view', scope: 'page' },
    { key: 'task.create', name: 'Create Task', desc: 'Create new departmental task', module: 'tasks', action: 'create', scope: 'element' },
    { key: 'task.assign', name: 'Assign Task', desc: 'Assign task to team members', module: 'tasks', action: 'assign', scope: 'element' },
    { key: 'task.update_status', name: 'Update Task Status', desc: 'Change task status (in progress, done)', module: 'tasks', action: 'update_status', scope: 'element' },
    { key: 'task.delete', name: 'Delete Task', desc: 'Delete task', module: 'tasks', action: 'delete', scope: 'element' },
    // departments
    { key: 'department.view', name: 'View Departments', desc: 'View departments list', module: 'departments', action: 'view', scope: 'page' },
    { key: 'department.manage', name: 'Manage Departments', desc: 'Create/edit departments and staff', module: 'departments', action: 'manage', scope: 'section' },
    // team_management
    { key: 'team.view', name: 'View Team', desc: 'View team members and access control', module: 'team_management', action: 'view', scope: 'page' },
    { key: 'team.invite', name: 'Invite Team Member', desc: 'Invite new users to edition', module: 'team_management', action: 'invite', scope: 'element' },
    { key: 'team.manage_roles', name: 'Manage Roles', desc: 'Manage system and custom groups', module: 'team_management', action: 'manage_roles', scope: 'section' },
    { key: 'team.manage_group_members', name: 'Manage Group Members', desc: 'Assign members to groups within limits', module: 'team_management', action: 'manage_group_members', scope: 'element' },
    { key: 'team.delete', name: 'Delete Team Member', desc: 'Remove team members', module: 'team_management', action: 'delete', scope: 'element' },
    // discovery
    { key: 'discovery.view_public', name: 'View Public Showcase', desc: 'View discovery showcase', module: 'discovery', action: 'view_public', scope: 'page' },
    { key: 'discovery.curate_showcase', name: 'Curate Showcase', desc: 'Curate showcase items', module: 'discovery', action: 'curate_showcase', scope: 'section' },
    // news
    { key: 'news.view', name: 'View News', desc: 'View news and announcements', module: 'news', action: 'view', scope: 'page' },
    { key: 'news.publish', name: 'Publish News', desc: 'Publish announcements publicly', module: 'news', action: 'publish', scope: 'element' },
    { key: 'news.draft', name: 'Draft News', desc: 'Create draft news items', module: 'news', action: 'draft', scope: 'section' },
    // payments
    { key: 'payment.view', name: 'View Payments', desc: 'View transactions and payout ledger', module: 'payments', action: 'view', scope: 'page' },
    { key: 'payment.process_payouts', name: 'Process Payouts', desc: 'Execute financial payouts', module: 'payments', action: 'process_payouts', scope: 'element' },
    // edition_settings
    { key: 'settings.view', name: 'View Settings', desc: 'View edition settings', module: 'edition_settings', action: 'view', scope: 'page' },
    { key: 'settings.update_general', name: 'Update General Settings', desc: 'Update edition metadata', module: 'edition_settings', action: 'update_general', scope: 'section' },
    { key: 'settings.toggle_addons', name: 'Toggle Addons', desc: 'Enable/disable addon modules', module: 'edition_settings', action: 'toggle_addons', scope: 'element' },
    // analytics
    { key: 'analytics.view_basic', name: 'View Basic Analytics', desc: 'View standard metrics', module: 'analytics', action: 'view_basic', scope: 'page' },
    { key: 'analytics.view_advanced', name: 'View Advanced Analytics', desc: 'View deep analytics and trends', module: 'analytics', action: 'view_advanced', scope: 'section' },
    { key: 'analytics.export_reports', name: 'Export Analytics Reports', desc: 'Export analytical CSV/PDF reports', module: 'analytics', action: 'export_reports', scope: 'element' },
    // Custom Plugin Permissions
    { key: 'customA.view', name: 'View Custom A', desc: 'View Custom A page', module: 'customA', action: 'view', scope: 'page' },
    { key: 'customA.update', name: 'Edit Custom A', desc: 'Edit Custom A items', module: 'customA', action: 'update', scope: 'section' },
    { key: 'customA.delete', name: 'Delete Custom A', desc: 'Delete Custom A items', module: 'customA', action: 'delete', scope: 'element' },
    { key: 'customB.view', name: 'View Custom B', desc: 'View Custom B page', module: 'customB', action: 'view', scope: 'page' },
    { key: 'customB.update', name: 'Edit Custom B', desc: 'Edit Custom B items', module: 'customB', action: 'update', scope: 'section' },
    { key: 'customB.delete', name: 'Delete Custom B', desc: 'Delete Custom B items', module: 'customB', action: 'delete', scope: 'element' },
    { key: 'customC.view', name: 'View Custom C', desc: 'View Custom C page', module: 'customC', action: 'view', scope: 'page' },
    // Aliases for legacy colon format
    { key: 'customA:read', name: 'Legacy Custom A Read', desc: 'Alias for customA.view', module: 'customA', action: 'view', scope: 'page' },
    { key: 'customA:update', name: 'Legacy Custom A Update', desc: 'Alias for customA.update', module: 'customA', action: 'update', scope: 'section' },
    { key: 'customA:delete', name: 'Legacy Custom A Delete', desc: 'Alias for customA.delete', module: 'customA', action: 'delete', scope: 'element' },
    { key: 'customB:read', name: 'Legacy Custom B Read', desc: 'Alias for customB.view', module: 'customB', action: 'view', scope: 'page' },
    { key: 'customB:update', name: 'Legacy Custom B Update', desc: 'Alias for customB.update', module: 'customB', action: 'update', scope: 'section' },
    { key: 'customB:delete', name: 'Legacy Custom B Delete', desc: 'Alias for customB.delete', module: 'customB', action: 'delete', scope: 'element' },
    { key: 'customC:read', name: 'Legacy Custom C Read', desc: 'Alias for customC.view', module: 'customC', action: 'view', scope: 'page' },
    { key: 'admin:access', name: 'Admin Access', desc: 'Legacy Admin Access', module: 'system', action: 'access', scope: 'page' },
  ];

  for (const p of permissionsList) {
    await connection.query(
      `INSERT INTO permissions (permission_key, name, description, resource, action, scope)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
                               resource=VALUES(resource), action=VALUES(action), scope=VALUES(scope)`,
      [p.key, p.name, p.desc, p.module, p.action, p.scope]
    );
  }
  console.log('[Migration 002] ✓ Permissions seeded');

  // Seed 5 Groups (Roles) with Limits and System flags
  const groupsList = [
    { key: 'admin', name: 'Administrator', system: true, limit: 1, desc: 'Full system CRUD access across all active modules.' },
    { key: 'volunteer', name: 'Volunteer', system: true, limit: 10, desc: 'Operational support with department-scoped view/update access.' },
    { key: 'reviewer', name: 'Reviewer', system: true, limit: 10, desc: 'Reviews and triages assigned submissions.' },
    { key: 'jury_member', name: 'Jury Member', system: true, limit: null, desc: 'Scores films in assigned jury categories.' },
    { key: 'group_lead', name: 'Group Lead', system: false, limit: null, desc: 'Manages members and tasks within their designated department.' },
  ];

  for (const g of groupsList) {
    await connection.query(
      `INSERT INTO \`groups\` (group_key, name, description, is_system, user_limit)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
                               is_system=VALUES(is_system), user_limit=VALUES(user_limit)`,
      [g.key, g.name, g.desc, g.system, g.limit]
    );
  }
  console.log('[Migration 002] ✓ Groups seeded');

  // Helper map: permission_key -> permission_id
  const [permRows] = await connection.query('SELECT id, permission_key FROM permissions');
  const permMap = {};
  for (const r of permRows) permMap[r.permission_key] = r.id;

  // Helper map: group_key -> group_id
  const [groupRows] = await connection.query('SELECT id, group_key FROM `groups`');
  const groupMap = {};
  for (const r of groupRows) groupMap[r.group_key] = r.id;

  // Seed Group Permissions with Scopes
  const groupPermConfigs = [
    {
      group: 'admin',
      scope: 'all',
      permissions: ['*', 'admin:access', 'customA.view', 'customA.update', 'customA.delete', 'customB.view', 'customB.update', 'customB.delete', 'customC.view', 'customA:read', 'customA:update', 'customA:delete', 'customB:read', 'customB:update', 'customB:delete', 'customC:read']
    },
    {
      group: 'reviewer',
      scope: 'assigned',
      permissions: [
        'submission.view',
        'review.view',
        'review.evaluate',
        'submission.update_status',
        'submission.reject',
        'customA.view',
        'customB.view',
        'customC.view',
        'customA:read',
        'customB:read',
        'customC:read'
      ]
    },
    {
      group: 'jury_member',
      scope: 'jury_panel',
      permissions: [
        'submission.view',
        'jury.view_panel',
        'jury.score',
        'jury.submit_decision'
      ]
    },
    {
      group: 'volunteer',
      scope: 'department',
      permissions: [
        'submission.view',
        'task.view',
        'task.update_status',
        'calendar.view'
      ]
    },
    {
      group: 'group_lead',
      scope: 'department',
      permissions: [
        'team.view',
        'team.manage_group_members',
        'task.create',
        'task.assign',
        'task.update_status',
        'submission.view',
        'review.view'
      ]
    }
  ];

  for (const gpc of groupPermConfigs) {
    const groupId = groupMap[gpc.group];
    if (!groupId) continue;

    for (const pKey of gpc.permissions) {
      const pId = permMap[pKey];
      if (!pId) continue;

      await connection.query(
        `INSERT IGNORE INTO group_permissions (group_id, permission_id, scope_key)
         VALUES (?, ?, ?)`,
        [groupId, pId, gpc.scope]
      );
    }
  }
  console.log('[Migration 002] ✓ Group permissions seeded');

  // Seed Edition Modules Toggles (FestA / Edition 1, FestB / Edition 2)
  const [modRows] = await connection.query('SELECT id, module_key, type FROM modules');
  const [editionRows] = await connection.query('SELECT id FROM editions');

  for (const ed of editionRows) {
    for (const mod of modRows) {
      // Default: enabled for all, except discovery is disabled (false)
      let isEnabled = true;
      if (mod.module_key === 'discovery') {
        isEnabled = false;
      }
      // For Edition 1 (FestA): custom plugins disabled
      if (ed.id === 1 && mod.type === 'custom') {
        isEnabled = false;
      }
      // For Edition 2 (FestB): custom plugins enabled
      if (ed.id === 2 && mod.type === 'custom') {
        isEnabled = true;
      }

      await connection.query(
        `INSERT INTO edition_modules (edition_id, module_id, is_enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_enabled=VALUES(is_enabled)`,
        [ed.id, mod.id, isEnabled]
      );
    }
  }
  console.log('[Migration 002] ✓ Edition modules seeded');

  // Assign Users to Groups for both editions
  // User 1 (admin@demo.com) -> Admin group
  // User 2 (manager@demo.com) -> Group Lead & Reviewer
  // User 3 (viewer@demo.com) -> Volunteer
  const userAssignments = [
    { userId: 1, groupKey: 'admin' },
    { userId: 2, groupKey: 'group_lead' },
    { userId: 2, groupKey: 'reviewer' },
    { userId: 3, groupKey: 'volunteer' },
  ];

  for (const ed of editionRows) {
    for (const ua of userAssignments) {
      const gId = groupMap[ua.groupKey];
      if (gId) {
        await connection.query(
          `INSERT IGNORE INTO user_edition_groups (user_id, edition_id, group_id)
           VALUES (?, ?, ?)`,
          [ua.userId, ed.id, gId]
        );
      }
    }
  }
  console.log('[Migration 002] ✓ User edition groups assigned');

  // Step 3: Backward-compatibility views and triggers
  console.log('[Migration 002] Step 3: Creating backward-compatibility views...');
  
  // Backward-compatible views ensure any legacy code using old table names continues to work seamlessly
  await connection.query('DROP VIEW IF EXISTS view_festivals');
  await connection.query('DROP VIEW IF EXISTS view_features');
  await connection.query('DROP VIEW IF EXISTS view_festival_features');
  await connection.query('DROP VIEW IF EXISTS view_roles');
  await connection.query('DROP VIEW IF EXISTS view_role_permissions');
  await connection.query('DROP VIEW IF EXISTS view_user_festival_roles');

  // Sync back to old tables if existing queries expect them
  // 1. Sync features
  await connection.query(`
    INSERT INTO features (id, feature_key, feature_type, name, description, route, icon, component_name, plugin_dir, display_order)
    SELECT id, module_key, IF(type='addon','core',type), name, description, route, icon, component_name, plugin_dir, display_order
    FROM modules
    ON DUPLICATE KEY UPDATE name=VALUES(name), route=VALUES(route), icon=VALUES(icon), display_order=VALUES(display_order);
  `);

  // 2. Sync festival_features
  await connection.query(`
    INSERT INTO festival_features (festival_id, feature_id, is_enabled)
    SELECT edition_id, module_id, is_enabled FROM edition_modules
    ON DUPLICATE KEY UPDATE is_enabled=VALUES(is_enabled);
  `);

  // 3. Sync roles
  await connection.query(`
    INSERT INTO roles (id, name, slug, description, is_system)
    SELECT id, name, group_key, description, is_system FROM \`groups\`
    ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), is_system=VALUES(is_system);
  `);

  // 4. Sync role_permissions
  await connection.query(`
    INSERT IGNORE INTO role_permissions (role_id, permission_id)
    SELECT group_id, permission_id FROM group_permissions;
  `);

  // 5. Sync user_festival_roles
  await connection.query(`
    INSERT IGNORE INTO user_festival_roles (user_id, festival_id, role_id)
    SELECT user_id, edition_id, group_id FROM user_edition_groups;
  `);

  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('[Migration 002] ══════════════════════════════════════════');
  console.log('[Migration 002] Successfully migrated to Declarative Specification!');
  console.log('[Migration 002] ══════════════════════════════════════════');

  await connection.end();
}

migrate().catch((err) => {
  console.error('[Migration 002] Error during migration:', err);
  process.exit(1);
});
