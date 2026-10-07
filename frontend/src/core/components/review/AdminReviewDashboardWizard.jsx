import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import FilmDetailDrawer from '../submissions/FilmDetailDrawer';

const PIPELINE_STEPS = [
  { key: 'screening', label: 'Round 1', phase: 'SCREENING', num: 1 },
  { key: 'selection', label: 'Official Selection', phase: 'SELECTION', num: 2 },
  { key: 'nominations', label: 'Nominations', phase: 'NOMINATIONS', num: 3 },
  { key: 'jury', label: 'Jury & Voting', phase: 'JURY', num: 4 },
  { key: 'results', label: 'Results', phase: 'RESULTS', num: 5 },
  { key: 'finals', label: 'Award Ledger', phase: 'FINALS', num: 6 },
];

const CRITERIA_KEYS = [
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

export default function AdminReviewDashboardWizard({ onSwitchToJudge, onSwitchToJury }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const subTab = searchParams.get('sub') || 'assign';
  const urlFilmId = searchParams.get('filmId');
  const paramRound = searchParams.get('round');

  const [activeRound, setActiveRound] = useState(paramRound ? parseInt(paramRound, 10) : 1);
  const [pipelineData, setPipelineData] = useState(null);
  const [juryList, setJuryList] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Film
  const [selectedFilmId, setSelectedFilmId] = useState(urlFilmId ? parseInt(urlFilmId, 10) : null);
  const [drawerFilm, setDrawerFilm] = useState(null);

  // Decisions Filter & Search
  const [decisionsFilter, setDecisionsFilter] = useState('all');
  const [decisionsSearch, setDecisionsSearch] = useState('');

  const fetchData = async (roundToFetch = activeRound) => {
    try {
      setLoading(true);
      const [pipeRes, judgesRes, flagsRes] = await Promise.all([
        api.get('/reviews/pipeline', { params: { round: roundToFetch } }),
        api.get('/reviews/jury').catch(() => api.get('/reviews/judges')),
        api.get('/submissions', { params: { limit: 1 } }),
      ]);
      setPipelineData(pipeRes.data);
      setJuryList(judgesRes.data?.data || []);
      setFlags(flagsRes.data?.flags || []);

      const films = pipeRes.data?.filmsInRound || [];
      if (films.length > 0) {
        if (!selectedFilmId || !films.some((f) => f.id === selectedFilmId)) {
          setSelectedFilmId(films[0].id);
        }
      } else {
        setSelectedFilmId(null);
      }
    } catch (err) {
      console.error('Failed to load review pipeline data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeRound);
  }, [activeRound]);

  const handleSwitchRound = (rNum) => {
    setActiveRound(rNum);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('round', rNum);
    setSearchParams(nextParams);
  };

  const setSubTab = (newSub) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('sub', newSub);
    setSearchParams(nextParams);
  };

  const handleSelectFilm = (id) => {
    setSelectedFilmId(id);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('filmId', id);
    setSearchParams(nextParams);
  };

  const filmsInRound = useMemo(() => {
    return pipelineData?.filmsInRound || [];
  }, [pipelineData]);

  const selectedFilm = useMemo(() => {
    if (!selectedFilmId) return filmsInRound[0] || null;
    return filmsInRound.find((f) => f.id === selectedFilmId) || filmsInRound[0] || null;
  }, [filmsInRound, selectedFilmId]);

  const handleOpenFilmDetails = async (film) => {
    if (!film) return;
    try {
      const res = await api.get(`/submissions/${film.id}`);
      setDrawerFilm(res.data);
    } catch (err) {
      setDrawerFilm(film);
    }
  };

  // Handle assigning/unassigning a jury member
  const handleToggleJuryAssignment = async (juryId) => {
    if (!selectedFilm) return;
    const currentJury = selectedFilm.assigned_jury_ids || selectedFilm.assigned_judge_ids || [];
    let updated;
    if (currentJury.includes(juryId)) {
      updated = currentJury.filter((id) => id !== juryId);
    } else {
      updated = [...currentJury, juryId];
    }

    // Optimistic update
    setPipelineData((prev) => {
      if (!prev) return prev;
      const updatedFilms = prev.filmsInRound.map((f) => {
        if (f.id === selectedFilm.id) {
          const assigned_jury = juryList
            .filter((j) => updated.includes(j.id))
            .map((j) => ({ id: j.id, jury_name: j.name, judge_name: j.name, status: 'assigned' }));
          return {
            ...f,
            assigned_jury_ids: updated,
            assigned_judge_ids: updated,
            assigned_jury,
            assigned_judges: assigned_jury,
          };
        }
        return f;
      });
      return { ...prev, filmsInRound: updatedFilms };
    });

    try {
      await api.post('/reviews/assign', {
        film_id: selectedFilm.id,
        round_number: activeRound,
        jury_ids: updated,
        judge_ids: updated,
      });
      await fetchData(activeRound);
      if (drawerFilm && drawerFilm.id === selectedFilm.id) {
        handleOpenFilmDetails(selectedFilm);
      }
    } catch (err) {
      alert('Failed to update jury assignment.');
    }
  };

  // Handle pipeline decision
  const handleMakeDecision = async (decision) => {
    if (!selectedFilm) return;
    try {
      await api.post('/reviews/decision', {
        film_id: selectedFilm.id,
        decision,
      });
      await fetchData(activeRound);
    } catch (err) {
      alert('Failed to apply decision.');
    }
  };

  // Filtering for Decisions tab
  const filteredDecisionsFilms = useMemo(() => {
    let list = filmsInRound;
    if (decisionsFilter === 'ready') {
      list = list.filter((f) => (f.reviews_count || 0) > 0);
    } else if (decisionsFilter === 'pending') {
      list = list.filter((f) => (f.reviews_count || 0) === 0 && f.status !== 'Rejected');
    } else if (decisionsFilter === 'rejected') {
      list = list.filter((f) => f.status === 'Rejected');
    }

    if (decisionsSearch.trim()) {
      const q = decisionsSearch.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          (f.director && f.director.toLowerCase().includes(q)) ||
          (f.email && f.email.toLowerCase().includes(q))
      );
    }
    return list;
  }, [filmsInRound, decisionsFilter, decisionsSearch]);

  const metrics = pipelineData?.metrics || {};
  const progressMatrix = pipelineData?.progressMatrix || [];

  return (
    <div className="fc-review-dashboard animate-fade-in">
      {/* Historical Alert Banner (Matching Screenshots) */}
      <div className="fc-notice-banner">
        <span>This step is complete. You're viewing the historical record.</span>
        {(onSwitchToJury || onSwitchToJudge) && (
          <button type="button" className="fc-btn-link" onClick={onSwitchToJury || onSwitchToJudge}>
            Switch to Jury View ↗
          </button>
        )}
      </div>

      {/* Top Pipeline Stepper */}
      <div className="fc-pipeline-stepper-card">
        <div className="fc-pipeline-stepper-list">
          {PIPELINE_STEPS.map((step, idx) => {
            const isCurrent = step.key === 'screening';
            const label = step.key === 'screening' ? `Round ${activeRound}` : step.label;
            return (
              <div
                key={step.key}
                className={`fc-stepper-step ${isCurrent ? 'current' : ''}`}
                style={{ cursor: step.key === 'screening' ? 'pointer' : 'default' }}
                onClick={() => step.key === 'screening' && handleSwitchRound(activeRound === 1 ? 2 : 1)}
                title={step.key === 'screening' ? `Currently viewing Round ${activeRound}. Click to toggle round.` : undefined}
              >
                <div className="fc-stepper-phase">{step.phase}</div>
                <div className="fc-stepper-circle-row">
                  {idx > 0 && <span className="fc-stepper-line left" />}
                  <span className={`fc-stepper-circle ${isCurrent ? 'active' : ''}`}>
                    {step.num}
                  </span>
                  {idx < PIPELINE_STEPS.length - 1 && <span className="fc-stepper-line right" />}
                </div>
                <div className={`fc-stepper-label ${isCurrent ? 'active' : ''}`}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Header & Stats */}
      <div className="fc-step-header-area">
        <div className="fc-step-header-top-row">
          <div>
            <h2 className="fc-step-main-title">
              Round {activeRound} screening
            </h2>
            <div className="fc-step-sub-title">
              {subTab === 'assign'
                ? 'Step 1 of 3 · Assign reviewers'
                : subTab === 'scores'
                ? 'Step 2 of 3 · Review scores'
                : 'Step 3 of 3 · Advance or reject'}
            </div>
          </div>

          {/* Clean Segmented Pill Switcher for Rounds */}
          <div className="fc-round-switcher-pills">
            <button
              type="button"
              className={`fc-round-pill ${activeRound === 1 ? 'active' : ''}`}
              onClick={() => handleSwitchRound(1)}
            >
              <span>Round 1</span>
              <span className="fc-round-pill-badge">
                {metrics.round1_assigned || 0}
              </span>
            </button>
            <button
              type="button"
              className={`fc-round-pill ${activeRound === 2 ? 'active' : ''}`}
              onClick={() => handleSwitchRound(2)}
            >
              <span>Round 2</span>
              <span className="fc-round-pill-badge">
                {metrics.round2_assigned || 0}
              </span>
            </button>
          </div>
        </div>
        <p className="fc-step-description">
          {subTab === 'assign'
            ? `Assign reviewers to ${filmsInRound.length} films in Round ${activeRound}`
            : subTab === 'scores'
            ? `Evaluate jury scorecards, aggregate criteria points, and track review progress for Round ${activeRound}`
            : `Review scores and advance or reject ${filmsInRound.length} films in Round ${activeRound}`}
        </p>

        <div className="fc-step-stats-strip">
          {activeRound === 1 ? (
            <>
              <span>{metrics.round1_pending || 0} films need at least one reviewer assigned, or mark rejected.</span>
              <span style={{ color: 'var(--fc-text-muted)' }}>
                {metrics.total_films || filmsInRound.length} in round · {metrics.round1_assigned || 0} assigned ·{' '}
                {metrics.round1_completed || 0} reviews in · {metrics.round1_pending || 0} pending decisions
              </span>
            </>
          ) : (
            <>
              <span>{metrics.round2_assigned || 0} films assigned to Round 2 reviewers.</span>
              <span style={{ color: 'var(--fc-text-muted)' }}>
                {metrics.round2_assigned || 0} in round · {metrics.round2_completed || 0} reviews completed ·{' '}
                {Math.max(0, (metrics.round2_assigned || 0) - (metrics.round2_completed || 0))} pending reviews
              </span>
            </>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs: 1. Assign, 2. Scores, 3. Decisions */}
      <div className="fc-review-sub-tabs">
        <button
          type="button"
          className={`fc-sub-tab-btn ${subTab === 'assign' ? 'active' : ''}`}
          onClick={() => setSubTab('assign')}
        >
          1. Assign
        </button>
        <button
          type="button"
          className={`fc-sub-tab-btn ${subTab === 'scores' ? 'active' : ''}`}
          onClick={() => setSubTab('scores')}
        >
          2. Scores
        </button>
        <button
          type="button"
          className={`fc-sub-tab-btn ${subTab === 'decisions' ? 'active' : ''}`}
          onClick={() => setSubTab('decisions')}
        >
          3. Decisions
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
          Loading review workspace...
        </div>
      ) : filmsInRound.length === 0 ? (
        <div className="fc-card" style={{ padding: '48px', textAlign: 'center', marginTop: '16px' }}>
          No films currently in this screening round.
        </div>
      ) : (
        <div className="fc-review-split-layout">
          {/* Left Rail: FILMS IN ROUND (Matching Screenshot 2 & 3) */}
          <div className="fc-films-rail-card">
            <div className="fc-films-rail-header">FILMS IN ROUND</div>
            <div className="fc-films-rail-list">
              {filmsInRound.map((film) => {
                const isSelected = selectedFilm?.id === film.id;
                return (
                  <div
                    key={film.id}
                    className={`fc-films-rail-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectFilm(film.id)}
                  >
                    <div className="fc-rail-item-title">{film.title}</div>
                    <div className="fc-rail-item-dir">{film.director || 'Filmmaker'}</div>
                    <div className="fc-rail-item-badge-row">
                      <span className={`fc-status-badge fc-status-${(film.status || 'submitted').toLowerCase().replace(/\s+/g, '-')}`}>
                        {film.status || 'Submitted'}
                      </span>
                      {film.flag_label && (
                        <span
                          className="fc-flag-indicator"
                          style={{
                            backgroundColor: `${film.flag_color || '#3b82f6'}20`,
                            color: film.flag_color || '#3b82f6',
                            borderColor: `${film.flag_color || '#3b82f6'}40`,
                          }}
                        >
                          {film.flag_label}
                        </span>
                      )}
                      {(film.reviews_count || 0) > 0 && (
                        <span className="fc-reviews-counter-pill">
                          {film.reviews_count} review{film.reviews_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Area: Dynamic per Sub-Tab */}
          <div className="fc-review-workspace-main">
            {/* ── Sub-Tab 1: ASSIGN REVIEWERS (Matching Screenshot 2) ── */}
            {subTab === 'assign' && (
              <div className="fc-card" style={{ padding: '24px' }}>
                {selectedFilm ? (
                  <div>
                    <div className="fc-assign-film-header">
                      <div>
                        <h3 className="fc-assign-film-title">Jury assignment · {selectedFilm.title}</h3>
                        <p className="fc-assign-film-director">{selectedFilm.director || 'Filmmaker'}</p>
                      </div>
                      <button
                        type="button"
                        className="fc-btn-view-details"
                        onClick={() => handleOpenFilmDetails(selectedFilm)}
                      >
                        View details
                      </button>
                    </div>

                    <div className="fc-assign-box">
                      <div className="fc-assign-box-title">Reviewers: Assign reviewers</div>
                      <div className="fc-assign-checkboxes-list">
                        {juryList.length === 0 ? (
                          <div style={{ color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
                            No jury members configured in team yet. Assign users to the "Jury" group in Team Management.
                          </div>
                        ) : (
                          juryList.map((juryMember) => {
                            const isAssigned = (selectedFilm.assigned_jury_ids || selectedFilm.assigned_judge_ids || []).includes(juryMember.id);
                            return (
                              <label key={juryMember.id} className="fc-assign-checkbox-item">
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={() => handleToggleJuryAssignment(juryMember.id)}
                                />
                                <span>{juryMember.name || juryMember.email}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                    Select a film from the rail to manage reviewer assignments.
                  </div>
                )}
              </div>
            )}

            {/* ── Sub-Tab 2: SCORES (Matching Screenshot 2 & Mockup) ── */}
            {subTab === 'scores' && (
              <div className="fc-scores-view-stack">
                {selectedFilm && (
                  <div className="fc-card" style={{ padding: '24px' }}>
                    <div className="fc-assign-film-header">
                      <div>
                        <h3 className="fc-assign-film-title">{selectedFilm.title}</h3>
                        <p className="fc-assign-film-director">
                          {selectedFilm.director || 'Filmmaker'} · {selectedFilm.country || 'India'} ·{' '}
                          {selectedFilm.runtime ? `${selectedFilm.runtime} min` : '15 min'} ·{' '}
                          {selectedFilm.category || 'Short Film'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="fc-btn-view-details"
                          onClick={() => handleOpenFilmDetails(selectedFilm)}
                        >
                          View details
                        </button>
                        <span className={`fc-status-badge fc-status-${(selectedFilm.status || 'submitted').toLowerCase().replace(/\s+/g, '-')}`}>
                          {selectedFilm.status || 'Submitted'}
                        </span>
                      </div>
                    </div>

                    {/* Criteria Scorecard Grid */}
                    <div className="fc-round1-summary-section">
                      <div className="fc-round1-summary-heading">ROUND {activeRound} SUMMARY</div>
                      <div className="fc-criteria-2col-grid">
                        {CRITERIA_KEYS.map((crit) => {
                          const val = selectedFilm.criteria_averages?.[crit.key];
                          return (
                            <div key={crit.key} className="fc-crit-row">
                              <span className="fc-crit-name">{crit.label}</span>
                              <span className="fc-crit-score">{val ? `${val}/5` : '--/5'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 10 Summary Metric Cards (2 rows of 5 cards) */}
                <div className="fc-metrics-10-grid">
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">TOTAL FILMS</span>
                    <span className="fc-metric-val">{metrics.total_films || filmsInRound.length}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">ROUND-1 ASSIGNED</span>
                    <span className="fc-metric-val">{metrics.round1_assigned || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">ROUND-1 COMPLETED</span>
                    <span className="fc-metric-val">{metrics.round1_completed || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">ROUND-1 PENDING</span>
                    <span className="fc-metric-val">{metrics.round1_pending || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">CONSIDERATION</span>
                    <span className="fc-metric-val">{metrics.consideration || 0}</span>
                  </div>

                  <div className="fc-metric-card">
                    <span className="fc-metric-title">ROUND-2 ASSIGNED</span>
                    <span className="fc-metric-val">{metrics.round2_assigned || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">ROUND-2 COMPLETED</span>
                    <span className="fc-metric-val">{metrics.round2_completed || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">FINALISTS</span>
                    <span className="fc-metric-val">{metrics.finalists || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">WINNERS</span>
                    <span className="fc-metric-val">{metrics.winners || 0}</span>
                  </div>
                  <div className="fc-metric-card">
                    <span className="fc-metric-title">REJECTED</span>
                    <span className="fc-metric-val">{metrics.rejected || 0}</span>
                  </div>
                </div>

                {/* Jury Progress Matrix Table (Matching Screenshot 2) */}
                <div className="fc-card" style={{ padding: '20px', marginTop: '16px' }}>
                  <h4 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 600 }}>
                    Jury Progress Matrix
                  </h4>
                  <div className="table-responsive">
                    <table className="fc-table">
                      <thead>
                        <tr>
                          <th>FILM ↑</th>
                          <th>STATUS</th>
                          <th>ROUND 1 REVIEWS</th>
                          <th>ROUND 2 REVIEWS</th>
                          <th>OVERALL AVG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressMatrix.map((item) => (
                          <tr
                            key={item.id}
                            className="fc-table-row-clickable"
                            onClick={() => handleSelectFilm(item.id)}
                          >
                            <td style={{ fontWeight: 600 }}>{item.title}</td>
                            <td>
                              <span className={`fc-status-badge fc-status-${(item.status || 'submitted').toLowerCase().replace(/\s+/g, '-')}`}>
                                {item.status || 'Submitted'}
                              </span>
                            </td>
                            <td>{item.round1_reviews}</td>
                            <td>{item.round2_reviews}</td>
                            <td>{item.overall_avg ? item.overall_avg : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Sub-Tab 3: DECISIONS (Matching Screenshot 3) ── */}
            {subTab === 'decisions' && (
              <div className="fc-card" style={{ padding: '24px' }}>
                {/* Search & Status Filter Pills */}
                <div className="fc-decisions-toolbar">
                  <input
                    type="text"
                    className="fc-decisions-search"
                    placeholder="Search title, director, email..."
                    value={decisionsSearch}
                    onChange={(e) => setDecisionsSearch(e.target.value)}
                  />
                  <div className="fc-decisions-pills">
                    <button
                      type="button"
                      className={`fc-dec-pill ${decisionsFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setDecisionsFilter('all')}
                    >
                      All <span className="fc-dec-count">{filmsInRound.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`fc-dec-pill ${decisionsFilter === 'ready' ? 'active' : ''}`}
                      onClick={() => setDecisionsFilter('ready')}
                    >
                      Ready <span className="fc-dec-count">{metrics.round1_completed || 0}</span>
                    </button>
                    <button
                      type="button"
                      className={`fc-dec-pill ${decisionsFilter === 'pending' ? 'active' : ''}`}
                      onClick={() => setDecisionsFilter('pending')}
                    >
                      Pending <span className="fc-dec-count">{metrics.round1_pending || 0}</span>
                    </button>
                    <button
                      type="button"
                      className={`fc-dec-pill ${decisionsFilter === 'rejected' ? 'active' : ''}`}
                      onClick={() => setDecisionsFilter('rejected')}
                    >
                      Rejected <span className="fc-dec-count">{metrics.rejected || 0}</span>
                    </button>
                  </div>
                </div>

                {selectedFilm ? (
                  <div style={{ marginTop: '20px' }}>
                    <div className="fc-assign-film-header">
                      <div>
                        <h3 className="fc-assign-film-title">{selectedFilm.title}</h3>
                        <p className="fc-assign-film-director">
                          {selectedFilm.director || 'Filmmaker'} · {selectedFilm.country || 'India'} ·{' '}
                          {selectedFilm.runtime ? `${selectedFilm.runtime} min` : '15 min'} ·{' '}
                          {selectedFilm.category || 'Short Film'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="fc-btn-view-details"
                          onClick={() => handleOpenFilmDetails(selectedFilm)}
                        >
                          View details
                        </button>
                        <span className={`fc-status-badge fc-status-${(selectedFilm.status || 'submitted').toLowerCase().replace(/\s+/g, '-')}`}>
                          {selectedFilm.status || 'Submitted'}
                        </span>
                      </div>
                    </div>

                    {/* Criteria Summary */}
                    <div className="fc-round1-summary-section" style={{ marginTop: '16px' }}>
                      <div className="fc-round1-summary-heading">ROUND {activeRound} SUMMARY</div>
                      <div className="fc-criteria-2col-grid">
                        {CRITERIA_KEYS.map((crit) => {
                          const val = selectedFilm.criteria_averages?.[crit.key];
                          return (
                            <div key={crit.key} className="fc-crit-row">
                              <span className="fc-crit-name">{crit.label}</span>
                              <span className="fc-crit-score">{val ? `${val}/5` : '--/5'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Decision Action Controls */}
                    <div className="fc-decisions-actions-box">
                      <div className="fc-decision-actions-title">Pipeline Decision Action:</div>
                      <div className="fc-decision-btn-group">
                        {activeRound === 1 ? (
                          <>
                            <button
                              type="button"
                              className="fc-btn-decision advance"
                              onClick={() => handleMakeDecision('advance_round_2')}
                            >
                              ✦ Advance to Round 2
                            </button>
                            <button
                              type="button"
                              className="fc-btn-decision selection"
                              onClick={() => handleMakeDecision('official_selection')}
                            >
                              Official Selection
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="fc-btn-decision selection"
                            style={{ background: '#16a34a', borderColor: '#16a34a' }}
                            onClick={() => handleMakeDecision('official_selection')}
                          >
                            ✓ Mark Official Selection
                          </button>
                        )}
                        <button
                          type="button"
                          className="fc-btn-decision consider"
                          onClick={() => handleMakeDecision('consideration')}
                        >
                          Mark Consideration
                        </button>
                        <button
                          type="button"
                          className="fc-btn-decision reject"
                          onClick={() => handleMakeDecision('rejected')}
                        >
                          Reject Film
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                    Select a film to make an advancement or rejection decision.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-over Film Details Drawer */}
      {drawerFilm && (
        <FilmDetailDrawer
          film={drawerFilm}
          flags={flags}
          onClose={() => setDrawerFilm(null)}
          onReject={(filmToReject) => handleMakeDecision('rejected')}
          onUpdateFilm={(updated) => {
            setDrawerFilm(updated);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
