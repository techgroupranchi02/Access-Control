/**
 * Migration 010: Sequential 6-Stages Review Workflow & Dynamic Settings
 * 
 * 1. Creates `festival_review_states` table for dynamic 6-stage review pipeline.
 * 2. Creates `festival_state_criteria` table for rubric criteria and percentage weights.
 * 3. Alters `submissions` table to add `review_state_id`, `current_stage_name`, `composite_score`, `auto_promoted`.
 * 4. Seeds the approved 6 sequential stages for primary festival events:
 *    Stage 1: Round 1: Screening (5-Star Rubric)
 *    Stage 2: Round 2: Consideration (10-Star Weighted Scale)
 *    Stage 3: Official Selection Nominations (Nomination Ballot)
 *    Stage 4: Jury & Voting (Full Competition Scorecard & Balloting)
 *    Stage 5: Finalist (Borda Count Ranked Choice Shortlist)
 *    Stage 6: Winner (Golden Laurel Crowning & Laurels)
 * 5. Backfills existing submissions with their corresponding review state references.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 010] Starting Sequential 6-Stages Review Workflow migration...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // 1. Create festival_review_states table
  await query(`
    CREATE TABLE IF NOT EXISTS \`festival_review_states\` (
      \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`event_id\` BIGINT UNSIGNED NOT NULL,
      \`unique_name\` VARCHAR(100) NOT NULL,
      \`stage_order\` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
      \`access_group_name\` VARCHAR(100) NOT NULL DEFAULT 'jury',
      \`custom_group_id\` INT NULL,
      \`scope_key\` VARCHAR(100) NOT NULL DEFAULT 'assigned',
      
      -- Evaluation System
      \`review_type\` ENUM('star_based', 'vote_based', 'rank_based') NOT NULL DEFAULT 'star_based',
      \`star_scale\` ENUM('3', '5', '10') NULL DEFAULT '5',
      \`vote_mode\` ENUM('single', 'multiple', 'nomination') NULL DEFAULT 'single',
      \`rank_mode\` ENUM('top_n', 'borda_count', 'all') NULL DEFAULT 'all',
      \`rank_top_n\` INT UNSIGNED NULL DEFAULT 5,
      \`notes_requirement\` ENUM('optional', 'required') NOT NULL DEFAULT 'optional',
      
      -- Progression & Cutoff Rules
      \`completion_logic\` ENUM('all_reviews_done', 'date_dependent', 'admin_override') NOT NULL DEFAULT 'all_reviews_done',
      \`auto_advance_cutoff\` DECIMAL(4,2) NULL DEFAULT 4.50,
      \`auto_reject_cutoff\` DECIMAL(4,2) NULL DEFAULT 3.00,
      \`deadline_at\` DATETIME NULL,
      \`unreviewed_action\` ENUM('mark_rejected', 'keep_current', 'advance') NOT NULL DEFAULT 'mark_rejected',
      \`status\` ENUM('not_started', 'active', 'completed') NOT NULL DEFAULT 'active',
      
      -- Automated Notifications
      \`notify_acceptance\` TINYINT(1) NOT NULL DEFAULT 0,
      \`acceptance_template\` TEXT NULL,
      \`notify_rejection\` TINYINT(1) NOT NULL DEFAULT 0,
      \`rejection_template\` TEXT NULL,

      -- Jury Assignment Rules & Criteria
      \`jury_assignment_mode\` ENUM('auto', 'manual', 'none') NOT NULL DEFAULT 'auto',
      \`jury_auto_rule\` ENUM('all_jury', 'n_jury') NOT NULL DEFAULT 'all_jury',
      \`jury_count_per_film\` INT UNSIGNED NULL DEFAULT 1,
      \`award_criteria\` TEXT NULL,
      
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_event_stage_order\` (\`event_id\`, \`stage_order\`),
      INDEX \`idx_rev_states_event\` (\`event_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 010] ✓ Created festival_review_states table');

  // 2. Create festival_state_criteria table
  await query(`
    CREATE TABLE IF NOT EXISTS \`festival_state_criteria\` (
      \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`event_id\` BIGINT UNSIGNED NOT NULL,
      \`state_id\` INT UNSIGNED NOT NULL,
      \`label\` VARCHAR(100) NOT NULL,
      \`criterion_key\` VARCHAR(100) NOT NULL,
      \`weight_percentage\` DECIMAL(5,2) NOT NULL DEFAULT 25.00,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_state_crit\` (\`state_id\`, \`criterion_key\`),
      INDEX \`idx_crit_event\` (\`event_id\`),
      CONSTRAINT \`fk_state_criteria_state\` FOREIGN KEY (\`state_id\`) REFERENCES \`festival_review_states\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[Migration 010] ✓ Created festival_state_criteria table');

  // 3. Alter submissions table columns
  const subCols = (await query('SHOW COLUMNS FROM `submissions`')).map(c => c.Field);
  
  if (!subCols.includes('review_state_id')) {
    await query('ALTER TABLE `submissions` ADD COLUMN `review_state_id` INT UNSIGNED NULL AFTER `status`');
    await query('ALTER TABLE `submissions` ADD INDEX `idx_sub_review_state` (`review_state_id`)');
    console.log('[Migration 010] ✓ Added review_state_id to submissions');
  }

  if (!subCols.includes('current_stage_name')) {
    await query('ALTER TABLE `submissions` ADD COLUMN `current_stage_name` VARCHAR(100) NULL AFTER `review_state_id`');
    console.log('[Migration 010] ✓ Added current_stage_name to submissions');
  }

  if (!subCols.includes('composite_score')) {
    await query('ALTER TABLE `submissions` ADD COLUMN `composite_score` DECIMAL(4,2) NULL AFTER `current_stage_name`');
    console.log('[Migration 010] ✓ Added composite_score to submissions');
  }

  if (!subCols.includes('auto_promoted')) {
    await query('ALTER TABLE `submissions` ADD COLUMN `auto_promoted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `composite_score`');
    console.log('[Migration 010] ✓ Added auto_promoted to submissions');
  }

  // 4. Seed the 6 approved sequential stages for primary festival events
  const subEvents = (await query('SELECT DISTINCT event_id FROM submissions')).map(r => r.event_id);
  const targetEventIds = Array.from(new Set([1, 40, ...subEvents])).filter(Boolean);

  const stageDefinitions = [
    {
      order: 1,
      name: 'Round 1: Screening',
      review_type: 'star_based',
      star_scale: '5',
      notes_requirement: 'optional',
      auto_advance_cutoff: 4.50,
      auto_reject_cutoff: 3.00,
      status: 'active',
      criteria: [
        { key: 'direction', label: 'Directorial Vision', weight: 25.00 },
        { key: 'screenplay', label: 'Screenplay & Narrative', weight: 25.00 },
        { key: 'cinematography', label: 'Cinematography', weight: 25.00 },
        { key: 'sound', label: 'Sound & Audio Design', weight: 25.00 }
      ]
    },
    {
      order: 2,
      name: 'Round 2: Consideration',
      review_type: 'star_based',
      star_scale: '10',
      notes_requirement: 'required',
      auto_advance_cutoff: 8.50,
      auto_reject_cutoff: 6.00,
      status: 'active',
      criteria: [
        { key: 'narrative_depth', label: 'Narrative Depth', weight: 25.00 },
        { key: 'pacing', label: 'Pacing & Flow', weight: 25.00 },
        { key: 'editing', label: 'Editing & Rhythm', weight: 25.00 },
        { key: 'score', label: 'Music & Original Score', weight: 25.00 }
      ]
    },
    {
      order: 3,
      name: 'Official Selection Nominations',
      review_type: 'vote_based',
      vote_mode: 'nomination',
      notes_requirement: 'optional',
      auto_advance_cutoff: null,
      auto_reject_cutoff: null,
      status: 'active',
      criteria: []
    },
    {
      order: 4,
      name: 'Jury & Voting',
      review_type: 'star_based',
      star_scale: '10',
      notes_requirement: 'required',
      auto_advance_cutoff: 8.50,
      auto_reject_cutoff: 5.00,
      status: 'active',
      criteria: [
        { key: 'artistic_merit', label: 'Artistic Merit', weight: 30.00 },
        { key: 'innovation', label: 'Innovation & Originality', weight: 30.00 },
        { key: 'execution', label: 'Technical Execution', weight: 40.00 }
      ]
    },
    {
      order: 5,
      name: 'Finalist',
      review_type: 'rank_based',
      rank_mode: 'borda_count',
      rank_top_n: 3,
      notes_requirement: 'optional',
      auto_advance_cutoff: null,
      auto_reject_cutoff: null,
      status: 'active',
      criteria: []
    },
    {
      order: 6,
      name: 'Winner',
      review_type: 'vote_based',
      vote_mode: 'single',
      notes_requirement: 'optional',
      auto_advance_cutoff: null,
      auto_reject_cutoff: null,
      status: 'active',
      criteria: []
    }
  ];

  for (const eventId of targetEventIds) {
    console.log(`[Migration 010] Seeding 6 sequential stages for event_id: ${eventId}...`);
    for (const stage of stageDefinitions) {
      await query(`
        INSERT INTO \`festival_review_states\` (
          \`event_id\`, \`unique_name\`, \`stage_order\`, \`access_group_name\`, \`scope_key\`,
          \`review_type\`, \`star_scale\`, \`vote_mode\`, \`rank_mode\`, \`rank_top_n\`,
          \`notes_requirement\`, \`auto_advance_cutoff\`, \`auto_reject_cutoff\`, \`status\`
        ) VALUES (?, ?, ?, 'jury', 'assigned', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`unique_name\` = VALUES(\`unique_name\`),
          \`review_type\` = VALUES(\`review_type\`),
          \`star_scale\` = VALUES(\`star_scale\`),
          \`vote_mode\` = VALUES(\`vote_mode\`),
          \`rank_mode\` = VALUES(\`rank_mode\`),
          \`rank_top_n\` = VALUES(\`rank_top_n\`),
          \`notes_requirement\` = VALUES(\`notes_requirement\`),
          \`auto_advance_cutoff\` = VALUES(\`auto_advance_cutoff\`),
          \`auto_reject_cutoff\` = VALUES(\`auto_reject_cutoff\`),
          \`status\` = VALUES(\`status\`);
      `, [
        eventId,
        stage.name,
        stage.order,
        stage.review_type,
        stage.star_scale || null,
        stage.vote_mode || null,
        stage.rank_mode || null,
        stage.rank_top_n || null,
        stage.notes_requirement,
        stage.auto_advance_cutoff,
        stage.auto_reject_cutoff,
        stage.status
      ]);

      // Retrieve state_id
      const stateRow = await query(
        'SELECT id FROM festival_review_states WHERE event_id = ? AND stage_order = ?',
        [eventId, stage.order]
      );
      if (stateRow.length > 0) {
        const stateId = stateRow[0].id;
        for (let i = 0; i < stage.criteria.length; i++) {
          const c = stage.criteria[i];
          await query(`
            INSERT INTO \`festival_state_criteria\` (
              \`event_id\`, \`state_id\`, \`label\`, \`criterion_key\`, \`weight_percentage\`, \`sort_order\`
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              \`label\` = VALUES(\`label\`),
              \`weight_percentage\` = VALUES(\`weight_percentage\`),
              \`sort_order\` = VALUES(\`sort_order\`);
          `, [eventId, stateId, c.label, c.key, c.weight, i + 1]);
        }
      }
    }
  }

  // 5. Backfill existing submissions with stage references
  console.log('[Migration 010] Backfilling existing submissions with 6-stage references...');
  const stateMapRows = await query('SELECT id, event_id, stage_order, unique_name FROM festival_review_states');
  const stateByEventAndOrder = {};
  for (const s of stateMapRows) {
    if (!stateByEventAndOrder[s.event_id]) stateByEventAndOrder[s.event_id] = {};
    stateByEventAndOrder[s.event_id][s.stage_order] = s;
  }

  const existingSubs = await query('SELECT id, event_id, status FROM submissions');
  for (const sub of existingSubs) {
    const states = stateByEventAndOrder[sub.event_id] || stateByEventAndOrder[1] || {};
    let targetStageOrder = 1;
    if (['Round 2 Screening', 'Consideration', 'Admin Review'].includes(sub.status)) {
      targetStageOrder = 2;
    } else if (sub.status === 'Official Selection') {
      targetStageOrder = 3;
    } else if (sub.status === 'Jury & Voting') {
      targetStageOrder = 4;
    } else if (sub.status === 'Finalist') {
      targetStageOrder = 5;
    } else if (sub.status === 'Winner') {
      targetStageOrder = 6;
    } else {
      targetStageOrder = 1;
    }

    const matchedState = states[targetStageOrder];
    if (matchedState) {
      await query(`
        UPDATE \`submissions\`
        SET \`review_state_id\` = ?,
            \`current_stage_name\` = ?
        WHERE \`id\` = ? AND (\`review_state_id\` IS NULL OR \`current_stage_name\` IS NULL)
      `, [matchedState.id, matchedState.unique_name, sub.id]);
    }
  }

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 010] ✓ Migration 010 completed successfully!');
}

async function down() {
  console.log('[Migration 010] Reverting Migration 010...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');
  await query('DROP TABLE IF EXISTS `festival_state_criteria`;');
  await query('DROP TABLE IF EXISTS `festival_review_states`;');
  try {
    await query('ALTER TABLE `submissions` DROP COLUMN `review_state_id`, DROP COLUMN `current_stage_name`, DROP COLUMN `composite_score`, DROP COLUMN `auto_promoted`;');
  } catch (e) {
    console.error('Note reverting submissions columns:', e.message);
  }
  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 010] ✓ Rollback finished.');
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
