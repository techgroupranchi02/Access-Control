/**
 * VotingPage Component (/voting)
 * 
 * Audience Choice Voting Hub & Official Tabulation:
 * - Screening Voting Windows Controller (open/close balloting, countdown timer)
 * - Fullscreen Projected Screen QR Modal for projectionists
 * - Real-Time Audience Choice Leaderboard (Bayesian Weighted Scoring & Results Approval Workflow)
 * - Fraud Inspector & Vote Moderation Deck (voiding suspicious entries)
 * - Kashish External API Sync Deck (live sync with kashish-admin.vercel.app, movie & user mappings)
 * - Delegate Reviews & Community Moderation Deck (Phase 7)
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  MovieIcon, 
  TrophyIcon, 
  ShieldIcon, 
  SyncIcon, 
  PlaceIcon, 
  ScheduleIcon, 
  PlayArrowIcon, 
  QrCodeScannerIcon, 
  StopIcon, 
  CheckCircleIcon, 
  WarningIcon,
  StarIcon,
  DeleteIcon,
  SearchIcon
} from '../components/common/Icons';

// Helper to format screening date and times safely
const formatScreeningSchedule = (dateStr, startStr, endStr) => {
  const formatTime = (t) => {
    if (!t) return '';
    const parts = String(t).split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parts[1];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    }
    return t;
  };
  const dateFormatted = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const timeFormatted = (startStr || endStr) ? `${formatTime(startStr)} – ${formatTime(endStr)}` : '';
  return [dateFormatted, timeFormatted].filter(Boolean).join(' · ');
};

export default function VotingPage() {
  const [activeTab, setActiveTab] = useState('controller'); // 'controller' | 'leaderboard' | 'fraud' | 'kashish' | 'reviews'
  const [screenings, setScreenings] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [approvalStatus, setApprovalStatus] = useState({ is_approved: false, approved_at: null, approved_by: null });
  const [flaggedVotes, setFlaggedVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  // Kashish Sync State
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [movieMappings, setMovieMappings] = useState([]);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [userMappings, setUserMappings] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [newMapping, setNewMapping] = useState({
    kashish_movie_id: '',
    kashish_movie_title: '',
    freecomers_submission_id: ''
  });
  const [savingMapping, setSavingMapping] = useState(false);

  // Delegate Reviews State (Phase 7)
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [reviewSearch, setReviewSearch] = useState('');
  const [pendingReviewsCount, setPendingReviewsCount] = useState(0);

  // Projected Screen QR Modal
  const [projectorModal, setProjectorModal] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [screeningsRes, leaderRes, flaggedRes] = await Promise.all([
        api.get('/audience/screenings'),
        api.get('/voting/leaderboard'),
        api.get('/voting/flagged')
      ]);
      setScreenings(screeningsRes.data.screenings || []);
      setLeaderboard(leaderRes.data.leaderboard || []);
      setApprovalStatus(leaderRes.data.approval || { is_approved: false });
      setFlaggedVotes(flaggedRes.data.flagged || []);

      // Check pending reviews count
      api.get('/audience/reviews/moderation', { params: { status: 'pending' } })
        .then(res => {
          if (res.data?.reviews) setPendingReviewsCount(res.data.reviews.length);
        })
        .catch(() => {});
    } catch (err) {
      console.error('Failed to load voting data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKashishData = async () => {
    try {
      const [mappingRes, logsRes, userRes] = await Promise.all([
        api.get('/kashish-sync/movie-mappings'),
        api.get('/kashish-sync/sync-logs'),
        api.get('/kashish-sync/user-mappings?limit=50')
      ]);
      setMovieMappings(mappingRes.data.mappings || []);
      setSubmissionsList(mappingRes.data.submissions || []);
      setSyncLogs(logsRes.data.logs || []);
      setUserMappings(userRes.data.mappings || []);
    } catch (err) {
      console.error('Failed to load Kashish sync data:', err);
    }
  };

  const fetchModerationReviews = async () => {
    try {
      setReviewsLoading(true);
      const res = await api.get('/audience/reviews/moderation', {
        params: {
          status: reviewStatusFilter,
          search: reviewSearch
        }
      });
      setReviews(res.data.reviews || []);
      const pendingRes = await api.get('/audience/reviews/moderation', {
        params: { status: 'pending' }
      });
      if (pendingRes.data?.reviews) {
        setPendingReviewsCount(pendingRes.data.reviews.length);
      }
    } catch (err) {
      console.error('Failed to load delegate reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'kashish') {
      fetchKashishData();
    } else if (activeTab === 'reviews') {
      fetchModerationReviews();
    }
  }, [activeTab, reviewStatusFilter, reviewSearch]);

  const handleOpenVoting = async (blockId) => {
    try {
      const res = await api.post(`/audience/screenings/${blockId}/open-voting`);
      setScreenings(screenings.map(s => s.id === blockId ? { ...s, voting_status: 'open', qr_token: res.data.qr_token } : s));
      alert('Voting window is now OPEN! Projectionists can now display the QR code on screen.');
    } catch (err) {
      alert('Failed to open voting window.');
    }
  };

  const handleCloseVoting = async (blockId) => {
    if (!window.confirm('Close voting window for this session and finalize ballot calculation?')) return;
    try {
      await api.post(`/audience/screenings/${blockId}/close-voting`);
      setScreenings(screenings.map(s => s.id === blockId ? { ...s, voting_status: 'closed' } : s));
      fetchData(); // refresh leaderboard
      alert('Voting window CLOSED. Leaderboard recalculated.');
    } catch (err) {
      alert('Failed to close voting window.');
    }
  };

  const handleVoidVote = async (voteId) => {
    const reason = window.prompt('Reason for voiding this vote (audit record):', 'Duplicate device concentration');
    if (!reason) return;

    try {
      await api.post('/voting/void-vote', { vote_id: voteId, reason });
      setFlaggedVotes(flaggedVotes.filter(v => v.vote_id !== voteId));
      fetchData(); // refresh scores
      alert('Vote voided.');
    } catch (err) {
      alert('Failed to void vote.');
    }
  };

  const handleApproveResults = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to approve and publish the official Audience Choice Award standings?\n\n' +
      'This will certify the scores and lock the official standing ranks.'
    );
    if (!confirmed) return;

    try {
      setApproving(true);
      const res = await api.post('/voting/approve-results');
      alert(res.data.message || 'Results approved and published successfully!');
      fetchData();
    } catch (err) {
      alert('Failed to approve results: ' + (err.response?.data?.error || err.message));
    } finally {
      setApproving(false);
    }
  };

  const handleSyncKashishVotes = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const res = await api.post('/kashish-sync/sync-votes');
      setSyncResult(res.data.summary);
      alert(res.data.message || 'Kashish sync completed successfully!');
      fetchKashishData();
      fetchData();
    } catch (err) {
      alert('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveMovieMapping = async (e) => {
    e.preventDefault();
    if (!newMapping.kashish_movie_id || !newMapping.freecomers_submission_id) {
      alert('Please fill in both Kashish Movie ID and Freecomers Film.');
      return;
    }

    try {
      setSavingMapping(true);
      await api.post('/kashish-sync/movie-mappings', newMapping);
      setNewMapping({ kashish_movie_id: '', kashish_movie_title: '', freecomers_submission_id: '' });
      fetchKashishData();
      alert('Movie mapping saved successfully!');
    } catch (err) {
      alert('Failed to save mapping: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingMapping(false);
    }
  };

  const handleDeleteMovieMapping = async (id) => {
    if (!window.confirm('Remove this movie mapping?')) return;
    try {
      await api.delete(`/kashish-sync/movie-mappings/${id}`);
      fetchKashishData();
    } catch (err) {
      alert('Failed to delete mapping: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleModerateReview = async (reviewId, newStatus) => {
    try {
      await api.put(`/audience/reviews/${reviewId}/moderate`, { status: newStatus });
      fetchModerationReviews();
    } catch (err) {
      alert('Failed to update review status: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Are you sure you want to permanently delete this review?')) return;
    try {
      await api.delete(`/audience/reviews/${reviewId}`);
      fetchModerationReviews();
    } catch (err) {
      alert('Failed to delete review: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="fc-voting-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
            Audience Choice Voting & Awards
          </h1>
          <p className="fc-page-subtitle" style={{ color: 'var(--fc-text-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
            Auditorium voting window triggers, cinema screen QR projector, Bayesian statistical scoring, Kashish API sync & Delegate Reviews
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: 'var(--fc-surface-hover)', padding: '4px', borderRadius: '8px', border: '1px solid var(--fc-border)', flexWrap: 'wrap', gap: '4px' }}>
          <button 
            type="button"
            onClick={() => setActiveTab('controller')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'controller' ? 'var(--fc-surface-card)' : 'transparent',
              color: activeTab === 'controller' ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
              boxShadow: activeTab === 'controller' ? 'var(--shadow-sm)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <MovieIcon size={14} />
            <span>Screening Windows</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'leaderboard' ? 'var(--fc-surface-card)' : 'transparent',
              color: activeTab === 'leaderboard' ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
              boxShadow: activeTab === 'leaderboard' ? 'var(--shadow-sm)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <TrophyIcon size={14} />
            <span>Live Leaderboard ({leaderboard.length})</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('fraud')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'fraud' ? 'var(--fc-surface-card)' : 'transparent',
              color: activeTab === 'fraud' ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
              boxShadow: activeTab === 'fraud' ? 'var(--shadow-sm)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShieldIcon size={14} />
            <span>Fraud Audit ({flaggedVotes.length})</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('kashish')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'kashish' ? 'var(--fc-surface-card)' : 'transparent',
              color: activeTab === 'kashish' ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
              boxShadow: activeTab === 'kashish' ? 'var(--shadow-sm)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <SyncIcon size={14} />
            <span>Kashish Sync</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('reviews')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'reviews' ? 'var(--fc-surface-card)' : 'transparent',
              color: activeTab === 'reviews' ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
              boxShadow: activeTab === 'reviews' ? 'var(--shadow-sm)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <StarIcon size={14} style={{ color: activeTab === 'reviews' ? '#f59e0b' : 'inherit' }} />
            <span>Delegate Reviews</span>
            {pendingReviewsCount > 0 && (
              <span style={{
                background: '#e05252',
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '999px',
                marginLeft: '4px'
              }}>
                {pendingReviewsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── TAB 1: SCREENING CONTROLLER ─────────────────────────────────────── */}
      {activeTab === 'controller' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          {screenings.map((s) => {
            const isOpen = s.voting_status === 'open';
            const isClosed = s.voting_status === 'closed';

            return (
              <div 
                key={s.id} 
                className="fc-card" 
                style={{
                  background: 'var(--fc-surface-card)',
                  borderRadius: '12px',
                  border: '1px solid var(--fc-border)',
                  padding: '24px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: isOpen ? '4px solid #16a34a' : isClosed ? '4px solid #94a3b8' : '4px solid #f59e0b'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>
                      {s.title}
                    </h3>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: isOpen ? 'rgba(22, 163, 74, 0.15)' : isClosed ? 'var(--fc-surface-hover)' : 'rgba(245, 158, 11, 0.15)',
                      color: isOpen ? '#16a34a' : isClosed ? 'var(--fc-text-muted)' : '#f59e0b',
                      border: isOpen ? '1px solid #16a34a' : 'none'
                    }}>
                      {isOpen ? 'Live · Voting Open' : isClosed ? 'Window Closed' : 'Scheduled'}
                    </span>
                  </div>

                  <div style={{ color: 'var(--fc-text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <PlaceIcon size={14} /> <span>{s.venue_name || 'Main Cinema Hall'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ScheduleIcon size={14} /> <span>{formatScreeningSchedule(s.screening_date, s.start_time, s.end_time)}</span>
                    </div>
                  </div>

                  {/* Films in this Screening Block */}
                  <div style={{ background: 'var(--fc-surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--fc-border)', marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                      Films Included in Ballot
                    </div>
                    {s.films && s.films.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', color: 'var(--fc-text-main)' }}>
                        {s.films.map((f, i) => (
                          <li key={i} style={{ marginBottom: '2px' }}>
                            <strong>{f.title}</strong> <span style={{ color: 'var(--fc-text-muted)' }}>({f.director || 'Unknown'})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>No films assigned yet</div>
                    )}
                  </div>
                </div>

                {/* Window Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  {!isOpen && !isClosed && (
                    <button 
                      type="button"
                      onClick={() => handleOpenVoting(s.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <PlayArrowIcon size={15} /> Open Voting Window
                    </button>
                  )}

                  {isOpen && (
                    <>
                      <button 
                        type="button"
                        onClick={() => setProjectorModal(s)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: '#1e293b',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <QrCodeScannerIcon size={15} /> Project Screen QR
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleCloseVoting(s.id)}
                        style={{
                          padding: '10px 16px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <StopIcon size={14} /> Close Window
                      </button>
                    </>
                  )}

                  {isClosed && (
                    <button 
                      type="button"
                      onClick={() => handleOpenVoting(s.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: 'var(--fc-surface)',
                        color: 'var(--fc-text-main)',
                        border: '1px solid var(--fc-border)',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <PlayArrowIcon size={15} /> Reopen Voting Window
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 2: AUDIENCE CHOICE LEADERBOARD ─────────────────────────────── */}
      {activeTab === 'leaderboard' && (
        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          
          {/* Approval Banner */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            borderRadius: '10px',
            marginBottom: '20px',
            background: approvalStatus.is_approved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: approvalStatus.is_approved ? '1px solid #10b981' : '1px solid #f59e0b',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {approvalStatus.is_approved ? <CheckCircleIcon size={20} style={{ color: '#059669' }} /> : <WarningIcon size={20} style={{ color: '#d97706' }} />}
                </span>
                <strong style={{ fontSize: '0.95rem', color: approvalStatus.is_approved ? '#059669' : '#d97706' }}>
                  {approvalStatus.is_approved ? 'OFFICIAL RESULTS PUBLISHED & CERTIFIED' : 'DRAFT STANDINGS — PENDING APPROVAL'}
                </strong>
              </div>
              <p style={{ margin: '4px 0 0 28px', fontSize: '0.8rem', color: 'var(--fc-text-secondary)' }}>
                {approvalStatus.is_approved 
                  ? `Certified by ${approvalStatus.approved_by || 'Festival Administration'} at ${new Date(approvalStatus.approved_at).toLocaleString()}`
                  : 'Tabulation is live and subject to change. Click "Approve & Publish" to certify official festival winners.'}
              </p>
            </div>

            {!approvalStatus.is_approved && (
              <button
                type="button"
                onClick={handleApproveResults}
                disabled={approving}
                style={{
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {approving ? 'Publishing...' : 'Approve & Publish Results'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
                Official Audience Choice Award Standings
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
                Ranked by Bayesian Adjusted Score (adjustment parameter m = 10) · Tie-break: total votes → raw average
              </p>
            </div>
            <button 
              type="button"
              onClick={fetchData}
              style={{ background: 'var(--fc-surface)', color: 'var(--fc-text-main)', border: '1px solid var(--fc-border)', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <SyncIcon size={13} /> Recalculate Now
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--fc-surface)', borderBottom: '2px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-secondary)' }}>
                  <th style={{ padding: '12px 14px' }}>Rank</th>
                  <th style={{ padding: '12px 14px' }}>Film Title & Director</th>
                  <th style={{ padding: '12px 14px' }}>Category</th>
                  <th style={{ padding: '12px 14px' }}>Total Votes (v)</th>
                  <th style={{ padding: '12px 14px' }}>Raw Avg (R)</th>
                  <th style={{ padding: '12px 14px' }}>Bayesian Score (W)</th>
                  <th style={{ padding: '12px 14px' }}>Ratings</th>
                  <th style={{ padding: '12px 14px' }}>Quorum Status</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((item, idx) => {
                  const isTop3 = idx < 3;
                  return (
                    <tr key={item.film_id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))', background: idx === 0 ? 'var(--fc-brand-active-bg, rgba(220, 38, 38, 0.12))' : 'transparent' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: '1.1rem', color: idx === 0 ? '#f59e0b' : 'var(--fc-text-secondary)' }}>
                        {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', fontSize: '0.95rem' }}>{item.film_title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>Directed by {item.director} · {item.runtime} mins</div>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--fc-text-secondary)' }}>
                        <span style={{ background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fc-text-secondary)' }}>
                          {item.film_category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--fc-text-main)' }}>
                        {item.total_votes}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--fc-text-muted)' }}>
                        {parseFloat(item.raw_average).toFixed(2)} ★
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <strong style={{ fontSize: '1.1rem', color: isTop3 ? '#10b981' : 'var(--fc-text-main)' }}>
                          {parseFloat(item.bayesian_score).toFixed(3)}
                        </strong>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ color: 'var(--fc-text-secondary)', fontSize: '0.8rem', background: 'var(--fc-surface)', border: '1px solid var(--fc-border)', padding: '3px 8px', borderRadius: '4px' }}>
                          {item.total_votes} rating{item.total_votes !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.8rem', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '3px 8px', borderRadius: '4px' }}>
                          Eligible ✓
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: FRAUD AUDIT ──────────────────────────────────────────────── */}
      {activeTab === 'fraud' && (
        <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
            Suspicious & Flagged Votes Audit
          </h2>
          {flaggedVotes.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
              ✓ No suspicious voting activity detected. Voting integrity is healthy.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-muted)' }}>
                  <th style={{ padding: '10px' }}>Film</th>
                  <th style={{ padding: '10px' }}>Voter</th>
                  <th style={{ padding: '10px' }}>Rating</th>
                  <th style={{ padding: '10px' }}>Status</th>
                  <th style={{ padding: '10px' }}>IP / Device</th>
                  <th style={{ padding: '10px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flaggedVotes.map(v => (
                  <tr key={v.vote_id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                    <td style={{ padding: '10px', fontWeight: 600, color: 'var(--fc-text-main)' }}>{v.film_title}</td>
                    <td style={{ padding: '10px', color: 'var(--fc-text-secondary)' }}>{v.attendee_name} ({v.attendee_phone})</td>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#f59e0b' }}>{v.rating} ★</td>
                    <td style={{ padding: '10px', color: '#ef4444' }}>{v.status}</td>
                    <td style={{ padding: '10px', color: 'var(--fc-text-muted)', fontSize: '0.75rem' }}>{v.ip_address}</td>
                    <td style={{ padding: '10px' }}>
                      <button 
                        type="button"
                        onClick={() => handleVoidVote(v.vote_id)}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        Void Vote
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB 4: KASHISH EXTERNAL SYNC DECK ──────────────────────────────── */}
      {activeTab === 'kashish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top Sync Card */}
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--fc-text-main)' }}>
                  Kashish External Votes Sync & Mapping Deck
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
                  Live API integration with Kashish external voting portal (<code>kashish-admin.vercel.app/api/v1/votes</code>)
                </p>
              </div>

              <button
                type="button"
                onClick={handleSyncKashishVotes}
                disabled={syncing}
                style={{
                  background: 'var(--color-primary, #2563eb)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <SyncIcon size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                <span>{syncing ? 'Syncing Votes from Kashish...' : 'Sync Kashish Votes'}</span>
              </button>
            </div>

            {/* Sync Summary Result Banner */}
            {syncResult && (
              <div style={{
                marginTop: '20px',
                padding: '16px 20px',
                borderRadius: '8px',
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Fetched</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--fc-text-main)' }}>{syncResult.total_fetched}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>New Votes Created</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>+{syncResult.new_votes_created}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Duplicates Skipped</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--fc-text-secondary)' }}>{syncResult.duplicate_skipped}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Users Auto-Matched</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#6366f1' }}>{syncResult.users_auto_matched}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Users Auto-Created</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0ea5e9' }}>{syncResult.users_auto_created}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Unmapped Movies</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: syncResult.movies_unmapped > 0 ? '#ef4444' : '#10b981' }}>{syncResult.movies_unmapped}</div>
                </div>
              </div>
            )}
          </div>

          {/* Movie Mapping Manager */}
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--fc-text-main)' }}>
              Movie Document ID Mappings ({movieMappings.length})
            </h3>
            <p style={{ margin: '0 0 18px 0', fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
              Map external Kashish Movie IDs to Freecomers Film Submissions for accurate ballot attribution.
            </p>

            {/* Add Mapping Form */}
            <form onSubmit={handleSaveMovieMapping} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr)) 120px', gap: '12px', marginBottom: '20px', background: 'var(--fc-surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--fc-border)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                  Kashish Movie ID *
                </label>
                <input
                  type="text"
                  placeholder="e.g. sJAx6OQQJs9u7laSzWnB"
                  value={newMapping.kashish_movie_id}
                  onChange={(e) => setNewMapping({ ...newMapping, kashish_movie_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                  Kashish Movie Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. A (DIS)LIKED STORY"
                  value={newMapping.kashish_movie_title}
                  onChange={(e) => setNewMapping({ ...newMapping, kashish_movie_title: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                  Target Freecomers Submission *
                </label>
                <select
                  value={newMapping.freecomers_submission_id}
                  onChange={(e) => setNewMapping({ ...newMapping, freecomers_submission_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--fc-border)', background: 'var(--fc-surface-card)', color: 'var(--fc-text-main)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  required
                >
                  <option value="">-- Select Film Submission --</option>
                  {submissionsList.map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.id} - {s.title} ({s.director || 'Unknown Director'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={savingMapping}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: savingMapping ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingMapping ? 'Saving...' : '+ Map Movie'}
                </button>
              </div>
            </form>

            {/* Mappings Table */}
            {movieMappings.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
                No movie mappings configured yet. Click "Sync Kashish Votes" to automatically map titles, or add manual mappings above.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-secondary)' }}>
                      <th style={{ padding: '10px 12px' }}>Kashish Movie ID</th>
                      <th style={{ padding: '10px 12px' }}>Kashish Title</th>
                      <th style={{ padding: '10px 12px' }}>Freecomers Film Title</th>
                      <th style={{ padding: '10px 12px' }}>Created Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movieMappings.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{m.kashish_movie_id}</td>
                        <td style={{ padding: '10px 12px' }}>{m.kashish_movie_title || '—'}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--fc-text-main)' }}>
                          #{m.freecomers_submission_id} — {m.freecomers_film_title || 'Linked Film'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--fc-text-muted)' }}>
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteMovieMapping(m.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sync History Logs */}
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
              Recent API Sync Operations
            </h3>
            {syncLogs.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
                No sync logs recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-secondary)' }}>
                      <th style={{ padding: '10px 12px' }}>Started At</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Fetched</th>
                      <th style={{ padding: '10px 12px' }}>New Votes</th>
                      <th style={{ padding: '10px 12px' }}>Duplicates</th>
                      <th style={{ padding: '10px 12px' }}>Users Auto-Matched</th>
                      <th style={{ padding: '10px 12px' }}>Users Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--fc-text-muted)' }}>
                          {new Date(log.started_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: log.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : log.status === 'failed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: log.status === 'completed' ? '#10b981' : log.status === 'failed' ? '#ef4444' : '#f59e0b'
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{log.total_fetched}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#10b981' }}>+{log.new_votes_created}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--fc-text-secondary)' }}>{log.duplicate_skipped}</td>
                        <td style={{ padding: '10px 12px' }}>{log.users_auto_matched}</td>
                        <td style={{ padding: '10px 12px' }}>{log.users_auto_created}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* User Mappings Table */}
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--fc-text-main)' }}>
              Synced Kashish Users ({userMappings.length})
            </h3>
            {userMappings.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
                No users mapped yet. Users will be automatically mapped or created during sync.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-secondary)' }}>
                      <th style={{ padding: '10px 12px' }}>Kashish User ID</th>
                      <th style={{ padding: '10px 12px' }}>Name</th>
                      <th style={{ padding: '10px 12px' }}>Email</th>
                      <th style={{ padding: '10px 12px' }}>Mobile</th>
                      <th style={{ padding: '10px 12px' }}>Freecomers Attendee #</th>
                      <th style={{ padding: '10px 12px' }}>Matched Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userMappings.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--fc-border-subtle, var(--fc-border))' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{u.kashish_user_id}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.kashish_user_name || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>{u.kashish_user_email || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>{u.kashish_user_mobile || '—'}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--fc-brand, #a82f2f)' }}>
                          #{u.freecomers_attendee_id}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            background: u.matched_by === 'email' ? 'rgba(99, 102, 241, 0.12)' : u.matched_by === 'phone' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                            color: u.matched_by === 'email' ? '#6366f1' : u.matched_by === 'phone' ? '#10b981' : '#0ea5e9'
                          }}>
                            {u.matched_by}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: DELEGATE REVIEWS MODERATION (PHASE 7) ─────────────────────── */}
      {activeTab === 'reviews' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Policy Banner */}
          <div style={{ 
            background: 'var(--fc-surface-card)', 
            border: '1px solid var(--fc-border)', 
            borderLeft: '4px solid #f59e0b',
            borderRadius: '12px', 
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--fc-text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StarIcon size={16} style={{ color: '#f59e0b' }} />
                <span>Delegate Reviews & Community Moderation (Phase 7)</span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--fc-text-muted)', lineHeight: 1.4 }}>
                Delegates can submit written reviews and 1–5 star ratings for festival films. Approved reviews are displayed publicly on film pages.
                <strong style={{ color: 'var(--fc-text-main)', marginLeft: '4px' }}>
                  Per Kashish Festival rules, reviews are qualitative only and never impact official Audience Choice Award Bayesian vote scores.
                </strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ 
                padding: '6px 12px', 
                borderRadius: '8px', 
                fontSize: '0.8rem', 
                fontWeight: 700,
                background: pendingReviewsCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                color: pendingReviewsCount > 0 ? '#ef4444' : '#10b981',
                border: pendingReviewsCount > 0 ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)'
              }}>
                {pendingReviewsCount} Pending Moderation
              </span>
            </div>
          </div>

          {/* Filter & Search Controls */}
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'All Reviews' },
                { key: 'pending', label: 'Pending Moderation', count: pendingReviewsCount },
                { key: 'approved', label: 'Approved & Public' },
                { key: 'rejected', label: 'Rejected' },
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setReviewStatusFilter(tab.key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: reviewStatusFilter === tab.key ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-border)',
                    background: reviewStatusFilter === tab.key ? 'var(--fc-brand-active-bg, rgba(168, 47, 47, 0.08))' : 'transparent',
                    color: reviewStatusFilter === tab.key ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span style={{
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      borderRadius: '999px',
                      padding: '1px 5px',
                      fontWeight: 800
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--fc-text-muted)' }}>
                  <SearchIcon size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Filter by film, delegate, text..."
                  value={reviewSearch}
                  onChange={(e) => setReviewSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: '6px',
                    border: '1px solid var(--fc-border)',
                    background: 'var(--fc-surface)',
                    color: 'var(--fc-text-main)',
                    fontSize: '0.825rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                type="button"
                onClick={fetchModerationReviews}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--fc-border)',
                  background: 'var(--fc-surface)',
                  color: 'var(--fc-text-secondary)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Reviews Moderation Table */}
          <div className="fc-card" style={{ background: 'var(--fc-surface-card)', borderRadius: '12px', border: '1px solid var(--fc-border)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
            {reviewsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                Loading delegate reviews...
              </div>
            ) : reviews.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
                <StarIcon size={32} style={{ color: 'var(--fc-border)', marginBottom: '8px' }} />
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No reviews found</div>
                <div style={{ fontSize: '0.825rem', marginTop: '4px' }}>
                  {reviewStatusFilter === 'pending' 
                    ? 'All delegate reviews have been moderated. Good job!' 
                    : 'No delegate reviews match the current status filter.'}
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--fc-surface)', borderBottom: '1px solid var(--fc-border)', textAlign: 'left', color: 'var(--fc-text-secondary)' }}>
                      <th style={{ padding: '12px 14px' }}>Film</th>
                      <th style={{ padding: '12px 14px' }}>Delegate / Author</th>
                      <th style={{ padding: '12px 14px' }}>Stars</th>
                      <th style={{ padding: '12px 14px' }}>Review Feedback</th>
                      <th style={{ padding: '12px 14px' }}>Date</th>
                      <th style={{ padding: '12px 14px' }}>Status</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((rev) => {
                      const isPending = rev.status === 'pending';
                      const isApproved = rev.status === 'approved';
                      const isRejected = rev.status === 'rejected';

                      return (
                        <tr 
                          key={rev.id} 
                          style={{ 
                            borderBottom: '1px solid var(--fc-border)', 
                            background: isPending ? 'rgba(245, 158, 11, 0.03)' : 'transparent',
                            transition: 'background-color 0.12s ease'
                          }}
                        >
                          {/* Film info */}
                          <td style={{ padding: '14px', verticalAlign: 'top', minWidth: '160px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--fc-text-main)', fontSize: '0.88rem' }}>
                              {rev.film_title || `Film #${rev.film_id}`}
                            </div>
                            {rev.film_director && (
                              <div style={{ fontSize: '0.775rem', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                                dir. {rev.film_director}
                              </div>
                            )}
                          </td>

                          {/* Delegate info */}
                          <td style={{ padding: '14px', verticalAlign: 'top', minWidth: '160px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--fc-text-main)' }}>
                              {rev.attendee_name || 'Festival Delegate'}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                              {rev.delegate_category && (
                                <span style={{
                                  background: 'var(--fc-surface-hover)',
                                  color: 'var(--fc-text-secondary)',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--fc-border)'
                                }}>
                                  {rev.delegate_category}
                                </span>
                              )}
                              {rev.is_anonymous === 1 && (
                                <span style={{
                                  background: 'rgba(99, 102, 241, 0.1)',
                                  color: '#6366f1',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }} title="Delegate chose to post anonymously on public film page">
                                  Posted Anonymous
                                </span>
                              )}
                            </div>
                            {rev.attendee_email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)', marginTop: '3px' }}>
                                {rev.attendee_email}
                              </div>
                            )}
                          </td>

                          {/* Star Rating */}
                          <td style={{ padding: '14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            {rev.review_stars ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#f59e0b' }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span key={star} style={{ fontSize: '13px' }}>
                                    {star <= rev.review_stars ? '★' : '☆'}
                                  </span>
                                ))}
                                <span style={{ marginLeft: '4px', fontWeight: 700, fontSize: '0.8rem', color: 'var(--fc-text-main)' }}>
                                  {rev.review_stars}/5
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--fc-text-muted)', fontSize: '0.775rem' }}>Text only</span>
                            )}
                          </td>

                          {/* Review Text */}
                          <td style={{ padding: '14px', verticalAlign: 'top', maxWidth: '380px' }}>
                            <div style={{ 
                              color: 'var(--fc-text-main)', 
                              lineHeight: 1.45, 
                              fontSize: '0.825rem',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              background: 'var(--fc-surface)',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              border: '1px solid var(--fc-border)'
                            }}>
                              "{rev.review_text}"
                            </div>
                            {rev.moderated_by_name && (
                              <div style={{ fontSize: '0.725rem', color: 'var(--fc-text-muted)', marginTop: '4px' }}>
                                Moderated by {rev.moderated_by_name} {rev.moderated_at ? `on ${new Date(rev.moderated_at).toLocaleDateString()}` : ''}
                              </div>
                            )}
                          </td>

                          {/* Submission Date */}
                          <td style={{ padding: '14px', verticalAlign: 'top', whiteSpace: 'nowrap', color: 'var(--fc-text-muted)', fontSize: '0.775rem' }}>
                            {rev.created_at ? new Date(rev.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>

                          {/* Status Badge */}
                          <td style={{ padding: '14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              background: isApproved 
                                ? 'rgba(16, 185, 129, 0.15)' 
                                : isRejected 
                                  ? 'rgba(239, 68, 68, 0.15)' 
                                  : 'rgba(245, 158, 11, 0.15)',
                              color: isApproved ? '#10b981' : isRejected ? '#ef4444' : '#f59e0b',
                              border: isApproved 
                                ? '1px solid rgba(16, 185, 129, 0.3)' 
                                : isRejected 
                                  ? '1px solid rgba(239, 68, 68, 0.3)' 
                                  : '1px solid rgba(245, 158, 11, 0.3)'
                            }}>
                              {rev.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              {!isApproved && (
                                <button
                                  type="button"
                                  onClick={() => handleModerateReview(rev.id, 'approved')}
                                  title="Approve and make visible on public film page"
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '5px',
                                    border: '1px solid #10b981',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#10b981',
                                    fontSize: '0.775rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Approve
                                </button>
                              )}
                              {!isRejected && (
                                <button
                                  type="button"
                                  onClick={() => handleModerateReview(rev.id, 'rejected')}
                                  title="Reject review from public film page"
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '5px',
                                    border: '1px solid #f59e0b',
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    color: '#d97706',
                                    fontSize: '0.775rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Reject
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteReview(rev.id)}
                                title="Delete review record"
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '5px',
                                  border: '1px solid var(--fc-border)',
                                  background: 'transparent',
                                  color: 'var(--fc-text-muted)',
                                  fontSize: '0.775rem',
                                  cursor: 'pointer'
                                }}
                              >
                                <DeleteIcon size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROJECTOR SCREEN QR MODAL ────────────────────────────────────────── */}
      {projectorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#0f172a', border: '2px solid #334155', borderRadius: '16px', maxWidth: '640px', width: '90%', padding: '36px', textAlign: 'center', color: '#fff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ fontSize: '0.85rem', letterSpacing: '0.15em', fontWeight: 800, color: '#e11d48', textTransform: 'uppercase', marginBottom: '8px' }}>
              KASHISH PRIDE FILM FESTIVAL · AUDIENCE CHOICE AWARD
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 4px 0' }}>
              Rate This Screening!
            </h2>
            <p style={{ color: '#94a3b8', margin: '0 0 24px 0', fontSize: '1rem' }}>
              {projectorModal.title} · {projectorModal.venue_name}
            </p>

            {/* Simulated Clean QR Code Graphic for Projection */}
            <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', marginBottom: '20px' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(window.location.origin + '/vote/' + projectorModal.qr_token)}`} 
                alt="Audience Voting QR Code" 
                style={{ width: '240px', height: '240px', display: 'block' }}
              />
            </div>

            <div style={{ background: '#1e293b', padding: '14px', borderRadius: '10px', maxWidth: '440px', margin: '0 auto 24px auto', fontSize: '0.9rem', color: '#cbd5e1' }}>
              <div>📱 <strong>Scan with your phone camera</strong> to open ballot</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>Enter your Badge # or Mobile to cast verified vote</div>
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #334155' }}>
                <a 
                  href={`/vote/${projectorModal.qr_token}`}
                  target="_blank" 
                  rel="noreferrer"
                  style={{ color: '#38bdf8', fontSize: '0.85rem', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  ↗ Open Voter Ballot Directly in New Tab
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
              <button 
                type="button"
                onClick={() => setProjectorModal(null)}
                style={{ padding: '10px 24px', background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                Exit Projector Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
