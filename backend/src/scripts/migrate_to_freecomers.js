/**
 * Migration Script: Migrate Access-Control to freecomers_database
 * 
 * Rules strictly followed:
 * 1. ZERO changes to freecomers_database.users (no new columns added).
 * 2. user_departments is completely excluded.
 * 3. Adds slug, edition, saas_enabled to freecomers_database.events (non-destructive).
 * 4. Adds capacity to freecomers_database.venues (non-destructive).
 * 5. Creates 31 missing tables in freecomers_database.
 * 6. Copies master RBAC configuration data and operational test data.
 * 7. Assigns Freecomers users to roles in user_event_groups for event 1.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/Access-Control/backend/.env' });

const TABLES_TO_CREATE = [
  'modules',
  'pages',
  'permissions',
  'groups',
  'module_groups',
  'module_groups_permissions',
  'events_modules',
  'event_custom_groups',
  'event_custom_group_permissions',
  'event_user_limits',
  'user_event_groups',
  'user_event_custom_groups',
  'submissions',
  'submission_flags',
  'submission_logs',
  'screening_assignments',
  'screening_reviews',
  'pipeline_states',
  'award_categories',
  'jury_ballots',
  'festival_departments',
  'venue_screening_slots',
  'guests',
  'tasks',
  'task_assignees',
  'sponsors',
  'sponsor_deliverables',
  'payout_milestones',
  'chat_channels',
  'chat_messages',
  'email_templates'
];

async function migrate() {
  console.log('[Migration] Starting migration to freecomers_database...');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  // 1. Align columns in freecomers_database.events
  console.log('\n[1/5] Checking and aligning freecomers_database.events columns...');
  const [eventCols] = await conn.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'freecomers_database' AND TABLE_NAME = 'events'
  `);
  const eventColSet = new Set(eventCols.map(c => c.COLUMN_NAME));

  if (!eventColSet.has('slug')) {
    console.log('  Adding slug column to events...');
    await conn.query(`ALTER TABLE freecomers_database.events ADD COLUMN slug VARCHAR(100) NULL UNIQUE AFTER name`);
  }
  if (!eventColSet.has('edition')) {
    console.log('  Adding edition column to events...');
    await conn.query(`ALTER TABLE freecomers_database.events ADD COLUMN edition VARCHAR(50) NULL DEFAULT 'Edition 4 · 2026' AFTER slug`);
  }
  if (!eventColSet.has('saas_enabled')) {
    console.log('  Adding saas_enabled column to events...');
    await conn.query(`ALTER TABLE freecomers_database.events ADD COLUMN saas_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER is_saas`);
  }

  // Ensure event 1 has slug, edition, and saas_enabled configured
  await conn.query(`
    UPDATE freecomers_database.events 
    SET slug = COALESCE(slug, 'fest-a'),
        edition = COALESCE(edition, 'Edition 4 · 2026'),
        saas_enabled = 1
    WHERE event_id = 1
  `);
  // Ensure event 2 has slug
  await conn.query(`
    UPDATE freecomers_database.events 
    SET slug = COALESCE(slug, 'fest-b'),
        edition = COALESCE(edition, 'Edition 4 · 2026'),
        saas_enabled = 1
    WHERE event_id = 2
  `);
  // Sync saas_enabled for all is_saas events
  await conn.query(`
    UPDATE freecomers_database.events 
    SET saas_enabled = 1,
        edition = COALESCE(edition, 'Edition 4 · 2026')
    WHERE is_saas = 1
  `);
  console.log('  ✓ events table aligned successfully.');

  // 2. Align columns in freecomers_database.venues
  console.log('\n[2/5] Checking and aligning freecomers_database.venues columns...');
  const [venueCols] = await conn.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'freecomers_database' AND TABLE_NAME = 'venues'
  `);
  const venueColSet = new Set(venueCols.map(c => c.COLUMN_NAME));

  if (!venueColSet.has('capacity')) {
    console.log('  Adding capacity column to venues...');
    await conn.query(`ALTER TABLE freecomers_database.venues ADD COLUMN capacity INT UNSIGNED NOT NULL DEFAULT 100`);
  }

  // Seed sample venues for event 1 if empty
  const [existingVenues] = await conn.query(`SELECT COUNT(*) as count FROM freecomers_database.venues WHERE event_id = 1`);
  if (existingVenues[0].count === 0) {
    console.log('  Seeding venues for event 1 in freecomers_database...');
    await conn.query(`
      INSERT INTO freecomers_database.venues (event_id, venue_name, capacity) VALUES
      (1, 'Main Auditorium', 450),
      (1, 'Indie Room', 120),
      (1, 'Outdoor Screen', 300)
    `);
  }
  console.log('  ✓ venues table aligned successfully.');

  // 3. Create the 31 missing tables in freecomers_database
  console.log('\n[3/5] Creating 31 missing tables in freecomers_database...');
  for (const tableName of TABLES_TO_CREATE) {
    const [createRes] = await conn.query(`SHOW CREATE TABLE access_control_database.\`${tableName}\``);
    let createSql = createRes[0]['Create Table'];
    // Remove database specific prefixes if any and ensure IF NOT EXISTS
    createSql = createSql.replace(`CREATE TABLE \`${tableName}\``, `CREATE TABLE IF NOT EXISTS freecomers_database.\`${tableName}\``);
    await conn.query(createSql);
    console.log(`  ✓ Table freecomers_database.${tableName} created / verified.`);
  }

  // 4. Copy master RBAC configuration data and operational data
  console.log('\n[4/5] Copying master RBAC & operational data from access_control_database...');
  const tablesToCopy = [
    'modules',
    'pages',
    'permissions',
    'groups',
    'module_groups',
    'module_groups_permissions',
    'festival_departments',
    'events_modules',
    'submissions',
    'submission_flags',
    'screening_assignments',
    'screening_reviews',
    'pipeline_states',
    'award_categories',
    'venue_screening_slots',
    'guests',
    'tasks',
    'task_assignees',
    'sponsors',
    'sponsor_deliverables',
    'payout_milestones',
    'chat_channels',
    'chat_messages'
  ];

  for (const table of tablesToCopy) {
    const [[{ count }]] = await conn.query(`SELECT COUNT(*) as count FROM freecomers_database.\`${table}\``);
    if (count === 0) {
      console.log(`  Copying rows for ${table}...`);
      await conn.query(`INSERT INTO freecomers_database.\`${table}\` SELECT * FROM access_control_database.\`${table}\``);
      const [[{ newCount }]] = await conn.query(`SELECT COUNT(*) as newCount FROM freecomers_database.\`${table}\``);
      console.log(`    Copied ${newCount} rows into freecomers_database.${table}`);
    } else {
      console.log(`  ${table} already has ${count} rows. Skipping initial copy.`);
    }
  }

  // 5. Assign Freecomers users to user_event_groups for event 1
  console.log('\n[5/5] Assigning Freecomers users in user_event_groups for event 1...');
  const userAssignments = [
    { userId: 1, groupId: 1 }, // Super Admin (SHASHANK - techgroupranchi01@gmail.com)
    { userId: 2, groupId: 1 }, // Super Admin (Saurav Mehta - techgroupranchi02@gmail.com)
    { userId: 4, groupId: 1 }, // Admin (Behind The Scenes - techgroupranchi04@gmail.com)
    { userId: 6, groupId: 2 }, // Volunteer (Abhishek Kumar)
    { userId: 8, groupId: 4 }, // Judge (Shikha Bhanu)
    { userId: 9, groupId: 2 }, // Volunteer (Freecomers)
    { userId: 11, groupId: 4 }, // Judge (Ronit munda)
    { userId: 14, groupId: 2 }, // Volunteer (Vivek Singh)
    { userId: 15, groupId: 2 }  // Volunteer (Vivek Singh)
  ];

  for (const { userId, groupId } of userAssignments) {
    await conn.query(`
      INSERT INTO freecomers_database.user_event_groups (user_id, event_id, group_id)
      VALUES (?, 1, ?)
      ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)
    `, [userId, groupId]);
  }
  console.log('  ✓ Freecomers users assigned to event 1 roles.');

  console.log('\n======================================================');
  console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('======================================================');

  await conn.end();
}

migrate().catch(err => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
