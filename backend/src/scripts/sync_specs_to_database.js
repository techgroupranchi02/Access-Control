/**
 * Sync Database to Freecomers Admin Module Specs (v8.0)
 * 
 * Synchronizes modules, pages, permissions, groups, module_groups, 
 * module_groups_permissions, and events_modules to match the 
 * Freecomers Admin Module Specs document.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/Access-Control/backend/.env' });

const CANONICAL_GROUPS = [
  { key: 'admin', label: 'Admin', description: 'Festival Director & Control Tower governance', is_system: 1 },
  { key: 'jury', label: 'Jury', description: 'Screening reviews, scorecards and jury ballots', is_system: 1 },
  { key: 'volunteer', label: 'Volunteer', description: 'Shift operations, task execution and check-in desk', is_system: 1 }
];

const MODULES_SPECS = [
  {
    module_key: 'submissions',
    type: 'core',
    label: 'Submissions',
    description: 'Intake catalog, film review pipeline, scorecards and selection',
    route: '/submissions',
    icon: 'film',
    display_order: 1,
    pages: [
      { page_key: 'all_submissions', label: 'All Submissions', route: '/submissions', display_order: 1 },
      { page_key: 'review_dashboard', label: 'Review Dashboard', route: '/review-dashboard', display_order: 2 }
    ],
    permissions: [
      { key: 'submission:view', label: 'View Submissions', description: 'Read catalog records, metadata, synopsis, review status, and scorecards.' },
      { key: 'submission:create', label: 'Create Submission', description: 'Register or manually ingest new submission entries.' },
      { key: 'submission:edit', label: 'Edit Submission', description: 'Edit film metadata (title, director, category, runtime, contact).' },
      { key: 'submission:flag', label: 'Flag Submission', description: 'Assign, change, or clear editorial/technical flags on films.' },
      { key: 'submission:reject', label: 'Reject Submission', description: 'Execute permanent terminal rejection with mandatory 10-char reason.' },
      { key: 'submission:delete', label: 'Delete Submission', description: 'Purge a film record from the festival database.' },
      { key: 'review:view', label: 'View Reviews', description: 'Access the screening pipeline and review scoreboard.' },
      { key: 'review:assign', label: 'Assign Reviews', description: 'Assign jury members to screening rounds.' },
      { key: 'review:score', label: 'Score Submission', description: 'Submit ratings, criteria scorecards, and private review notes.' },
      { key: 'review:advance', label: 'Advance Submission', description: 'Promote submissions to subsequent screening rounds or Official Selection.' },
      { key: 'review:override', label: 'Override Review', description: 'Override jury consensus or manually decide borderline films.' }
    ],
    groupAccess: {
      admin: ['submission:view', 'submission:create', 'submission:edit', 'submission:flag', 'submission:reject', 'submission:delete', 'review:view', 'review:assign', 'review:score', 'review:advance', 'review:override'],
      jury: ['submission:view', 'review:view', 'review:score'],
      volunteer: []
    }
  },
  {
    module_key: 'jury',
    type: 'addon',
    label: 'Jury',
    description: 'Juror directory, award categories, and confidential ballots',
    route: '/discover-jury',
    icon: 'award',
    display_order: 2,
    pages: [
      { page_key: 'discover_jury', label: 'Discover Jury', route: '/discover-jury', display_order: 1 },
      { page_key: 'jury_workspace', label: 'Jury Workspace & Ballot Portal', route: '/jury/:userId/review-dashboard', display_order: 2 }
    ],
    permissions: [
      { key: 'jury:view_directory', label: 'View Directory', description: 'Browse verified industry jurors and their credits.' },
      { key: 'jury:invite', label: 'Invite Jurors', description: 'Send invitations to prospective jury members.' },
      { key: 'jury:manage_awards', label: 'Manage Awards', description: 'Create and reorder festival award categories.' },
      { key: 'jury:vote_control', label: 'Vote Control', description: 'Open or close the confidential jury voting window.' },
      { key: 'jury:submit_ballot', label: 'Submit Ballot', description: 'Cast and lock secret ballot votes for nominated films.' },
      { key: 'jury:publish_awards', label: 'Publish Awards', description: 'Certify results and publish final award winners.' }
    ],
    groupAccess: {
      admin: ['jury:view_directory', 'jury:invite', 'jury:manage_awards', 'jury:vote_control', 'jury:submit_ballot', 'jury:publish_awards'],
      jury: ['jury:submit_ballot'],
      volunteer: []
    }
  },
  {
    module_key: 'team',
    type: 'core',
    label: 'Team',
    description: 'Team roster, role assignments, and access control governance',
    route: '/team',
    icon: 'users',
    display_order: 3,
    pages: [
      { page_key: 'team_hub', label: 'Team & Access Control Hub', route: '/team', display_order: 1 }
    ],
    permissions: [
      { key: 'team:view', label: 'View Team', description: 'Read roster members, contact emails, assigned roles, and departments.' },
      { key: 'team:manage', label: 'Manage Team', description: 'Add new users, edit role assignments, assign departments, delete users.' }
    ],
    groupAccess: {
      admin: ['team:view', 'team:manage'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'tasks',
    type: 'addon',
    label: 'Tasks',
    description: 'Operational tasks board, duty delegation, and shift tracking',
    route: '/tasks',
    icon: 'check-square',
    display_order: 4,
    pages: [
      { page_key: 'tasks_board', label: 'Operational Tasks Board', route: '/tasks', display_order: 1 }
    ],
    permissions: [
      { key: 'task:view', label: 'View Tasks', description: 'Read operational task board and shift assignments.' },
      { key: 'task:create', label: 'Create Task', description: 'Create new operational task items.' },
      { key: 'task:edit', label: 'Edit Task', description: 'Edit task descriptions, deadlines, priority, and assignees.' },
      { key: 'task:status_update', label: 'Update Task Status', description: 'Change task lifecycle status (To Do -> In Progress -> Done).' },
      { key: 'task:delete', label: 'Delete Task', description: 'Delete tasks.' }
    ],
    groupAccess: {
      admin: ['task:view', 'task:create', 'task:edit', 'task:status_update', 'task:delete'],
      volunteer: ['task:view', 'task:status_update'],
      jury: []
    }
  },
  {
    module_key: 'schedule',
    type: 'core',
    label: 'Schedule',
    description: 'Festival run-of-show grid, venue slots, and conflict resolution',
    route: '/schedule',
    icon: 'calendar',
    display_order: 5,
    pages: [
      { page_key: 'schedule_grid', label: 'Festival Schedule Grid', route: '/schedule', display_order: 1 }
    ],
    permissions: [
      { key: 'schedule:view', label: 'View Schedule', description: 'Read the festival run-of-show calendar and screening venues.' },
      { key: 'schedule:manage', label: 'Manage Schedule', description: 'Add, move, reschedule, or cancel venue screening slots.' },
      { key: 'schedule:resolve_conflicts', label: 'Resolve Conflicts', description: 'Dismiss or override schedule conflict warnings.' }
    ],
    groupAccess: {
      admin: ['schedule:view', 'schedule:manage', 'schedule:resolve_conflicts'],
      volunteer: ['schedule:view'],
      jury: ['schedule:view']
    }
  },
  {
    module_key: 'guests',
    type: 'addon',
    label: 'Guests & Hospitality',
    description: 'VIP guest directory, hotel, itineraries, escorts and check-in desk',
    route: '/guests',
    icon: 'user-check',
    display_order: 6,
    pages: [
      { page_key: 'guests_hub', label: 'Guests and Hospitality Hub', route: '/guests', display_order: 1 }
    ],
    permissions: [
      { key: 'guest:view', label: 'View Guests', description: 'Read guest directory, RSVP status, hotel, and flight details.' },
      { key: 'guest:create', label: 'Create Guest', description: 'Register new VIP guests and delegates.' },
      { key: 'guest:edit', label: 'Edit Guest', description: 'Modify hotel accommodations, flight itineraries, and assigned volunteer escorts.' },
      { key: 'guest:checkin', label: 'Check-In Guest', description: 'Check in arriving guests and issue festival credential badges.' },
      { key: 'guest:message', label: 'Message Guest', description: 'Send personalized itineraries and welcome messages.' }
    ],
    groupAccess: {
      admin: ['guest:view', 'guest:create', 'guest:edit', 'guest:checkin', 'guest:message'],
      volunteer: ['guest:view', 'guest:checkin', 'guest:message'],
      jury: []
    }
  },
  {
    module_key: 'chat',
    type: 'addon',
    label: 'Team Chat',
    description: 'Live team communication, jury deliberations, and task channels',
    route: '/chat',
    icon: 'message-square',
    display_order: 7,
    pages: [
      { page_key: 'chat_main', label: 'Team Chat', route: '/chat', display_order: 1 }
    ],
    permissions: [
      { key: 'chat:view', label: 'View Chat', description: 'Read and participate in assigned group channels.' },
      { key: 'chat:create_group', label: 'Create Chat Group', description: 'Create new custom chat groups (Restricted to Admin).' },
      { key: 'chat:delete_message', label: 'Delete Message', description: 'Delete offensive or misplaced chat messages.' }
    ],
    groupAccess: {
      admin: ['chat:view', 'chat:create_group', 'chat:delete_message'],
      jury: ['chat:view'],
      volunteer: ['chat:view']
    }
  },
  {
    module_key: 'dashboard',
    type: 'core',
    label: 'Dashboard',
    description: 'Executive festival health metrics, intake stats, and control tower',
    route: '/dashboard',
    icon: 'layout',
    display_order: 8,
    pages: [
      { page_key: 'dashboard_main', label: 'Executive Dashboard', route: '/dashboard', display_order: 1 }
    ],
    permissions: [
      { key: 'dashboard:view_global', label: 'View Global Dashboard', description: 'Master festival operations, financial counters, and executive health metrics.' }
    ],
    groupAccess: {
      admin: ['dashboard:view_global'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'sponsors',
    type: 'addon',
    label: 'Sponsors',
    description: 'Sponsorship contracts, deliverable tracking, tiers, and logos',
    route: '/sponsors',
    icon: 'dollar-sign',
    display_order: 9,
    pages: [
      { page_key: 'sponsors_hub', label: 'Sponsors Hub', route: '/sponsors', display_order: 1 }
    ],
    permissions: [
      { key: 'sponsors:view', label: 'View Sponsors', description: 'Read sponsor contracts, tiers, logos, and deliverables.' },
      { key: 'sponsors:manage', label: 'Manage Sponsors', description: 'Add sponsors, edit contract amounts, manage deliverables, and update fulfillment status.' }
    ],
    groupAccess: {
      admin: ['sponsors:view', 'sponsors:manage'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'comms',
    type: 'addon',
    label: 'Communications',
    description: 'Bulk newsletters, email dispatch templates, and press updates',
    route: '/comms',
    icon: 'mail',
    display_order: 10,
    pages: [
      { page_key: 'comms_hub', label: 'Communications Hub', route: '/comms', display_order: 1 }
    ],
    permissions: [
      { key: 'comms:view', label: 'View Comms', description: 'Read dispatch history and email logs.' },
      { key: 'comms:publish', label: 'Publish Comms', description: 'Dispatch bulk announcements and press releases.' },
      { key: 'comms:templates', label: 'Manage Templates', description: 'Create and edit reusable email templates.' }
    ],
    groupAccess: {
      admin: ['comms:view', 'comms:publish', 'comms:templates'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'payouts',
    type: 'addon',
    label: 'Payouts',
    description: 'Prize purse escrows, milestone disbursement, and financial ledger',
    route: '/payouts',
    icon: 'credit-card',
    display_order: 11,
    pages: [
      { page_key: 'payouts_hub', label: 'Payouts Hub', route: '/payouts', display_order: 1 }
    ],
    permissions: [
      { key: 'payouts:view', label: 'View Payouts', description: 'Read financial balance, escrow status, and payout ledgers.' },
      { key: 'payouts:disburse', label: 'Disburse Payouts', description: 'Authorize and disburse award cash prizes and milestone payouts.' }
    ],
    groupAccess: {
      admin: ['payouts:view', 'payouts:disburse'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'settings',
    type: 'core',
    label: 'Settings',
    description: 'Festival edition metadata, seat quotas, and global config',
    route: '/settings',
    icon: 'settings',
    display_order: 12,
    pages: [
      { page_key: 'settings_hub', label: 'Settings Hub', route: '/settings', display_order: 1 }
    ],
    permissions: [
      { key: 'settings:manage', label: 'Manage Settings', description: 'Update festival branding, edition metadata, seat quotas, and global config.' }
    ],
    groupAccess: {
      admin: ['settings:manage'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'discovery',
    type: 'addon',
    label: 'Discovery',
    description: 'Public film showcase, press kits, and catalog discovery',
    route: '/discover',
    icon: 'compass',
    display_order: 13,
    pages: [
      { page_key: 'discover_films', label: 'Discover Films', route: '/discover', display_order: 1 }
    ],
    permissions: [
      { key: 'discover:browse', label: 'Browse Discovery', description: 'Browse public catalog, trailers, and press kits.' }
    ],
    groupAccess: {
      admin: ['discover:browse'],
      jury: [],
      volunteer: []
    }
  },
  {
    module_key: 'marketing',
    type: 'addon',
    label: 'Marketing & Laurel',
    description: 'Embed widgets, submitter buttons, and vector laurel studio',
    route: '/submission-buttons',
    icon: 'share-2',
    display_order: 14,
    pages: [
      { page_key: 'submission_buttons', label: 'Submission Buttons & Logos', route: '/submission-buttons', display_order: 1 },
      { page_key: 'laurel_generator', label: 'Laurel Generator', route: '/laurel', display_order: 2 }
    ],
    permissions: [
      { key: 'marketing:export', label: 'Export Marketing Assets', description: 'Generate embed snippets, widgets, and export high-res vector laurels.' }
    ],
    groupAccess: {
      admin: ['marketing:export'],
      jury: [],
      volunteer: []
    }
  }
];

const VALID_MODULE_KEYS = MODULES_SPECS.map(m => m.module_key);
const ALL_VALID_PERM_KEYS = MODULES_SPECS.flatMap(m => m.permissions.map(p => p.key));

async function syncDatabase(dbName) {
  console.log(`\n======================================================`);
  console.log(`[Sync] Syncing database: ${dbName}...`);
  console.log(`======================================================`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: dbName,
    multipleStatements: true
  });

  // 1. Ensure pages table has label column
  const [pageCols] = await conn.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pages'
  `, [dbName]);
  const pageColSet = new Set(pageCols.map(c => c.COLUMN_NAME));
  if (!pageColSet.has('label')) {
    console.log('[Schema] Adding label column to pages table...');
    await conn.query(`ALTER TABLE pages ADD COLUMN label VARCHAR(100) NULL AFTER page_key`);
  }

  // 2. Align canonical groups (Admin, Jury, Volunteer)
  console.log('[Groups] Aligning 3 canonical active groups (admin, jury, volunteer)...');
  const groupMap = {}; // groupKey -> id

  for (const g of CANONICAL_GROUPS) {
    const [existing] = await conn.query('SELECT id FROM `groups` WHERE group_key = ? LIMIT 1', [g.key]);
    if (existing.length > 0) {
      await conn.query('UPDATE `groups` SET label = ?, description = ?, is_system = ? WHERE id = ?', [
        g.label, g.description, g.is_system, existing[0].id
      ]);
      groupMap[g.key] = existing[0].id;
    } else {
      const [res] = await conn.query('INSERT INTO `groups` (group_key, label, description, is_system) VALUES (?, ?, ?, ?)', [
        g.key, g.label, g.description, g.is_system
      ]);
      groupMap[g.key] = res.insertId;
    }
  }

  // Remove any group that is NOT in canonical groups
  console.log('[Groups] Removing non-canonical groups...');
  const [allGroups] = await conn.query('SELECT id, group_key FROM `groups`');
  for (const g of allGroups) {
    if (!CANONICAL_GROUPS.some(cg => cg.key === g.group_key)) {
      const [mgRows] = await conn.query('SELECT id FROM module_groups WHERE group_id = ?', [g.id]);
      for (const mg of mgRows) {
        await conn.query('DELETE FROM module_groups_permissions WHERE module_group_id = ?', [mg.id]);
      }
      await conn.query('DELETE FROM module_groups WHERE group_id = ?', [g.id]);
      await conn.query('DELETE FROM `groups` WHERE id = ?', [g.id]);
      console.log(`  ✓ Removed obsolete group: ${g.group_key} (ID: ${g.id})`);
    }
  }

  // 3. Remove non-canonical modules
  console.log('[Modules] Cleaning up any non-canonical modules...');
  const placeholders = VALID_MODULE_KEYS.map(() => '?').join(',');
  const [obsoleteModules] = await conn.query(`
    SELECT id, module_key FROM modules 
    WHERE module_key NOT IN (${placeholders})
  `, VALID_MODULE_KEYS);

  for (const om of obsoleteModules) {
    await conn.query('DELETE FROM events_modules WHERE module_id = ?', [om.id]);
    await conn.query('DELETE FROM pages WHERE module_id = ?', [om.id]);
    const [mgRows] = await conn.query('SELECT id FROM module_groups WHERE module_id = ?', [om.id]);
    for (const mg of mgRows) {
      await conn.query('DELETE FROM module_groups_permissions WHERE module_group_id = ?', [mg.id]);
    }
    await conn.query('DELETE FROM module_groups WHERE module_id = ?', [om.id]);
    await conn.query('DELETE FROM permissions WHERE module_id = ?', [om.id]);
    await conn.query('DELETE FROM modules WHERE id = ?', [om.id]);
    console.log(`  ✓ Cleaned up obsolete module: ${om.module_key} (ID: ${om.id})`);
  }

  // 4. Upsert 14 Canonical Modules
  console.log('[Modules] Synchronizing 14 Canonical Modules...');
  const moduleMap = {}; // moduleKey -> id

  for (const m of MODULES_SPECS) {
    const [existing] = await conn.query('SELECT id FROM modules WHERE module_key = ? LIMIT 1', [m.module_key]);
    let modId;
    if (existing.length > 0) {
      modId = existing[0].id;
      await conn.query(`
        UPDATE modules 
        SET type = ?, label = ?, description = ?, route = ?, icon = ?, display_order = ?
        WHERE id = ?
      `, [m.type, m.label, m.description, m.route, m.icon, m.display_order, modId]);
    } else {
      const [insRes] = await conn.query(`
        INSERT INTO modules (module_key, type, label, description, route, icon, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [m.module_key, m.type, m.label, m.description, m.route, m.icon, m.display_order]);
      modId = insRes.insertId;
    }
    moduleMap[m.module_key] = modId;
    console.log(`  ✓ Module [${m.type.toUpperCase()}] ${m.label} (key: ${m.module_key}, ID: ${modId})`);
  }

  // 5. Synchronize Pages for each module
  console.log('[Pages] Synchronizing 17 Canonical Pages...');
  for (const m of MODULES_SPECS) {
    const modId = moduleMap[m.module_key];
    await conn.query('DELETE FROM pages WHERE module_id = ?', [modId]);

    for (const p of m.pages) {
      await conn.query(`
        INSERT INTO pages (module_id, page_key, label, route, display_order)
        VALUES (?, ?, ?, ?, ?)
      `, [modId, p.page_key, p.label, p.route, p.display_order]);
      console.log(`    ↳ Page: ${p.label} -> ${p.route} (${m.module_key})`);
    }
  }

  // 6. Synchronize Scoped Permissions for each module
  console.log('[Permissions] Synchronizing 46 Scoped Permissions...');
  // First, clean up obsolete permissions
  const permPlaceholders = ALL_VALID_PERM_KEYS.map(() => '?').join(',');
  await conn.query(`DELETE FROM permissions WHERE permission_key NOT IN (${permPlaceholders})`, ALL_VALID_PERM_KEYS);

  const permMap = {}; // permKey -> id

  for (const m of MODULES_SPECS) {
    const modId = moduleMap[m.module_key];
    
    for (const p of m.permissions) {
      const [existing] = await conn.query('SELECT id FROM permissions WHERE permission_key = ? LIMIT 1', [p.key]);
      let permId;
      if (existing.length > 0) {
        permId = existing[0].id;
        await conn.query(`
          UPDATE permissions 
          SET label = ?, description = ?, module_id = ?
          WHERE id = ?
        `, [p.label, p.description, modId, permId]);
      } else {
        const [res] = await conn.query(`
          INSERT INTO permissions (permission_key, label, description, module_id, actions_match, actions_unmatch)
          VALUES (?, ?, ?, ?, 'active', 'inactive')
        `, [p.key, p.label, p.description, modId]);
        permId = res.insertId;
      }
      permMap[p.key] = permId;
    }
  }
  console.log(`  ✓ Total permissions mapped: ${Object.keys(permMap).length}`);

  // 7. Synchronize Group Access Matrix (module_groups and module_groups_permissions)
  console.log('[Matrix] Synchronizing Group Access Matrix...');
  for (const m of MODULES_SPECS) {
    const modId = moduleMap[m.module_key];

    for (const groupKey of Object.keys(CANONICAL_GROUPS.reduce((acc, g) => ({ ...acc, [g.key]: true }), {}))) {
      const grpId = groupMap[groupKey];
      if (!grpId) continue;

      // Find or create module_group
      let [mgRows] = await conn.query('SELECT id FROM module_groups WHERE group_id = ? AND module_id = ? LIMIT 1', [grpId, modId]);
      let mgId;
      if (mgRows.length === 0) {
        const [mgRes] = await conn.query('INSERT INTO module_groups (group_id, module_id, name) VALUES (?, ?, ?)', [
          grpId, modId, `${groupKey} - ${m.label}`
        ]);
        mgId = mgRes.insertId;
      } else {
        mgId = mgRows[0].id;
      }

      // Clear existing permissions for this module_group
      await conn.query('DELETE FROM module_groups_permissions WHERE module_group_id = ?', [mgId]);

      // Assign target permissions from groupAccess
      const allowedPermKeys = m.groupAccess[groupKey] || [];
      for (const pk of allowedPermKeys) {
        const pid = permMap[pk];
        if (pid) {
          await conn.query('INSERT INTO module_groups_permissions (module_group_id, permission_id) VALUES (?, ?)', [
            mgId, pid
          ]);
        }
      }
    }
  }
  console.log('  ✓ Group Access Matrix populated for all modules and groups.');

  // 8. Provision all 14 modules for active SaaS festivals
  console.log('[EventsModules] Ensuring all active SaaS festivals have all 14 modules provisioned...');
  const validModIds = Object.values(moduleMap);
  try {
    const [saasEvents] = await conn.query(`
      SELECT event_id FROM events 
      WHERE (saas_enabled = 1 OR is_saas = 1)
    `);

    for (const evt of saasEvents) {
      for (const modId of validModIds) {
        await conn.query(`
          INSERT IGNORE INTO events_modules (event_id, module_id)
          VALUES (?, ?)
        `, [evt.event_id, modId]);
      }
    }
    console.log(`  ✓ All 14 modules enabled across ${saasEvents.length} SaaS festival editions.`);
  } catch (err) {
    console.warn(`[EventsModules] Notice on events table for ${dbName}:`, err.message);
  }

  await conn.end();
  console.log(`[Sync] Finished syncing ${dbName} successfully!`);
}

async function main() {
  try {
    await syncDatabase('freecomers_database');
    try {
      await syncDatabase('access_control_database');
    } catch (e) {
      console.warn('[Sync] Note on access_control_database:', e.message);
    }
    console.log('\n[SUCCESS] Entire system successfully synchronized with Freecomers Admin Module Specs v8.0!');
    process.exit(0);
  } catch (error) {
    console.error('[FATAL] Sync failed:', error);
    process.exit(1);
  }
}

main();
