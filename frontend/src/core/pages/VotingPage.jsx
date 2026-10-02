/**
 * VotingPage Component (/voting)
 * 
 * Audience Choice Voting Hub & Official Tabulation:
 * - Screening Voting Windows Controller (open/close balloting, countdown timer)
 * - Fullscreen Projected Screen QR Modal for projectionists
 * - Real-Time Audience Choice Leaderboard (Bayesian Weighted Scoring & Quorum flags)
 * - Fraud Inspector & Vote Moderation Deck (voiding suspicious entries)
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function VotingPage() {
  const [activeTab, setActiveTab] = useState('controller'); // 'controller' | 'leaderboard' | 'fraud'
  const [screenings, setScreenings] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [flaggedVotes, setFlaggedVotes] = useState([]);
  const [loading, setLoading] = useState(true);

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
      setFlaggedVotes(flaggedRes.data.flagged || []);
    } catch (err) {
      console.error('Failed to load voting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  return (
    <div className="fc-voting-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="fc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="fc-page-title" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#111827' }}>
            Audience Choice Voting & Awards
          </h1>
          <p className="fc-page-subtitle" style={{ color: '#6b7280', marginTop: '4px', fontSize: '0.9rem' }}>
            Auditorium voting window triggers, cinema screen QR projector, and Bayesian statistical scoring
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => setActiveTab('controller')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'controller' ? '#fff' : 'transparent',
              color: activeTab === 'controller' ? '#111827' : '#6b7280',
              boxShadow: activeTab === 'controller' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🎬 Screening Windows
          </button>
          <button 
            onClick={() => setActiveTab('leaderboard')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'leaderboard' ? '#fff' : 'transparent',
              color: activeTab === 'leaderboard' ? '#111827' : '#6b7280',
              boxShadow: activeTab === 'leaderboard' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🏆 Live Leaderboard ({leaderboard.length})
          </button>
          <button 
            onClick={() => setActiveTab('fraud')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              background: activeTab === 'fraud' ? '#fff' : 'transparent',
              color: activeTab === 'fraud' ? '#111827' : '#6b7280',
              boxShadow: activeTab === 'fraud' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            🛡️ Fraud Audit ({flaggedVotes.length})
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
                  background: '#fff',
                  borderRadius: '12px',
                  border: isOpen ? '2px solid #10b981' : '1px solid #e5e7eb',
                  padding: '20px',
                  boxShadow: isOpen ? '0 4px 12px rgba(16, 185, 129, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span 
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background: isOpen ? '#ecfdf5' : isClosed ? '#f3f4f6' : '#eff6ff',
                        color: isOpen ? '#059669' : isClosed ? '#6b7280' : '#2563eb'
                      }}
                    >
                      {isOpen ? '● VOTING ACTIVE' : isClosed ? 'VOTING CONCLUDED' : 'PENDING SCREENING'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {s.block_type === 'short_block' ? 'Short Film Package' : 'Feature Film'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '8px 0 4px 0', color: '#111827' }}>
                    {s.title}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '12px' }}>
                    📍 {s.venue_name} · 🕒 {s.start_time} - {s.end_time}
                  </div>

                  {/* Films in this Screening */}
                  <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Programmed Films ({s.films ? s.films.length : 0}):
                    </div>
                    {s.films && s.films.map(f => (
                      <div key={f.film_id} style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: '0.8rem', padding: '2px 0' }}>
                        <span>• {f.title} ({f.runtime}m)</span>
                        <span style={{ color: '#94a3b8' }}>{f.director}</span>
                      </div>
                    ))}
                  </div>

                  {/* Operational Metrics */}
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: '#4b5563', marginBottom: '16px' }}>
                    <div>👥 <strong>{s.checked_in_count || 0}</strong> Checked-In</div>
                    <div>🗳️ <strong>{s.total_votes_cast || 0}</strong> Votes Submitted</div>
                  </div>
                </div>

                {/* Actions Deck */}
                <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #f3f4f6', paddingTop: '14px' }}>
                  {!isOpen && (
                    <button
                      onClick={() => handleOpenVoting(s.id)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      ▶ Open Voting Window
                    </button>
                  )}

                  {isOpen && (
                    <>
                      <button
                        onClick={() => setProjectorModal(s)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: '#1e293b',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        📽️ Project Screen QR
                      </button>
                      <button
                        onClick={() => handleCloseVoting(s.id)}
                        style={{
                          padding: '10px 16px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        ⏹ Close Window
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB 2: AUDIENCE CHOICE LEADERBOARD ─────────────────────────────── */}
      {activeTab === 'leaderboard' && (
        <div className="fc-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#111827' }}>
                Official Audience Choice Award Standings
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                Ranked by Bayesian Weighted Score (Threshold $m = 25$ votes) to eliminate small-sample bias
              </p>
            </div>
            <button 
              onClick={fetchData} 
              style={{ background: '#f3f4f6', border: '1px solid #d1d5db', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
            >
              🔄 Recalculate Now
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '12px 14px' }}>Rank</th>
                  <th style={{ padding: '12px 14px' }}>Film Title & Director</th>
                  <th style={{ padding: '12px 14px' }}>Category</th>
                  <th style={{ padding: '12px 14px' }}>Total Votes (v)</th>
                  <th style={{ padding: '12px 14px' }}>Raw Avg (R)</th>
                  <th style={{ padding: '12px 14px' }}>Bayesian Score (W)</th>
                  <th style={{ padding: '12px 14px' }}>Quorum Status</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((item, idx) => {
                  const isTop3 = idx < 3;
                  return (
                    <tr key={item.film_id} style={{ borderBottom: '1px solid #f1f5f9', background: idx === 0 ? '#fffbeb' : '#fff' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: '1.1rem', color: idx === 0 ? '#b45309' : '#334155' }}>
                        {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{item.film_title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Directed by {item.director} · {item.runtime} mins</div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>
                        <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {item.film_category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#334155' }}>
                        {item.total_votes}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>
                        {parseFloat(item.raw_average).toFixed(2)} ★
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <strong style={{ fontSize: '1.1rem', color: isTop3 ? '#059669' : '#0f172a' }}>
                          {parseFloat(item.bayesian_score).toFixed(3)}
                        </strong>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {item.has_quorum ? (
                          <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.8rem', background: '#dcfce7', padding: '3px 8px', borderRadius: '4px' }}>
                            Qualified ✓
                          </span>
                        ) : (
                          <span style={{ color: '#b45309', fontSize: '0.75rem', background: '#fef3c7', padding: '3px 8px', borderRadius: '4px' }}>
                            Needs 25 Votes
                          </span>
                        )}
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
        <div className="fc-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px 0', color: '#111827' }}>
            Suspicious & Flagged Votes Audit
          </h2>
          {flaggedVotes.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
              ✓ No suspicious voting activity detected. Voting integrity is healthy.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
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
                  <tr key={v.vote_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>{v.film_title}</td>
                    <td style={{ padding: '10px' }}>{v.attendee_name} ({v.attendee_phone})</td>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{v.rating} ★</td>
                    <td style={{ padding: '10px', color: '#ef4444' }}>{v.status}</td>
                    <td style={{ padding: '10px', color: '#6b7280', fontSize: '0.75rem' }}>{v.ip_address}</td>
                    <td style={{ padding: '10px' }}>
                      <button 
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
              {/* Dynamic QR image via public API */}
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(window.location.origin + '/vote/' + projectorModal.qr_token)}`} 
                alt="Audience Voting QR Code" 
                style={{ width: '240px', height: '240px', display: 'block' }}
              />
            </div>

            <div style={{ background: '#1e293b', padding: '14px', borderRadius: '10px', maxWidth: '420px', margin: '0 auto 24px auto', fontSize: '0.9rem', color: '#cbd5e1' }}>
              <div>📱 <strong>Scan with your phone camera</strong> to open ballot</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>Enter your Badge # or Mobile to cast verified vote</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
              <button 
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
