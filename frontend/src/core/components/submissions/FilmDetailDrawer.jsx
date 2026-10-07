import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const STANDARD_FLAGS = [
  { id: 'none', label: 'None', color: '#94a3b8' },
  { id: 'flag-high-priority', label: 'High Priority', color: '#e05252' },
  { id: 'flag-needs-review', label: 'Needs Review', color: '#d97706' },
  { id: 'flag-strong-contender', label: 'Strong Contender', color: '#10b981' },
  { id: 'flag-special-interest', label: 'Special Interest', color: '#3b82f6' },
];

const LIFECYCLE_STAGES = [
  { id: 'submitted', label: 'Submitted', statuses: ['Submitted'] },
  { id: 'round1', label: 'Round 1 screening', statuses: ['Round 1 Screening', 'In Review', 'under review'] },
  { id: 'admin_review', label: 'Admin review', statuses: ['Admin Review', 'Consideration'] },
  { id: 'round2', label: 'Round 2 screening', statuses: ['Round 2 Screening'] },
  { id: 'official_selection', label: 'Official Selection', statuses: ['Official Selection', 'accepted'] },
  { id: 'awards', label: 'Awards', statuses: ['Winner', 'Finalist'] },
];

const CRITERIA_DEFINITIONS = [
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
  { key: 'message_importance', label: 'Importance of film message' },
];

const renderStarRating = (score) => {
  const count = Math.round(Number(score) || 0);
  const filled = Math.max(0, Math.min(5, count));
  const empty = Math.max(0, 5 - filled);
  return (
    <span className="fc-stars-container" style={{ letterSpacing: '2px', fontSize: '0.85rem' }}>
      <span style={{ color: '#eab308' }}>{'★'.repeat(filled)}</span>
      <span style={{ color: '#e2e8f0' }}>{'★'.repeat(empty)}</span>
    </span>
  );
};

export default function FilmDetailDrawer({
  film,
  onClose,
  onReject,
  onUpdateFilm,
  flags = [],
}) {
  const navigate = useNavigate();
  const [activeFilm, setActiveFilm] = useState(film);
  const [flagId, setFlagId] = useState(film?.flag_id || 'none');
  const [flagLoading, setFlagLoading] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState({});

  // Advance / Assign State
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showR1AssignModal, setShowR1AssignModal] = useState(false);
  const [availableJudges, setAvailableJudges] = useState([]);
  const [selectedR2JudgeIds, setSelectedR2JudgeIds] = useState([]);
  const [selectedR1JudgeIds, setSelectedR1JudgeIds] = useState([]);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

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
          .catch(() => {});
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

  // Determine current lifecycle index
  let activeStageIndex = 0;
  LIFECYCLE_STAGES.forEach((stage, idx) => {
    if (stage.statuses.some((s) => s.toLowerCase() === (activeFilm.status || '').toLowerCase())) {
      activeStageIndex = idx;
    }
  });

  // If status is 'Admin Review' but the film has already gone through Round 2 screening
  if (activeFilm.status === 'Admin Review' && hasRound2) {
    activeStageIndex = 3;
  }

  const allFlagsList = flags.length > 0 ? flags : STANDARD_FLAGS;

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

  // Assign Reviewers to Round 1
  const handleAssignToRound1 = async () => {
    try {
      setAdvanceLoading(true);
      await api.post('/reviews/assign', {
        film_id: activeFilm.id,
        round_number: 1,
        judge_ids: selectedR1JudgeIds,
      });
      const res = await api.get(`/submissions/${activeFilm.id}`);
      const updated = res.data || { ...activeFilm, status: 'Round 1 Screening' };
      setActiveFilm(updated);
      setShowR1AssignModal(false);
      setActionSuccessMsg('Reviewers assigned for Round 1 screening!');
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
    const isExpanded = expandedReviews[cardKey];
    const isCompleted = item.status === 'completed' || item.overall_rating != null;
    const juryName = item.jury_name || item.judge_name || item.name || 'Jury Member';

    return (
      <div key={cardKey} className="fc-drawer-review-card">
        <div className="fc-drawer-review-header" onClick={() => toggleReviewExpand(cardKey)}>
          <div className="fc-drawer-review-left">
            <span className="fc-drawer-review-judge">{juryName}</span>
            {isCompleted && (
              <>
                <span className="fc-drawer-review-done-pill">Done</span>
                {item.overall_rating && (
                  <span className="fc-drawer-review-score">
                    {parseFloat(item.overall_rating).toFixed(1)}/5
                  </span>
                )}
              </>
            )}
          </div>
          <button type="button" className="fc-drawer-review-expand-btn">
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {isExpanded && (
          <div className="fc-drawer-review-details">
            {isCompleted ? (
              <>
                {item.criteria_scores && (
                  <div className="fc-drawer-criteria-list">
                    {CRITERIA_DEFINITIONS.map((crit) => {
                      const score = item.criteria_scores[crit.key];
                      if (score == null) return null;
                      return (
                        <div key={crit.key} className="fc-drawer-crit-row">
                          <span className="fc-drawer-crit-title">{crit.label}</span>
                          {renderStarRating(score)}
                        </div>
                      );
                    })}
                  </div>
                )}
                {item.notes && (
                  <div className="fc-drawer-review-quote">
                    "{item.notes}"
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--fc-text-muted)', fontSize: '0.82rem', fontStyle: 'italic', padding: '6px 0' }}>
                Awaiting screening review submission from {juryName}.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
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
          <button type="button" className="fc-drawer-close-btn" onClick={onClose} title="Close drawer">
            ✕
          </button>
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
                  .filter((f) => f.id !== 'none')
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Synopsis */}
          {activeFilm.synopsis && (
            <div className="fc-drawer-section">
              <p className="fc-drawer-synopsis">{activeFilm.synopsis}</p>
            </div>
          )}

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
                  <td className="fc-drawer-meta-value">{activeFilm.category || '—'}</td>
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
            <label className="fc-drawer-field-label">LIFECYCLE</label>
            <div className="fc-lifecycle-track">
              {LIFECYCLE_STAGES.map((stage, idx) => {
                const isPast = !isRejected && idx < activeStageIndex;
                const isCurrent = !isRejected && idx === activeStageIndex;

                return (
                  <div key={stage.id} className="fc-lifecycle-step">
                    <div className="fc-lifecycle-node-col">
                      <span
                        className={`fc-lifecycle-dot ${
                          isCurrent ? 'current' : isPast ? 'completed' : isRejected && idx === 0 ? 'rejected' : 'upcoming'
                        }`}
                      />
                      {idx < LIFECYCLE_STAGES.length - 1 && (
                        <span className={`fc-lifecycle-line ${isPast ? 'completed' : ''}`} />
                      )}
                    </div>
                    <div className="fc-lifecycle-label-col">
                      <span
                        className={`fc-lifecycle-label ${
                          isCurrent ? 'current' : isPast ? 'completed' : isRejected ? 'rejected-label' : 'upcoming'
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
                  <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#64748b' }}>
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
              <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--fc-surface-card)', border: '1px dashed var(--fc-border)', color: 'var(--fc-text-muted)', fontSize: '0.82rem' }}>
                No reviewers assigned to this round yet.
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
            <div style={{ padding: '8px 12px', marginBottom: '10px', borderRadius: '6px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>
              ✓ {actionSuccessMsg}
            </div>
          )}

          {isRejected ? (
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
          ) : activeFilm.status === 'Submitted' ? (
            <div className="fc-drawer-footer-actions">
              <button
                type="button"
                className="fc-btn-advance-primary"
                onClick={() => setShowR1AssignModal(true)}
                disabled={advanceLoading}
              >
                + Assign to Round 1 Screening
              </button>
              <div className="fc-drawer-secondary-actions">
                <button
                  type="button"
                  className="fc-btn-reject-drawer"
                  style={{ width: '100%' }}
                  onClick={() => {
                    onClose();
                    if (onReject) onReject(activeFilm);
                  }}
                >
                  Reject Film
                </button>
              </div>
            </div>
          ) : activeFilm.status === 'Official Selection' ? (
            <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', borderRadius: '8px', fontWeight: 600, fontSize: '0.88rem' }}>
              ✓ Officially Selected for Festival
            </div>
          ) : (
            <div className="fc-drawer-footer-actions">
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
                            <div className="fc-advance-judge-avatar">
                              {(judge.name || judge.email || 'J').charAt(0).toUpperCase()}
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
                              onChange={() => {}}
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
              <h3 className="fc-advance-modal-title">Assign to Round 1 Screening</h3>
              <button
                type="button"
                className="fc-drawer-close-btn"
                onClick={() => setShowR1AssignModal(false)}
              >
                ✕
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
                            <div className="fc-advance-judge-avatar">
                              {(judge.name || judge.email || 'J').charAt(0).toUpperCase()}
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
                              onChange={() => {}}
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
                {advanceLoading ? 'Assigning...' : `Assign Reviewers (${selectedR1JudgeIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
