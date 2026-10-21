import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import ScreenerVideoPlayer from '../components/submissions/ScreenerVideoPlayer';
import { StarIcon, StarBorderIcon, CheckCircleIcon, CheckIcon, CloseIcon } from '../components/common/Icons';

const DEFAULT_CRITERIA = [
  { key: 'screenplay', title: 'Screenplay', defaultScore: 4 },
  { key: 'dialogues', title: 'Dialogues', defaultScore: 4 },
  { key: 'writing', title: 'Writing', defaultScore: 4 },
  { key: 'structure', title: 'Structure', defaultScore: 4 },
  { key: 'direction', title: 'Direction', defaultScore: 4 },
  { key: 'acting', title: 'Acting', defaultScore: 4 },
  { key: 'cinematography', title: 'Cinematography', defaultScore: 4 },
  { key: 'production_design', title: 'Production design', defaultScore: 4 },
  { key: 'sound', title: 'Sound', defaultScore: 4 },
  { key: 'music', title: 'Music', defaultScore: 4 },
  { key: 'creativity', title: 'Creativity', defaultScore: 4 },
  { key: 'inspire', title: 'Did the film inspire you?', defaultScore: 4 },
  { key: 'message_importance', title: 'Importance of film message', defaultScore: 4 },
];

function InteractiveStarRating({ value, onChange, disabled }) {
  const [hoverVal, setHoverVal] = useState(0);

  return (
    <div className="fc-review-stars-wrap">
      <div className="fc-review-stars-group">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = (hoverVal || value || 0) >= star;
          return (
            <span
              key={star}
              className={`fc-review-star ${isFilled ? 'is-filled' : 'is-empty'} ${hoverVal === star ? 'is-hovered' : ''}`}
              onMouseEnter={() => !disabled && setHoverVal(star)}
              onMouseLeave={() => !disabled && setHoverVal(0)}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) onChange(star);
              }}
              title={`${star} Star${star > 1 ? 's' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer' }}
            >
              {isFilled ? <StarIcon size={18} /> : <StarBorderIcon size={18} />}
            </span>
          );
        })}
      </div>
      <span className="fc-review-score-badge">
        {value ? `${value}/5` : '0/5'}
      </span>
    </div>
  );
}

export default function FilmReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentFestival } = useFestivalConfig();

  const [film, setFilm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Scorecard state
  const [criteriaList, setCriteriaList] = useState(DEFAULT_CRITERIA);
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [assignmentId, setAssignmentId] = useState(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const successBannerRef = useRef(null);

  // Screener modal
  const [showScreenerModal, setShowScreenerModal] = useState(false);

  // Queue navigation (Next assigned film)
  const [nextFilm, setNextFilm] = useState(null);

  // 1. Fetch current film details
  useEffect(() => {
    let isMounted = true;
    async function loadFilm() {
      setLoading(true);
      setError(null);
      setSavedSuccess(false);

      try {
        const res = await api.get(`/submissions/${id}`, {
          headers: currentFestival?.id ? { 'X-Festival-Id': currentFestival.id } : {},
        });
        const filmData = res.data;
        if (!isMounted) return;

        setFilm(filmData);

        // Determine dynamic criteria from stage_criteria
        let activeCriteria = DEFAULT_CRITERIA;
        if (Array.isArray(filmData.stage_criteria) && filmData.stage_criteria.length > 0) {
          activeCriteria = filmData.stage_criteria.map((c) => ({
            key: c.criterion_key || c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            title: c.label,
            description: c.description,
            is_award_category: Boolean(c.is_award_category),
            defaultScore: 4,
          }));
        }
        setCriteriaList(activeCriteria);

        // Determine assignment & round
        const myUserId = user?.id;
        const myEmail = user?.email?.toLowerCase();

        // Check assigned jury / reviews
        const assignedList = filmData.assigned_jury || filmData.assigned_judges || [];
        const reviewsList = filmData.reviews || [];

        // Find match for current logged-in user
        const myAssignment = assignedList.find(
          (a) => a.jury_user_id === myUserId || a.jury_id === myUserId || (a.jury_email && a.jury_email.toLowerCase() === myEmail)
        );

        const myReview = reviewsList.find(
          (r) => r.jury_user_id === myUserId || r.jury_id === myUserId || (r.jury_email && r.jury_email.toLowerCase() === myEmail)
        );

        if (myAssignment) {
          setAssignmentId(myAssignment.assignment_id || myAssignment.id || null);
          setRoundNumber(myAssignment.round_number || filmData.current_round || 1);
        } else if (filmData.current_round) {
          setRoundNumber(filmData.current_round);
        }

        // Initialize score form values
        const initialScores = {};
        const existingCriteria = myReview?.criteria_scores || myAssignment?.criteria_scores || {};

        activeCriteria.forEach((c) => {
          let foundVal = existingCriteria[c.key];
          if (foundVal === undefined && c.aliases) {
            for (const alias of c.aliases) {
              if (existingCriteria[alias] !== undefined) {
                foundVal = existingCriteria[alias];
                break;
              }
            }
          }
          initialScores[c.key] = Number(foundVal) || c.defaultScore || 4;
        });

        setScores(initialScores);
        setNotes(myReview?.notes || myAssignment?.notes || '');
      } catch (err) {
        console.error('Failed to load film for review:', err);
        if (isMounted) setError(err.response?.data?.error || 'Film not found or access denied.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (id) {
      loadFilm();
    }

    return () => {
      isMounted = false;
    };
  }, [id, user?.id, user?.email, currentFestival?.id]);

  // 2. Load submission queue to determine Next Assigned Film
  useEffect(() => {
    async function loadQueue() {
      try {
        const res = await api.get('/submissions', {
          headers: currentFestival?.id ? { 'X-Festival-Id': currentFestival.id } : {},
        });
        const allFilms = res.data?.data || [];
        const currentId = parseInt(id, 10);

        const currentIndex = allFilms.findIndex((f) => f.id === currentId);
        if (currentIndex !== -1 && currentIndex < allFilms.length - 1) {
          const candidate = allFilms.slice(currentIndex + 1).find((f) => f.status !== 'Rejected');
          if (candidate) {
            setNextFilm(candidate);
          } else {
            setNextFilm(null);
          }
        } else {
          setNextFilm(null);
        }
      } catch {
        // queue fallback
      }
    }

    loadQueue();
  }, [id, currentFestival?.id]);

  const handleScoreChange = (key, val) => {
    setScores((prev) => ({ ...prev, [key]: val }));
    if (savedSuccess) setSavedSuccess(false);
  };

  const computedAverage = useMemo(() => {
    if (!criteriaList || criteriaList.length === 0) return '0.0';
    let total = 0;
    let count = 0;
    criteriaList.forEach((c) => {
      const val = scores[c.key];
      if (val !== undefined && val !== null && !isNaN(val) && Number(val) > 0) {
        total += Number(val);
        count++;
      }
    });
    return count > 0 ? (total / count).toFixed(1) : '0.0';
  }, [scores, criteriaList]);

  const handleSaveScore = async () => {
    try {
      setSubmitting(true);

      const activeScores = {};
      criteriaList.forEach((c) => {
        activeScores[c.key] = scores[c.key] || 4;
      });

      const payload = {
        assignment_id: assignmentId,
        film_id: parseInt(id, 10),
        round_number: roundNumber || 1,
        scores: activeScores,
        notes,
      };

      await api.post('/reviews/scorecard', payload, {
        headers: currentFestival?.id ? { 'X-Festival-Id': currentFestival.id } : {},
      });

      setSavedSuccess(true);
      setTimeout(() => {
        if (successBannerRef.current) {
          successBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    } catch (err) {
      console.error('Error saving score:', err);
      alert(err.response?.data?.error || 'Failed to save score. Please check your network connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const screenerUrl = film?.watch_link || film?.screener_url || film?.video_link || film?.vimeo_link || film?.youtube_link;

  if (loading) {
    return (
      <div className="fc-review-page-wrapper">
        <div className="fc-review-loading-card animate-fade-in">
          <div className="skeleton" style={{ height: '24px', width: '180px', marginBottom: '16px' }}></div>
          <div className="skeleton" style={{ height: '36px', width: '320px', marginBottom: '12px' }}></div>
          <div className="skeleton" style={{ height: '20px', width: '220px', marginBottom: '32px' }}></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ height: '110px', borderRadius: '10px' }}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !film) {
    return (
      <div className="fc-review-page-wrapper">
        <div className="fc-review-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚫</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--fc-text-main)', marginBottom: '8px' }}>
            Unable to Load Film
          </h2>
          <p style={{ color: 'var(--fc-text-muted)', fontSize: '0.9375rem', marginBottom: '24px' }}>
            {error || 'This submission could not be found or you do not have permission to view it.'}
          </p>
          <button
            type="button"
            className="fc-btn fc-btn-primary"
            onClick={() => navigate('/submissions')}
          >
            ← Back to Submissions
          </button>
        </div>
      </div>
    );
  }

  const isAwardCategoryMode = Boolean(
    film.is_award_category_stage ||
    roundNumber === 5 ||
    (film.current_stage_name && film.current_stage_name.toLowerCase().includes('jury')) ||
    criteriaList.some((c) => c.is_award_category)
  );

  const stageDisplay = isAwardCategoryMode
    ? 'Jury & Voting (Award Categories)'
    : (film.current_stage_name || (roundNumber === 2 ? 'Round 2: Consideration' : 'Round 1: Screening'));

  return (
    <div className="fc-review-page-wrapper animate-fade-in">
      {/* ── TOP BREADCRUMB BAR ── */}
      <div className="fc-review-top-bar">
        <Link to="/submissions" className="fc-review-back-link">
          ← Back to Submissions
        </Link>
        {nextFilm && (
          <button
            type="button"
            className="fc-review-next-btn-ghost"
            onClick={() => navigate(`/submissions/${nextFilm.id}/review`)}
            title={`Jump to next film: ${nextFilm.title}`}
          >
            Next: <span style={{ fontWeight: 600 }}>{nextFilm.title}</span> →
          </button>
        )}
      </div>


      {/* ── MAIN REVIEW CARD (MATCHES USER SCREENSHOT) ── */}
      <div className="fc-review-card">
        {/* Header Block */}
        <div className="fc-review-header-block">
          <div className="fc-review-title-row">
            <h1 className="fc-review-film-title">{film.title}</h1>
          </div>

          <div className="fc-review-film-subtitle">
            {film.director || 'Filmmaker'} · {film.runtime ? `${film.runtime} min` : '16 min'} · {film.category || 'Short Film'}
            {film.country ? ` · ${film.country}` : ''}
          </div>

          <div className="fc-review-screener-btn-wrap">
            <button
              type="button"
              className="fc-review-watch-btn"
              onClick={() => setShowScreenerModal(true)}
            >
              ▶ Watch Screener
            </button>
          </div>
        </div>

        <div className="fc-review-divider"></div>

        {/* Section Heading & Live Score */}
        <div className="fc-review-section-heading-row" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="fc-review-section-heading">
              Score this film — {stageDisplay}
            </h2>
            {isAwardCategoryMode && (
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
                Rate this film from 1 to 5 stars for each nominated award category below.
              </p>
            )}
          </div>
          <div className="fc-review-live-score-pill">
            <span className="fc-review-live-score-star" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <StarIcon size={14} />
            </span>
            <span className="fc-review-live-score-val">{computedAverage}</span>
            <span className="fc-review-live-score-scale">/ 5.0 Computed Avg</span>
          </div>
        </div>

        {/* 2-Column Criteria Grid */}
        <div className="fc-review-criteria-grid">
          {criteriaList.map((criterion) => {
            const currentScore = scores[criterion.key] || 0;
            return (
              <div key={criterion.key} className="fc-review-criterion-card">
                <div className="fc-review-criterion-header">
                  <div className="fc-review-criterion-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {criterion.is_award_category && (
                      <StarIcon size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                    )}
                    <span>{criterion.title}</span>
                    {criterion.is_award_category && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: 'rgba(217, 119, 6, 0.12)',
                        color: '#d97706',
                        letterSpacing: '0.04em'
                      }}>
                        Award
                      </span>
                    )}
                  </div>
                  <div className="fc-review-criterion-desc">{criterion.description || (criterion.is_award_category ? 'Nominated category excellence rating' : '')}</div>
                </div>
                <div className="fc-review-criterion-rating">
                  <InteractiveStarRating
                    value={currentScore}
                    onChange={(val) => handleScoreChange(criterion.key, val)}
                    disabled={submitting}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Review Critique Notes */}
        <div className="fc-review-notes-section">
          <label className="fc-review-notes-label" htmlFor="review-notes-input">
            Review Critique & Notes
          </label>
          <textarea
            id="review-notes-input"
            className="fc-review-notes-textarea"
            rows="4"
            placeholder="Your review notes..."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              if (savedSuccess) setSavedSuccess(false);
            }}
            disabled={submitting}
          />
        </div>

        {/* ── SUCCESS BANNER (RENDERED AT BOTTOM INSTEAD OF TOP) ── */}
        {savedSuccess && (
          <div ref={successBannerRef} className="fc-review-success-banner animate-fade-in">
            <div className="fc-review-success-content">
              <span className="fc-review-success-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                <CheckCircleIcon size={20} />
              </span>
              <div>
                <div className="fc-review-success-title">Scorecard Successfully Submitted!</div>
                <div className="fc-review-success-sub">
                  Your rating of <strong>{computedAverage} / 5.0</strong> has been officially recorded for "{film.title}".
                </div>
              </div>
            </div>
            <div className="fc-review-success-actions">
              {nextFilm ? (
                <button
                  type="button"
                  className="fc-btn fc-btn-sm"
                  style={{ background: '#166534', color: '#fff', fontWeight: 700 }}
                  onClick={() => navigate(`/submissions/${nextFilm.id}/review`)}
                >
                  Review Next Film ({nextFilm.title}) →
                </button>
              ) : null}
              <button
                type="button"
                className="fc-btn fc-btn-outline fc-btn-sm"
                onClick={() => navigate('/submissions')}
              >
                Back to Submissions
              </button>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="fc-review-bottom-actions">
          <button
            type="button"
            className="fc-review-save-btn"
            onClick={handleSaveScore}
            disabled={submitting}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            {submitting ? 'Saving...' : (savedSuccess ? <><CheckIcon size={14} /> Score Saved</> : 'Save Score')}
          </button>
          <button
            type="button"
            className="fc-review-cancel-btn"
            onClick={() => navigate('/submissions')}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── EMBEDDED VIDEO SCREENER MODAL (OPTION A) ── */}
      {showScreenerModal && (
        <div className="fc-screener-modal-backdrop animate-fade-in" onClick={() => setShowScreenerModal(false)}>
          <div className="fc-screener-modal-content animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="fc-screener-modal-header">
              <div className="fc-screener-modal-info">
                <span className="fc-screener-modal-title">{film.title}</span>
                <span className="fc-screener-modal-sub">
                  {film.director ? `Directed by ${film.director}` : ''} · {film.runtime ? `${film.runtime}m` : '16m'} · DRM Protected
                </span>
              </div>
              <button
                type="button"
                className="fc-screener-close-btn"
                onClick={() => setShowScreenerModal(false)}
                title="Close Screener"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="fc-screener-player-frame" style={{ padding: '4px' }}>
              <ScreenerVideoPlayer
                url={screenerUrl}
                password={film?.watch_link_password}
                title={film?.title}
                runtime={film?.runtime}
                autoPlay={true}
              />
            </div>

            <div className="fc-screener-modal-footer">
              <span style={{ fontSize: '12px', color: '#78716c' }}>
                Secure Jury Screening · Freecomers Festival Platform
              </span>
              <button
                type="button"
                className="fc-btn fc-btn-primary fc-btn-sm"
                onClick={() => setShowScreenerModal(false)}
              >
                Continue to Scorecard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
