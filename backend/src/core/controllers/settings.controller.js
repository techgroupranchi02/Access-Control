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
  deleteCategory
};
