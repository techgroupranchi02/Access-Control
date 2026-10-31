/**
 * Migration 012: Align Submissions, Review Workflow, and Ballots Schema
 *
 * Ensures:
 * 1. submissions table supports flexible categories (VARCHAR 255), fractional runtimes (VARCHAR 50),
 *    custom premieres (VARCHAR 100), and all workflow statuses (VARCHAR 100).
 * 2. festival_review_states includes jury_assignment_mode, jury_auto_rule, jury_count_per_film, and award_criteria.
 * 3. screening_assignments & screening_reviews have jury_user_id column.
 * 4. jury_ballots includes jury_user_id, nullable voted_film_id, and ranked_nominees JSON column.
 * 5. submission_logs includes notes column.
 */

const { query } = require('../src/config/database');

async function getColumns(tableName) {
  try {
    const rows = await query(`SHOW COLUMNS FROM \`${tableName}\``);
    return rows.map(r => r.Field);
  } catch (err) {
    return [];
  }
}

async function up() {
  console.log('[Migration 012] Starting schema alignment for submissions and review workflow...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // 1. submissions
  const subCols = await getColumns('submissions');
  if (subCols.length > 0) {
    console.log('[Migration 012] Aligning submissions table column definitions...');
    await query(`
      ALTER TABLE \`submissions\`
        MODIFY COLUMN \`category\` VARCHAR(255) NOT NULL DEFAULT 'Short Film',
        MODIFY COLUMN \`runtime\` VARCHAR(50) NOT NULL DEFAULT '15',
        MODIFY COLUMN \`premiere\` VARCHAR(100) NULL DEFAULT 'None',
        MODIFY COLUMN \`status\` VARCHAR(100) NOT NULL DEFAULT 'Submitted';
    `);
    console.log('[Migration 012] ✓ submissions table column definitions aligned.');
  }

  // 2. festival_review_states
  const frsCols = await getColumns('festival_review_states');
  if (frsCols.length > 0) {
    if (!frsCols.includes('jury_assignment_mode')) {
      await query("ALTER TABLE `festival_review_states` ADD COLUMN `jury_assignment_mode` ENUM('auto', 'manual', 'none') NOT NULL DEFAULT 'auto'");
    }
    if (!frsCols.includes('jury_auto_rule')) {
      await query("ALTER TABLE `festival_review_states` ADD COLUMN `jury_auto_rule` ENUM('all_jury', 'n_jury') NOT NULL DEFAULT 'all_jury'");
    }
    if (!frsCols.includes('jury_count_per_film')) {
      await query("ALTER TABLE `festival_review_states` ADD COLUMN `jury_count_per_film` INT UNSIGNED NULL DEFAULT 1");
    }
    if (!frsCols.includes('award_criteria')) {
      await query("ALTER TABLE `festival_review_states` ADD COLUMN `award_criteria` TEXT NULL");
    }
    console.log('[Migration 012] ✓ festival_review_states columns verified/added.');
  }

  // 3. screening_assignments
  const saCols = await getColumns('screening_assignments');
  if (saCols.length > 0) {
    if (!saCols.includes('jury_user_id')) {
      if (saCols.includes('judge_user_id')) {
        await query("ALTER TABLE `screening_assignments` CHANGE COLUMN `judge_user_id` `jury_user_id` INT UNSIGNED NOT NULL");
      } else {
        await query("ALTER TABLE `screening_assignments` ADD COLUMN `jury_user_id` INT UNSIGNED NOT NULL AFTER `round_number`");
      }
    }
    console.log('[Migration 012] ✓ screening_assignments jury_user_id verified.');
  }

  // 4. screening_reviews
  const srCols = await getColumns('screening_reviews');
  if (srCols.length > 0) {
    if (!srCols.includes('jury_user_id')) {
      if (srCols.includes('judge_user_id')) {
        await query("ALTER TABLE `screening_reviews` CHANGE COLUMN `judge_user_id` `jury_user_id` INT UNSIGNED NOT NULL");
      } else {
        await query("ALTER TABLE `screening_reviews` ADD COLUMN `jury_user_id` INT UNSIGNED NOT NULL AFTER `film_id`");
      }
    }
    console.log('[Migration 012] ✓ screening_reviews jury_user_id verified.');
  }

  // 5. jury_ballots
  const jbCols = await getColumns('jury_ballots');
  if (jbCols.length > 0) {
    if (!jbCols.includes('jury_user_id')) {
      if (jbCols.includes('judge_user_id')) {
        await query("ALTER TABLE `jury_ballots` CHANGE COLUMN `judge_user_id` `jury_user_id` INT UNSIGNED NOT NULL");
      } else {
        await query("ALTER TABLE `jury_ballots` ADD COLUMN `jury_user_id` INT UNSIGNED NOT NULL AFTER `category_id`");
      }
    }
    if (!jbCols.includes('ranked_nominees')) {
      await query("ALTER TABLE `jury_ballots` ADD COLUMN `ranked_nominees` JSON NULL DEFAULT NULL AFTER `voted_film_id`");
    }
    await query("ALTER TABLE `jury_ballots` MODIFY COLUMN `voted_film_id` BIGINT UNSIGNED NULL DEFAULT NULL");
    console.log('[Migration 012] ✓ jury_ballots ranked_nominees and jury_user_id verified.');
  }

  // 6. submission_logs
  const slCols = await getColumns('submission_logs');
  if (slCols.length > 0) {
    if (!slCols.includes('notes')) {
      await query("ALTER TABLE `submission_logs` ADD COLUMN `notes` TEXT NULL AFTER `new_value`");
    }
    console.log('[Migration 012] ✓ submission_logs notes column verified.');
  }

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 012] ✓ Submissions and review workflow schema alignment completed successfully.');
}

async function down() {
  console.log('[Migration 012] Revert not required (non-destructive alignment).');
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
