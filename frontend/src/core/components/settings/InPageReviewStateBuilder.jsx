import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  StarIcon,
  CheckCircleIcon,
  GavelIcon,
  EditIcon,
  PeopleIcon,
  LockIcon,
  CancelIcon,
  FlashOnIcon,
  ScheduleIcon,
  TrophyIcon,
  CloseIcon,
  CheckIcon,
  AddIcon,
  WarningIcon,
  PersonIcon,
  DragIndicatorIcon,
  ArrowUpwardIcon,
  ArrowDownwardIcon,
  HowToVoteIcon,
  InfoIcon
} from '../common/Icons';

function renderOptionIcon(icon) {
  switch (icon) {
    case '⭐':
    case '🌟':
    case '✨':
      return <StarIcon size={18} />;
    case '🗳️':
    case 'vote':
      return <HowToVoteIcon size={18} />;
    case '⚖️':
      return <GavelIcon size={18} />;
    case '📝':
    case '✍️':
      return <EditIcon size={18} />;
    case '🏁':
      return <CheckCircleIcon size={18} />;
    case '👥':
      return <PeopleIcon size={18} />;
    case '🔒':
      return <LockIcon size={18} />;
    case '❌':
      return <CancelIcon size={18} />;
    case '⚡':
      return <FlashOnIcon size={18} />;
    case '⏳':
      return <ScheduleIcon size={18} />;
    default:
      return null;
  }
}

const PRESET_SUGGESTIONS = [
  'Semi-Final Screening',
  'Quarter-Finals',
  'Grand Jury Consideration',
  'Audience Choice Voting',
  'Special Jury Selection'
];

const DEFAULT_AWARD_CRITERIA = [
  'Best Film',
  'Best Direction',
  'Best Cinematography',
  'Best Debut Film',
  'Best Documentary',
  'Best Short Film',
  'Best Animation'
];

const EVALUATION_OPTIONS = [
  {
    id: 'star_rating',
    icon: '⭐',
    title: 'Star Rating',
    scaleText: (scale) => `Scale: 1.0 to ${scale || 5}.0`,
    description: 'Criteria-weighted rubric scorecard with composite averages across festival rubrics.'
  },
  {
    id: 'vote_nomination',
    icon: '🗳️',
    title: 'Vote / Nomination',
    scaleText: () => 'Scale: Nominate / Consider',
    description: 'Consensus-driven qualitative voting tallies without numerical scoring.'
  },
  {
    id: 'pass_fail',
    icon: '⚖️',
    title: 'Pass / Fail',
    scaleText: () => 'Scale: Binary Gate',
    description: 'Preliminary qualification triage gate (Pass or Reject).'
  }
];

const STAR_SCALE_OPTIONS = [
  {
    scale: 3,
    label: '3 Stars',
    badge: 'Fast Triage',
    range: '1.0 to 3.0',
    description: 'Fast 3-tier evaluation rubric for high-velocity preliminary screening.'
  },
  {
    scale: 5,
    label: '5 Stars',
    badge: 'Industry Standard',
    range: '1.0 to 5.0',
    description: 'Standard film festival scoring with criteria weights & composite averages.'
  },
  {
    scale: 10,
    label: '10 Stars',
    badge: 'High Precision',
    range: '1.0 to 10.0',
    description: 'High-resolution decimal scale for large competitive catalogs.'
  }
];

const NOTES_REQUIREMENT_OPTIONS = [
  {
    id: 'optional',
    icon: '📝',
    title: 'Optional Notes',
    subtitle: 'Not Required',
    description: 'Jurors can submit star ratings or votes without being forced to enter text remarks.'
  },
  {
    id: 'required',
    icon: '✍️',
    title: 'Mandatory Critique',
    subtitle: 'Written Notes Required',
    description: 'Jurors must write qualitative critique notes before their evaluation scorecard can be submitted.'
  }
];

const COMPLETION_LOGICS = [
  {
    id: 'All reviews completed by assigned jury',
    icon: '🏁',
    title: 'All Reviews Completed',
    badge: 'Automated Gate',
    desc: 'Stage concludes once every assigned juror submits their review.'
  },
  {
    id: 'Majority consensus reached',
    icon: '👥',
    title: 'Majority Consensus',
    badge: 'Fast Consensus',
    desc: 'Auto-promotes as soon as 50%+ consensus is reached.'
  },
  {
    id: 'Manual admin closure',
    icon: '🔒',
    title: 'Manual Admin Closure',
    badge: 'Admin Control',
    desc: 'Festival admin decides exactly when to advance films.'
  }
];

const UNREVIEWED_ACTIONS = [
  {
    id: 'Mark un-reviewed as Rejected',
    icon: '❌',
    title: 'Mark as Rejected',
    badge: 'Standard Strict',
    desc: 'Films without reviews are rejected when stage closes.'
  },
  {
    id: 'Auto-advance un-reviewed',
    icon: '⚡',
    title: 'Auto-Advance',
    badge: 'Permissive',
    desc: 'Films move forward to the next round automatically.'
  },
  {
    id: 'Keep in pending queue',
    icon: '⏳',
    title: 'Keep Pending',
    badge: 'Queue Hold',
    desc: 'Remains in this stage until reviewed by committee.'
  }
];

export default function InPageReviewStateBuilder({
  editStage = null,
  nextStageOrder = 7,
  allStages = null,
  onClose,
  onCreated,
  onSaved,
  showNotification
}) {
  const isEditMode = Boolean(editStage);

  // Derive initial evaluation type from editStage
  const getInitialReviewType = () => {
    if (!editStage) return 'star_rating';
    const rt = String(editStage.review_type || '').toLowerCase();
    if (rt.includes('pass')) return 'pass_fail';
    if (rt.includes('vote')) return 'vote_nomination';
    return 'star_rating';
  };

  // Derive initial star scale from editStage
  const getInitialStarScale = () => {
    if (!editStage) return 5;
    const scale = parseInt(editStage.star_scale, 10);
    if ([3, 5, 10].includes(scale)) return scale;
    return 5;
  };

  // Derive initial completion logic from editStage
  const getInitialCompletionLogic = () => {
    if (!editStage) return 'All reviews completed by assigned jury';
    const cl = String(editStage.completion_logic || '').toLowerCase();
    if (cl.includes('admin') || cl.includes('manual')) return 'Manual admin closure';
    if (cl.includes('majority')) return 'Majority consensus reached';
    return 'All reviews completed by assigned jury';
  };

  // Derive initial action on unreviewed from editStage
  const getInitialActionUnreviewed = () => {
    if (!editStage) return 'Mark un-reviewed as Rejected';
    const ua = String(editStage.unreviewed_action || editStage.action_unreviewed || '').toLowerCase();
    if (ua.includes('advance')) return 'Auto-advance un-reviewed';
    if (ua.includes('keep') || ua.includes('pending')) return 'Keep in pending queue';
    return 'Mark un-reviewed as Rejected';
  };

  // Derive initial criteria list
  const getInitialCriteriaList = () => {
    if (editStage && Array.isArray(editStage.criteria) && editStage.criteria.length > 0) {
      return editStage.criteria.map(c => c.label || c.criterion_key);
    }
    return [
      'Screenplay',
      'Dialogues',
      'Writing',
      'Structure',
      'Direction',
      'Acting',
      'Cinematography',
      'Production design',
      'Sound',
      'Music',
      'Creativity',
      'Did the film inspire you?',
      'Importance of film message',
    ];
  };

  const getInitialAwardCriteria = () => {
    if (editStage) {
      if (Array.isArray(editStage.award_criteria) && editStage.award_criteria.length > 0) {
        return editStage.award_criteria;
      }
      if (Array.isArray(editStage.award_criteria)) {
        return editStage.award_criteria;
      }
      return DEFAULT_AWARD_CRITERIA;
    }
    return DEFAULT_AWARD_CRITERIA;
  };

  const [uniqueName, setUniqueName] = useState(
    editStage ? (editStage.unique_name || editStage.name || '') : ''
  );
  const getInitialStageOrder = () => {
    if (nextStageOrder) return nextStageOrder;
    if (editStage) {
      if (editStage.status === 'inactive' || editStage.stage_order > 50) return 1;
      return editStage.stage_order || 1;
    }
    return 1;
  };
  const [stageOrder, setStageOrder] = useState(getInitialStageOrder());
  const [juryAssignmentMode, setJuryAssignmentMode] = useState(
    editStage?.jury_assignment_mode || 'auto'
  );
  const [juryAutoRule, setJuryAutoRule] = useState(
    editStage?.jury_auto_rule || 'all_jury'
  );
  const [juryCountPerFilm, setJuryCountPerFilm] = useState(
    editStage?.jury_count_per_film ? Number(editStage.jury_count_per_film) : 1
  );
  const [totalAvailableJury, setTotalAvailableJury] = useState(
    editStage?.total_available_jury ?? 0
  );

  // Sync juryAssignmentMode if editStage changes
  useEffect(() => {
    if (editStage?.jury_assignment_mode) {
      setJuryAssignmentMode(editStage.jury_assignment_mode);
    }
  }, [editStage?.id, editStage?.jury_assignment_mode]);

  useEffect(() => {
    let mounted = true;
    api.get('/reviews/jury')
      .then((res) => {
        if (!mounted) return;
        const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        setTotalAvailableJury(list.length);
      })
      .catch((err) => {
        console.warn('Failed to fetch jury list:', err);
      });
    return () => { mounted = false; };
  }, []);

  // ── REVIEW STAGE STACK & POSITION REORDERING STATE ─────────────────────
  const [stagesList, setStagesList] = useState([]);
  const [orderedStages, setOrderedStages] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [hasReordered, setHasReordered] = useState(false);

  // Load stages list if not provided in props
  useEffect(() => {
    if (allStages && Array.isArray(allStages) && allStages.length > 0) {
      setStagesList(allStages);
    } else {
      api.get('/settings/review-states')
        .then((res) => {
          const list = Array.isArray(res.data?.data) ? res.data.data : [];
          setStagesList(list);
        })
        .catch((err) => {
          console.warn('Failed to load review states for reorder stack:', err);
        });
    }
  }, [allStages]);

  // Sync orderedStages when stagesList, editStage, or isEditMode changes
  useEffect(() => {
    if (!stagesList || stagesList.length === 0) {
      if (editStage) {
        setOrderedStages([editStage]);
      }
      return;
    }

    // Sort stages by stage_order ascending
    let sorted = [...stagesList].sort((a, b) => (Number(a.stage_order) || 0) - (Number(b.stage_order) || 0));

    if (isEditMode && editStage) {
      const foundIdx = sorted.findIndex(s => s.id === editStage.id);
      if (foundIdx === -1) {
        sorted.push(editStage);
        sorted.sort((a, b) => (Number(a.stage_order) || 0) - (Number(b.stage_order) || 0));
      }
      setOrderedStages(sorted);
      const currIdx = sorted.findIndex(s => s.id === editStage.id);
      if (currIdx !== -1) {
        setStageOrder(currIdx + 1);
      }
    } else {
      // Create mode: insert draft placeholder for new stage
      const draftItem = {
        id: 'new_draft',
        unique_name: uniqueName || 'New Dynamic Stage',
        stage_order: stageOrder,
        isNew: true,
        status: status || 'active',
        review_type: reviewType === 'star_rating' ? 'star_rating' : (reviewType === 'pass_fail' ? 'pass_fail' : 'vote_nomination'),
        star_scale: reviewType === 'star_rating' ? starScale : null,
        jury_assignment_mode: juryAssignmentMode || 'auto'
      };
      const insertAt = Math.min(Math.max(0, stageOrder - 1), sorted.length);
      const withDraft = [...sorted];
      withDraft.splice(insertAt, 0, draftItem);
      setOrderedStages(withDraft);
    }
  }, [stagesList, editStage?.id]);

  // Drag and drop handlers for vertical stack reordering
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnter = (e, index) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    // leave intact
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === undefined || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...orderedStages];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setOrderedStages(updated);
    setHasReordered(true);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Sync the stageOrder of the currently edited stage
    const currentIdx = updated.findIndex(s => (isEditMode ? s.id === editStage?.id : (s.isNew || s.id === 'new_draft')));
    if (currentIdx !== -1) {
      setStageOrder(currentIdx + 1);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMoveUp = (index) => {
    if (index <= 0) return;
    const updated = [...orderedStages];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setOrderedStages(updated);
    setHasReordered(true);

    const currentIdx = updated.findIndex(s => (isEditMode ? s.id === editStage?.id : (s.isNew || s.id === 'new_draft')));
    if (currentIdx !== -1) {
      setStageOrder(currentIdx + 1);
    }
  };

  const handleMoveDown = (index) => {
    if (index >= orderedStages.length - 1) return;
    const updated = [...orderedStages];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setOrderedStages(updated);
    setHasReordered(true);

    const currentIdx = updated.findIndex(s => (isEditMode ? s.id === editStage?.id : (s.isNew || s.id === 'new_draft')));
    if (currentIdx !== -1) {
      setStageOrder(currentIdx + 1);
    }
  };

  const [reviewType, setReviewType] = useState(getInitialReviewType());
  const [starScale, setStarScale] = useState(getInitialStarScale());

  useEffect(() => {
    if (editStage) {
      setReviewType(getInitialReviewType());
      setStarScale(getInitialStarScale());
    }
  }, [editStage]);
  const [notesRequirement, setNotesRequirement] = useState(
    editStage ? (
      (editStage.notes_requirement === 'required' || editStage.notes_required === 'required') ? 'required' : 'optional'
    ) : 'optional'
  );
  const [completionLogic, setCompletionLogic] = useState(getInitialCompletionLogic());
  const [actionUnreviewed, setActionUnreviewed] = useState(getInitialActionUnreviewed());
  const [status, setStatus] = useState(editStage?.status === 'inactive' ? 'inactive' : 'active');
  const [criteriaList, setCriteriaList] = useState(getInitialCriteriaList());
  const [newCriterion, setNewCriterion] = useState('');
  const [awardCriteriaList, setAwardCriteriaList] = useState(getInitialAwardCriteria());
  const [newAwardCriterion, setNewAwardCriterion] = useState('');
  const [notifyAcceptance, setNotifyAcceptance] = useState(
    editStage ? Boolean(editStage.notify_acceptance) : true
  );
  const [acceptanceTemplate, setAcceptanceTemplate] = useState(
    editStage?.acceptance_template || 'Congratulations! Your film has successfully advanced to the next round of Freecomers 2026.'
  );
  const [notifyRejection, setNotifyRejection] = useState(
    editStage ? Boolean(editStage.notify_rejection) : true
  );
  const [rejectionTemplate, setRejectionTemplate] = useState(
    editStage?.rejection_template || 'Thank you for submitting {film_title} to Freecomers 2026. After careful evaluation, your film has not been selected to advance to the next round ({stage_name}). We wish you all the best with your filmmaking endeavors.'
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editStage?.award_criteria && Array.isArray(editStage.award_criteria)) {
      setAwardCriteriaList(editStage.award_criteria);
    }
  }, [editStage]);

  const handleAddCriterion = (e) => {
    e.preventDefault();
    if (!newCriterion.trim()) return;
    if (!criteriaList.includes(newCriterion.trim())) {
      setCriteriaList([...criteriaList, newCriterion.trim()]);
    }
    setNewCriterion('');
  };

  const handleRemoveCriterion = (item) => {
    setCriteriaList(criteriaList.filter(c => c !== item));
  };

  const handleAddAwardCriterion = (e) => {
    if (e) e.preventDefault();
    const trimmed = newAwardCriterion.trim();
    if (!trimmed) return;
    if (!awardCriteriaList.includes(trimmed)) {
      setAwardCriteriaList([...awardCriteriaList, trimmed]);
    }
    setNewAwardCriterion('');
  };

  const handleQuickAddAward = (item) => {
    if (!awardCriteriaList.includes(item)) {
      setAwardCriteriaList([...awardCriteriaList, item]);
    }
  };

  const handleRemoveAwardCriterion = (item) => {
    setAwardCriteriaList(awardCriteriaList.filter(c => c !== item));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uniqueName.trim()) {
      if (showNotification) showNotification('Please provide a unique stage name.', 'error');
      return;
    }

    if (juryAssignmentMode === 'auto' && juryAutoRule === 'n_jury') {
      const nCount = parseInt(juryCountPerFilm, 10);
      if (!nCount || nCount < 1) {
        if (showNotification) showNotification('Assigned jury count per film must be at least 1.', 'error');
        return;
      }
      if (totalAvailableJury > 0 && nCount > totalAvailableJury) {
        if (showNotification) {
          showNotification(`Assigned jury count (${nCount}) cannot exceed the total number of available jury (${totalAvailableJury}).`, 'error');
        }
        return;
      }
    }

    setSubmitting(true);
    try {
      const rawCriteria = criteriaList.map((label, idx) => ({
        label,
        criterion_key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        weight_percentage: Math.round(100 / Math.max(1, criteriaList.length)),
        sort_order: idx + 1
      }));

      const payload = {
        unique_name: uniqueName.trim(),
        stage_order: parseInt(stageOrder, 10) || (editStage?.stage_order || nextStageOrder),
        access_group_name: juryAssignmentMode === 'none' ? 'Admin Only' : (juryAssignmentMode === 'manual' ? 'Manual Jury' : 'Auto Jury'),
        jury_assignment_mode: juryAssignmentMode,
        jury_auto_rule: juryAssignmentMode === 'auto' ? juryAutoRule : 'all_jury',
        jury_count_per_film: (juryAssignmentMode === 'auto' && juryAutoRule === 'n_jury') ? Math.max(1, parseInt(juryCountPerFilm, 10) || 1) : 1,
        scope_key: 'assigned',
        review_type: reviewType === 'star_rating' ? 'star_rating' : 'vote_nomination',
        vote_mode: reviewType === 'pass_fail' ? 'single' : (reviewType === 'vote_nomination' ? 'nomination' : null),
        star_scale: reviewType === 'star_rating' ? parseInt(starScale, 10) : 5,
        notes_requirement: notesRequirement,
        notes_required: notesRequirement,
        status: status,
        completion_logic: completionLogic,
        action_unreviewed: actionUnreviewed,
        unreviewed_action: actionUnreviewed,
        auto_advance_cutoff: reviewType === 'star_rating' ? (starScale === 10 ? 8.0 : (starScale === 3 ? 2.5 : 4.0)) : null,
        auto_reject_cutoff: reviewType === 'star_rating' ? (starScale === 10 ? 5.0 : (starScale === 3 ? 1.5 : 2.5)) : null,
        notify_acceptance: notifyAcceptance,
        acceptance_template: acceptanceTemplate,
        notify_rejection: notifyRejection,
        criteria: reviewType !== 'vote_nomination' ? rawCriteria : [],
        award_criteria: reviewType === 'vote_nomination' ? awardCriteriaList : []
      };

      let savedResponse = null;
      if (isEditMode) {
        savedResponse = await api.put(`/settings/review-states/${editStage.id}`, payload);
      } else {
        savedResponse = await api.post('/settings/review-states', payload);
      }

      // If reordered and multiple stages exist, sync sequence via /settings/review-states/reorder
      if (hasReordered && orderedStages.length > 1) {
        try {
          const createdStageId = savedResponse?.data?.data?.id;
          const orderList = orderedStages.map((s, idx) => {
            const stageId = (s.isNew || s.id === 'new_draft') ? createdStageId : s.id;
            return {
              id: stageId,
              stage_order: idx + 1
            };
          }).filter(item => item.id);

          if (orderList.length > 0) {
            await api.post('/settings/review-states/reorder', { orderList });
          }
        } catch (reorderErr) {
          console.warn('Failed to sync reordered review states:', reorderErr);
        }
      }

      if (isEditMode) {
        if (showNotification) {
          showNotification(`Stage "${uniqueName.trim()}" configuration updated successfully.`);
        }
        if (onSaved) onSaved();
      } else {
        if (showNotification) {
          showNotification(`Dynamic review-state "${uniqueName.trim()}" created & deployed successfully.`);
        }
        if (onCreated) onCreated();
      }

      if (onClose) onClose();
    } catch (err) {
      console.error('Failed to save review state:', err);
      if (showNotification) {
        showNotification(err.response?.data?.error || 'Failed to save review state.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const containerId = isEditMode ? `inpage-stage-builder-${editStage.id}` : 'inpage-stage-builder';

  return (
    <div className="fc-inpage-stage-builder animate-fade-in" id={containerId} style={isEditMode ? { borderColor: 'var(--fc-brand, #a82f2f)', boxShadow: '0 8px 30px rgba(168, 47, 47, 0.12)' } : {}}>
      {/* ── CARD HEADER & LIVE PREVIEW ─────────────────────────────────── */}
      <div className="fc-stage-builder-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="fc-builder-pulse-badge" title={`Sequential Stage #${stageOrder}`}>
            {stageOrder}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '16px', color: 'var(--fc-text-main, #1c1917)' }}>
                {uniqueName.trim() || (isEditMode ? 'Configure Review Stage' : 'New Dynamic Review Stage')}
              </strong>
              <span className={`fc-builder-draft-chip ${isEditMode ? 'edit-mode' : ''}`}>
                {isEditMode ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <EditIcon size={12} />
                    <span>In-Page Stage Editor</span>
                  </span>
                ) : (
                  '● In-Page Builder Draft'
                )}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span className="criteria-chip" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {juryAssignmentMode === 'none' ? (
                  <>
                    <LockIcon size={12} />
                    <span>No Jury (Admin Only)</span>
                  </>
                ) : (juryAssignmentMode === 'manual' ? (
                  <>
                    <PersonIcon size={12} />
                    <span>Manual Jury Assignment</span>
                  </>
                ) : (juryAutoRule === 'n_jury' ? (
                  <>
                    <FlashOnIcon size={12} />
                    <span>Auto: {juryCountPerFilm || 1} Juror{Number(juryCountPerFilm) === 1 ? '' : 's'} / Film</span>
                  </>
                ) : (
                  <>
                    <FlashOnIcon size={12} />
                    <span>Auto: All Jurors</span>
                  </>
                )))}
              </span>
              <span className="criteria-chip" style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {reviewType === 'star_rating' ? (
                  <>
                    <StarIcon size={12} />
                    <span>{starScale}-Star Rating</span>
                  </>
                ) : (reviewType === 'pass_fail' ? (
                  <>
                    <GavelIcon size={12} />
                    <span>Pass / Fail</span>
                  </>
                ) : (
                  <>
                    <HowToVoteIcon size={12} />
                    <span>Vote / Nomination</span>
                  </>
                ))}
              </span>
              <span className="criteria-chip" style={{ background: notesRequirement === 'required' ? '#fef3c7' : '#f1f5f9', color: notesRequirement === 'required' ? '#b45309' : '#475569', borderColor: notesRequirement === 'required' ? '#fde68a' : '#cbd5e1' }}>
                Notes: {notesRequirement === 'required' ? 'Mandatory Critique' : 'Optional Notes'}
              </span>
              <span className="criteria-chip" style={{ background: status === 'active' ? '#dbeafe' : '#f1f5f9', color: status === 'active' ? '#1d4ed8' : '#64748b', borderColor: status === 'active' ? '#bfdbfe' : '#cbd5e1' }}>
                {status === 'active' ? '● Active' : '○ Inactive'}
              </span>
              {reviewType === 'vote_nomination' && awardCriteriaList.length > 0 && (
                <span className="criteria-chip" style={{ background: '#fdf2f8', color: '#db2777', borderColor: '#fbcfe8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <TrophyIcon size={13} /> {awardCriteriaList.length} Award Categories
                </span>
              )}
              {reviewType !== 'vote_nomination' && criteriaList.length > 0 && (
                <span className="criteria-chip" style={{ background: '#f8fafc', color: '#475569', borderColor: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {criteriaList.length} Rubric Criteria
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="fc-builder-close-btn"
          onClick={onClose}
          title="Discard and close editor"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          <CloseIcon size={13} /> Close
        </button>
      </div>

      {/* ── INTERACTIVE BUILDER FORM BODY ──────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* 1. Stage Name & Sequence Order */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>1. STAGE IDENTITY & SEQUENCE</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Define the stage name, sequence order, and whether this stage is active.
              </span>
            </div>

            {/* Top Row: Stage Name & Stage Status */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) auto', gap: '24px', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <label className="fc-builder-field-label">STAGE NAME (E.G. ROUND 1, NOMINATION, FINALIST) *</label>
                <input
                  type="text"
                  className="fc-builder-text-input"
                  placeholder="e.g. Semi-Final Screening, Grand Jury..."
                  value={uniqueName}
                  onChange={(e) => setUniqueName(e.target.value)}
                  autoFocus={!isEditMode}
                  required
                />
                {/* Preset Suggestions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#78716c', fontWeight: 600 }}>Quick Presets:</span>
                  {PRESET_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      className="fc-sug-chip"
                      onClick={() => setUniqueName(sug)}
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="fc-builder-field-label">STAGE STATUS</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px' }}>
                  <label className="fc-toggle-switch" style={{ cursor: 'pointer', verticalAlign: 'middle' }}>
                    <input
                      type="checkbox"
                      checked={status === 'active'}
                      onChange={(e) => setStatus(e.target.checked ? 'active' : 'inactive')}
                    />
                    <span className="fc-toggle-slider" />
                  </label>
                  <button
                    type="button"
                    className={`fc-stage-status-btn ${status === 'active' ? 'active' : 'inactive'}`}
                    onClick={() => setStatus(status === 'active' ? 'inactive' : 'active')}
                  >
                    {status === 'active' ? '● Active' : '○ Inactive'}
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: '#78716c', marginTop: '4px', display: 'block' }}>
                  {status === 'active' ? 'Accepting jury reviews' : 'Bypassed / on hold'}
                </span>
              </div>
            </div>

            {/* DRAGGABLE VERTICAL STACK LIST: POSITION SEQUENCE ORDER */}
            <div className="fc-stage-stack-container">
              <div className="fc-stage-stack-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <label className="fc-builder-field-label" style={{ margin: 0 }}>
                    POSITION SEQUENCE ORDER (STAGE STACK)
                  </label>
                  <span className="fc-stage-stack-hint">
                    Drag cards by the <DragIndicatorIcon size={14} style={{ verticalAlign: 'middle', margin: '0 2px' }} /> handle or use ↑ / ↓ arrows to reorder
                  </span>
                </div>
                <div className="fc-stage-current-pos-pill">
                  Position #{stageOrder} of {orderedStages.length || 1} in pipeline
                </div>
              </div>

              <div className="fc-stage-stack-list">
                {orderedStages.map((stg, idx) => {
                  const isCurrent = isEditMode
                    ? (stg.id === editStage?.id)
                    : (stg.isNew || stg.id === 'new_draft');
                  const posNum = idx + 1;
                  const displayName = isCurrent
                    ? (uniqueName.trim() || (isEditMode ? editStage?.unique_name : 'New Stage'))
                    : (stg.unique_name || stg.name || `Stage #${posNum}`);
                  const isDraggingThis = draggedIndex === idx;
                  const isDragOverThis = dragOverIndex === idx;

                  return (
                    <div
                      key={stg.id || `stg-${idx}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnter={(e) => handleDragEnter(e, idx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`fc-stage-stack-card ${isCurrent ? 'current-editing' : ''} ${isDraggingThis ? 'is-dragging' : ''} ${isDragOverThis ? 'is-drag-over' : ''}`}
                    >
                      {/* Drag Handle */}
                      <div className="fc-stage-drag-handle" title="Drag to reorder position in pipeline">
                        <DragIndicatorIcon size={18} />
                      </div>

                      {/* Position Number Badge */}
                      <div className={`fc-stage-pos-badge ${isCurrent ? 'badge-current' : ''}`}>
                        #{posNum}
                      </div>

                      {/* Stage Info */}
                      <div className="fc-stage-stack-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="fc-stage-stack-name">
                            {displayName}
                          </span>
                          {isCurrent && (
                            <span className="fc-stage-editing-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <StarIcon size={11} />
                              <span>Editing This Stage</span>
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span className={`fc-stage-meta-chip ${stg.status === 'inactive' ? 'meta-inactive' : 'meta-active'}`}>
                            {stg.status === 'inactive' ? 'Inactive' : 'Active'}
                          </span>
                          <span className="fc-stage-meta-chip meta-type">
                            {String(stg.review_type || '').toLowerCase().includes('pass')
                              ? 'Pass / Fail'
                              : (String(stg.review_type || '').toLowerCase().includes('vote')
                                  ? 'Vote / Nomination'
                                  : `${stg.star_scale || 5}-Star Rating`)}
                          </span>
                          {stg.jury_assignment_mode && (
                            <span className="fc-stage-meta-chip meta-jury">
                              {stg.jury_assignment_mode === 'manual' ? 'Manual Jury' : 'Auto Jury'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Swap Up / Down Buttons */}
                      <div className="fc-stage-stack-actions">
                        <button
                          type="button"
                          className="fc-stage-reorder-btn"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveUp(idx);
                          }}
                          title={idx === 0 ? 'Already at top' : 'Move up (earlier in pipeline)'}
                        >
                          <ArrowUpwardIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="fc-stage-reorder-btn"
                          disabled={idx === orderedStages.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveDown(idx);
                          }}
                          title={idx === orderedStages.length - 1 ? 'Already at bottom' : 'Move down (later in pipeline)'}
                        >
                          <ArrowDownwardIcon size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Interactive Evaluation Type Selector */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>2. EVALUATION & SCORING MODEL</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Select how juries grade submissions in this sequential stage.
              </span>
            </div>

            <div className="fc-interactive-choice-grid">
              {EVALUATION_OPTIONS.map((opt) => {
                const isSelected = reviewType === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`fc-interactive-choice-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setReviewType(opt.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{renderOptionIcon(opt.icon)}</span>
                      <span className={`fc-choice-radio-indicator ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <CheckIcon size={12} />}
                      </span>
                    </div>
                    <strong style={{ fontSize: '13.5px', color: 'var(--fc-text-main, #1c1917)', display: 'block', marginBottom: '2px' }}>
                      {opt.title}
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--fc-brand, #a82f2f)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      {typeof opt.scaleText === 'function' ? opt.scaleText(starScale) : opt.scaleText}
                    </span>
                    <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.35, margin: 0 }}>
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Sub-panel for Star Scale Selection when Star Rating is selected */}
            {reviewType === 'star_rating' && (
              <div
                className="fc-builder-subpanel"
                style={{
                  marginTop: '14px',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StarIcon size={16} style={{ color: '#d97706' }} />
                      <strong style={{ fontSize: '13px', color: 'var(--fc-text-main, #1c1917)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Configure Star Scale (How many stars?)
                      </strong>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#78716c', display: 'block', marginTop: '2px' }}>
                      Choose the rating scale granularity jurors will use to score each rubric criterion.
                    </span>
                  </div>
                  <span className="criteria-chip" style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fde68a', fontSize: '11px', fontWeight: 700 }}>
                    Active: {starScale} Stars
                  </span>
                </div>

                {/* 3 Interactive Cards for Scale */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  {STAR_SCALE_OPTIONS.map((opt) => {
                    const isScaleSelected = starScale === opt.scale;
                    return (
                      <div
                        key={opt.scale}
                        className={`fc-interactive-choice-card ${isScaleSelected ? 'selected' : ''}`}
                        onClick={() => setStarScale(opt.scale)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '9px',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ fontSize: '13px', color: isScaleSelected ? 'var(--fc-brand)' : 'var(--fc-text-main)' }}>
                              {opt.label}
                            </strong>
                            <span
                              className="criteria-chip"
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                background: isScaleSelected ? 'rgba(225, 29, 72, 0.14)' : 'var(--fc-surface-hover)',
                                color: isScaleSelected ? 'var(--fc-brand)' : 'var(--fc-text-muted)',
                                borderColor: isScaleSelected ? 'var(--fc-brand-border)' : 'var(--fc-border)'
                              }}
                            >
                              {opt.badge}
                            </span>
                          </div>
                          <span className={`fc-choice-radio-indicator ${isScaleSelected ? 'checked' : ''}`} style={{ width: '16px', height: '16px', fontSize: '9px' }}>
                            {isScaleSelected && <CheckIcon size={10} />}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--fc-brand)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                          Scale: {opt.range}
                        </span>
                        <p style={{ fontSize: '11px', color: 'var(--fc-text-muted)', margin: 0, lineHeight: 1.35 }}>
                          {opt.description}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Live Jury Star Visualizer Preview */}
                <div
                  className="fc-builder-preview-box"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--fc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Live Jury Preview:
                    </span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {Array.from({ length: starScale }).map((_, idx) => (
                        <StarIcon key={idx} size={16} style={{ color: '#eab308' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', color: 'var(--fc-text-muted)' }}>
                      Jurors rate from <strong style={{ color: 'var(--fc-text-main)' }}>1.0 to {starScale}.0</strong> in 0.5 increments
                    </span>
                    <span
                      className="criteria-chip"
                      style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0', fontSize: '10.5px', fontWeight: 700 }}
                    >
                      Sample: {(starScale * 0.84).toFixed(1)} / {starScale}.0
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Review Notes Requirement (Requested by user) */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>3. REVIEW NOTES REQUIREMENT</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Determine whether written notes and critique remarks are mandatory for submitting an evaluation.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {NOTES_REQUIREMENT_OPTIONS.map((opt) => {
                const isSelected = notesRequirement === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`fc-interactive-choice-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setNotesRequirement(opt.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{renderOptionIcon(opt.icon)}</span>
                      <span className={`fc-choice-radio-indicator ${isSelected ? 'checked' : ''}`}>
                        {isSelected && <CheckIcon size={12} />}
                      </span>
                    </div>
                    <strong style={{ fontSize: '13.5px', color: 'var(--fc-text-main, #1c1917)', display: 'block', marginBottom: '2px' }}>
                      {opt.title}
                    </strong>
                    <span style={{ fontSize: '11px', color: isSelected ? 'var(--fc-brand, #a82f2f)' : '#78716c', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      {opt.subtitle}
                    </span>
                    <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.35, margin: 0 }}>
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Assign Jury for this Stage */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>4. ASSIGN JURY FOR THIS STAGE</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Determine whether submissions are automatically assigned to jurors, managed manually, or require no jury (Admin-only stage).
              </span>
            </div>

            {/* Top Mode Selection: Auto assign vs Manual assign vs No jury */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              {/* Auto Assign Card */}
              <div
                className={`fc-interactive-choice-card ${juryAssignmentMode === 'auto' ? 'selected' : ''}`}
                onClick={() => setJuryAssignmentMode('auto')}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FlashOnIcon size={20} style={{ color: 'var(--fc-brand, #a82f2f)' }} />
                    <strong style={{ fontSize: '14px', color: 'var(--fc-text-main, #1c1917)' }}>
                      Auto assign
                    </strong>
                  </div>
                  <span className={`fc-choice-radio-indicator ${juryAssignmentMode === 'auto' ? 'checked' : ''}`}>
                    {juryAssignmentMode === 'auto' && <CheckIcon size={12} />}
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.4, margin: 0 }}>
                  Submissions moving into this stage are automatically assigned to jury members based on configured rules.
                </p>
              </div>

              {/* Manual Assign Card */}
              <div
                className={`fc-interactive-choice-card ${juryAssignmentMode === 'manual' ? 'selected' : ''}`}
                onClick={() => setJuryAssignmentMode('manual')}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PersonIcon size={20} style={{ color: 'var(--fc-brand, #a82f2f)' }} />
                    <strong style={{ fontSize: '14px', color: 'var(--fc-text-main, #1c1917)' }}>
                      Manual assign
                    </strong>
                  </div>
                  <span className={`fc-choice-radio-indicator ${juryAssignmentMode === 'manual' ? 'checked' : ''}`}>
                    {juryAssignmentMode === 'manual' && <CheckIcon size={12} />}
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.4, margin: 0 }}>
                  Administrators will curate and assign specific jury members manually to each film submission.
                </p>
              </div>

              {/* No Jury Assignment Card */}
              <div
                className={`fc-interactive-choice-card ${juryAssignmentMode === 'none' ? 'selected' : ''}`}
                onClick={() => {
                  setJuryAssignmentMode('none');
                  setCompletionLogic('manual_admin');
                }}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LockIcon size={20} style={{ color: 'var(--fc-brand, #a82f2f)' }} />
                    <strong style={{ fontSize: '14px', color: 'var(--fc-text-main, #1c1917)' }}>
                      No jury assignment
                    </strong>
                  </div>
                  <span className={`fc-choice-radio-indicator ${juryAssignmentMode === 'none' ? 'checked' : ''}`}>
                    {juryAssignmentMode === 'none' && <CheckIcon size={12} />}
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.4, margin: 0 }}>
                  Admin-only / Showcase stage (e.g. Finalist, Winner). No jury members evaluate films in this stage.
                </p>
              </div>
            </div>

            {/* Auto Assign Sub-options (Conditions 2.1 & 2.3) */}
            {juryAssignmentMode === 'auto' && (
              <div style={{
                background: 'var(--fc-surface, #fafaf9)',
                border: '1.5px solid var(--fc-border, #e7e5e4)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#44403c', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  Auto-Assignment Rules
                </div>

                {/* Condition 2.1: Every jury will review all films */}
                <div
                  className={`fc-rule-card ${juryAutoRule === 'all_jury' ? 'selected' : ''}`}
                  onClick={() => setJuryAutoRule('all_jury')}
                  style={{ cursor: 'pointer', padding: '12px 14px' }}
                >
                  <span className={`fc-choice-radio-indicator ${juryAutoRule === 'all_jury' ? 'checked' : ''}`} style={{ flexShrink: 0 }}>
                    {juryAutoRule === 'all_jury' && <CheckIcon size={12} />}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '13px', color: juryAutoRule === 'all_jury' ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-main, #1c1917)' }}>
                        Every jury will review all the films of that stage
                      </strong>
                      <span className="criteria-chip" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd', fontSize: '10.5px' }}>
                        Full Panel Review
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.35, marginTop: '2px', display: 'block' }}>
                      Every active jury member is automatically assigned to evaluate each film in this round upon advancement.
                    </span>
                  </div>
                </div>

                {/* Condition 2.3: Every film will be reviewed by <n> jury */}
                <div
                  className={`fc-rule-card ${juryAutoRule === 'n_jury' ? 'selected' : ''}`}
                  onClick={() => setJuryAutoRule('n_jury')}
                  style={{ cursor: 'pointer', padding: '12px 14px' }}
                >
                  <span className={`fc-choice-radio-indicator ${juryAutoRule === 'n_jury' ? 'checked' : ''}`} style={{ flexShrink: 0 }}>
                    {juryAutoRule === 'n_jury' && <CheckIcon size={12} />}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '13px', color: juryAutoRule === 'n_jury' ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-main, #1c1917)' }}>
                        Every film will be reviewed by &lt;n&gt; jury
                      </strong>
                      <span className="criteria-chip" style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe', fontSize: '10.5px' }}>
                        Workload Balanced
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.35, marginTop: '2px', display: 'block' }}>
                      Each film is evenly distributed to a quota of N jurors based on least-loaded active juror workload.
                    </span>
                  </div>
                </div>

                {/* Stepper / Input for <n> jury when 2.3 is selected */}
                {juryAutoRule === 'n_jury' && (
                  <div style={{
                    marginTop: '4px',
                    marginLeft: '28px',
                    padding: '12px 16px',
                    background: 'var(--fc-surface-card, #ffffff)',
                    borderRadius: '8px',
                    border: '1px solid var(--fc-border, #e2e8f0)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main, #1c1917)', display: 'block' }}>
                          Number of Jury Reviewers per Film (n) *
                        </label>
                        <span style={{ fontSize: '11px', color: '#78716c' }}>
                          Each film advanced will be assigned to exactly this many jurors.
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="fc-stepper-btn"
                          onClick={() => setJuryCountPerFilm(Math.max(1, (parseInt(juryCountPerFilm, 10) || 1) - 1))}
                          title="Decrease jury count"
                        >
                          –
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={totalAvailableJury > 0 ? totalAvailableJury : 50}
                          className="fc-builder-text-input"
                          style={{
                            width: '64px',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: '14px',
                            borderColor: (totalAvailableJury > 0 && juryCountPerFilm > totalAvailableJury) ? '#ef4444' : undefined
                          }}
                          value={juryCountPerFilm}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setJuryCountPerFilm(isNaN(val) ? '' : val);
                          }}
                        />
                        <button
                          type="button"
                          className="fc-stepper-btn"
                          onClick={() => {
                            const current = parseInt(juryCountPerFilm, 10) || 0;
                            const nextVal = current + 1;
                            if (totalAvailableJury > 0 && nextVal > totalAvailableJury) {
                              if (showNotification) showNotification(`Cannot exceed total available jury (${totalAvailableJury}).`, 'error');
                              return;
                            }
                            setJuryCountPerFilm(nextVal);
                          }}
                          title="Increase jury count"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Validation & Jury Count Context */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        Total active jury registered: <strong>{totalAvailableJury}</strong>
                      </span>
                      {totalAvailableJury > 0 && (
                        <span className="criteria-chip" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0', fontSize: '10.5px' }}>
                          Max allowed: {totalAvailableJury}
                        </span>
                      )}
                      {totalAvailableJury > 0 && Number(juryCountPerFilm) > totalAvailableJury && (
                        <span style={{ fontSize: '11.5px', color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <WarningIcon size={13} /> n ({juryCountPerFilm}) cannot be greater than total number of jury ({totalAvailableJury})
                        </span>
                      )}
                      {totalAvailableJury === 0 && (
                        <span style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <WarningIcon size={13} /> No jurors currently assigned to festival. You can configure now, but ensure jurors are invited before evaluating.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual Assign Notice (Condition 2.2) */}
            {juryAssignmentMode === 'manual' && (
              <div style={{
                background: 'var(--fc-alert-bg, rgba(225, 29, 72, 0.08))',
                border: '1.5px solid var(--fc-alert-border, rgba(225, 29, 72, 0.28))',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <PersonIcon size={24} style={{ color: 'var(--fc-alert-title, #e11d48)', flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '13px', color: 'var(--fc-alert-title, #e11d48)', display: 'block', marginBottom: '2px' }}>
                    Admin will assign jury manually
                  </strong>
                  <p style={{ fontSize: '12px', color: 'var(--fc-text-secondary, #a1a1aa)', margin: 0, lineHeight: 1.45 }}>
                    No automated screening assignments will be created when films advance to this stage.
                    Festival administrators will have full control to assign specific jury members manually from the Submissions &amp; Review table.
                  </p>
                </div>
              </div>
            )}

            {/* No Jury Notice (Admin-Only / Showcase Stage) */}
            {juryAssignmentMode === 'none' && (
              <div style={{
                background: 'var(--fc-surface, #f8fafc)',
                border: '1.5px solid var(--fc-border, #e2e8f0)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <InfoIcon size={22} style={{ color: 'var(--fc-brand, #a82f2f)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '13px', color: 'var(--fc-text-main, #1c1917)', display: 'block', marginBottom: '3px' }}>
                    Admin-Only / Showcase Stage (Zero Jury Overhead)
                  </strong>
                  <p style={{ fontSize: '12px', color: 'var(--fc-text-secondary, #64748b)', margin: 0, lineHeight: 1.45 }}>
                    No jury members will be assigned to evaluate films in this round. Films advancing into this stage are managed directly by festival administrators for operations such as crowning category winners, publishing official selections, and generating press honours.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 5. Completion & Unreviewed Actions */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>5. STAGE COMPLETION & AUTOMATION RULES</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Configure trigger conditions for concluding this round and how to handle unreviewed submissions.
              </span>
            </div>

            {/* 5.1 When does this stage close? */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'var(--fc-brand, #a82f2f)',
                  background: '#fee2e2',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.5px'
                }}>
                  5.1
                </span>
                <strong style={{ fontSize: '13px', color: 'var(--fc-text-main, #1c1917)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Stage Completion Trigger (When does this stage close?)
                </strong>
              </div>
              <span style={{ fontSize: '11.5px', color: '#78716c', display: 'block', marginBottom: '10px' }}>
                Determine the milestone or condition that triggers the conclusion of jury evaluation for this round.
              </span>

              {juryAssignmentMode === 'none' && (
                <div
                  className="fc-builder-notice-box"
                  style={{
                    marginBottom: '12px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <InfoIcon size={14} />
                  <span>Because this stage has <strong>No jury assignment</strong>, stage conclusion is managed by <strong>Manual Admin Closure</strong>.</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                {COMPLETION_LOGICS.map((item) => {
                  const isSelected = completionLogic === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`fc-interactive-choice-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setCompletionLogic(item.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{renderOptionIcon(item.icon)}</span>
                        <span className={`fc-choice-radio-indicator ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <CheckIcon size={12} />}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '13.5px', color: 'var(--fc-text-main, #1c1917)' }}>
                          {item.title}
                        </strong>
                        {item.badge && (
                          <span
                            className="criteria-chip"
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              background: isSelected ? '#fee2e2' : '#f1f5f9',
                              color: isSelected ? '#991b1b' : '#64748b',
                              borderColor: isSelected ? '#fecaca' : '#e2e8f0'
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.35, margin: 0 }}>
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5.2 What happens to unreviewed films upon closure? */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: 'var(--fc-brand, #a82f2f)',
                  background: '#fee2e2',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.5px'
                }}>
                  5.2
                </span>
                <strong style={{ fontSize: '13px', color: 'var(--fc-text-main, #1c1917)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Action on Unreviewed Films (What happens to leftovers?)
                </strong>
              </div>
              <span style={{ fontSize: '11.5px', color: '#78716c', display: 'block', marginBottom: '10px' }}>
                Define the automated fallback policy for submissions that jurors did not evaluate before stage closure.
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                {UNREVIEWED_ACTIONS.map((item) => {
                  const isSelected = actionUnreviewed === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`fc-interactive-choice-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setActionUnreviewed(item.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{renderOptionIcon(item.icon)}</span>
                        <span className={`fc-choice-radio-indicator ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <CheckIcon size={12} />}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '13.5px', color: 'var(--fc-text-main, #1c1917)' }}>
                          {item.title}
                        </strong>
                        {item.badge && (
                          <span
                            className="criteria-chip"
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              background: isSelected ? '#fee2e2' : '#f1f5f9',
                              color: isSelected ? '#991b1b' : '#64748b',
                              borderColor: isSelected ? '#fecaca' : '#e2e8f0'
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '11.5px', color: '#78716c', lineHeight: 1.35, margin: 0 }}>
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Automation Summary Banner */}
            <div
              className="fc-automation-summary-banner"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '8px',
                flexWrap: 'wrap'
              }}
            >
              <FlashOnIcon size={16} style={{ color: '#d97706', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', lineHeight: 1.4 }}>
                <strong>Automation Rule:</strong> This stage concludes when <strong>{completionLogic}</strong>. Any films left unreviewed will be <strong>{actionUnreviewed}</strong>.
              </span>
            </div>
          </div>

          {/* 6. Contextual Section: Rubrics for Star Rating vs Award Categories for Vote / Nomination */}
          {reviewType === 'vote_nomination' ? (
            /* 6. Award Criteria & Nominations (When Vote / Nomination is chosen) */
            <div className="fc-builder-section animate-fade-in">
              <div className="fc-builder-section-title">
                <span>6. AWARD CATEGORIES &amp; NOMINATIONS</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                  Define the award categories available for nomination and voting in this stage.
                </span>
              </div>

              {/* QUICK ADD PRESETS */}
              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#78716c', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  QUICK ADD
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {DEFAULT_AWARD_CRITERIA.map((preset) => {
                    const alreadyAdded = awardCriteriaList.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={`fc-award-preset-btn ${alreadyAdded ? 'added' : ''}`}
                        onClick={() => !alreadyAdded && handleQuickAddAward(preset)}
                        title={alreadyAdded ? 'Already added' : `Add ${preset}`}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '999px',
                          border: '1px solid',
                          borderColor: alreadyAdded ? 'var(--fc-border-subtle, #e2e8f0)' : 'var(--fc-border, #cbd5e1)',
                          background: alreadyAdded ? 'var(--fc-surface, #f8fafc)' : 'var(--fc-surface-card, #ffffff)',
                          color: alreadyAdded ? 'var(--fc-text-muted, #94a3b8)' : 'var(--fc-text-main, #334155)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: alreadyAdded ? 'default' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {alreadyAdded ? <CheckIcon size={12} /> : <AddIcon size={12} />} {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ACTIVE AWARD CATEGORIES */}
              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#78716c', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  ACTIVE AWARD CATEGORIES ({awardCriteriaList.length})
                </span>
                {awardCriteriaList.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {awardCriteriaList.map((crit) => (
                      <span
                        key={crit}
                        className="fc-award-chip"
                        style={{
                          background: 'rgba(244, 63, 94, 0.12)',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          borderRadius: '999px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--fc-badge-burgundy, #fda4af)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <TrophyIcon size={13} style={{ color: 'var(--fc-brand, #f43f5e)' }} />
                        <span>{crit}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAwardCriterion(crit)}
                          className="fc-crit-chip-remove"
                          title={`Remove ${crit}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--fc-brand, #f43f5e)',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: '11px',
                            fontWeight: 800,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <CloseIcon size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '12.5px', color: '#78716c', margin: '4px 0', fontStyle: 'italic' }}>
                    No award categories added yet. Click quick add presets above or add custom categories below.
                  </p>
                )}
              </div>

              {/* CUSTOM AWARD INPUT */}
              <div style={{ display: 'flex', gap: '8px', maxWidth: '440px' }}>
                <input
                  type="text"
                  className="fc-builder-text-input"
                  style={{ padding: '8px 14px', fontSize: '12.5px', flex: 1 }}
                  placeholder="Custom award name..."
                  value={newAwardCriterion}
                  onChange={(e) => setNewAwardCriterion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAwardCriterion(e);
                    }
                  }}
                />
                <button
                  type="button"
                  className="fc-btn"
                  onClick={handleAddAwardCriterion}
                  style={{
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                    background: 'var(--fc-brand, #a82f2f)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
          ) : (
            /* 6. Evaluation Criteria Chips (When Star Rating or Pass / Fail is chosen) */
            <div className="fc-builder-section animate-fade-in">
              <div className="fc-builder-section-title">
                <span>6. EVALUATION CRITERIA RUBRICS</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                  {reviewType === 'star_rating'
                    ? `Categories weighted equally when juries submit evaluation scorecards on the ${starScale}-star scale.`
                    : 'Qualitative criteria reviewed when evaluating film submissions.'}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                {criteriaList.map((crit) => (
                  <span key={crit} className="fc-crit-chip">
                    <span>{crit}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCriterion(crit)}
                      className="fc-crit-chip-remove"
                      title={`Remove ${crit}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <CloseIcon size={11} />
                    </button>
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', maxWidth: '380px' }}>
                <input
                  type="text"
                  className="fc-builder-text-input"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  placeholder="Add custom criterion (e.g. Originality)..."
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCriterion(e);
                    }
                  }}
                />
                <button
                  type="button"
                  className="fc-btn fc-btn-outline fc-btn-sm"
                  onClick={handleAddCriterion}
                  style={{ whiteSpace: 'nowrap', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <AddIcon size={12} /> Add
                </button>
              </div>
            </div>
          )}

          {/* 7. Automated Filmmaker Notification */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>7. AUTOMATED NOTIFICATION (ADVANCEMENT DISPATCH)</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Automatically notify filmmakers when their project advances to this round.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <label className="fc-toggle-switch">
                <input
                  type="checkbox"
                  checked={notifyAcceptance}
                  onChange={(e) => setNotifyAcceptance(e.target.checked)}
                />
                <span className="fc-toggle-slider" />
              </label>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fc-text-main, #1c1917)' }}>
                {notifyAcceptance ? 'Notification Enabled' : 'Notification Disabled'}
              </span>
            </div>

            {notifyAcceptance && (
              <div className="fc-email-preview-box">
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#a82f2f', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  EMAIL DISPATCH TEMPLATE
                </div>
                <textarea
                  className="fc-builder-text-input"
                  rows={3}
                  value={acceptanceTemplate}
                  onChange={(e) => setAcceptanceTemplate(e.target.value)}
                  style={{ width: '100%', fontSize: '12.5px', lineHeight: 1.5 }}
                />
                <span style={{ fontSize: '11px', color: '#78716c', marginTop: '4px', display: 'block' }}>
                  Available merge tags: <code style={{ color: '#a82f2f' }}>{'{film_title}'}</code>, <code style={{ color: '#a82f2f' }}>{'{director_name}'}</code>, <code style={{ color: '#a82f2f' }}>{'{stage_name}'}</code>
                </span>
              </div>
            )}
          </div>

          {/* 9. Automated Filmmaker Rejection Notification */}
          <div className="fc-builder-section">
            <div className="fc-builder-section-title">
              <span>9. AUTOMATED NOTIFICATION (REJECTION DISPATCH)</span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#78716c' }}>
                Automatically notify filmmakers when their project is rejected from this round.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <label className="fc-toggle-switch">
                <input
                  type="checkbox"
                  checked={notifyRejection}
                  onChange={(e) => setNotifyRejection(e.target.checked)}
                />
                <span className="fc-toggle-slider" />
              </label>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fc-text-main, #1c1917)' }}>
                {notifyRejection ? 'Notification Enabled' : 'Notification Disabled'}
              </span>
            </div>

            {notifyRejection && (
              <div className="fc-email-preview-box">
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#a82f2f', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  REJECTION EMAIL DISPATCH TEMPLATE
                </div>
                <textarea
                  className="fc-builder-text-input"
                  rows={3}
                  value={rejectionTemplate}
                  onChange={(e) => setRejectionTemplate(e.target.value)}
                  style={{ width: '100%', fontSize: '12.5px', lineHeight: 1.5 }}
                />
                <span style={{ fontSize: '11px', color: '#78716c', marginTop: '4px', display: 'block' }}>
                  Available merge tags: <code style={{ color: '#a82f2f' }}>{'{film_title}'}</code>, <code style={{ color: '#a82f2f' }}>{'{director_name}'}</code>, <code style={{ color: '#a82f2f' }}>{'{stage_name}'}</code>
                </span>
              </div>
            )}
          </div>

        </div>

        {/* ── STICKY/BOTTOM ACTIONS BAR ──────────────────────────────────── */}
        <div className="fc-builder-actions-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#78716c' }}>
              {isEditMode ? `Updating Stage #${stageOrder} in the sequential pipeline.` : `Stage #${stageOrder} will be appended to the sequential review pipeline.`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="fc-btn fc-btn-outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fc-btn fc-btn-primary"
              style={{
                background: 'var(--fc-brand, #a82f2f)',
                color: '#ffffff',
                fontWeight: 700,
                padding: '10px 24px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(168, 47, 47, 0.25)'
              }}
              disabled={submitting}
            >
              {submitting ? (
                isEditMode ? 'Saving Stage...' : 'Creating Stage...'
              ) : isEditMode ? (
                <><CheckIcon size={14} /> Save Stage Configuration</>
              ) : (
                <><CheckIcon size={14} /> Create & Deploy Review-State</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
