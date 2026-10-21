/**
 * Settings Controller
 * 100% Dynamic Database-backed settings for:
 * 1. Departments (festival_departments table)
 * 2. Film Flags (submission_flags table with swatches & active toggle)
 * 3. Review Rounds (festival_edition_settings, festival_review_round_configs, festival_review_criteria)
 */

const { query } = require('../../config/database');

const CANONICAL_CRITERIA = [
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

function getEventId(req) {
  const raw = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || 1;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 1 : parsed;
}

/**
 * Ensures an event has baseline edition settings, round configs, and criteria.
 */
async function ensureEventInitialized(eventId) {
  try {
    // 1. Check settings
    const settings = await query('SELECT max_screening_rounds FROM festival_edition_settings WHERE event_id = ?', [eventId]);
    if (settings.length === 0) {
      await query(`
        INSERT INTO festival_edition_settings (event_id, max_screening_rounds)
        VALUES (?, 2)
        ON DUPLICATE KEY UPDATE max_screening_rounds = max_screening_rounds
      `, [eventId]);
    }

    // 2. Check round configs
    const rounds = await query('SELECT round_number FROM festival_review_round_configs WHERE event_id = ?', [eventId]);
    const roundNums = rounds.map(r => r.round_number);

    if (!roundNums.includes(1)) {
      await query(`
        INSERT INTO festival_review_round_configs (event_id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required)
        VALUES (?, 1, 'Round 1: Initial Screening', 'Reviewers score submitted films using this round''s criteria.', 'star_rating', 5, 'optional')
      `, [eventId]);
    }
    if (!roundNums.includes(2)) {
      await query(`
        INSERT INTO festival_review_round_configs (event_id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required)
        VALUES (?, 2, 'Round 2: Final Screening', 'Fresh reviewers score films advanced from Round 1 using this round''s criteria.', 'star_rating', 5, 'optional')
      `, [eventId]);
    }

    // 3. Check criteria
    const criteriaCount = await query('SELECT COUNT(*) as cnt FROM festival_review_criteria WHERE event_id = ?', [eventId]);
    if (criteriaCount[0].cnt === 0) {
      for (const rNum of [1, 2]) {
        for (let i = 0; i < CANONICAL_CRITERIA.length; i++) {
          const c = CANONICAL_CRITERIA[i];
          await query(`
            INSERT INTO festival_review_criteria (event_id, round_number, label, criterion_key, sort_order)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE label = VALUES(label)
          `, [eventId, rNum, c.label, c.key, i + 1]);
        }
      }
    }
  } catch (err) {
    console.error('[SettingsController] ensureEventInitialized warning:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FILM FLAGS
// ─────────────────────────────────────────────────────────────────────────────

async function listFlags(req, res) {
  try {
    const eventId = getEventId(req);
    let rows = await query(
      'SELECT id, event_id, label, color, is_active, sort_order, created_at FROM submission_flags WHERE event_id = ? ORDER BY sort_order ASC, id ASC',
      [eventId]
    );

    if (rows.length === 0) {
      const defaultFlags = [
        { id: `flag-${eventId}-high-priority`, label: 'High Priority', color: '#e05252', sort_order: 1 },
        { id: `flag-${eventId}-needs-review`, label: 'Needs Review', color: '#d97706', sort_order: 2 },
        { id: `flag-${eventId}-strong-contender`, label: 'Strong Contender', color: '#10b981', sort_order: 3 },
        { id: `flag-${eventId}-special-interest`, label: 'Special Interest', color: '#3b82f6', sort_order: 4 },
      ];
      for (const f of defaultFlags) {
        await query(
          'INSERT INTO submission_flags (id, event_id, label, color, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE label=VALUES(label)',
          [f.id, eventId, f.label, f.color, f.sort_order]
        );
      }
      rows = await query(
        'SELECT id, event_id, label, color, is_active, sort_order, created_at FROM submission_flags WHERE event_id = ? ORDER BY sort_order ASC, id ASC',
        [eventId]
      );
    }

    res.json({ data: rows, total: rows.length });
  } catch (error) {
    console.error('[SettingsController] listFlags error:', error);
    res.status(500).json({ error: 'Failed to retrieve flags.' });
  }
}

async function createFlag(req, res) {
  try {
    const eventId = getEventId(req);
    const { label, color, is_active } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Flag label is required.' });
    }

    const cleanLabel = label.trim();
    const cleanColor = (color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) ? color : '#e05252';
    const activeVal = is_active === false || is_active === 0 ? 0 : 1;

    // Get max sort_order
    const maxOrder = await query('SELECT MAX(sort_order) as max_ord FROM submission_flags WHERE event_id = ?', [eventId]);
    const nextOrder = (maxOrder[0].max_ord || 0) + 1;

    const flagId = `flag-${eventId}-${Date.now().toString(36)}`;

    await query(
      'INSERT INTO submission_flags (id, event_id, label, color, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [flagId, eventId, cleanLabel, cleanColor, activeVal, nextOrder]
    );

    res.status(201).json({
      message: 'Film flag created successfully.',
      data: {
        id: flagId,
        event_id: eventId,
        label: cleanLabel,
        color: cleanColor,
        is_active: activeVal,
        sort_order: nextOrder
      }
    });
  } catch (error) {
    console.error('[SettingsController] createFlag error:', error);
    res.status(500).json({ error: 'Failed to create flag.' });
  }
}

async function updateFlag(req, res) {
  try {
    const eventId = getEventId(req);
    const id = req.params.id;
    const { label, color, is_active, sort_order } = req.body;

    const existing = await query('SELECT * FROM submission_flags WHERE id = ? AND event_id = ?', [id, eventId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Flag not found.' });
    }

    const flag = existing[0];
    const newLabel = label !== undefined ? label.trim() : flag.label;
    const newColor = (color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) ? color : flag.color;
    const newActive = is_active !== undefined ? (is_active ? 1 : 0) : flag.is_active;
    const newOrder = sort_order !== undefined ? parseInt(sort_order, 10) : flag.sort_order;

    await query(
      'UPDATE submission_flags SET label = ?, color = ?, is_active = ?, sort_order = ? WHERE id = ? AND event_id = ?',
      [newLabel, newColor, newActive, newOrder, id, eventId]
    );

    res.json({
      message: 'Flag updated successfully.',
      data: {
        id,
        event_id: eventId,
        label: newLabel,
        color: newColor,
        is_active: newActive,
        sort_order: newOrder
      }
    });
  } catch (error) {
    console.error('[SettingsController] updateFlag error:', error);
    res.status(500).json({ error: 'Failed to update flag.' });
  }
}

async function deleteFlag(req, res) {
  try {
    const eventId = getEventId(req);
    const id = req.params.id;

    // Reset references in submissions
    await query('UPDATE submissions SET flag_id = NULL WHERE flag_id = ? AND event_id = ?', [id, eventId]);

    const result = await query('DELETE FROM submission_flags WHERE id = ? AND event_id = ?', [id, eventId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flag not found.' });
    }

    res.json({ message: 'Flag deleted successfully.', id });
  } catch (error) {
    console.error('[SettingsController] deleteFlag error:', error);
    res.status(500).json({ error: 'Failed to delete flag.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REVIEW ROUNDS & CRITERIA
// ─────────────────────────────────────────────────────────────────────────────

async function getReviewRounds(req, res) {
  try {
    const eventId = getEventId(req);
    await ensureEventInitialized(eventId);

    // 1. Check total review submissions
    const reviewCounts = await query(`
      SELECT 
        COUNT(*) as total_reviews,
        SUM(CASE WHEN round_number = 1 THEN 1 ELSE 0 END) as r1_reviews,
        SUM(CASE WHEN round_number = 2 THEN 1 ELSE 0 END) as r2_reviews,
        SUM(CASE WHEN round_number = 3 THEN 1 ELSE 0 END) as r3_reviews,
        SUM(CASE WHEN round_number = 4 THEN 1 ELSE 0 END) as r4_reviews
      FROM screening_reviews
      WHERE event_id = ?
    `, [eventId]);

    const totals = reviewCounts[0] || {};
    const totalReviews = parseInt(totals.total_reviews || 0, 10);
    const isRoundsLocked = totalReviews > 0;

    // 2. Edition settings
    const settings = await query(
      'SELECT max_screening_rounds FROM festival_edition_settings WHERE event_id = ?',
      [eventId]
    );
    const maxScreeningRounds = settings.length > 0 ? settings[0].max_screening_rounds : 2;

    // 3. Round configs
    const roundConfigs = await query(
      'SELECT id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required FROM festival_review_round_configs WHERE event_id = ? ORDER BY round_number ASC',
      [eventId]
    );

    // 4. Criteria
    const allCriteria = await query(
      'SELECT id, round_number, label, criterion_key, sort_order FROM festival_review_criteria WHERE event_id = ? ORDER BY sort_order ASC, id ASC',
      [eventId]
    );

    // Assemble rounds up to maxScreeningRounds
    const rounds = [];
    for (let rNum = 1; rNum <= maxScreeningRounds; rNum++) {
      let cfg = roundConfigs.find(r => r.round_number === rNum);
      if (!cfg) {
        cfg = {
          round_number: rNum,
          round_name: rNum === 1 ? 'Round 1: Initial Screening' : `Round ${rNum}: Screening`,
          description: rNum === 1 ? 'Reviewers score submitted films using this round\'s criteria.' : `Reviewers score films advanced from previous rounds.`,
          scoring_mode: 'star_rating',
          max_rating_points: 5,
          notes_required: 'optional'
        };
      }

      const rReviews = parseInt(totals[`r${rNum}_reviews`] || 0, 10);
      const isRoundLocked = rReviews > 0;
      const categories = allCriteria.filter(c => c.round_number === rNum);

      rounds.push({
        ...cfg,
        is_locked: isRoundLocked,
        reviews_count: rReviews,
        categories
      });
    }

    res.json({
      max_screening_rounds: maxScreeningRounds,
      is_rounds_locked: isRoundsLocked,
      lock_message: isRoundsLocked ? 'Round count is locked because one or more round reviews have already been submitted.' : null,
      rounds
    });
  } catch (error) {
    console.error('[SettingsController] getReviewRounds error:', error);
    res.status(500).json({ error: 'Failed to retrieve review rounds configuration.' });
  }
}

async function updateMaxRounds(req, res) {
  try {
    const eventId = getEventId(req);
    const { max_screening_rounds } = req.body;
    const rounds = parseInt(max_screening_rounds, 10);

    if (isNaN(rounds) || rounds < 1 || rounds > 4) {
      return res.status(400).json({ error: 'max_screening_rounds must be between 1 and 4.' });
    }

    // Check lock
    const reviewCounts = await query('SELECT COUNT(*) as total FROM screening_reviews WHERE event_id = ?', [eventId]);
    if (reviewCounts[0].total > 0) {
      return res.status(403).json({
        error: 'Round count is locked because one or more round reviews have already been submitted.'
      });
    }

    await query(`
      INSERT INTO festival_edition_settings (event_id, max_screening_rounds)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE max_screening_rounds = VALUES(max_screening_rounds)
    `, [eventId, rounds]);

    res.json({
      message: 'Max screening rounds updated.',
      max_screening_rounds: rounds
    });
  } catch (error) {
    console.error('[SettingsController] updateMaxRounds error:', error);
    res.status(500).json({ error: 'Failed to update max screening rounds.' });
  }
}

async function updateRoundConfig(req, res) {
  try {
    const eventId = getEventId(req);
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const { scoring_mode, max_rating_points, notes_required } = req.body;

    if (isNaN(roundNumber) || roundNumber < 1 || roundNumber > 4) {
      return res.status(400).json({ error: 'Invalid round number.' });
    }

    // Check lock
    const reviewCounts = await query(
      'SELECT COUNT(*) as total FROM screening_reviews WHERE event_id = ? AND round_number = ?',
      [eventId, roundNumber]
    );
    if (reviewCounts[0].total > 0) {
      return res.status(403).json({
        error: 'Configuration is locked because reviews have already been submitted for this round. Existing reviews must be cleared to make changes.'
      });
    }

    // Existing config
    const existing = await query(
      'SELECT * FROM festival_review_round_configs WHERE event_id = ? AND round_number = ?',
      [eventId, roundNumber]
    );

    const validScoring = ['star_rating', 'vote_nomination'];
    const validMaxPoints = [3, 5, 10];
    const validNotes = ['optional', 'required'];

    const newScoring = validScoring.includes(scoring_mode) ? scoring_mode : (existing[0]?.scoring_mode || 'star_rating');
    const newMaxPoints = validMaxPoints.includes(parseInt(max_rating_points, 10)) ? parseInt(max_rating_points, 10) : (existing[0]?.max_rating_points || 5);
    const newNotes = validNotes.includes(notes_required) ? notes_required : (existing[0]?.notes_required || 'optional');

    const roundName = roundNumber === 1 ? 'Round 1: Initial Screening' : `Round ${roundNumber}: Final Screening`;
    const description = roundNumber === 1
      ? 'Reviewers score submitted films using this round\'s criteria.'
      : 'Fresh reviewers score films advanced from Round 1 using this round\'s criteria.';

    await query(`
      INSERT INTO festival_review_round_configs 
        (event_id, round_number, round_name, description, scoring_mode, max_rating_points, notes_required)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        scoring_mode = VALUES(scoring_mode),
        max_rating_points = VALUES(max_rating_points),
        notes_required = VALUES(notes_required)
    `, [eventId, roundNumber, roundName, description, newScoring, newMaxPoints, newNotes]);

    res.json({
      message: 'Round configuration updated successfully.',
      round_number: roundNumber,
      scoring_mode: newScoring,
      max_rating_points: newMaxPoints,
      notes_required: newNotes
    });
  } catch (error) {
    console.error('[SettingsController] updateRoundConfig error:', error);
    res.status(500).json({ error: 'Failed to update round configuration.' });
  }
}

async function addCategory(req, res) {
  try {
    const eventId = getEventId(req);
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const { label, key } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Category label is required.' });
    }

    // Check lock
    const reviewCounts = await query(
      'SELECT COUNT(*) as total FROM screening_reviews WHERE event_id = ? AND round_number = ?',
      [eventId, roundNumber]
    );
    if (reviewCounts[0].total > 0) {
      return res.status(403).json({
        error: 'Configuration is locked because reviews have already been submitted for this round.'
      });
    }

    const cleanLabel = label.trim();
    let cleanKey = (key && key.trim()) ? key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : cleanLabel.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanKey) cleanKey = `crit_${Date.now()}`;

    // Get max sort_order
    const maxOrder = await query(
      'SELECT MAX(sort_order) as max_ord FROM festival_review_criteria WHERE event_id = ? AND round_number = ?',
      [eventId, roundNumber]
    );
    const nextOrder = (maxOrder[0].max_ord || 0) + 1;

    const result = await query(`
      INSERT INTO festival_review_criteria (event_id, round_number, label, criterion_key, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `, [eventId, roundNumber, cleanLabel, cleanKey, nextOrder]);

    res.status(201).json({
      message: 'Category added successfully.',
      data: {
        id: result.insertId,
        event_id: eventId,
        round_number: roundNumber,
        label: cleanLabel,
        criterion_key: cleanKey,
        sort_order: nextOrder
      }
    });
  } catch (error) {
    console.error('[SettingsController] addCategory error:', error);
    res.status(500).json({ error: 'Failed to add criteria category.' });
  }
}

async function updateCategory(req, res) {
  try {
    const eventId = getEventId(req);
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const id = parseInt(req.params.id, 10);
    const { label, key } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Category label is required.' });
    }

    // Check lock
    const reviewCounts = await query(
      'SELECT COUNT(*) as total FROM screening_reviews WHERE event_id = ? AND round_number = ?',
      [eventId, roundNumber]
    );
    if (reviewCounts[0].total > 0) {
      return res.status(403).json({
        error: 'Configuration is locked because reviews have already been submitted for this round.'
      });
    }

    const cleanLabel = label.trim();
    let cleanKey = (key && key.trim()) ? key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_') : cleanLabel.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const result = await query(`
      UPDATE festival_review_criteria
      SET label = ?, criterion_key = ?
      WHERE id = ? AND event_id = ? AND round_number = ?
    `, [cleanLabel, cleanKey, id, eventId, roundNumber]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    res.json({
      message: 'Category updated successfully.',
      data: {
        id,
        round_number: roundNumber,
        label: cleanLabel,
        criterion_key: cleanKey
      }
    });
  } catch (error) {
    console.error('[SettingsController] updateCategory error:', error);
    res.status(500).json({ error: 'Failed to update criteria category.' });
  }
}

async function deleteCategory(req, res) {
  try {
    const eventId = getEventId(req);
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const id = parseInt(req.params.id, 10);

    // Check lock
    const reviewCounts = await query(
      'SELECT COUNT(*) as total FROM screening_reviews WHERE event_id = ? AND round_number = ?',
      [eventId, roundNumber]
    );
    if (reviewCounts[0].total > 0) {
      return res.status(403).json({
        error: 'Configuration is locked because reviews have already been submitted for this round.'
      });
    }

    const result = await query(
      'DELETE FROM festival_review_criteria WHERE id = ? AND event_id = ? AND round_number = ?',
      [id, eventId, roundNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    res.json({ message: 'Category deleted successfully.', id });
  } catch (error) {
    console.error('[SettingsController] deleteCategory error:', error);
    res.status(500).json({ error: 'Failed to delete criteria category.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SEQUENTIAL 6-STAGES REVIEW WORKFLOW SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

async function ensureReviewStatesForEvent(eventId) {
  const existing = await query('SELECT count(*) as cnt FROM festival_review_states WHERE event_id = ?', [eventId]);
  if (existing[0].cnt > 0) return;

  const standardCriteria = [
    { key: 'screenplay', label: 'Screenplay', weight: 7.69 },
    { key: 'dialogues', label: 'Dialogues', weight: 7.69 },
    { key: 'writing', label: 'Writing', weight: 7.69 },
    { key: 'structure', label: 'Structure', weight: 7.69 },
    { key: 'direction', label: 'Direction', weight: 7.69 },
    { key: 'acting', label: 'Acting', weight: 7.69 },
    { key: 'cinematography', label: 'Cinematography', weight: 7.69 },
    { key: 'production_design', label: 'Production design', weight: 7.69 },
    { key: 'sound', label: 'Sound', weight: 7.69 },
    { key: 'music', label: 'Music', weight: 7.69 },
    { key: 'creativity', label: 'Creativity', weight: 7.69 },
    { key: 'inspire', label: 'Did the film inspire you?', weight: 7.69 },
    { key: 'message_importance', label: 'Importance of film message', weight: 7.69 },
  ];

  const defaultStages = [
    { order: 1, name: 'Round 1: Screening', review_type: 'star_based', star_scale: '5', notes_requirement: 'optional', auto_advance_cutoff: 4.50, auto_reject_cutoff: 3.00, status: 'active',
      criteria: standardCriteria
    },
    { order: 2, name: 'Round 2: Consideration', review_type: 'star_based', star_scale: '10', notes_requirement: 'required', auto_advance_cutoff: 8.50, auto_reject_cutoff: 6.00, status: 'active',
      criteria: standardCriteria
    },
    { order: 3, name: 'Official Selection', review_type: 'vote_based', vote_mode: 'nomination', notes_requirement: 'optional', auto_advance_cutoff: null, auto_reject_cutoff: null, status: 'active', criteria: [] },
    { order: 4, name: 'Nominations', review_type: 'vote_based', vote_mode: 'nomination', notes_requirement: 'optional', auto_advance_cutoff: null, auto_reject_cutoff: null, status: 'active', criteria: [],
      award_criteria: ['Best Film', 'Best Direction', 'Best Cinematography', 'Best Debut Film', 'Best Documentary', 'Best Short Film', 'Best Animation']
    },
    { order: 5, name: 'Jury & Voting', review_type: 'star_based', star_scale: '10', notes_requirement: 'required', auto_advance_cutoff: 8.50, auto_reject_cutoff: 5.00, status: 'active',
      criteria: standardCriteria
    },
    { order: 6, name: 'Finalist', review_type: 'rank_based', rank_mode: 'borda_count', rank_top_n: 3, notes_requirement: 'optional', auto_advance_cutoff: null, auto_reject_cutoff: null, status: 'active', criteria: [], jury_assignment_mode: 'none' },
    { order: 7, name: 'Winner', review_type: 'vote_based', vote_mode: 'single', notes_requirement: 'optional', auto_advance_cutoff: null, auto_reject_cutoff: null, status: 'active', criteria: [], jury_assignment_mode: 'none' }
  ];

  for (const stage of defaultStages) {
    await query(`
      INSERT INTO festival_review_states (
        event_id, unique_name, stage_order, access_group_name, scope_key,
        review_type, star_scale, vote_mode, rank_mode, rank_top_n,
        notes_requirement, auto_advance_cutoff, auto_reject_cutoff, status,
        jury_assignment_mode, jury_auto_rule, jury_count_per_film, award_criteria
      ) VALUES (?, ?, ?, 'jury', 'assigned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'all_jury', 1, ?)
      ON DUPLICATE KEY UPDATE unique_name = VALUES(unique_name)
    `, [
      eventId, stage.name, stage.order, stage.review_type, stage.star_scale || null, stage.vote_mode || null,
      stage.rank_mode || null, stage.rank_top_n || null, stage.notes_requirement,
      stage.auto_advance_cutoff, stage.auto_reject_cutoff, stage.status,
      stage.jury_assignment_mode || 'auto',
      stage.award_criteria ? JSON.stringify(stage.award_criteria) : null
    ]);

    const stateRow = await query('SELECT id FROM festival_review_states WHERE event_id = ? AND stage_order = ?', [eventId, stage.order]);
    if (stateRow.length > 0) {
      const stateId = stateRow[0].id;
      for (let i = 0; i < stage.criteria.length; i++) {
        const c = stage.criteria[i];
        await query(`
          INSERT INTO festival_state_criteria (event_id, state_id, label, criterion_key, weight_percentage, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE label = VALUES(label)
        `, [eventId, stateId, c.label, c.key, c.weight, i + 1]);
      }
    }
  }
}

async function resequenceReviewStatesForEvent(eventId, movedStateId = null, desiredOrder = null) {
  // 1. Get all active rows ordered by stage_order ASC, id ASC
  const activeRows = await query(
    "SELECT id FROM festival_review_states WHERE event_id = ? AND (status IS NULL OR status != 'inactive') ORDER BY stage_order ASC, id ASC",
    [eventId]
  );

  let activeIds = activeRows.map(r => r.id);

  if (movedStateId && desiredOrder != null) {
    const movedIdNum = parseInt(movedStateId, 10);
    // Remove movedStateId from activeIds if already present
    activeIds = activeIds.filter(id => id !== movedIdNum);

    // Check if movedStateId is currently active
    const stateRow = await query("SELECT status FROM festival_review_states WHERE id = ? AND event_id = ?", [movedIdNum, eventId]);
    if (stateRow.length > 0 && stateRow[0].status !== 'inactive') {
      const targetIdx = Math.max(0, Math.min(parseInt(desiredOrder, 10) - 1, activeIds.length));
      activeIds.splice(targetIdx, 0, movedIdNum);
    }
  }

  // Resequence active stages contiguously 1, 2, 3...
  for (let i = 0; i < activeIds.length; i++) {
    await query('UPDATE festival_review_states SET stage_order = ? WHERE id = ?', [i + 1, activeIds[i]]);
  }

  // 2. Resequence inactive stages after active stages (e.g. 101, 102...) so there is never an overlap
  const inactiveRows = await query(
    "SELECT id FROM festival_review_states WHERE event_id = ? AND status = 'inactive' ORDER BY stage_order ASC, id ASC",
    [eventId]
  );
  for (let i = 0; i < inactiveRows.length; i++) {
    await query('UPDATE festival_review_states SET stage_order = ? WHERE id = ?', [100 + i + 1, inactiveRows[i].id]);
  }
}

async function getReviewStates(req, res) {
  try {
    const eventId = getEventId(req);
    await ensureReviewStatesForEvent(eventId);
    await resequenceReviewStatesForEvent(eventId);

    const states = await query(`
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM submissions sub WHERE sub.event_id = s.event_id AND sub.review_state_id = s.id) as film_count
      FROM festival_review_states s
      WHERE s.event_id = ?
      ORDER BY (CASE WHEN s.status = 'inactive' THEN 1 ELSE 0 END) ASC, s.stage_order ASC, s.id ASC
    `, [eventId]);

    const stateIds = states.map(s => s.id);
    let criteria = [];
    if (stateIds.length > 0) {
      criteria = await query(`
        SELECT * FROM festival_state_criteria 
        WHERE event_id = ? AND state_id IN (${stateIds.map(() => '?').join(',')})
        ORDER BY sort_order ASC
      `, [eventId, ...stateIds]);
    }

    const stateCriteriaMap = {};
    for (const c of criteria) {
      if (!stateCriteriaMap[c.state_id]) stateCriteriaMap[c.state_id] = [];
      stateCriteriaMap[c.state_id].push(c);
    }

    const result = states.map(s => {
      let parsedAwardCriteria = [];
      try {
        parsedAwardCriteria = s.award_criteria
          ? (typeof s.award_criteria === 'string' ? JSON.parse(s.award_criteria) : s.award_criteria)
          : [];
      } catch (e) {
        parsedAwardCriteria = [];
      }
      return {
        ...s,
        award_criteria: parsedAwardCriteria,
        criteria: stateCriteriaMap[s.id] || []
      };
    });

    const juryCountRows = await query(`
      SELECT COUNT(DISTINCT u.id) as total_jury
      FROM users u
      JOIN user_event_groups ueg ON ueg.user_id = u.id
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
    `, [eventId]);
    const totalAvailableJury = (juryCountRows[0] && juryCountRows[0].total_jury) || 0;

    res.json({ success: true, data: result, total_available_jury: totalAvailableJury });
  } catch (err) {
    console.error('[SettingsController] getReviewStates error:', err);
    res.status(500).json({ error: 'Failed to fetch review states.' });
  }
}

async function getReviewStateById(req, res) {
  try {
    const eventId = getEventId(req);
    const stateId = parseInt(req.params.id, 10);
    const states = await query('SELECT * FROM festival_review_states WHERE id = ? AND event_id = ?', [stateId, eventId]);
    if (states.length === 0) {
      return res.status(404).json({ error: 'Review state not found.' });
    }
    const criteria = await query('SELECT * FROM festival_state_criteria WHERE state_id = ? AND event_id = ? ORDER BY sort_order ASC', [stateId, eventId]);

    const juryCountRows = await query(`
      SELECT COUNT(DISTINCT u.id) as total_jury
      FROM users u
      JOIN user_event_groups ueg ON ueg.user_id = u.id
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
    `, [eventId]);
    const totalAvailableJury = (juryCountRows[0] && juryCountRows[0].total_jury) || 0;

    let parsedAwardCriteria = [];
    try {
      parsedAwardCriteria = states[0].award_criteria
        ? (typeof states[0].award_criteria === 'string' ? JSON.parse(states[0].award_criteria) : states[0].award_criteria)
        : [];
    } catch (e) {
      parsedAwardCriteria = [];
    }

    res.json({
      success: true,
      data: {
        ...states[0],
        award_criteria: parsedAwardCriteria,
        criteria,
        total_available_jury: totalAvailableJury
      }
    });
  } catch (err) {
    console.error('[SettingsController] getReviewStateById error:', err);
    res.status(500).json({ error: 'Failed to fetch review state.' });
  }
}

async function createReviewState(req, res) {
  try {
    const eventId = getEventId(req);
    const {
      unique_name,
      stage_order,
      access_group_name,
      scope_key,
      review_type,
      star_scale,
      vote_mode,
      rank_mode,
      rank_top_n,
      notes_requirement,
      completion_logic,
      auto_advance_cutoff,
      auto_reject_cutoff,
      notify_acceptance,
      acceptance_template,
      notify_rejection,
      rejection_template,
      criteria,
      action_unreviewed,
      unreviewed_action
    } = req.body;

    if (!unique_name || !unique_name.trim()) {
      return res.status(400).json({ error: 'Stage name is required.' });
    }

    // Determine order
    let order = parseInt(stage_order, 10);
    if (isNaN(order)) {
      const maxOrder = await query('SELECT MAX(stage_order) as max_o FROM festival_review_states WHERE event_id = ?', [eventId]);
      order = (maxOrder[0].max_o || 0) + 1;
    }

    let normReviewType = 'star_based';
    if (review_type) {
      const rt = String(review_type).toLowerCase();
      if (rt.includes('vote') || rt.includes('pass')) normReviewType = 'vote_based';
      else if (rt.includes('rank')) normReviewType = 'rank_based';
      else normReviewType = 'star_based';
    }

    let normStarScale = '5';
    if (star_scale) {
      const s = String(star_scale);
      if (['3', '5', '10'].includes(s)) normStarScale = s;
      else if (s.includes('10')) normStarScale = '10';
      else if (s.includes('3')) normStarScale = '3';
      else normStarScale = '5';
    } else if (normReviewType !== 'star_based') {
      normStarScale = null;
    }

    let normCompletionLogic = 'all_reviews_done';
    if (completion_logic) {
      const cl = String(completion_logic).toLowerCase();
      if (cl.includes('admin') || cl.includes('manual')) normCompletionLogic = 'admin_override';
      else if (cl.includes('date') || cl.includes('deadline')) normCompletionLogic = 'date_dependent';
      else normCompletionLogic = 'all_reviews_done';
    }

    let normUnreviewedAction = 'mark_rejected';
    if (action_unreviewed || req.body.unreviewed_action) {
      const ua = String(action_unreviewed || req.body.unreviewed_action).toLowerCase();
      if (ua.includes('advance')) normUnreviewedAction = 'advance';
      else if (ua.includes('keep') || ua.includes('pending')) normUnreviewedAction = 'keep_current';
      else normUnreviewedAction = 'mark_rejected';
    }

    let normNotesReq = 'optional';
    if (notes_requirement || req.body.notes_required) {
      const nr = String(notes_requirement || req.body.notes_required).toLowerCase();
      if (nr.includes('require')) normNotesReq = 'required';
    }

    const initialStatus = (req.body.status && String(req.body.status).toLowerCase() === 'inactive') ? 'inactive' : 'active';

    const jury_assignment_mode = ['manual', 'none'].includes(req.body.jury_assignment_mode) ? req.body.jury_assignment_mode : 'auto';
    const jury_auto_rule = req.body.jury_auto_rule === 'n_jury' ? 'n_jury' : 'all_jury';
    let jury_count_per_film = req.body.jury_count_per_film !== undefined ? parseInt(req.body.jury_count_per_film, 10) : 1;
    if (isNaN(jury_count_per_film) || jury_count_per_film < 1) jury_count_per_film = 1;

    // Validate n <= total available jury when auto assign with n_jury rule
    if (jury_assignment_mode === 'auto' && jury_auto_rule === 'n_jury') {
      const juryCountRows = await query(`
        SELECT COUNT(DISTINCT u.id) as total_jury
        FROM users u
        JOIN user_event_groups ueg ON ueg.user_id = u.id
        JOIN \`groups\` g ON g.id = ueg.group_id
        WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
      `, [eventId]);
      const totalJury = (juryCountRows[0] && juryCountRows[0].total_jury) || 0;

      if (totalJury > 0 && jury_count_per_film > totalJury) {
        return res.status(400).json({
          error: `Number of jurors per film (${jury_count_per_film}) cannot be greater than total number of jury (${totalJury}).`
        });
      }
    }

    const award_criteria = req.body.award_criteria
      ? (Array.isArray(req.body.award_criteria) ? JSON.stringify(req.body.award_criteria) : String(req.body.award_criteria))
      : null;

    const insertResult = await query(`
      INSERT INTO festival_review_states (
        event_id, unique_name, stage_order, access_group_name, scope_key,
        review_type, star_scale, vote_mode, rank_mode, rank_top_n,
        notes_requirement, completion_logic, unreviewed_action, auto_advance_cutoff, auto_reject_cutoff,
        status, notify_acceptance, acceptance_template, notify_rejection, rejection_template,
        jury_assignment_mode, jury_auto_rule, jury_count_per_film, award_criteria
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      unique_name.trim(),
      order,
      access_group_name || 'jury',
      scope_key || 'assigned',
      normReviewType,
      normStarScale,
      vote_mode || null,
      rank_mode || null,
      rank_top_n ? parseInt(rank_top_n, 10) : null,
      normNotesReq,
      normCompletionLogic,
      normUnreviewedAction,
      auto_advance_cutoff != null ? parseFloat(auto_advance_cutoff) : null,
      auto_reject_cutoff != null ? parseFloat(auto_reject_cutoff) : null,
      initialStatus,
      notify_acceptance ? 1 : 0,
      acceptance_template || null,
      notify_rejection ? 1 : 0,
      rejection_template || null,
      jury_assignment_mode,
      jury_auto_rule,
      jury_count_per_film,
      award_criteria
    ]);

    const stateId = insertResult.insertId;

    // Sync award_criteria to award_categories
    if (Array.isArray(req.body.award_criteria) && req.body.award_criteria.length > 0) {
      for (let i = 0; i < req.body.award_criteria.length; i++) {
        const item = req.body.award_criteria[i];
        const awardName = typeof item === 'string' ? item.trim() : (item.name || '').trim();
        if (awardName) {
          const existingAward = await query('SELECT id FROM award_categories WHERE event_id = ? AND name = ?', [eventId, awardName]);
          if (existingAward.length === 0) {
            await query('INSERT INTO award_categories (event_id, name, order_index) VALUES (?, ?, ?)', [eventId, awardName, i + 1]);
          }
        }
      }
    }

    if (Array.isArray(criteria) && criteria.length > 0) {
      for (let i = 0; i < criteria.length; i++) {
        const c = criteria[i];
        if (c.label && c.label.trim()) {
          const key = c.criterion_key || c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const weight = parseFloat(c.weight_percentage) || 25.00;
          await query(`
            INSERT INTO festival_state_criteria (event_id, state_id, label, criterion_key, weight_percentage, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [eventId, stateId, c.label.trim(), key, weight, i + 1]);
        }
      }
    }

    const targetOrder = stage_order !== undefined ? parseInt(stage_order, 10) : order;
    await resequenceReviewStatesForEvent(eventId, stateId, targetOrder);

    res.json({ success: true, message: 'Review state created successfully.', id: stateId });
  } catch (err) {
    console.error('[SettingsController] createReviewState error:', err);
    res.status(500).json({ error: 'Failed to create review state.' });
  }
}

async function updateReviewState(req, res) {
  try {
    const eventId = getEventId(req);
    const stateId = parseInt(req.params.id, 10);

    const {
      unique_name,
      stage_order,
      access_group_name,
      scope_key,
      review_type,
      star_scale,
      vote_mode,
      rank_mode,
      rank_top_n,
      notes_requirement,
      completion_logic,
      auto_advance_cutoff,
      auto_reject_cutoff,
      notify_acceptance,
      acceptance_template,
      notify_rejection,
      rejection_template,
      criteria
    } = req.body;

    const fields = [];
    const params = [];

    if (unique_name !== undefined) { fields.push('unique_name = ?'); params.push(unique_name.trim()); }
    if (stage_order !== undefined) { fields.push('stage_order = ?'); params.push(parseInt(stage_order, 10)); }
    if (access_group_name !== undefined) { fields.push('access_group_name = ?'); params.push(access_group_name); }
    if (scope_key !== undefined) { fields.push('scope_key = ?'); params.push(scope_key); }
    if (review_type !== undefined) {
      let normReviewType = 'star_based';
      const rt = String(review_type).toLowerCase();
      if (rt.includes('vote') || rt.includes('pass')) normReviewType = 'vote_based';
      else if (rt.includes('rank')) normReviewType = 'rank_based';
      else normReviewType = 'star_based';
      fields.push('review_type = ?');
      params.push(normReviewType);
    }
    if (star_scale !== undefined) {
      const s = String(star_scale);
      const val = ['3', '5', '10'].includes(s) ? s : (s.includes('10') ? '10' : (s.includes('3') ? '3' : '5'));
      fields.push('star_scale = ?');
      params.push(val);
    }
    if (notes_requirement !== undefined || req.body.notes_required !== undefined) {
      const nr = String(notes_requirement || req.body.notes_required).toLowerCase().includes('require') ? 'required' : 'optional';
      fields.push('notes_requirement = ?');
      params.push(nr);
    }
    if (completion_logic !== undefined) {
      let normCompletionLogic = 'all_reviews_done';
      const cl = String(completion_logic).toLowerCase();
      if (cl.includes('admin') || cl.includes('manual')) normCompletionLogic = 'admin_override';
      else if (cl.includes('date') || cl.includes('deadline')) normCompletionLogic = 'date_dependent';
      else normCompletionLogic = 'all_reviews_done';
      fields.push('completion_logic = ?');
      params.push(normCompletionLogic);
    }
    if (auto_advance_cutoff !== undefined) { fields.push('auto_advance_cutoff = ?'); params.push(auto_advance_cutoff != null ? parseFloat(auto_advance_cutoff) : null); }
    if (auto_reject_cutoff !== undefined) { fields.push('auto_reject_cutoff = ?'); params.push(auto_reject_cutoff != null ? parseFloat(auto_reject_cutoff) : null); }
    if (notify_acceptance !== undefined) { fields.push('notify_acceptance = ?'); params.push(notify_acceptance ? 1 : 0); }
    if (acceptance_template !== undefined) { fields.push('acceptance_template = ?'); params.push(acceptance_template); }
    if (notify_rejection !== undefined) { fields.push('notify_rejection = ?'); params.push(notify_rejection ? 1 : 0); }
    if (rejection_template !== undefined) { fields.push('rejection_template = ?'); params.push(rejection_template); }
    const unrev = req.body.action_unreviewed !== undefined ? req.body.action_unreviewed : req.body.unreviewed_action;
    if (unrev !== undefined) {
      const ua = String(unrev).toLowerCase();
      let norm = 'mark_rejected';
      if (ua.includes('advance')) norm = 'advance';
      else if (ua.includes('keep') || ua.includes('pending')) norm = 'keep_current';
      fields.push('unreviewed_action = ?');
      params.push(norm);
    }
    if (req.body.status !== undefined) {
      const st = String(req.body.status).toLowerCase();
      const val = (st === 'inactive' || st === 'not_started' || st === '0' || st === 'false') ? 'inactive' : 'active';
      fields.push('status = ?');
      params.push(val);
    }

    if (req.body.jury_assignment_mode !== undefined) {
      const jam = ['manual', 'none'].includes(req.body.jury_assignment_mode) ? req.body.jury_assignment_mode : 'auto';
      fields.push('jury_assignment_mode = ?');
      params.push(jam);
    }
    if (req.body.jury_auto_rule !== undefined) {
      const jar = req.body.jury_auto_rule === 'n_jury' ? 'n_jury' : 'all_jury';
      fields.push('jury_auto_rule = ?');
      params.push(jar);
    }
    if (req.body.jury_count_per_film !== undefined) {
      let jcf = parseInt(req.body.jury_count_per_film, 10);
      if (isNaN(jcf) || jcf < 1) jcf = 1;

      // Validate n <= total available jury if auto and n_jury
      const currentMode = req.body.jury_assignment_mode !== undefined ? req.body.jury_assignment_mode : 'auto';
      const currentRule = req.body.jury_auto_rule !== undefined ? req.body.jury_auto_rule : 'all_jury';
      if (currentMode === 'auto' && currentRule === 'n_jury') {
        const juryCountRows = await query(`
          SELECT COUNT(DISTINCT u.id) as total_jury
          FROM users u
          JOIN user_event_groups ueg ON ueg.user_id = u.id
          JOIN \`groups\` g ON g.id = ueg.group_id
          WHERE ueg.event_id = ? AND g.group_key IN ('jury', 'judge')
        `, [eventId]);
        const totalJury = (juryCountRows[0] && juryCountRows[0].total_jury) || 0;

        if (totalJury > 0 && jcf > totalJury) {
          return res.status(400).json({
            error: `Number of jurors per film (${jcf}) cannot be greater than total number of jury (${totalJury}).`
          });
        }
      }

      fields.push('jury_count_per_film = ?');
      params.push(jcf);
    }

    if (req.body.award_criteria !== undefined) {
      const acJson = Array.isArray(req.body.award_criteria)
        ? JSON.stringify(req.body.award_criteria)
        : (req.body.award_criteria ? String(req.body.award_criteria) : null);
      fields.push('award_criteria = ?');
      params.push(acJson);

      // Sync to award_categories
      if (Array.isArray(req.body.award_criteria) && req.body.award_criteria.length > 0) {
        for (let i = 0; i < req.body.award_criteria.length; i++) {
          const item = req.body.award_criteria[i];
          const awardName = typeof item === 'string' ? item.trim() : (item.name || '').trim();
          if (awardName) {
            const existingAward = await query('SELECT id FROM award_categories WHERE event_id = ? AND name = ?', [eventId, awardName]);
            if (existingAward.length === 0) {
              await query('INSERT INTO award_categories (event_id, name, order_index) VALUES (?, ?, ?)', [eventId, awardName, i + 1]);
            }
          }
        }
      }
    }

    if (fields.length > 0) {
      params.push(stateId, eventId);
      await query(`UPDATE festival_review_states SET ${fields.join(', ')} WHERE id = ? AND event_id = ?`, params);
    }

    // Update criteria if provided
    if (Array.isArray(criteria)) {
      await query('DELETE FROM festival_state_criteria WHERE state_id = ? AND event_id = ?', [stateId, eventId]);
      for (let i = 0; i < criteria.length; i++) {
        const c = criteria[i];
        if (c.label && c.label.trim()) {
          const key = c.criterion_key || c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const weight = parseFloat(c.weight_percentage) || 25.00;
          await query(`
            INSERT INTO festival_state_criteria (event_id, state_id, label, criterion_key, weight_percentage, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [eventId, stateId, c.label.trim(), key, weight, i + 1]);
        }
      }
    }

    const targetOrder = stage_order !== undefined ? parseInt(stage_order, 10) : null;
    await resequenceReviewStatesForEvent(eventId, stateId, targetOrder);

    res.json({ success: true, message: 'Review state updated successfully.' });
  } catch (err) {
    console.error('[SettingsController] updateReviewState error:', err);
    res.status(500).json({ error: 'Failed to update review state.' });
  }
}

async function deleteReviewState(req, res) {
  try {
    const eventId = getEventId(req);
    const stateId = parseInt(req.params.id, 10);

    // Verify if films are active in this state
    const filmsInState = await query('SELECT count(*) as cnt FROM submissions WHERE review_state_id = ? AND event_id = ?', [stateId, eventId]);
    if (filmsInState[0].cnt > 0) {
      return res.status(400).json({
        error: `Cannot delete stage: ${filmsInState[0].cnt} film(s) are currently in this review state. Move films to another state first.`
      });
    }

    await query('DELETE FROM festival_state_criteria WHERE state_id = ? AND event_id = ?', [stateId, eventId]);
    await query('DELETE FROM festival_review_states WHERE id = ? AND event_id = ?', [stateId, eventId]);

    await resequenceReviewStatesForEvent(eventId);

    res.json({ success: true, message: 'Review state deleted successfully.' });
  } catch (err) {
    console.error('[SettingsController] deleteReviewState error:', err);
    res.status(500).json({ error: 'Failed to delete review state.' });
  }
}

async function reorderReviewStates(req, res) {
  try {
    const eventId = getEventId(req);
    const { orderList } = req.body; // array of { id, stage_order }

    if (!Array.isArray(orderList)) {
      return res.status(400).json({ error: 'orderList must be an array.' });
    }

    for (const item of orderList) {
      if (item.id && item.stage_order) {
        await query('UPDATE festival_review_states SET stage_order = ? WHERE id = ? AND event_id = ?', [
          parseInt(item.stage_order, 10),
          parseInt(item.id, 10),
          eventId
        ]);
      }
    }

    await resequenceReviewStatesForEvent(eventId);

    res.json({ success: true, message: 'Review states reordered successfully.' });
  } catch (err) {
    console.error('[SettingsController] reorderReviewStates error:', err);
    res.status(500).json({ error: 'Failed to reorder review states.' });
  }
}

async function addStateCriteria(req, res) {
  try {
    const eventId = getEventId(req);
    const stateId = parseInt(req.params.id, 10);
    const { label, criterion_key, weight_percentage } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Criteria label is required.' });
    }

    const key = criterion_key || label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const weight = parseFloat(weight_percentage) || 25.00;

    const maxSort = await query('SELECT MAX(sort_order) as m FROM festival_state_criteria WHERE state_id = ?', [stateId]);
    const nextSort = (maxSort[0].m || 0) + 1;

    const ins = await query(`
      INSERT INTO festival_state_criteria (event_id, state_id, label, criterion_key, weight_percentage, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [eventId, stateId, label.trim(), key, weight, nextSort]);

    res.json({ success: true, message: 'Criterion added.', id: ins.insertId });
  } catch (err) {
    console.error('[SettingsController] addStateCriteria error:', err);
    res.status(500).json({ error: 'Failed to add criterion.' });
  }
}

async function deleteStateCriteria(req, res) {
  try {
    const eventId = getEventId(req);
    const stateId = parseInt(req.params.id, 10);
    const critId = parseInt(req.params.critId, 10);

    await query('DELETE FROM festival_state_criteria WHERE id = ? AND state_id = ? AND event_id = ?', [critId, stateId, eventId]);
    res.json({ success: true, message: 'Criterion deleted.' });
  } catch (err) {
    console.error('[SettingsController] deleteStateCriteria error:', err);
    res.status(500).json({ error: 'Failed to delete criterion.' });
  }
}

module.exports = {
  listFlags,
  createFlag,
  updateFlag,
  deleteFlag,
  getReviewRounds,
  updateMaxRounds,
  updateRoundConfig,
  addCategory,
  updateCategory,
  deleteCategory,
  getReviewStates,
  getReviewStateById,
  createReviewState,
  updateReviewState,
  deleteReviewState,
  reorderReviewStates,
  addStateCriteria,
  deleteStateCriteria
};

