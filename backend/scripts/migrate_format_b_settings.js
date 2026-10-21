/**
 * Migration Script: Format B Auto-Configurable Settings Engine
 * Updates `pages`, `modules`, and creates `event_module_settings`.
 */

const { query, pool } = require('../src/config/database');

async function runMigration() {
  console.log('[Migration] Starting Format B schema migration...');

  try {
    // 1. Check pages columns
    const pageCols = await query('SHOW COLUMNS FROM pages');
    const pageColNames = pageCols.map(c => c.Field);

    if (!pageColNames.includes('page_type')) {
      console.log('[Migration] Adding page_type to pages...');
      await query(`
        ALTER TABLE pages 
        ADD COLUMN page_type ENUM('primary', 'subpage', 'settings') NOT NULL DEFAULT 'primary' AFTER display_order
      `);
      await query('CREATE INDEX idx_pages_type ON pages (page_type)');
    } else {
      console.log('[Migration] page_type already exists on pages.');
    }

    if (!pageColNames.includes('sidebar_menu')) {
      console.log('[Migration] Adding sidebar_menu to pages...');
      await query(`
        ALTER TABLE pages 
        ADD COLUMN sidebar_menu TINYINT(1) NOT NULL DEFAULT 1 AFTER page_type
      `);
    } else {
      console.log('[Migration] sidebar_menu already exists on pages.');
    }

    if (!pageColNames.includes('menu_order')) {
      console.log('[Migration] Adding menu_order to pages...');
      await query(`
        ALTER TABLE pages 
        ADD COLUMN menu_order INT NOT NULL DEFAULT 0 AFTER sidebar_menu
      `);
      await query('CREATE INDEX idx_pages_menu ON pages (sidebar_menu, menu_order)');
    } else {
      console.log('[Migration] menu_order already exists on pages.');
    }

    // 2. Check modules columns
    const modCols = await query('SHOW COLUMNS FROM modules');
    const modColNames = modCols.map(c => c.Field);

    if (!modColNames.includes('has_settings')) {
      console.log('[Migration] Adding has_settings to modules...');
      await query(`
        ALTER TABLE modules 
        ADD COLUMN has_settings TINYINT(1) NOT NULL DEFAULT 1 AFTER display_order
      `);
    } else {
      console.log('[Migration] has_settings already exists on modules.');
    }

    if (!modColNames.includes('settings_route')) {
      console.log('[Migration] Adding settings_route to modules...');
      await query(`
        ALTER TABLE modules 
        ADD COLUMN settings_route VARCHAR(255) NULL AFTER has_settings
      `);
    } else {
      console.log('[Migration] settings_route already exists on modules.');
    }

    // 3. Create event_module_settings
    console.log('[Migration] Creating event_module_settings table if not exists...');
    await query(`
      CREATE TABLE IF NOT EXISTS event_module_settings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        event_id BIGINT UNSIGNED NOT NULL,
        module_id INT NOT NULL,
        setting_key VARCHAR(100) NOT NULL,
        setting_value JSON NOT NULL,
        updated_by_user_id BIGINT UNSIGNED NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_event_module_setting (event_id, module_id, setting_key),
        INDEX idx_ems_event_module (event_id, module_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 4. Update existing modules settings metadata
    console.log('[Migration] Updating Submissions and Team modules metadata...');
    await query(`
      UPDATE modules 
      SET has_settings = 1, settings_route = '/settings/review-stage' 
      WHERE module_key = 'submissions'
    `);

    await query(`
      UPDATE modules 
      SET has_settings = 1, settings_route = '/team/settings' 
      WHERE module_key = 'team'
    `);

    // Update Submissions pages
    await query(`
      UPDATE pages 
      SET page_type = 'primary', sidebar_menu = 1, menu_order = 1 
      WHERE module_id = 2 AND page_key = 'all_submissions'
    `);

    await query(`
      UPDATE pages 
      SET page_type = 'settings', sidebar_menu = 1, menu_order = 2 
      WHERE module_id = 2 AND page_key = 'review_dashboard'
    `);

    // Update Team pages & insert team_settings page
    await query(`
      UPDATE pages 
      SET page_type = 'primary', sidebar_menu = 1, menu_order = 1 
      WHERE module_id = 34 AND page_key = 'team_hub'
    `);

    const teamManagePerm = await query("SELECT id FROM permissions WHERE permission_key = 'team:manage' LIMIT 1");
    const permId = teamManagePerm.length > 0 ? teamManagePerm[0].id : null;

    const existingTeamSettings = await query("SELECT id FROM pages WHERE module_id = 34 AND page_key = 'team_settings' LIMIT 1");
    if (existingTeamSettings.length === 0) {
      console.log('[Migration] Registering team_settings in pages table...');
      await query(`
        INSERT INTO pages (module_id, page_key, label, route, permission_id, display_order, page_type, sidebar_menu, menu_order)
        VALUES (34, 'team_settings', 'Team & Access Policy Settings', '/team/settings', ?, 2, 'settings', 1, 2)
      `, [permId]);
    } else {
      await query(`
        UPDATE pages 
        SET label = 'Team & Access Policy Settings', route = '/team/settings', page_type = 'settings', sidebar_menu = 1, menu_order = 2, permission_id = ?
        WHERE module_id = 34 AND page_key = 'team_settings'
      `, [permId]);
    }

    // 5. Seed default Team settings in event_module_settings for active events
    const events = await query('SELECT event_id FROM events WHERE is_deleted = 0 LIMIT 10');
    console.log(`[Migration] Seeding initial team settings for ${events.length} event(s)...`);

    for (const ev of events) {
      const eId = ev.event_id;
      const initialSettings = [
        ['default_assigned_group', JSON.stringify('volunteer')],
        ['allowed_account_types', JSON.stringify(['individual', 'organization'])],
        ['require_directory_verification', JSON.stringify({ enabled: true })],
        ['allow_custom_groups', JSON.stringify({ enabled: true })],
        ['seat_warning_threshold_percent', JSON.stringify({ threshold: 90 })],
        ['invite_expiration_days', JSON.stringify({ days: 7 })]
      ];

      for (const [key, val] of initialSettings) {
        await query(`
          INSERT INTO event_module_settings (event_id, module_id, setting_key, setting_value)
          VALUES (?, 34, ?, ?)
          ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `, [eId, key, val]);
      }
    }

    console.log('[Migration] ✓ Format B schema migration completed successfully!');
  } catch (err) {
    console.error('[Migration] ✗ Error during migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
