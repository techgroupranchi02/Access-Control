import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import ScreenerVideoPlayer from './ScreenerVideoPlayer';
import {
  StarIcon,
  StarBorderIcon,
  CloseIcon,
  CancelIcon,
  CheckCircleIcon,
  FlashOnIcon,
  EditIcon,
  TrophyIcon
} from '../common/Icons';

const STANDARD_FLAGS = [
  { id: 'none', label: 'None', color: '#94a3b8' },
  { id: 'flag-high-priority', label: 'High Priority', color: '#e05252' },
  { id: 'flag-needs-review', label: 'Needs Review', color: '#d97706' },
  { id: 'flag-strong-contender', label: 'Strong Contender', color: '#10b981' },
  { id: 'flag-special-interest', label: 'Special Interest', color: '#3b82f6' },
];

const LIFECYCLE_STAGES = [
  { id: 'submitted', label: 'New Submission (Intake)', order: 0, statuses: ['New Submission', 'Submitted', 'submitted', 'new submission'] },
  { id: 'screening', label: 'Round 1: Screening', order: 1, statuses: ['Round 1: Screening', 'Round 1 Screening', 'In Review'] },
  { id: 'consideration', label: 'Round 2: Consideration', order: 2, statuses: ['Round 2: Consideration', 'Round 2 Screening', 'Consideration', 'Admin Review'] },
  { id: 'official_selection', label: 'Official Selection', order: 3, statuses: ['Official Selection', 'accepted'] },
  { id: 'nominations', label: 'Nominations', order: 4, statuses: ['Nominations', 'Nominated', 'Official Selection Nominations'] },
  { id: 'jury_voting', label: 'Jury & Voting', order: 5, statuses: ['Jury & Voting'] },
  { id: 'finalist', label: 'Finalist', order: 6, statuses: ['Finalist'] },
  { id: 'winner', label: 'Winner', order: 7, statuses: ['Winner'] },
];

const CANONICAL_CRITERIA_MAP = {
  story: 'Story / Narrative',
  screenplay: 'Story / Narrative',
  narrative: 'Story / Narrative',
  direction: 'Direction',
  directorial_vision: 'Direction',
  cinematography: 'Cinematography',
  visuals: 'Cinematography',
  sound: 'Sound / Music',
  music: 'Sound / Music',
  sound_music: 'Sound / Music',
  audio: 'Sound / Music',
  performance: 'Performance',
  acting: 'Performance',
  technical_quality: 'Technical Quality',
  technical: 'Technical Quality',
  structure: 'Technical Quality',
  emotional_impact: 'Emotional Impact',
  inspire: 'Emotional Impact',
  impact: 'Emotional Impact',
  originality: 'Originality',
  creativity: 'Originality',
  clarity: 'Clarity of Message',
  clarity_of_message: 'Clarity of Message',
  message_importance: 'Clarity of Message',
  writing: 'Writing & Structure',
  production_design: 'Production Design',
  dialogues: 'Dialogues',
};

const STANDARD_CRITERIA_DEFINITIONS = [
  { key: 'screenplay', label: 'Screenplay', aliases: ['screenplay', 'story', 'narrative', 'writing'] },
  { key: 'dialogues', label: 'Dialogues', aliases: ['dialogues'] },
  { key: 'writing', label: 'Writing', aliases: ['writing'] },
  { key: 'structure', label: 'Structure', aliases: ['structure'] },
  { key: 'direction', label: 'Direction', aliases: ['direction', 'directorial_vision'] },
  { key: 'acting', label: 'Acting', aliases: ['acting', 'performance'] },
  { key: 'cinematography', label: 'Cinematography', aliases: ['cinematography', 'visuals'] },
  { key: 'production_design', label: 'Production design', aliases: ['production_design', 'productionDesign'] },
  { key: 'sound', label: 'Sound', aliases: ['sound', 'sound_music', 'audio'] },
  { key: 'music', label: 'Music', aliases: ['music'] },
  { key: 'creativity', label: 'Creativity', aliases: ['creativity', 'originality'] },
  { key: 'inspire', label: 'Did the film inspire you?', aliases: ['inspire', 'inspiration', 'emotional_impact', 'impact'] },
  { key: 'message_importance', label: 'Importance of film message', aliases: ['message_importance', 'messageImportance', 'clarity', 'clarity_of_message'] },
];

const getScoreForCriterion = (criteriaScores, criterion) => {
  if (!criteriaScores || typeof criteriaScores !== 'object') return null;
  if (criteriaScores[criterion.key] != null) return criteriaScores[criterion.key];
  if (criterion.aliases) {
    for (const alias of criterion.aliases) {
      if (criteriaScores[alias] != null) return criteriaScores[alias];
    }
  }
  return null;
};

const renderStarRating = (score) => {
  const count = Math.round(Number(score) || 0);
  const filled = Math.max(0, Math.min(5, count));
  const empty = Math.max(0, 5 - filled);
  return (
    <span className="fc-stars-container" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {Array.from({ length: filled }).map((_, i) => (
        <StarIcon key={`f-${i}`} size={14} style={{ color: '#eab308' }} />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <StarBorderIcon key={`e-${i}`} size={14} style={{ color: '#cbd5e1' }} />
      ))}
    </span>
  );
};

const InteractiveStarRating = ({ value, onChange, disabled }) => {
  const [hoverVal, setHoverVal] = useState(0);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: disabled ? 'default' : 'pointer' }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = (hoverVal || value || 0) >= star;
        return (
          <span
            key={star}
            style={{
              transition: 'transform 0.1s ease',
              userSelect: 'none',
              transform: hoverVal === star ? 'scale(1.2)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              color: isFilled ? '#eab308' : '#cbd5e1'
            }}
            onMouseEnter={() => !disabled && setHoverVal(star)}
            onMouseLeave={() => !disabled && setHoverVal(0)}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) onChange(star);
            }}
            title={`${star} Star${star > 1 ? 's' : ''}`}
          >
            {isFilled ? <StarIcon size={18} /> : <StarBorderIcon size={18} />}
          </span>
        );
      })}
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', marginLeft: '6px' }}>
        {value ? `${value}/5` : '0/5'}
      </span>
    </div>
  );
};

export default function FilmDetailDrawer({
  film,
  onClose,
  onReject,
  onUpdateFilm,
  flags = [],
  stages = [],
  onAdvance,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeFilm, setActiveFilm] = useState(film);
  const [flagId, setFlagId] = useState(film?.flag_id || 'none');

  const activeStagesList = useMemo(() => {
    const intakeStage = { id: 'stage-submitted', label: 'New Submission (Intake)', order: 0, statuses: ['New Submission', 'Submitted', 'submitted', 'new submission'] };
    if (stages && stages.length > 0) {
      const dynamicStages = stages
        .filter((s) => s.status !== 'inactive')
        .map((s, idx) => ({
          id: s.id || `stage-${idx}`,
          label: s.unique_name || s.name || `Stage ${idx + 1}`,
          order: idx + 1,
          statuses: [s.unique_name || s.name],
        }));
      return [intakeStage, ...dynamicStages];
    }
    return LIFECYCLE_STAGES;
  }, [stages]);
  const [flagLoading, setFlagLoading] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState({});

  // Juror Scoring State
  const isJuryUser = Boolean(user?.current_group === 'jury' || user?.current_group === 'judge');
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [scoreFormValues, setScoreFormValues] = useState({});
  const [scoreNotes, setScoreNotes] = useState('');
  const [submittingScore, setSubmittingScore] = useState(false);
  const [scoreSuccessMsg, setScoreSuccessMsg] = useState('');

  // Advance / Assign State
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showR1AssignModal, setShowR1AssignModal] = useState(false);
  const [availableJudges, setAvailableJudges] = useState([]);
  const [selectedR2JudgeIds, setSelectedR2JudgeIds] = useState([]);
  const [selectedR1JudgeIds, setSelectedR1JudgeIds] = useState([]);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  const activeCriteriaList = useMemo(() => {
    if (activeFilm?.stage_criteria && activeFilm.stage_criteria.length > 0) {
      return activeFilm.stage_criteria.map((c) => ({
        key: c.criterion_key || c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        label: c.label,
        aliases: [c.criterion_key, c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')]
      }));
    }
    return STANDARD_CRITERIA_DEFINITIONS;
  }, [activeFilm?.stage_criteria]);

  const handleStartEditing = (item, cardKey) => {
    setEditingAssignmentId(cardKey);
    setExpandedReviews((prev) => ({ ...prev, [cardKey]: true }));
    const initial = {};
    activeCriteriaList.forEach((c) => {
      initial[c.key] = getScoreForCriterion(item.criteria_scores, c) || 4;
    });
    setScoreFormValues(initial);
    setScoreNotes(item.notes || '');
  };

  const handleScoreCriterionChange = (key, val) => {
    setScoreFormValues((prev) => ({ ...prev, [key]: val }));
  };

  const currentOverallScore = useMemo(() => {
    const vals = Object.values(scoreFormValues).map(Number).filter((v) => !isNaN(v) && v > 0);
    if (vals.length === 0) return '4.0';
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }, [scoreFormValues]);

  const handleSubmitScorecard = async (item, cardKey) => {
    try {
      setSubmittingScore(true);
      const assignId = item.assignment_id || item.id;
      const roundNum = item.round_number || 1;

      const finalScores = { ...scoreFormValues };
      CRITERIA_DEFINITIONS.forEach((c) => {
        if (!finalScores[c.key]) finalScores[c.key] = 4;
      });

      await api.post('/reviews/scorecard', {
        assignment_id: assignId,
        film_id: activeFilm.id,
        round_number: roundNum,
        scores: finalScores,
        notes: scoreNotes,
      });

      setScoreSuccessMsg('Scorecard successfully submitted!');
      setEditingAssignmentId(null);

      const freshRes = await api.get(`/submissions/${activeFilm.id}`);
      if (freshRes.data) {
        setActiveFilm(freshRes.data);
        if (onUpdateFilm) onUpdateFilm(freshRes.data);
      }
      setTimeout(() => setScoreSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Failed to submit scorecard:', err);
      alert(err.response?.data?.error || 'Failed to submit scorecard.');
    } finally {
      setSubmittingScore(false);
    }
  };

  // Fetch available jury members for assignment
  useEffect(() => {
    api.get('/reviews/jury')
      .catch(() => api.get('/reviews/judges'))
      .then((res) => {
        setAvailableJudges(res.data?.data || []);
      })
      .catch((err) => {
        console.error('Failed to load jury members:', err);
      });
  }, []);

  useEffect(() => {
    if (film) {
      setActiveFilm(film);
      setFlagId(film.flag_id || 'none');
      if (film.id) {
        api.get(`/submissions/${film.id}`)
          .then((res) => {
            if (res.data) {
              setActiveFilm((prev) => ({ ...prev, ...res.data }));
              if (res.data.flag_id) setFlagId(res.data.flag_id);
            }
          })
          .catch(() => { });
      }
    }
  }, [film?.id, film?.flag_id]);

  useEffect(() => {
    if (showAdvanceModal && activeFilm) {
      const assignedList = activeFilm.assigned_jury || activeFilm.assigned_judges || [];
      const existingR2JudgeIds = assignedList
        .filter((j) => j.round_number === 2)
        .map((j) => j.jury_id || j.judge_id || j.id);
      setSelectedR2JudgeIds(existingR2JudgeIds);
    }
  }, [showAdvanceModal, activeFilm]);

  useEffect(() => {
    if (showR1AssignModal && activeFilm) {
      const assignedList = activeFilm.assigned_jury || activeFilm.assigned_judges || [];
      const existingR1JudgeIds = assignedList
        .filter((j) => (j.round_number || 1) === 1)
        .map((j) => j.jury_id || j.judge_id || j.id);
      setSelectedR1JudgeIds(existingR1JudgeIds);
    }
  }, [showR1AssignModal, activeFilm]);

  if (!activeFilm) return null;

  const isRejected = activeFilm.status === 'Rejected';
  const hasRound2 = (activeFilm.assigned_judges || []).some((j) => (j.round_number || 1) === 2) ||
    (activeFilm.reviews || []).some((r) => (r.round_number || 1) === 2);

  const isSubmittedFilm = !isRejected && (
    ['Submitted', 'submitted', 'New Submission', 'new submission'].includes(activeFilm.status) ||
    ['Submitted', 'submitted', 'New Submission', 'new submission'].includes(activeFilm.current_stage_name) ||
    (!activeFilm.review_state_id && (!activeFilm.current_stage_name || ['Submitted', 'New Submission'].includes(activeFilm.current_stage_name)))
  );

  // Determine current lifecycle index across active stages (Step 0 = Submitted Intake)
  const activeStageIndex = useMemo(() => {
    if (!activeFilm || isRejected) return 0;

    // 1. If film has review_state_id, match by id in activeStagesList
    if (activeFilm.review_state_id) {
      const matchIdx = activeStagesList.findIndex(
        (s) => Number(s.id) === Number(activeFilm.review_state_id)
      );
      if (matchIdx !== -1) return matchIdx;
    }

    // 2. If status or stage is Submitted / intake, it is Step 0
    const curStage = (activeFilm.current_stage_name || activeFilm.status || '').toLowerCase();
    if (!curStage || curStage === 'submitted' || curStage === 'new submission' || curStage.includes('intake')) {
      return 0;
    }

    // 3. Match by stage label or statuses
    const nameMatchIdx = activeStagesList.findIndex((stage) =>
      stage.statuses.some((s) => curStage.includes(s.toLowerCase()) || s.toLowerCase() === curStage)
    );
    if (nameMatchIdx !== -1) return nameMatchIdx;

    return 0;
  }, [activeFilm, activeStagesList, isRejected]);

  // Clean value for the Review Stage dropdown in Drawer
  const currentStageSelectValue = useMemo(() => {
    if (!activeFilm) return '';
    const name = activeFilm.current_stage_name || activeFilm.status || '';
    if (!name || name.toLowerCase() === 'submitted' || name.toLowerCase() === 'new submission' || name.toLowerCase().includes('intake')) {
      return 'New Submission (Intake)';
    }
    const matched = activeStagesList.find((s) =>
      s.label.toLowerCase() === name.toLowerCase() ||
      s.statuses.some((st) => st.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(st.toLowerCase()))
    );
    return matched ? matched.label : name;
  }, [activeFilm, activeStagesList]);

  const allFlagsList = flags.length > 0 ? flags : STANDARD_FLAGS;

  const handleCategoryChange = async (newCategory) => {
    try {
      await api.put(`/submissions/${activeFilm.id}/category`, { category: newCategory });
      const updated = { ...activeFilm, category: newCategory };
      setActiveFilm(updated);
      if (onUpdateFilm) onUpdateFilm(updated);
      setActionSuccessMsg(`Category changed to "${newCategory}"`);
      setTimeout(() => setActionSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Failed to update category:', err);
      alert(err.response?.data?.error || 'Failed to update category');
    }
  };

  const handleStageChange = async (newStageName) => {
    try {
      const res = await api.put(`/submissions/${activeFilm.id}/stage`, { stage_name: newStageName });
      const updated = res.data?.submission || {
        ...activeFilm,
        current_stage_name: (newStageName.includes('Submitted') || newStageName.includes('New Submission')) ? 'New Submission' : newStageName,
        status: (newStageName.includes('Submitted') || newStageName.includes('New Submission')) ? 'New Submission' : newStageName
      };
      setActiveFilm(updated);
      if (onUpdateFilm) onUpdateFilm(updated);
      setActionSuccessMsg(`Review stage transitioned to "${newStageName}"`);
      setTimeout(() => setActionSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Failed to update review stage:', err);
      alert(err.response?.data?.error || 'Failed to update review stage');
    }
  };

  const handleDirectAdvance = async () => {
    if (onAdvance) {
      onAdvance(activeFilm);
      return;
    }
    if (!window.confirm(`Are you sure you want to advance "${activeFilm.title}" to the next sequential stage?`)) {
      return;
    }
    try {
      setAdvanceLoading(true);
      const res = await api.post(`/submissions/${activeFilm.id}/advance`);
      const nextName = res.data?.next_stage_name || 'Next Stage';
      const updated = res.data?.submission || { ...activeFilm, status: nextName, current_stage_name: nextName };
      setActiveFilm(updated);
      if (onUpdateFilm) onUpdateFilm(updated);
      setActionSuccessMsg(`Promoted to "${nextName}"!`);
      setTimeout(() => setActionSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to advance film:', err);
      alert(err.response?.data?.error || 'Failed to advance film.');
    } finally {
      setAdvanceLoading(false);
    }
  };

  const handleFlagSelect = async (newFlagId) => {
    setFlagId(newFlagId);
    setFlagLoading(true);
    try {
      const val = newFlagId === 'none' ? null : newFlagId;
      const res = await api.post(`/submissions/${activeFilm.id}/flag`, { flag_id: val });
      const matchedFlag = allFlagsList.find((f) => f.id === val);
      const updatedFilm = res.data?.film || {
        ...activeFilm,
        flag_id: val,
        flag_label: matchedFlag ? matchedFlag.label : null,
        flag_color: matchedFlag ? matchedFlag.color : null,
      };
      setActiveFilm(updatedFilm);
      if (onUpdateFilm) {
        onUpdateFilm(updatedFilm);
      }
    } catch (err) {
      console.error('Failed to update flag:', err);
    } finally {
      setFlagLoading(false);
    }
  };

  // Advance to Round 2 with optional judge assignments
  const handleAdvanceToRound2 = async () => {
    try {
      setAdvanceLoading(true);
      setActionSuccessMsg('');

      // 1. Advance pipeline status to Round 2
      await api.post('/reviews/decision', {
        film_id: activeFilm.id,
        decision: 'advance_round_2',
      });

      // 2. Assign judges for Round 2 if selected
      if (selectedR2JudgeIds.length > 0) {
        await api.post('/reviews/assign', {
          film_id: activeFilm.id,
          round_number: 2,
          judge_ids: selectedR2JudgeIds,
        });
      }

      // 3. Re-fetch fresh film details
      const res = await api.get(`/submissions/${activeFilm.id}`);
      const updated = res.data || { ...activeFilm, status: 'Round 2 Screening' };
      setActiveFilm(updated);
      setShowAdvanceModal(false);
      setActionSuccessMsg('Film advanced to Round 2 Screening successfully!');
      setTimeout(() => setActionSuccessMsg(''), 4500);

      if (onUpdateFilm) {
        onUpdateFilm(updated);
      }
    } catch (err) {
      console.error('Failed to advance film to Round 2:', err);
      alert('Failed to advance film to Round 2.');
    } finally {
      setAdvanceLoading(false);
    }
  };

  // Direct promotion to Official Selection
  const handleDirectOfficialSelection = async () => {
    if (!window.confirm(`Are you sure you want to mark "${activeFilm.title}" as Official Selection?`)) {
      return;
    }
    try {
      setAdvanceLoading(true);
      await api.post('/reviews/decision', {
        film_id: activeFilm.id,
        decision: 'official_selection',
      });
      const res = await api.get(`/submissions/${activeFilm.id}`);
      const updated = res.data || { ...activeFilm, status: 'Official Selection' };
      setActiveFilm(updated);
      setActionSuccessMsg('Film promoted to Official Selection!');
      setTimeout(() => setActionSuccessMsg(''), 4500);
      if (onUpdateFilm) {
        onUpdateFilm(updated);
      }
    } catch (err) {
      console.error('Failed to mark Official Selection:', err);
      alert('Failed to mark Official Selection.');
    } finally {
      setAdvanceLoading(false);
    }
  };

  // Assign Reviewers to Round 1 (Option 3: Unified Advance & Assign for Submitted films)
  const handleAssignToRound1 = async () => {
    try {
      setAdvanceLoading(true);
      await api.post('/reviews/assign', {
        film_id: activeFilm.id,
        round_number: 1,
        judge_ids: selectedR1JudgeIds,
      });
      const res = await api.get(`/submissions/${activeFilm.id}`);
      const stage1Label = activeStagesList[1]?.label || 'Round 1: Screening';
      const updated = res.data || {
        ...activeFilm,
        status: 'Round 1 Screening',
        current_stage_name: stage1Label
      };
      setActiveFilm(updated);
      setShowR1AssignModal(false);
      setActionSuccessMsg(isSubmittedFilm
        ? `Film advanced & reviewers assigned for ${stage1Label}!`
        : `Reviewers assigned for ${stage1Label}!`
      );
      setTimeout(() => setActionSuccessMsg(''), 4500);
      if (onUpdateFilm) {
        onUpdateFilm(updated);
      }
    } catch (err) {
      console.error('Failed to assign reviewers for Round 1:', err);
      alert('Failed to assign reviewers for Round 1.');
    } finally {
      setAdvanceLoading(false);
    }
  };

  const toggleReviewExpand = (key) => {
    setExpandedReviews((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Determine review items from assigned_jury or assigned_judges or reviews
  const reviewItems = (activeFilm.assigned_jury && activeFilm.assigned_jury.length > 0)
    ? activeFilm.assigned_jury
    : (activeFilm.assigned_judges && activeFilm.assigned_judges.length > 0)
      ? activeFilm.assigned_judges
      : (activeFilm.reviews || []);

  const round1Items = reviewItems.filter((i) => (i.round_number || 1) === 1);
  const round2Items = reviewItems.filter((i) => i.round_number === 2);
  const r1Completed = round1Items.filter((i) => i.status === 'completed' || i.overall_rating != null).length;
  const r2Completed = round2Items.filter((i) => i.status === 'completed' || i.overall_rating != null).length;

  const renderReviewCard = (item, idx, prefix) => {
    const cardKey = `${prefix}-${item.assignment_id || item.jury_id || item.judge_id || idx}`;
    const isCompleted = item.status === 'completed' || item.overall_rating != null;
    const juryName = item.jury_name || item.judge_name || item.name || 'Jury Member';

    const itemUserId = item.jury_user_id || item.jury_id || item.judge_id;
    const itemEmail = item.jury_email || item.email;
    const isMyReview = Boolean(
      (user?.id && itemUserId && Number(itemUserId) === Number(user.id)) ||
      (user?.email && itemEmail && itemEmail.toLowerCase().trim() === user.email.toLowerCase().trim()) ||
      (user?.userIds && itemUserId && user.userIds.map(Number).includes(Number(itemUserId)))
    );

    const isCurrentlyScoring = editingAssignmentId === cardKey || (!isCompleted && isMyReview);
    const isExpanded = expandedReviews[cardKey] ?? (isMyReview && !isCompleted);

    return (
      <div
        key={cardKey}
        className="fc-drawer-review-card"
        style={isMyReview ? { border: '1.5px solid rgba(168, 47, 47, 0.4)', boxShadow: '0 2px 10px rgba(168, 47, 47, 0.08)' } : {}}
      >
        <div className="fc-drawer-review-header" onClick={() => toggleReviewExpand(cardKey)}>
          <div className="fc-drawer-review-left">
            <span className="fc-drawer-review-judge">
              {juryName} {isMyReview && <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--fc-brand)', background: 'rgba(168, 47, 47, 0.1)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>YOU</span>}
            </span>
            {isCompleted ? (
              <>
                <span className="fc-drawer-review-done-pill">Done</span>
                {item.overall_rating && (
                  <span className="fc-drawer-review-score">
                    {parseFloat(item.overall_rating).toFixed(1)}/5
                  </span>
                )}
              </>
            ) : (
              <span className="fc-eval-status-badge pending">
                Pending Review
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isMyReview && isCompleted && !isCurrentlyScoring && (
              <button
                type="button"
                className="fc-btn-link"
                style={{ fontSize: '12px', color: 'var(--fc-brand)', fontWeight: 600, padding: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEditing(item, cardKey);
                }}
              >
                <EditIcon size={12} />
                <span>Edit Scorecard</span>
              </button>
            )}
            <button type="button" className="fc-drawer-review-expand-btn">
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="fc-drawer-review-details">
            {isCurrentlyScoring ? (
              /* ── INTERACTIVE SCORECARD FORM FOR JUROR ── */
              <div className="fc-drawer-scorecard-form" style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--fc-border)' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--fc-text-main)' }}>Your Official Scorecard</strong>
                    <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>Rate criteria on a 5-star scale and provide review notes</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>Computed Avg</div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--fc-brand)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <StarIcon size={14} style={{ color: '#eab308' }} /> {currentOverallScore}/5.0
                    </span>
                  </div>
                </div>

                <div className="fc-drawer-criteria-list" style={{ gap: '10px' }}>
                  {activeCriteriaList.map((crit) => {
                    const val = scoreFormValues[crit.key] || 4;
                    return (
                      <div key={crit.key} className="fc-drawer-crit-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="fc-drawer-crit-title" style={{ fontSize: '12px', fontWeight: 600 }}>{crit.label}</span>
                        <InteractiveStarRating
                          value={val}
                          onChange={(newVal) => handleScoreCriterionChange(crit.key, newVal)}
                        />
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-main)', marginBottom: '4px' }}>
                    Review Critique & Notes
                  </label>
                  <textarea
                    rows={3}
                    className="fc-input"
                    style={{ width: '100%', fontSize: '12px', padding: '8px', borderRadius: '6px', border: '1px solid var(--fc-border)' }}
                    placeholder="Enter constructive critique, technical feedback, and notes for the festival directors..."
                    value={scoreNotes}
                    onChange={(e) => setScoreNotes(e.target.value)}
                  />
                </div>

                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  {isCompleted && (
                    <button
                      type="button"
                      className="fc-btn fc-btn-secondary fc-btn-sm"
                      onClick={() => setEditingAssignmentId(null)}
                      disabled={submittingScore}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    className="fc-btn fc-btn-primary fc-btn-sm"
                    style={{ background: 'var(--fc-brand)', borderColor: 'var(--fc-brand)', color: '#fff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => handleSubmitScorecard(item, cardKey)}
                    disabled={submittingScore}
                  >
                    {submittingScore ? 'Submitting...' : (
                      <>
                        <CheckCircleIcon size={14} />
                        <span>Submit Official Scorecard</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : isCompleted ? (
              /* ── COMPLETED SCORECARD BREAKDOWN ── */
              <>
                {item.criteria_scores && (
                  <div className="fc-drawer-criteria-list">
                    {activeCriteriaList.map((crit) => {
                      const score = getScoreForCriterion(item.criteria_scores, crit);
                      if (score == null) return null;
                      return (
                        <div key={crit.key} className="fc-drawer-crit-row">
                          <span className="fc-drawer-crit-title">{crit.label}</span>
                          {renderStarRating(score)}
                        </div>
                      );
                    })}
                    {Object.entries(item.criteria_scores)
                      .filter(([k, val]) => {
                        if (val == null) return false;
                        const alreadyShown = activeCriteriaList.some(
                          c => c.key === k || (c.aliases && c.aliases.includes(k))
                        );
                        return !alreadyShown;
                      })
                      .map(([extraKey, score]) => (
                        <div key={extraKey} className="fc-drawer-crit-row">
                          <span className="fc-drawer-crit-title">
                            {CANONICAL_CRITERIA_MAP[extraKey] || extraKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </span>
                          {renderStarRating(score)}
                        </div>
                      ))
                    }
                  </div>
                )}
                {item.notes && (
                  <div className="fc-drawer-review-quote">
                    "{item.notes}"
                  </div>
                )}
              </>
            ) : (
              /* ── AWAITING OTHER JUROR ── */
              <div style={{ color: 'var(--fc-text-muted)', fontSize: '0.82rem', fontStyle: 'italic', padding: '6px 0' }}>
                Awaiting screening review submission from {juryName}.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fc-drawer-backdrop" onClick={onClose}>
      <div className="fc-drawer-panel animate-slide-left" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="fc-drawer-header">
          <div className="fc-drawer-title-area">
            <h2 className="fc-drawer-title">{activeFilm.title}</h2>
            <div className="fc-drawer-badge-row">
              <span className={`fc-status-badge fc-status-${(activeFilm.status || 'submitted').toLowerCase().replace(/\s+/g, '-')}`}>
                {activeFilm.status || 'Submitted'}
              </span>
              {activeFilm.flag_label && (
                <span
                  className="fc-flag-indicator"
                  style={{
                    backgroundColor: `${activeFilm.flag_color || '#3b82f6'}20`,
                    color: activeFilm.flag_color || '#3b82f6',
                    borderColor: `${activeFilm.flag_color || '#3b82f6'}40`,
                  }}
                >
                  {activeFilm.flag_label}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="fc-drawer-close-btn" onClick={onClose} title="Close drawer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="fc-drawer-body">
          {/* Flag Dropdown */}
          <div className="fc-drawer-section">
            <label className="fc-drawer-field-label">FLAG</label>
            <div className="fc-drawer-flag-select-wrapper">
              <select
                className="fc-drawer-flag-select"
                value={flagId}
                disabled={flagLoading}
                onChange={(e) => handleFlagSelect(e.target.value)}
              >
                <option value="none">None</option>
                {allFlagsList
                  .filter((f) => {
                    if (f.id === 'none') return false;
                    const isActive = f.is_active === 1 || f.is_active === true || f.is_active === '1' || f.is_active === undefined;
                    return isActive || String(f.id) === String(flagId);
                  })
                  .map((f) => {
                    const isActive = f.is_active === 1 || f.is_active === true || f.is_active === '1' || f.is_active === undefined;
                    return (
                      <option key={f.id} value={f.id}>
                        {f.label}{!isActive ? ' (Inactive)' : ''}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          {/* Synopsis */}
          {activeFilm.synopsis && (
            <div className="fc-drawer-section">
              <p className="fc-drawer-synopsis">{activeFilm.synopsis}</p>
            </div>
          )}

          {/* Screener Player */}
          <div className="fc-drawer-section">
            <label className="fc-drawer-field-label">SCREENER PLAYER & ACCESS</label>
            <ScreenerVideoPlayer
              url={activeFilm.watch_link || activeFilm.screener_url || activeFilm.video_link}
              password={activeFilm.watch_link_password}
              title={activeFilm.title}
              runtime={activeFilm.runtime}
            />
          </div>

          {/* Metadata Table */}
          <div className="fc-drawer-section">
            <table className="fc-drawer-meta-table">
              <tbody>
                <tr>
                  <td className="fc-drawer-meta-label">Director</td>
                  <td className="fc-drawer-meta-value">{activeFilm.director || '—'}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Category</td>
                  <td className="fc-drawer-meta-value">
                    <select
                      className="fc-toolbar-select"
                      style={{ padding: '3px 8px', fontSize: '12px', fontWeight: 600 }}
                      value={activeFilm.category || 'Short Film'}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    >
                      <option value="Documentary">Documentary</option>
                      <option value="Short Film">Short Film</option>
                      <option value="Feature Film">Feature Film</option>
                      <option value="Animation">Animation</option>
                      <option value="Student Film">Student Film</option>
                      <option value="Experimental">Experimental</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Review Stage</td>
                  <td className="fc-drawer-meta-value">
                    {isRejected ? (
                      <span className="fc-status-pill status-rejected" style={{ fontWeight: 800, padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CancelIcon size={13} /> Rejected {activeFilm.current_stage_name && !['Rejected', 'Submitted', 'New Submission'].includes(activeFilm.current_stage_name) ? `(at ${activeFilm.current_stage_name})` : ''}
                      </span>
                    ) : (
                      <select
                        className="fc-toolbar-select"
                        style={{ padding: '3px 8px', fontSize: '12px', fontWeight: 600 }}
                        value={currentStageSelectValue}
                        onChange={(e) => handleStageChange(e.target.value)}
                      >
                        {activeStagesList.map(s => (
                          <option key={s.id} value={s.label}>{s.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Runtime</td>
                  <td className="fc-drawer-meta-value">{activeFilm.runtime ? `${activeFilm.runtime} min` : '15 min'}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Country</td>
                  <td className="fc-drawer-meta-value">{activeFilm.country || 'India'}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Language</td>
                  <td className="fc-drawer-meta-value">{activeFilm.language || activeFilm.lang || 'Hindi'}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Format</td>
                  <td className="fc-drawer-meta-value">{activeFilm.format || activeFilm.fmt || 'MP4'}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Premiere</td>
                  <td className="fc-drawer-meta-value">{activeFilm.premiere || 'World Premiere'}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Year</td>
                  <td className="fc-drawer-meta-value">{activeFilm.year || activeFilm.yr || 2025}</td>
                </tr>
                <tr>
                  <td className="fc-drawer-meta-label">Contact</td>
                  <td className="fc-drawer-meta-value">{activeFilm.email || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fc-drawer-divider" />

          {/* Vertical Lifecycle Stepper */}
          <div className="fc-drawer-section">
            <label className="fc-drawer-field-label">Review Stages</label>
            <div className="fc-lifecycle-track">
              {activeStagesList.map((stage, idx) => {
                const isPast = !isRejected && idx < activeStageIndex;
                const isCurrent = !isRejected && idx === activeStageIndex;

                return (
                  <div key={stage.id} className="fc-lifecycle-step">
                    <div className="fc-lifecycle-node-col">
                      <span
                        className={`fc-lifecycle-dot ${isCurrent ? 'current' : isPast ? 'completed' : isRejected && idx === 0 ? 'rejected' : 'upcoming'
                          }`}
                      />
                      {idx < activeStagesList.length - 1 && (
                        <span className={`fc-lifecycle-line ${isPast ? 'completed' : ''}`} />
                      )}
                    </div>
                    <div className="fc-lifecycle-label-col">
                      <span
                        className={`fc-lifecycle-label ${isCurrent ? 'current' : isPast ? 'completed' : isRejected ? 'rejected-label' : 'upcoming'
                          }`}
                      >
                        {stage.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {isRejected && (
              <div className="fc-lifecycle-rejected-banner">
                Rejected — no further progression
                {activeFilm.rejection_reason && (
                  <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--fc-text-secondary, #64748b)' }}>
                    Reason: {activeFilm.rejection_reason}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="fc-drawer-divider" />

          {/* Round 1 Reviews Section (Matching Screenshot 4) */}
          <div className="fc-drawer-section">
            <label className="fc-drawer-field-label">
              ROUND 1 REVIEWS ({r1Completed}/{round1Items.length})
            </label>
            {round1Items.length === 0 ? (
              <div style={{ padding: '12px 14px', borderRadius: '8px', background: isRejected ? 'rgba(239, 68, 68, 0.1)' : 'var(--fc-surface-card)', border: isRejected ? '1px solid rgba(239, 68, 68, 0.25)' : '1px dashed var(--fc-border)', color: isRejected ? 'var(--fc-rejected-reason, #ef4444)' : 'var(--fc-text-muted)', fontSize: '0.82rem', fontWeight: isRejected ? 600 : 400 }}>
                {isRejected
                  ? '✕ Film is rejected — juror assignments and evaluations are closed.'
                  : activeStageIndex === 0
                    ? 'Film is currently in the intake queue. Advance to Round 1: Screening to begin juror review and scoring.'
                    : 'No reviewers assigned to this round yet.'}
              </div>
            ) : (
              <div className="fc-drawer-reviews-list">
                {round1Items.map((item, idx) => renderReviewCard(item, idx, 'r1'))}
              </div>
            )}
          </div>

          {/* Round 2 Reviews Section (If Round 2 has items, Matching Screenshot 4) */}
          {round2Items.length > 0 && (
            <div className="fc-drawer-section" style={{ marginTop: '16px' }}>
              <label className="fc-drawer-field-label">
                ROUND 2 REVIEWS ({r2Completed}/{round2Items.length})
              </label>
              <div className="fc-drawer-reviews-list">
                {round2Items.map((item, idx) => renderReviewCard(item, idx, 'r2'))}
              </div>
            </div>
          )}

          {/* Pipeline Link */}
          <div className="fc-drawer-section" style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="fc-drawer-pipeline-link"
              onClick={() => {
                onClose();
                navigate(`/review-dashboard?sub=assign&filmId=${activeFilm.id}`);
              }}
            >
              Open in pipeline →
            </button>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="fc-drawer-footer">
          {actionSuccessMsg && (
            <div style={{ padding: '8px 12px', marginBottom: '10px', borderRadius: '6px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
              <CheckCircleIcon size={14} />
              <span>{actionSuccessMsg}</span>
            </div>
          )}

          {scoreSuccessMsg && (
            <div style={{ padding: '8px 12px', marginBottom: '10px', borderRadius: '6px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
              <CheckCircleIcon size={14} />
              <span>{scoreSuccessMsg}</span>
            </div>
          )}

          {isJuryUser ? (
            <div style={{ padding: '8px 12px', textAlign: 'center', background: 'var(--fc-surface-hover, rgba(255, 255, 255, 0.05))', borderRadius: '6px', border: '1px solid var(--fc-border)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fc-text-main)' }}>
                {r1Completed > 0
                  ? '✓ Your screening review for this film has been officially submitted.'
                  : '★ You are assigned to review and score this film. Submit your scorecard above.'}
              </div>
            </div>
          ) : isRejected ? (
            <div style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 500, textAlign: 'center', padding: '6px' }}>
              Film has been rejected
            </div>
          ) : activeFilm.status === 'Admin Review' ? (
            <div className="fc-drawer-footer-actions">
              {hasRound2 ? (
                <>
                  <button
                    type="button"
                    className="fc-btn-advance-primary"
                    style={{ background: '#16a34a', borderColor: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}
                    onClick={handleDirectOfficialSelection}
                    disabled={advanceLoading}
                  >
                    <CheckCircleIcon size={14} />
                    <span>Mark Official Selection</span>
                  </button>
                  <div className="fc-drawer-secondary-actions">
                    <button
                      type="button"
                      className="fc-btn-action-outline"
                      onClick={() => setShowAdvanceModal(true)}
                    >
                      Manage Round 2 Reviewers
                    </button>
                    <button
                      type="button"
                      className="fc-btn-reject-drawer"
                      onClick={() => {
                        onClose();
                        if (onReject) onReject(activeFilm);
                      }}
                    >
                      Reject Film
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="fc-btn-advance-primary"
                    onClick={() => setShowAdvanceModal(true)}
                    disabled={advanceLoading}
                  >
                    ✦ Advance to Round 2 Screening
                  </button>
                  <div className="fc-drawer-secondary-actions">
                    <button
                      type="button"
                      className="fc-btn-action-outline"
                      onClick={handleDirectOfficialSelection}
                      disabled={advanceLoading}
                    >
                      Mark Official Selection
                    </button>
                    <button
                      type="button"
                      className="fc-btn-reject-drawer"
                      onClick={() => {
                        onClose();
                        if (onReject) onReject(activeFilm);
                      }}
                    >
                      Reject Film
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : activeFilm.status === 'Round 2 Screening' ? (
            <div className="fc-drawer-footer-actions">
              <button
                type="button"
                className="fc-btn-advance-primary"
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
                onClick={handleDirectOfficialSelection}
                disabled={advanceLoading}
              >
                ✓ Mark Official Selection
              </button>
              <div className="fc-drawer-secondary-actions">
                <button
                  type="button"
                  className="fc-btn-action-outline"
                  onClick={() => setShowAdvanceModal(true)}
                >
                  Manage Round 2 Reviewers
                </button>
                <button
                  type="button"
                  className="fc-btn-reject-drawer"
                  onClick={() => {
                    onClose();
                    if (onReject) onReject(activeFilm);
                  }}
                >
                  Reject Film
                </button>
              </div>
            </div>
          ) : isSubmittedFilm ? (
            <div className="fc-drawer-footer-actions">
              <button
                type="button"
                className="fc-btn-advance-primary"
                onClick={handleDirectAdvance}
                disabled={advanceLoading}
              >
                {advanceLoading ? 'Advancing...' : `⚡ Advance to ${activeStagesList[1]?.label || 'Round 1: Screening'}`}
              </button>
              <div className="fc-drawer-secondary-actions">
                <button
                  type="button"
                  className="fc-btn-action-outline"
                  onClick={() => setShowR1AssignModal(true)}
                  disabled={advanceLoading}
                >
                  ⚡ Advance & Assign Jury
                </button>
                <button
                  type="button"
                  className="fc-btn-reject-drawer"
                  onClick={() => {
                    onClose();
                    if (onReject) onReject(activeFilm);
                  }}
                >
                  Reject Film
                </button>
              </div>
            </div>
          ) : activeFilm.status === 'Winner' ? (
            <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(234, 88, 12, 0.1)', color: '#c2410c', borderRadius: '8px', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <TrophyIcon size={16} />
              <span>Winner — Festival Award Recipient</span>
            </div>
          ) : (
            <div className="fc-drawer-footer-actions">
              <button
                type="button"
                className="fc-btn-advance-primary"
                onClick={handleDirectAdvance}
                disabled={advanceLoading}
              >
                {advanceLoading
                  ? 'Advancing...'
                  : activeStagesList[activeStageIndex + 1]?.label
                    ? `⚡ Advance to ${activeStagesList[activeStageIndex + 1].label}`
                    : '⚡ Advance to Next Stage'}
              </button>
              <button
                type="button"
                className="fc-btn-reject-drawer"
                onClick={() => {
                  onClose();
                  if (onReject) onReject(activeFilm);
                }}
              >
                Reject Film
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Advance to Round 2 Modal */}
      {showAdvanceModal && (
        <div className="fc-modal-overlay" onClick={() => setShowAdvanceModal(false)}>
          <div className="fc-advance-modal animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="fc-advance-modal-header">
              <h3 className="fc-advance-modal-title">Advance to Round 2 Screening</h3>
              <button
                type="button"
                className="fc-drawer-close-btn"
                onClick={() => setShowAdvanceModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="fc-advance-modal-body">
              {/* Film Summary */}
              <div className="fc-advance-film-summary">
                <div className="fc-advance-film-title">{activeFilm.title}</div>
                <div className="fc-advance-film-meta">
                  <span>Dir. {activeFilm.director || 'Filmmaker'}</span>
                  <span>·</span>
                  <span>{activeFilm.category || 'Short Film'}</span>
                  {activeFilm.rating && (
                    <>
                      <span>·</span>
                      <span className="fc-advance-score-tag">
                        ★ {parseFloat(activeFilm.rating).toFixed(1)}/5
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Reviewer Selection */}
              <div>
                <div className="fc-advance-section-label">
                  ASSIGN ROUND 2 JURY MEMBERS (OPTIONAL)
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--fc-text-secondary)', margin: '0 0 10px 0' }}>
                  Select jury members to evaluate this film in Round 2. Jury can also be assigned or changed later in the Review Dashboard.
                </p>

                {availableJudges.length === 0 ? (
                  <div style={{ padding: '12px', background: 'var(--fc-surface)', borderRadius: '8px', color: 'var(--fc-text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
                    No registered jury members found for this festival.
                  </div>
                ) : (
                  <div className="fc-advance-judges-list">
                    {availableJudges.map((judge) => {
                      const isSelected = selectedR2JudgeIds.includes(judge.id);
                      return (
                        <div
                          key={judge.id}
                          className={`fc-advance-judge-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedR2JudgeIds((prev) =>
                              prev.includes(judge.id)
                                ? prev.filter((id) => id !== judge.id)
                                : [...prev, judge.id]
                            );
                          }}
                        >
                          <div className="fc-advance-judge-info">
                            <div className="fc-advance-judge-avatar" style={{ overflow: 'hidden', position: 'relative' }}>
                              {(judge.thumbnailPic || judge.thumbnail) ? (
                                <img
                                  src={judge.thumbnailPic || judge.thumbnail}
                                  alt={judge.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <span style={{ display: (judge.thumbnailPic || judge.thumbnail) ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                {(judge.name || judge.email || 'J').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="fc-advance-judge-name">{judge.name}</div>
                              <div className="fc-advance-judge-email">{judge.email}</div>
                            </div>
                          </div>
                          <div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => { }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#a82f2f' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="fc-advance-modal-footer">
              <button
                type="button"
                className="fc-btn-action-outline"
                style={{ flex: 'none', padding: '8px 16px' }}
                onClick={() => setShowAdvanceModal(false)}
                disabled={advanceLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fc-btn-advance-primary"
                style={{ width: 'auto', padding: '8px 20px' }}
                onClick={handleAdvanceToRound2}
                disabled={advanceLoading}
              >
                {advanceLoading ? 'Advancing...' : selectedR2JudgeIds.length > 0 ? `Advance & Assign (${selectedR2JudgeIds.length})` : 'Confirm & Advance to Round 2'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Round 1 Modal */}
      {showR1AssignModal && (
        <div className="fc-modal-overlay" onClick={() => setShowR1AssignModal(false)}>
          <div className="fc-advance-modal animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="fc-advance-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isSubmittedFilm && (
                  <FlashOnIcon size={18} style={{ color: '#a82f2f' }} />
                )}
                <h3 className="fc-advance-modal-title" style={{ margin: 0 }}>
                  {isSubmittedFilm
                    ? `Advance & Assign to ${activeStagesList[1]?.label || 'Round 1: Screening'}`
                    : 'Assign to Round 1 Screening'
                  }
                </h3>
              </div>
              <button
                type="button"
                className="fc-drawer-close-btn"
                onClick={() => setShowR1AssignModal(false)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="fc-advance-modal-body">
              <div className="fc-advance-film-summary">
                <div className="fc-advance-film-title">{activeFilm.title}</div>
                <div className="fc-advance-film-meta">
                  <span>Dir. {activeFilm.director || 'Filmmaker'}</span>
                  <span>·</span>
                  <span>{activeFilm.category || 'Short Film'}</span>
                </div>
              </div>

              {/* Option 3 Unified Workflow Notice for Submitted Film */}
              {isSubmittedFilm && (
                <div
                  className="fc-unified-notice-banner"
                  style={{ margin: '12px 0 16px' }}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>⚡</span>
                  <div className="fc-unified-notice-text">
                    <strong>Unified Stage Advance:</strong> Because this film is currently in <em>Submitted (Intake)</em>, assigning reviewers will automatically transition it to <strong>{activeStagesList[1]?.label || 'Round 1: Screening'}</strong> and activate each reviewer's scorecard.
                  </div>
                </div>
              )}

              <div>
                <div className="fc-advance-section-label">
                  SELECT ROUND 1 JURY MEMBERS
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--fc-text-secondary)', margin: '0 0 10px 0' }}>
                  Choose jury members who will receive this film in their queue to review and score.
                </p>

                {availableJudges.length === 0 ? (
                  <div style={{ padding: '12px', background: 'var(--fc-surface)', borderRadius: '8px', color: 'var(--fc-text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
                    No registered jury members found for this festival.
                  </div>
                ) : (
                  <div className="fc-advance-judges-list">
                    {availableJudges.map((judge) => {
                      const isSelected = selectedR1JudgeIds.includes(judge.id);
                      return (
                        <div
                          key={judge.id}
                          className={`fc-advance-judge-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedR1JudgeIds((prev) =>
                              prev.includes(judge.id)
                                ? prev.filter((id) => id !== judge.id)
                                : [...prev, judge.id]
                            );
                          }}
                        >
                          <div className="fc-advance-judge-info">
                            <div className="fc-advance-judge-avatar" style={{ overflow: 'hidden', position: 'relative' }}>
                              {(judge.thumbnailPic || judge.thumbnail) ? (
                                <img
                                  src={judge.thumbnailPic || judge.thumbnail}
                                  alt={judge.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <span style={{ display: (judge.thumbnailPic || judge.thumbnail) ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                {(judge.name || judge.email || 'J').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="fc-advance-judge-name">{judge.name}</div>
                              <div className="fc-advance-judge-email">{judge.email}</div>
                            </div>
                          </div>
                          <div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => { }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#a82f2f' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="fc-advance-modal-footer">
              <button
                type="button"
                className="fc-btn-action-outline"
                style={{ flex: 'none', padding: '8px 16px' }}
                onClick={() => setShowR1AssignModal(false)}
                disabled={advanceLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fc-btn-advance-primary"
                style={{ width: 'auto', padding: '8px 20px' }}
                onClick={handleAssignToRound1}
                disabled={advanceLoading || selectedR1JudgeIds.length === 0}
              >
                {advanceLoading
                  ? 'Promoting & Assigning...'
                  : isSubmittedFilm
                    ? `⚡ Move to Round 1 & Assign (${selectedR1JudgeIds.length})`
                    : `Assign Reviewers (${selectedR1JudgeIds.length})`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
