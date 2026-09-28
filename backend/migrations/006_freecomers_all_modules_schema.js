/**
 * Migration 006: Freecomers All Operational Modules Schema
 *
 * Implements production operational tables for all Freecomers platform modules:
 * 1. submissions, submission_flags, submission_logs
 * 2. screening_assignments, screening_reviews, pipeline_states
 * 3. award_categories, jury_ballots
 * 4. tasks, task_assignees
 * 5. venues, venue_screening_slots
 * 6. guests
 * 7. chat_channels, chat_messages
 * 8. sponsors, sponsor_deliverables
 * 9. email_templates, payout_milestones, festival_departments
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 006] Creating Freecomers operational module tables...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // Ensure `edition` exists on `events`
  const eventCols = (await query('SHOW COLUMNS FROM `events`')).map(c => c.Field);
  if (!eventCols.includes('edition')) {
    await query("ALTER TABLE `events` ADD COLUMN `edition` VARCHAR(50) NOT NULL DEFAULT 'Edition 4 · 2026' AFTER `slug`");
  }

  // 1. submission_flags
  await query(`
    CREATE TABLE IF NOT EXISTS submission_flags (
      id VARCHAR(50) PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      label VARCHAR(100) NOT NULL,
      color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_flags_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. submissions
  await query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      director VARCHAR(255) NOT NULL,
      category ENUM('Short Film', 'Documentary', 'Student Film', 'Animation', 'Music Video', 'Feature Film') NOT NULL,
      runtime INT UNSIGNED NOT NULL COMMENT 'Runtime in minutes',
      country VARCHAR(100) NOT NULL,
      language VARCHAR(100) NOT NULL DEFAULT 'English',
      format VARCHAR(50) NOT NULL DEFAULT 'Digital',
      premiere ENUM('World', 'International', 'National', 'Regional', 'None') NOT NULL DEFAULT 'None',
      year SMALLINT UNSIGNED NOT NULL DEFAULT 2026,
      email VARCHAR(255) NOT NULL,
      synopsis TEXT NULL,
      status ENUM(
        'Submitted', 'Round 1 Screening', 'Admin Review', 'Round 2 Screening',
        'Round 3 Screening', 'Round 4 Screening', 'Official Selection',
        'Winner', 'Finalist', 'Rejected'
      ) NOT NULL DEFAULT 'Submitted',
      flag_id VARCHAR(50) NULL,
      overall_average_rating DECIMAL(3, 2) NULL,
      rejection_reason TEXT NULL,
      rejected_by_user_id INT UNSIGNED NULL,
      rejected_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_submissions_event_status (event_id, status),
      INDEX idx_submissions_search (title, director, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. submission_logs
  await query(`
    CREATE TABLE IF NOT EXISTS submission_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      submission_id BIGINT UNSIGNED NOT NULL,
      action VARCHAR(50) NOT NULL,
      actor_user_id INT UNSIGNED NOT NULL,
      old_value JSON NULL,
      new_value JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sublogs_submission (submission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. screening_assignments
  await query(`
    CREATE TABLE IF NOT EXISTS screening_assignments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      round_number TINYINT UNSIGNED NOT NULL DEFAULT 1,
      judge_user_id INT UNSIGNED NOT NULL,
      status ENUM('assigned', 'in_progress', 'completed') NOT NULL DEFAULT 'assigned',
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      UNIQUE KEY uk_assignment (film_id, round_number, judge_user_id),
      INDEX idx_screening_judge (judge_user_id),
      INDEX idx_screening_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. screening_reviews
  await query(`
    CREATE TABLE IF NOT EXISTS screening_reviews (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      assignment_id BIGINT UNSIGNED NOT NULL,
      event_id BIGINT UNSIGNED NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      judge_user_id INT UNSIGNED NOT NULL,
      round_number TINYINT UNSIGNED NOT NULL DEFAULT 1,
      criteria_scores JSON NOT NULL COMMENT '{"directing": 5, "screenplay": 4, "cinematography": 5, "acting": 4, "sound": 5}',
      overall_rating DECIMAL(3, 2) NOT NULL,
      notes TEXT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reviews_assignment (assignment_id),
      INDEX idx_reviews_film (film_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6. pipeline_states
  await query(`
    CREATE TABLE IF NOT EXISTS pipeline_states (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      current_stage TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=Screening, 2=Selection, 3=Nominations, 4=Jury, 5=Results, 6=Finals',
      voting_open BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_event_pipeline (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7. award_categories
  await query(`
    CREATE TABLE IF NOT EXISTS award_categories (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(150) NOT NULL,
      order_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_awards_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 8. jury_ballots
  await query(`
    CREATE TABLE IF NOT EXISTS jury_ballots (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      category_id INT UNSIGNED NOT NULL,
      judge_user_id INT UNSIGNED NOT NULL,
      voted_film_id BIGINT UNSIGNED NOT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_juror_vote (category_id, judge_user_id),
      INDEX idx_ballots_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 9. tasks
  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      department ENUM('Tech', 'Venue', 'Guest Escort', 'Registration', 'Hospitality', 'General') NOT NULL,
      priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
      due_date DATETIME NOT NULL,
      status ENUM('To Do', 'In Progress', 'Done') NOT NULL DEFAULT 'To Do',
      created_by_user_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tasks_event_dept (event_id, department),
      INDEX idx_tasks_status (event_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 10. task_assignees
  await query(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id BIGINT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_task_user (task_id, user_id),
      INDEX idx_assignees_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 11. venues
  await query(`
    CREATE TABLE IF NOT EXISTS venues (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      capacity INT UNSIGNED NOT NULL DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_venues_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 12. venue_screening_slots
  await query(`
    CREATE TABLE IF NOT EXISTS venue_screening_slots (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      venue_name VARCHAR(100) NOT NULL,
      day_index TINYINT UNSIGNED NOT NULL COMMENT '0=Day 1, 1=Day 2, etc.',
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      film_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_slots_day_venue (event_id, day_index, venue_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 13. guests
  await query(`
    CREATE TABLE IF NOT EXISTS guests (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      rsvp_status ENUM('Invite Sent', 'Confirmed', 'Arrived', 'Checked In', 'Seated', 'Cancelled') NOT NULL DEFAULT 'Invite Sent',
      hotel_details VARCHAR(255) NULL,
      flight_details VARCHAR(255) NULL,
      assigned_volunteer_id INT UNSIGNED NULL,
      assigned_seat VARCHAR(100) NULL,
      badge_issued BOOLEAN NOT NULL DEFAULT FALSE,
      checked_in_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_guests_event_status (event_id, rsvp_status),
      INDEX idx_guests_volunteer (assigned_volunteer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 14. chat_channels
  await query(`
    CREATE TABLE IF NOT EXISTS chat_channels (
      id VARCHAR(50) PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT NULL,
      is_system_group BOOLEAN NOT NULL DEFAULT FALSE,
      visibility_mode ENUM('roles', 'users', 'all') NOT NULL DEFAULT 'roles',
      visible_to_roles JSON NOT NULL COMMENT '["admin", "volunteer"]',
      created_by_user_id INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_channels_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 15. chat_messages
  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR(50) PRIMARY KEY,
      channel_id VARCHAR(50) NOT NULL,
      sender_user_id INT UNSIGNED NOT NULL,
      content TEXT NOT NULL,
      reply_to VARCHAR(50) NULL,
      edited_at TIMESTAMP NULL DEFAULT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_messages_channel_sent (channel_id, sent_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 16. sponsors
  await query(`
    CREATE TABLE IF NOT EXISTS sponsors (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(255) NOT NULL,
      tier ENUM('Title', 'Presenting', 'Partner') NOT NULL,
      contract_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      logo_url VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sponsors_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 17. sponsor_deliverables
  await query(`
    CREATE TABLE IF NOT EXISTS sponsor_deliverables (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sponsor_id INT UNSIGNED NOT NULL,
      title VARCHAR(255) NOT NULL,
      due_date DATE NOT NULL,
      status ENUM('Pending', 'In Progress', 'Completed') NOT NULL DEFAULT 'Pending',
      INDEX idx_deliv_sponsor (sponsor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 18. email_templates
  await query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id VARCHAR(50) PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      subject VARCHAR(255) NOT NULL,
      body_html TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_templates_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 19. payout_milestones
  await query(`
    CREATE TABLE IF NOT EXISTS payout_milestones (
      id VARCHAR(50) PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(100) NOT NULL,
      target_amount DECIMAL(12, 2) NOT NULL,
      status ENUM('Locked', 'Eligible', 'Disbursed') NOT NULL DEFAULT 'Locked',
      disbursed_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_payouts_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 20. festival_departments
  await query(`
    CREATE TABLE IF NOT EXISTS festival_departments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_depts_event (event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 006] ✓ All operational module tables created successfully.');
}

async function down() {
  console.log('[Migration 006] Dropping operational module tables...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');
  const tables = [
    'festival_departments', 'payout_milestones', 'email_templates', 'sponsor_deliverables',
    'sponsors', 'chat_messages', 'chat_channels', 'guests', 'venue_screening_slots',
    'venues', 'task_assignees', 'tasks', 'jury_ballots', 'award_categories',
    'pipeline_states', 'screening_reviews', 'screening_assignments', 'submission_logs',
    'submissions', 'submission_flags'
  ];
  for (const t of tables) {
    await query(`DROP TABLE IF EXISTS \`${t}\`;`);
  }
  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 006] ✓ Operational tables dropped.');
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
