import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';

const DEFAULT_CRITERIA_LIST = [
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

function StarRating({ value, onChange, disabled }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="fc-stars-row">
      <span className="fc-stars-value-num">{value > 0 ? value : '—'}</span>
      <div className="fc-stars-icons">
        {stars.map((s) => (
          <button
            key={s}
            type="button"
            className={`fc-star-btn ${s <= value ? 'filled' : ''}`}
            disabled={disabled}
            onClick={() => onChange && onChange(s)}
            title={`${s} star${s > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JudgeReviewDashboardShell({ onSwitchToAdmin }) {
  const [activeRound, setActiveRound] = useState(1);
  const [criteriaList, setCriteriaList] = useState(DEFAULT_CRITERIA_LIST);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [queueSearch, setQueueSearch] = useState('');

  // Form state
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    const fetchRoundCriteria = async () => {
      try {
        const res = await api.get('/settings/review-rounds');
        const targetRound = res.data.rounds?.find((r) => r.round_number === activeRound) || res.data.rounds?.[0];
        if (targetRound && targetRound.categories && targetRound.categories.length > 0) {
          setCriteriaList(targetRound.categories.map((c) => ({ key: c.criterion_key, label: c.label })));
        }
      } catch (err) {
        console.warn('Could not load dynamic criteria from settings, using default.');
      }
    };
    fetchRoundCriteria();
  }, [activeRound]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reviews/assignments', { params: { view: 'jury' } });
      const data = res.data.data || [];
      setAssignments(data);
      if (data.length > 0 && !selectedAssignmentId) {
        setSelectedAssignmentId(data[0].assignment_id);
      }
    } catch (err) {
      console.error('Failed to load jury assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const roundAssignments = useMemo(() => {
    return assignments.filter((a) => a.round_number === activeRound);
  }, [assignments, activeRound]);

  // When round changes, ensure the selected assignment points to one in this round
  useEffect(() => {
    if (roundAssignments.length > 0) {
      const exists = roundAssignments.some((a) => a.assignment_id === selectedAssignmentId);
      if (!exists) {
        setSelectedAssignmentId(roundAssignments[0].assignment_id);
      }
    }
  }, [roundAssignments, selectedAssignmentId]);

  const filteredQueue = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return roundAssignments;
    return roundAssignments.filter(
      (a) =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.director && a.director.toLowerCase().includes(q)) ||
        (a.jury_name && a.jury_name.toLowerCase().includes(q)) ||
        (a.judge_name && a.judge_name.toLowerCase().includes(q))
    );
  }, [roundAssignments, queueSearch]);

  const selectedAssignment = useMemo(() => {
    if (!selectedAssignmentId) return roundAssignments[0] || null;
    return roundAssignments.find((a) => a.assignment_id === selectedAssignmentId) || roundAssignments[0] || null;
  }, [roundAssignments, selectedAssignmentId]);

  // Sync form when selected assignment changes
  useEffect(() => {
    if (selectedAssignment) {
      if (selectedAssignment.scores) {
        setScores(selectedAssignment.scores);
      } else {
        const initial = {};
        criteriaList.forEach((c) => {
          initial[c.key] = 4;
        });
        setScores(initial);
      }
      setNotes(selectedAssignment.notes || '');
      setSubmitSuccess(false);
    }
  }, [selectedAssignment]);

  const handleScoreChange = (key, val) => {
    if (selectedAssignment?.isCompleted) return;
    setScores((prev) => ({ ...prev, [key]: val }));
  };

  const overallRating = useMemo(() => {
    const vals = Object.values(scores).map(Number).filter((v) => !isNaN(v) && v > 0);
    if (vals.length === 0) return 0;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }, [scores]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    setSubmitting(true);
    try {
      await api.post('/reviews/scorecard', {
        assignment_id: selectedAssignment.assignment_id,
        film_id: selectedAssignment.film_id,
        round_number: activeRound,
        scores,
        notes,
      });
      setSubmitSuccess(true);
      await fetchAssignments();
    } catch (err) {
      alert('Failed to submit review scorecard.');
    } finally {
      setSubmitting(false);
    }
  };

  const completedCount = roundAssignments.filter((a) => a.isCompleted).length;
  const isLocked = selectedAssignment?.isCompleted || submitSuccess;

  return (
    <div className="fc-judge-review-page animate-fade-in">
      {/* Top Instruction Banner (Matching Screenshot 1) */}
      <div className="fc-judge-top-strip">
        <span>Complete screening reviews for assigned films and cast your jury ballot when voting opens.</span>
        {onSwitchToAdmin && (
          <button type="button" className="fc-btn-link" onClick={onSwitchToAdmin}>
            Switch to Admin View ↗
          </button>
        )}
      </div>

      {/* Round Tabs */}
      <div className="fc-judge-round-tabs">
        <button
          type="button"
          className={`fc-judge-round-tab ${activeRound === 1 ? 'active' : ''}`}
          onClick={() => {
            setActiveRound(1);
            setSelectedFilmId(null);
          }}
        >
          Round 1 <span className="fc-judge-tab-badge">1</span>
        </button>
        <button
          type="button"
          className={`fc-judge-round-tab ${activeRound === 2 ? 'active' : ''}`}
          onClick={() => {
            setActiveRound(2);
            setSelectedFilmId(null);
          }}
        >
          Round 2 <span className="fc-judge-tab-badge">2</span>
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
          Loading assigned films...
        </div>
      ) : roundAssignments.length === 0 ? (
        <div className="fc-card" style={{ padding: '48px', textAlign: 'center', marginTop: '16px' }}>
          <p style={{ fontWeight: 600, color: 'var(--fc-text-main)' }}>No films assigned for Round {activeRound}</p>
          <p style={{ color: 'var(--fc-text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
            When the festival admin assigns films to your jury profile, they will appear here in your queue.
          </p>
        </div>
      ) : (
        <div className="fc-judge-layout">
          {/* Left Column: Assigned Films Queue */}
          <div className="fc-judge-queue-card">
            <div className="fc-judge-queue-header">
              <span className="fc-judge-queue-counter">
                Review {completedCount} of {roundAssignments.length}
              </span>
              <div className="fc-judge-queue-title">ROUND {activeRound} QUEUE</div>
              <input
                type="text"
                className="fc-judge-queue-search"
                placeholder="Search films..."
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
              />
            </div>

            <div className="fc-judge-queue-list">
              {filteredQueue.map((item) => {
                const isSelected = selectedAssignment?.assignment_id === item.assignment_id;
                return (
                  <div
                    key={item.assignment_id || `${item.film_id}-${item.round_number}`}
                    className={`fc-judge-queue-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedAssignmentId(item.assignment_id)}
                  >
                    <div className="fc-judge-queue-item-top">
                      <span className="fc-judge-queue-film-title">{item.title}</span>
                      {item.isCompleted ? (
                        <span className="fc-badge-completed">Completed</span>
                      ) : (
                        <span className="fc-badge-in-progress">In Progress</span>
                      )}
                    </div>
                    <div className="fc-judge-queue-film-meta">
                      <span style={{ fontWeight: 600, color: '#2563eb' }}>
                        Jury: {item.jury_name || item.judge_name || 'Jury Member'}
                      </span>
                      {' · '}{item.director || 'Filmmaker'} · {item.category || 'Short Film'} · {item.runtime ? `${item.runtime} min` : '15 min'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: 13-Criteria Scorecard Form */}
          <div className="fc-judge-form-card">
            {selectedAssignment ? (
              <form onSubmit={handleSubmitReview}>
                {/* Locked Banner if Review Submitted */}
                {isLocked && (
                  <div className="fc-judge-locked-banner">
                    <div>
                      <strong>Round {activeRound} review submitted. Scores and notes are locked.</strong>
                    </div>
                    <div style={{ fontSize: '0.82rem', marginTop: '2px', opacity: 0.85 }}>
                      Review is locked after submission.
                    </div>
                  </div>
                )}

                <div className="fc-judge-form-header">
                  <div className="fc-judge-form-title">Round {activeRound} Review</div>
                  <div className="fc-judge-form-subtitle">
                    <span>{selectedAssignment.title} · {selectedAssignment.director || 'Filmmaker'}</span>
                    <span style={{ marginLeft: '10px', padding: '3px 10px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', fontWeight: 600, fontSize: '0.82rem' }}>
                      Jury: {selectedAssignment.jury_name || selectedAssignment.judge_name || 'Jury Member'}
                    </span>
                  </div>
                </div>

                {/* 13-Criteria Star Rating List (Matching Screenshot 1) */}
                <div className="fc-criteria-star-list">
                  {criteriaList.map((crit) => (
                    <div key={crit.key} className="fc-criteria-star-row">
                      <span className="fc-criteria-star-label">{crit.label}</span>
                      <StarRating
                        value={scores[crit.key] || 0}
                        disabled={isLocked}
                        onChange={(val) => handleScoreChange(crit.key, val)}
                      />
                    </div>
                  ))}
                </div>

                {/* Overall Rating Live Average */}
                <div className="fc-overall-rating-card">
                  <div>
                    <div className="fc-overall-label">Overall Rating</div>
                    <div className="fc-overall-sublabel">Average of criteria</div>
                  </div>
                  <div className="fc-overall-stars-val">
                    <span className="fc-overall-num">{overallRating}</span>
                    <span className="fc-overall-stars">
                      {'★'.repeat(Math.round(overallRating))}
                      {'☆'.repeat(5 - Math.round(overallRating))}
                    </span>
                  </div>
                </div>

                {/* Review Notes Textarea */}
                <div className="fc-judge-notes-area">
                  <label className="fc-judge-notes-label">REVIEW NOTES (OPTIONAL)</label>
                  <textarea
                    className="fc-judge-notes-input"
                    rows={3}
                    placeholder="Enter confidential notes, highlights, or feedback..."
                    value={notes}
                    disabled={isLocked}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Submit Action */}
                {!isLocked && (
                  <div className="fc-judge-submit-area">
                    <button
                      type="submit"
                      className="fc-btn-submit-review"
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting...' : `Submit Round ${activeRound} Review`}
                    </button>
                  </div>
                )}
              </form>
            ) : (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                Select a film from the queue to start reviewing.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
