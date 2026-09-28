/**
 * Migration 007: Settings Module Schema & Screening Criteria
 * 
 * Creates tables for:
 * 1. submission_flags columns: is_active, sort_order
 * 2. festival_edition_settings: event_id, max_screening_rounds
 * 3. festival_review_round_configs: event_id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required
 * 4. festival_review_criteria: event_id, round_number, label, criterion_key, sort_order
 * 
 * Also seeds default round configs and the 13 canonical criteria categories for primary events (1 and 40).
 */

const { query, pool } = require('../src/config/database');

const canonicalCriteria = [
  { key: 'screenplay', label: 'Screenplay' },
  { key: 'dialogues', label: 'Dialogues' },
  { key: 'writing', label: 'Writing' },
  { key: 'structure', label: 'Structure' },
  { key: 'direction', label: 'Direction' },
  { key: 'acting', label: 'Acting' },
  { key: 'cinematography', label: 'Cinematography' },
  { key: 'production_design', label: 'Production design' },
  { key: 'sound', label: 'Sound' },
  { key: 'music', label: 'Music' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'inspire', label: 'Did the film inspire you?' },
  { key: 'message_importance', label: 'Importance of film message' }
];

async function up() {
  console.log('[Migration 007] Starting Settings & Criteria schema update...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // 1. submission_flags: check columns is_active, sort_order
  const flagCols = (await query('SHOW COLUMNS FROM `submission_flags`')).map(c => c.Field);
  if (!flagCols.includes('is_active')) {
    await query('ALTER TABLE `submission_flags` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `color`');
    console.log('[Migration 007] ✓ Added is_active to submission_flags');
  }
  if (!flagCols.includes('sort_order')) {
    await query('ALTER TABLE `submission_flags` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0 AFTER `is_active`');
    console.log('[Migration 007] ✓ Added sort_order to submission_flags');
  }

  // 2. festival_edition_settings
  await query(`
    CREATE TABLE IF NOT EXISTS festival_edition_settings (
      event_id BIGINT UNSIGNED PRIMARY KEY,
      max_screening_rounds TINYINT UNSIGNED NOT NULL DEFAULT 2,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 007] ✓ festival_edition_settings table created');

  // 3. festival_review_round_configs
  await query(`
    CREATE TABLE IF NOT EXISTS festival_review_round_configs (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      round_number TINYINT UNSIGNED NOT NULL,
      round_name VARCHAR(100) NOT NULL,
      description VARCHAR(255) NULL,
      scoring_mode ENUM('star_rating', 'vote_nomination') NOT NULL DEFAULT 'star_rating',
      max_rating_points INT NOT NULL DEFAULT 5,
      notes_required ENUM('optional', 'required') NOT NULL DEFAULT 'optional',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_event_round (event_id, round_number),
      INDEX idx_rev_configs_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 007] ✓ festival_review_round_configs table created');

  // 4. festival_review_criteria
  await query(`
    CREATE TABLE IF NOT EXISTS festival_review_criteria (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      round_number TINYINT UNSIGNED NOT NULL DEFAULT 1,
      label VARCHAR(100) NOT NULL,
      criterion_key VARCHAR(100) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_event_round_key (event_id, round_number, criterion_key),
      INDEX idx_criteria_event (event_id, round_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 007] ✓ festival_review_criteria table created');

  // 5. Seed default configuration for primary events [1, 40]
  const targetEvents = [1, 40];

  for (const eventId of targetEvents) {
    // Edition settings
    await query(`
      INSERT INTO festival_edition_settings (event_id, max_screening_rounds)
      VALUES (?, 2)
      ON DUPLICATE KEY UPDATE max_screening_rounds = VALUES(max_screening_rounds);
    `, [eventId]);

    // Round 1 config
    await query(`
      INSERT INTO festival_review_round_configs (event_id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required)
      VALUES (?, 1, 'Round 1: Initial Screening', 'Reviewers score submitted films using this round''s criteria.', 'star_rating', 5, 'optional')
      ON DUPLICATE KEY UPDATE round_name = VALUES(round_name);
    `, [eventId]);

    // Round 2 config
    await query(`
      INSERT INTO festival_review_round_configs (event_id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required)
      VALUES (?, 2, 'Round 2: Final Screening', 'Fresh reviewers score films advanced from Round 1 using this round''s criteria.', 'star_rating', 5, 'optional')
      ON DUPLICATE KEY UPDATE round_name = VALUES(round_name);
    `, [eventId]);

    // Criteria for Round 1
    for (let i = 0; i < canonicalCriteria.length; i++) {
      const c = canonicalCriteria[i];
      await query(`
        INSERT INTO festival_review_criteria (event_id, round_number, label, criterion_key, sort_order)
        VALUES (?, 1, ?, ?, ?)
        ON DUPLICATE KEY UPDATE label = VALUES(label), sort_order = VALUES(sort_order);
      `, [eventId, c.label, c.key, i + 1]);
    }

    // Criteria for Round 2
    for (let i = 0; i < canonicalCriteria.length; i++) {
      const c = canonicalCriteria[i];
      await query(`
        INSERT INTO festival_review_criteria (event_id, round_number, label, criterion_key, sort_order)
        VALUES (?, 2, ?, ?, ?)
        ON DUPLICATE KEY UPDATE label = VALUES(label), sort_order = VALUES(sort_order);
      `, [eventId, c.label, c.key, i + 1]);
    }

    // Default departments if none exist for this event
    const existingDepts = await query('SELECT count(*) as cnt FROM festival_departments WHERE event_id = ?', [eventId]);
    if (existingDepts[0].cnt === 0) {
      const defaultDepts = ['Hospitality', 'Registration', 'Venue', 'Guest Escort', 'Tech'];
      for (const d of defaultDepts) {
        await query('INSERT INTO festival_departments (event_id, name) VALUES (?, ?)', [eventId, d]);
      }
    }

    // Default flags if none exist for this event
    const existingFlags = await query('SELECT count(*) as cnt FROM submission_flags WHERE event_id = ?', [eventId]);
    if (existingFlags[0].cnt === 0) {
      const defaultFlags = [
        { id: `flag-${eventId}-high-priority`, label: 'High Priority', color: '#e05252', sort_order: 1 },
        { id: `flag-${eventId}-needs-review`, label: 'Needs Review', color: '#d97706', sort_order: 2 },
        { id: `flag-${eventId}-strong-contender`, label: 'Strong Contender', color: '#10b981', sort_order: 3 },
        { id: `flag-${eventId}-special-interest`, label: 'Special Interest', color: '#3b82f6', sort_order: 4 },
      ];
      for (const f of defaultFlags) {
        await query(
          'INSERT INTO submission_flags (id, event_id, label, color, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
          [f.id, eventId, f.label, f.color, f.sort_order]
        );
      }
    }
  }

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 007] ✓ Migration completed successfully for target events [1, 40].');
}

async function down() {
  await query('SET FOREIGN_KEY_CHECKS = 0;');
  await query('DROP TABLE IF EXISTS festival_review_criteria;');
  await query('DROP TABLE IF EXISTS festival_review_round_configs;');
  await query('DROP TABLE IF EXISTS festival_edition_settings;');
  await query('SET FOREIGN_KEY_CHECKS = 1;');
}

module.exports = { up, down, canonicalCriteria };

if (require.main === module) {
  up()
    .then(async () => {
      if (pool && pool.end) await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      if (pool && pool.end) await pool.end();
      process.exit(1);
    });
}
