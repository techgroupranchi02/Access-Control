/**
 * Migration 013: Deduplicate Festival Review States and Enforce Unique Name Constraint
 * 
 * 1. Re-maps any submissions pointing to duplicate stage IDs to their canonical stage IDs.
 * 2. Deletes duplicate stage rows from festival_review_states (cascading to festival_state_criteria).
 * 3. Ensures canonical 6-stage sequential order (1 to 6) for all events.
 * 4. Adds UNIQUE KEY `uk_event_unique_name` (event_id, unique_name) to prevent future duplication.
 */

const { query } = require('../src/config/database');

async function up() {
  console.log('[Migration 013] Starting deduplication and constraint enforcement for review stages...');
  await query('SET FOREIGN_KEY_CHECKS = 0;');

  // 1. Remap submissions for Event 40 (KASHISH x BENGALURU 2026)
  console.log('[Migration 013] Remapping submissions and cleaning stages for Event 40...');
  await query('UPDATE submissions SET review_state_id = 223 WHERE review_state_id = 12156 AND event_id = 40');
  await query(`
    UPDATE festival_review_states 
    SET unique_name = 'Official Selection Nominations', 
        award_criteria = '["Best Film","Best Direction","Best Cinematography","Best Debut Film","Best Documentary","Best Short Film","Best Animation"]',
        stage_order = 3
    WHERE id = 225
  `);
  // Delete duplicate stages in event 40
  await query('DELETE FROM festival_review_states WHERE event_id = 40 AND id NOT IN (223, 224, 225, 226, 227, 228)');
  // Re-set clean stage orders 1..6 for event 40
  await query('UPDATE festival_review_states SET stage_order = 1 WHERE id = 223');
  await query('UPDATE festival_review_states SET stage_order = 2 WHERE id = 224');
  await query('UPDATE festival_review_states SET stage_order = 3 WHERE id = 225');
  await query('UPDATE festival_review_states SET stage_order = 4 WHERE id = 226');
  await query('UPDATE festival_review_states SET stage_order = 5 WHERE id = 227');
  await query('UPDATE festival_review_states SET stage_order = 6 WHERE id = 228');

  // 2. Remap submissions and clean stages for Event 1
  console.log('[Migration 013] Remapping submissions and cleaning stages for Event 1...');
  await query('UPDATE submissions SET review_state_id = 12122 WHERE review_state_id = 12150 AND event_id = 1');
  // Delete duplicate stages in event 1
  await query('DELETE FROM festival_review_states WHERE event_id = 1 AND id NOT IN (12122, 12123, 12124, 12125, 12126, 12127)');
  await query('UPDATE festival_review_states SET stage_order = 1 WHERE id = 12122');
  await query('UPDATE festival_review_states SET stage_order = 2 WHERE id = 12123');
  await query('UPDATE festival_review_states SET stage_order = 3 WHERE id = 12124');
  await query('UPDATE festival_review_states SET stage_order = 4 WHERE id = 12125');
  await query('UPDATE festival_review_states SET stage_order = 5 WHERE id = 12126');
  await query('UPDATE festival_review_states SET stage_order = 6 WHERE id = 12127');

  // 3. Remap submissions and clean stages for Event 126
  console.log('[Migration 013] Remapping submissions and cleaning stages for Event 126...');
  await query('UPDATE submissions SET review_state_id = 715 WHERE review_state_id = 12270 AND event_id = 126');
  // Delete duplicate stages in event 126
  await query('DELETE FROM festival_review_states WHERE event_id = 126 AND id NOT IN (715, 716, 717, 718, 719, 720)');
  await query('UPDATE festival_review_states SET stage_order = 1 WHERE id = 715');
  await query('UPDATE festival_review_states SET stage_order = 2 WHERE id = 716');
  await query('UPDATE festival_review_states SET stage_order = 3 WHERE id = 717');
  await query('UPDATE festival_review_states SET stage_order = 4 WHERE id = 718');
  await query('UPDATE festival_review_states SET stage_order = 5 WHERE id = 719');
  await query('UPDATE festival_review_states SET stage_order = 6 WHERE id = 720');

  // 4. Dynamic safety net for any remaining duplicate stage names across ALL events
  const remainingDupes = await query(`
    SELECT event_id, unique_name, MIN(id) as keep_id
    FROM festival_review_states
    GROUP BY event_id, unique_name
    HAVING COUNT(*) > 1
  `);
  for (const dupe of remainingDupes) {
    console.log(`[Migration 013] Cleaning unexpected duplicates for event ${dupe.event_id}, stage "${dupe.unique_name}"...`);
    const rowsToDelete = await query(`
      SELECT id FROM festival_review_states 
      WHERE event_id = ? AND unique_name = ? AND id != ?
    `, [dupe.event_id, dupe.unique_name, dupe.keep_id]);
    for (const r of rowsToDelete) {
      await query('UPDATE submissions SET review_state_id = ? WHERE review_state_id = ?', [dupe.keep_id, r.id]);
      await query('DELETE FROM festival_review_states WHERE id = ?', [r.id]);
    }
  }

  // 5. Add UNIQUE KEY uk_event_unique_name if not already present
  const indexes = await query(`
    SHOW INDEX FROM festival_review_states WHERE Key_name = 'uk_event_unique_name'
  `);
  if (indexes.length === 0) {
    await query(`
      ALTER TABLE festival_review_states 
      ADD UNIQUE KEY uk_event_unique_name (event_id, unique_name)
    `);
    console.log('[Migration 013] ✓ Added UNIQUE KEY uk_event_unique_name (event_id, unique_name)');
  }

  await query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Migration 013] ✓ Review stages deduplication completed successfully.');
}

async function down() {
  console.log('[Migration 013] Revert: dropping uk_event_unique_name');
  try {
    await query('ALTER TABLE festival_review_states DROP INDEX uk_event_unique_name');
  } catch (e) {}
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

