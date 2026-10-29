/**
 * Migration Script for Kashish Integration & Results Approval Workflow
 */
const { query, pool } = require('../config/database');

async function runMigration() {
  console.log('[Migration] Starting Kashish integration migration...');

  try {
    // 1. audience_voting_scores: Add results_approved columns if not present
    console.log('[Migration] Checking audience_voting_scores columns...');
    const scoreCols = await query("SHOW COLUMNS FROM audience_voting_scores LIKE 'results_approved'");
    if (scoreCols.length === 0) {
      await query(`
        ALTER TABLE audience_voting_scores
          ADD COLUMN results_approved TINYINT(1) DEFAULT 0,
          ADD COLUMN approved_by_user_id BIGINT UNSIGNED NULL,
          ADD COLUMN approved_at TIMESTAMP NULL
      `);
      console.log('[Migration] Added results_approved columns to audience_voting_scores');
    } else {
      console.log('[Migration] results_approved column already exists in audience_voting_scores');
    }

    // 2. audience_votes: Modify screening_block_id to be nullable & voting_method to varchar(32)
    console.log('[Migration] Updating audience_votes columns for external sync...');
    await query(`
      ALTER TABLE audience_votes
        MODIFY COLUMN screening_block_id BIGINT UNSIGNED NULL DEFAULT NULL,
        MODIFY COLUMN voting_method VARCHAR(32) NOT NULL DEFAULT 'qr_direct'
    `);
    console.log('[Migration] audience_votes updated successfully');

    // 3. Create kashish_movie_mappings
    console.log('[Migration] Creating kashish_movie_mappings table...');
    await query(`
      CREATE TABLE IF NOT EXISTS kashish_movie_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id BIGINT UNSIGNED NOT NULL,
        kashish_movie_id VARCHAR(64) NOT NULL,
        kashish_movie_title VARCHAR(255) NULL,
        freecomers_submission_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_kashish_movie (event_id, kashish_movie_id),
        INDEX idx_submission (freecomers_submission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create kashish_user_mappings
    console.log('[Migration] Creating kashish_user_mappings table...');
    await query(`
      CREATE TABLE IF NOT EXISTS kashish_user_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id BIGINT UNSIGNED NOT NULL,
        kashish_user_id VARCHAR(64) NOT NULL,
        kashish_user_email VARCHAR(255) NULL,
        kashish_user_name VARCHAR(255) NULL,
        kashish_user_mobile VARCHAR(30) NULL,
        freecomers_attendee_id BIGINT UNSIGNED NULL,
        matched_by ENUM('email', 'phone', 'manual', 'auto_created') DEFAULT 'email',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_kashish_user (event_id, kashish_user_id),
        INDEX idx_attendee (freecomers_attendee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Create kashish_sync_logs
    console.log('[Migration] Creating kashish_sync_logs table...');
    await query(`
      CREATE TABLE IF NOT EXISTS kashish_sync_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id BIGINT UNSIGNED NOT NULL,
        sync_type ENUM('votes', 'full') DEFAULT 'votes',
        total_fetched INT DEFAULT 0,
        new_votes_created INT DEFAULT 0,
        duplicate_skipped INT DEFAULT 0,
        users_auto_matched INT DEFAULT 0,
        users_auto_created INT DEFAULT 0,
        movies_unmapped INT DEFAULT 0,
        synced_by_user_id BIGINT UNSIGNED NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        status ENUM('running', 'completed', 'failed') DEFAULT 'running',
        error_message TEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('[Migration] All Kashish tables and schema updates applied successfully!');
  } catch (err) {
    console.error('[Migration] Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
