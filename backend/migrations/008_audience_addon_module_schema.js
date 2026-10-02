/**
 * Migration 008: Audience Add-On Module Schema & RBAC Provisioning
 * 
 * Implements production operational tables for the Audience (ADD-On) Module:
 * 1. audience_categories (Delegate categories, badge colors, voting eligibility)
 * 2. screening_blocks (Screening slots for Feature Films & Short Film packages)
 * 3. screening_block_films (Playlist sequence mapping of films inside blocks)
 * 4. screening_checkins (High-throughput gate check-in verifying attendance)
 * 5. audience_votes (1 vote per person per film, star rating, verified status)
 * 6. audience_voting_scores (Bayesian weighted score & Wilson confidence cache)
 * 7. audience_voting_audit_logs (Admin fraud audit & vote status moderation)
 * 8. festival_external_sync_logs (Data sync logs from Kashish / external sources)
 * 
 * RBAC Provisioning:
 * - Registers 'audience' module in `modules` table (type: 'addon')
 * - Registers 4 core pages: /audience, /attendance, /voting, /registration
 * - Registers granular permissions in `permissions` table
 * - Provisions group access matrix in `module_groups` & `module_groups_permissions`
 * - Activates module for festival event 1 in `events_modules`
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 008] Starting Audience Add-on Module provisioning...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // ── 1. Create audience_categories ──────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS audience_categories (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) NOT NULL,
      badge_color VARCHAR(30) NOT NULL DEFAULT '#6366f1',
      badge_ribbon_text VARCHAR(50) NULL,
      can_vote BOOLEAN NOT NULL DEFAULT TRUE,
      voting_weight DECIMAL(3, 2) NOT NULL DEFAULT 1.00,
      quota INT UNSIGNED NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_event_category (event_id, code),
      INDEX idx_audcat_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `audience_categories` created.');

  // ── 2. Create screening_blocks ─────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS screening_blocks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      venue_id BIGINT UNSIGNED NULL,
      title VARCHAR(255) NOT NULL,
      block_type ENUM('feature', 'short_block', 'panel', 'gala') NOT NULL DEFAULT 'feature',
      screening_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      qr_token VARCHAR(64) NOT NULL,
      voting_status ENUM('pending', 'open', 'closed', 'finalized') NOT NULL DEFAULT 'pending',
      voting_opened_at TIMESTAMP NULL DEFAULT NULL,
      voting_closed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_block_qr (qr_token),
      INDEX idx_screening_event_date (event_id, screening_date),
      INDEX idx_screening_voting (voting_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `screening_blocks` created.');

  // ── 3. Create screening_block_films ────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS screening_block_films (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      screening_block_id BIGINT UNSIGNED NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      sequence_order TINYINT UNSIGNED NOT NULL DEFAULT 1,
      is_eligible_for_voting BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_block_film (screening_block_id, film_id),
      INDEX idx_block_films_block (screening_block_id),
      INDEX idx_block_films_film (film_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `screening_block_films` created.');

  // ── 4. Create screening_checkins ───────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS screening_checkins (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      screening_block_id BIGINT UNSIGNED NOT NULL,
      attendee_id BIGINT UNSIGNED NOT NULL,
      venue_id BIGINT UNSIGNED NULL,
      scanned_by_user_id INT UNSIGNED NOT NULL,
      scan_status ENUM('valid', 'duplicate_ignored', 'offline_synced') NOT NULL DEFAULT 'valid',
      offline_client_timestamp TIMESTAMP NULL DEFAULT NULL,
      scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_attendee_screening (screening_block_id, attendee_id),
      INDEX idx_checkin_event (event_id),
      INDEX idx_checkin_attendee (attendee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `screening_checkins` created.');

  // ── 5. Create audience_votes ───────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS audience_votes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      screening_block_id BIGINT UNSIGNED NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      attendee_id BIGINT UNSIGNED NOT NULL,
      rating TINYINT UNSIGNED NOT NULL COMMENT '1 to 5 scale',
      is_attendance_verified BOOLEAN NOT NULL DEFAULT FALSE,
      voting_method ENUM('qr_direct', 'portal_session', 'assisted') NOT NULL DEFAULT 'qr_direct',
      status ENUM('valid', 'flagged_suspicious', 'admin_voided') NOT NULL DEFAULT 'valid',
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      device_fingerprint VARCHAR(128) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_attendee_film_vote (event_id, attendee_id, film_id),
      INDEX idx_votes_film_status (film_id, status),
      INDEX idx_votes_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `audience_votes` created.');

  // ── 6. Create audience_voting_scores ───────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS audience_voting_scores (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      total_votes INT UNSIGNED NOT NULL DEFAULT 0,
      sum_ratings INT UNSIGNED NOT NULL DEFAULT 0,
      raw_average DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
      bayesian_score DECIMAL(4, 3) NOT NULL DEFAULT 0.000,
      wilson_lower_bound DECIMAL(4, 3) NOT NULL DEFAULT 0.000,
      standing_rank INT UNSIGNED NULL DEFAULT NULL,
      has_quorum BOOLEAN NOT NULL DEFAULT FALSE,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_event_film_score (event_id, film_id),
      INDEX idx_scores_event_rank (event_id, standing_rank)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `audience_voting_scores` created.');

  // ── 7. Create audience_voting_audit_logs ───────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS audience_voting_audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      vote_id BIGINT UNSIGNED NULL,
      action ENUM('cast', 'flag', 'void', 'restore', 'bulk_override') NOT NULL,
      actor_user_id INT UNSIGNED NULL,
      reason TEXT NULL,
      metadata JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_event (event_id),
      INDEX idx_audit_vote (vote_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `audience_voting_audit_logs` created.');

  // ── 8. Create festival_external_sync_logs ──────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS festival_external_sync_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      source_system VARCHAR(100) NOT NULL DEFAULT 'kashish_api',
      entity_type ENUM('films', 'screenings', 'attendees') NOT NULL,
      records_fetched INT UNSIGNED NOT NULL DEFAULT 0,
      records_created INT UNSIGNED NOT NULL DEFAULT 0,
      records_updated INT UNSIGNED NOT NULL DEFAULT 0,
      records_failed INT UNSIGNED NOT NULL DEFAULT 0,
      error_payload JSON NULL,
      synced_by_user_id INT UNSIGNED NULL,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sync_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 008] ✓ Table `festival_external_sync_logs` created.');

  // ── 9. Provision RBAC Matrix in `modules`, `pages`, `permissions` ─────────

  // 9a. Check or insert 'audience' module
  const existingModules = await query("SELECT id FROM modules WHERE module_key = 'audience'");
  let moduleId = existingModules.length > 0 ? existingModules[0].id : null;

  if (!moduleId) {
    const res = await query(`
      INSERT INTO modules (module_key, type, label, description, route, icon, plugin_dir, display_order)
      VALUES (
        'audience', 
        'addon', 
        'Audience', 
        'Audience management, delegate categories, badges, attendance check-in and voting', 
        '/audience', 
        'users', 
        NULL, 
        15
      )
    `);
    moduleId = res.insertId;
    console.log(`[Migration 008] ✓ Created module 'audience' with ID ${moduleId}`);
  } else {
    console.log(`[Migration 008] Module 'audience' already exists with ID ${moduleId}`);
  }

  // 9b. Register Pages for Audience Module
  const pagesConfig = [
    { page_key: 'audience_settings', label: 'Audience Settings & Categories', route: '/audience', display_order: 1 },
    { page_key: 'audience_attendance', label: 'Attendance & Gate Check-in', route: '/attendance', display_order: 2 },
    { page_key: 'audience_voting', label: 'Audience Choice Voting & Results', route: '/voting', display_order: 3 },
    { page_key: 'audience_registration', label: 'Attendee Registration & Passes', route: '/registration', display_order: 4 }
  ];

  for (const p of pagesConfig) {
    await query(`
      INSERT INTO pages (module_id, page_key, label, route, display_order)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE label=VALUES(label), route=VALUES(route), display_order=VALUES(display_order);
    `, [moduleId, p.page_key, p.label, p.route, p.display_order]);
  }
  console.log('[Migration 008] ✓ Registered 4 pages under Audience module.');

  // 9c. Register Permissions for Audience Module
  const permissionsConfig = [
    { key: 'audience:view', label: 'View Audience Hub', desc: 'Access to Audience dashboard and settings overview' },
    { key: 'audience:manage_settings', label: 'Manage Audience Settings', desc: 'Configure voting thresholds, venue links, and parameters' },
    { key: 'audience:manage_categories', label: 'Manage Delegate Categories', desc: 'Create and edit delegate badge categories and quotas' },
    { key: 'attendance:view', label: 'View Attendance Records', desc: 'View venue and screening check-in headcounts and lists' },
    { key: 'attendance:scan_checkin', label: 'Perform Gate Check-in', desc: 'Scan attendee QR codes for venue and screening entry' },
    { key: 'attendance:export', label: 'Export Attendance Reports', desc: 'Export attendance spreadsheets and gate audit logs' },
    { key: 'voting:view_results', label: 'View Voting Standings', desc: 'View raw votes, participation rates, and Bayesian scores' },
    { key: 'voting:control_window', label: 'Open / Close Voting Window', desc: 'Trigger balloting start and end for screenings' },
    { key: 'voting:audit_fraud', label: 'Audit & Moderate Votes', desc: 'Flag or void duplicate and suspicious votes' },
    { key: 'registration:view', label: 'View Attendees List', desc: 'Browse registered attendees and delegate roster' },
    { key: 'registration:create', label: 'Register New Attendee', desc: 'Manual and spot registration at the venue desk' },
    { key: 'registration:issue_badge', label: 'Issue & Print Badge Passes', desc: 'Generate printable badge passes and dispatch QR tokens' }
  ];

  const permIdMap = {};
  for (const perm of permissionsConfig) {
    await query(`
      INSERT INTO permissions (permission_key, label, description, module_id)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE label=VALUES(label), description=VALUES(description), module_id=VALUES(module_id);
    `, [perm.key, perm.label, perm.desc, moduleId]);

    const row = await query('SELECT id FROM permissions WHERE permission_key = ?', [perm.key]);
    if (row.length > 0) {
      permIdMap[perm.key] = row[0].id;
    }
  }
  console.log(`[Migration 008] ✓ Registered ${permissionsConfig.length} scoped permissions.`);

  // 9d. Provision module_groups and module_groups_permissions
  // Groups: 1=Admin, 2=Volunteer, 4=Judge
  const rolePermissionAssignments = {
    1: Object.keys(permIdMap), // Admin gets ALL permissions
    2: [ // Volunteer
      'audience:view',
      'attendance:view',
      'attendance:scan_checkin',
      'registration:view',
      'registration:create',
      'registration:issue_badge'
    ],
    4: [ // Judge
      'voting:view_results'
    ]
  };

  for (const [groupId, permKeys] of Object.entries(rolePermissionAssignments)) {
    // Ensure module_groups entry exists
    const gRows = await query('SELECT group_key FROM `groups` WHERE id = ?', [groupId]);
    const groupName = gRows.length > 0 ? gRows[0].group_key : `Group-${groupId}`;

    await query(`
      INSERT INTO module_groups (group_id, module_id, name)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE name=VALUES(name);
    `, [groupId, moduleId, `${groupName} - audience`]);

    const mgRows = await query('SELECT id FROM module_groups WHERE group_id = ? AND module_id = ?', [groupId, moduleId]);
    if (mgRows.length > 0) {
      const moduleGroupId = mgRows[0].id;

      for (const pKey of permKeys) {
        const pId = permIdMap[pKey];
        if (pId) {
          await query(`
            INSERT IGNORE INTO module_groups_permissions (module_group_id, permission_id)
            VALUES (?, ?)
          `, [moduleGroupId, pId]);
        }
      }
    }
  }
  console.log('[Migration 008] ✓ Configured Group Access Matrix (Admin, Volunteer, Judge).');

  // 9e. Enable 'audience' for Festival Event 1 in `events_modules`
  await query(`
    INSERT IGNORE INTO events_modules (event_id, module_id)
    VALUES (1, ?)
  `, [moduleId]);
  console.log(`[Migration 008] ✓ Activated 'audience' module for Event 1 in events_modules.`);

  // ── 10. Seed Default Audience Categories for Event 1 ──────────────────────
  const defaultCategories = [
    { name: 'VIP & Jury', code: 'vip_jury', color: '#e11d48', ribbon: 'VIP / GUEST', weight: 1.00, quota: 100 },
    { name: 'Festival Delegate', code: 'delegate', color: '#2563eb', ribbon: 'DELEGATE', weight: 1.00, quota: 500 },
    { name: 'Accredited Filmmaker', code: 'filmmaker', color: '#7c3aed', ribbon: 'CREW / FILMMAKER', weight: 1.00, quota: 150 },
    { name: 'Media & Press', code: 'press', color: '#059669', ribbon: 'PRESS / MEDIA', weight: 1.00, quota: 50 },
    { name: 'Student Delegate', code: 'student', color: '#d97706', ribbon: 'STUDENT', weight: 1.00, quota: 200 },
    { name: 'Bangalore Attendee', code: 'bangalore_general', color: '#4f46e5', ribbon: 'AUDIENCE PASS', weight: 1.00, quota: 1000 }
  ];

  for (const c of defaultCategories) {
    await query(`
      INSERT INTO audience_categories (event_id, name, code, badge_color, badge_ribbon_text, can_vote, voting_weight, quota)
      VALUES (1, ?, ?, ?, ?, TRUE, ?, ?)
      ON DUPLICATE KEY UPDATE name=VALUES(name), badge_color=VALUES(badge_color), badge_ribbon_text=VALUES(badge_ribbon_text);
    `, [c.name, c.code, c.color, c.ribbon, c.weight, c.quota]);
  }
  console.log('[Migration 008] ✓ Seeded 6 default audience delegate categories for Event 1.');

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 008] ✓ All Audience Add-on Module tables & permissions migrated successfully!');
}

async function down() {
  console.log('[Migration 008] Rolling back Audience Add-on Module tables...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  const tables = [
    'festival_external_sync_logs',
    'audience_voting_audit_logs',
    'audience_voting_scores',
    'audience_votes',
    'screening_checkins',
    'screening_block_films',
    'screening_blocks',
    'audience_categories'
  ];

  for (const t of tables) {
    await query(`DROP TABLE IF EXISTS \`${t}\`;`);
  }

  // Fetch audience module ID
  const modRows = await query("SELECT id FROM modules WHERE module_key = 'audience'");
  if (modRows.length > 0) {
    const moduleId = modRows[0].id;
    await query('DELETE FROM events_modules WHERE module_id = ?', [moduleId]);
    await query('DELETE FROM pages WHERE module_id = ?', [moduleId]);

    const mgRows = await query('SELECT id FROM module_groups WHERE module_id = ?', [moduleId]);
    for (const mg of mgRows) {
      await query('DELETE FROM module_groups_permissions WHERE module_group_id = ?', [mg.id]);
    }
    await query('DELETE FROM module_groups WHERE module_id = ?', [moduleId]);
    await query('DELETE FROM permissions WHERE module_id = ?', [moduleId]);
    await query('DELETE FROM modules WHERE id = ?', [moduleId]);
  }

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 008] ✓ Audience Add-on Module rollback complete.');
}

module.exports = { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration 008 Error]', err);
      process.exit(1);
    });
}
