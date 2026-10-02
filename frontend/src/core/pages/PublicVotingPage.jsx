/**
 * PublicVotingPage Component (/vote/:token)
 * 
 * Mobile-First Public Voter Scorecard:
 * - Standalone layout for festival attendees scanning the projected screen QR code
 * - Option 3 Eligibility: Voter verifies identity with Badge ID or Mobile Number
 * - Validates verified gate check-in before unlocking the official ballot
 * - Supports Feature Films and Short Film package bundles with individual star ratings
 * - Includes "Did Not Watch / Skip" toggle for short film bundles
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function PublicVotingPage() {
  const { token } = useParams();
  const [screening, setScreening] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Step State: 'identify' | 'ballot' | 'success'
  const [step, setStep] = useState('identify');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState('');

  // Ratings State: { [filmId]: rating_1_to_5 }
  const [ratings, setRatings] = useState({});
  const [skippedFilms, setSkippedFilms] = useState({});
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteResult, setVoteResult] = useState(null);

  useEffect(() => {
    const fetchScreening = async () => {
      try {
        setLoading(true);
        setError('');
        // Use relative path or base API URL
        const res = await axios.get(`/api/public/vote/${token}`);
        setScreening(res.data.screening);
      } catch (err) {
        console.error('Failed to load screening:', err);
        setError(err.response?.data?.error || 'Invalid or expired voting link. Please verify with the festival volunteers.');
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchScreening();
  }, [token]);

  const handleVerifyVoter = (e) => {
    e.preventDefault();
    if (!badgeNumber.trim() && !phoneNumber.trim()) {
      setAuthError('Please enter your Badge ID or Mobile Number.');
      return;
    }
    setAuthError('');
    // Move to ballot; actual Option 3 verification executes atomically on submit
    setStep('ballot');
  };

  const handleRatingChange = (filmId, stars) => {
    setRatings(prev => ({ ...prev, [filmId]: stars }));
    setSkippedFilms(prev => {
      const copy = { ...prev };
      delete copy[filmId];
      return copy;
    });
  };

  const handleSkipToggle = (filmId) => {
    setSkippedFilms(prev => ({ ...prev, [filmId]: !prev[filmId] }));
    setRatings(prev => {
      const copy = { ...prev };
      delete copy[filmId];
      return copy;
    });
  };

  const handleSubmitBallot = async (e) => {
    e.preventDefault();

    // Check if at least one film is rated
    const ratedCount = Object.keys(ratings).filter(id => !skippedFilms[id] && ratings[id] > 0).length;
    if (ratedCount === 0) {
      alert('Please rate at least one film in this screening.');
      return;
    }

    try {
      setSubmittingVote(true);
      const res = await axios.post(`/api/public/vote/${token}/submit`, {
        badge_number: badgeNumber.trim() || undefined,
        phone_number: phoneNumber.trim() || undefined,
        ratings,
        device_fingerprint: window.navigator.userAgent
      });

      setVoteResult(res.data);
      setStep('success');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to record vote. Please check your badge ID.');
      if (err.response?.status === 403 || err.response?.status === 404) {
        setStep('identify');
        setAuthError(err.response?.data?.error);
      }
    } finally {
      setSubmittingVote(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎬</div>
          <div style={{ fontWeight: 600 }}>Loading Official Festival Ballot...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '20px', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', maxWidth: '440px', padding: '32px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0', color: '#f87171' }}>Voting Not Available</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.5' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '16px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', paddingTop: '20px' }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f43f5e', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            KASHISH PRIDE FILM FESTIVAL · BANGALORE
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0 2px 0' }}>
            Audience Choice Award
          </h1>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            {screening.title} · {screening.venue}
          </div>
        </div>

        {/* ── STEP 1: VOTER IDENTIFICATION ──────────────────────────────────── */}
        {step === 'identify' && (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px 0' }}>
              Confirm Attendance to Vote
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
              To ensure award integrity, only audience members who checked into this screening door can vote.
            </p>

            {authError && (
              <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', color: '#fecaca', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleVerifyVoter}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Badge Pass Number
                </label>
                <input 
                  type="number"
                  placeholder="e.g. 104"
                  value={badgeNumber}
                  onChange={(e) => setBadgeNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: '#fff',
                    fontSize: '1.1rem',
                    fontWeight: 700
                  }}
                />
                <small style={{ color: '#64748b', display: 'block', marginTop: '4px', fontSize: '0.75rem' }}>
                  Printed on your delegate pass badge.
                </small>
              </div>

              <div style={{ textAlign: 'center', margin: '12px 0', color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>
                — OR —
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Registered Mobile Number
                </label>
                <input 
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    background: '#0f172a',
                    color: '#fff',
                    fontSize: '1.1rem',
                    fontWeight: 700
                  }}
                />
              </div>

              <button 
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)'
                }}
              >
                Continue to Official Ballot →
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: OFFICIAL BALLOT SCORECARD ────────────────────────────── */}
        {step === 'ballot' && (
          <form onSubmit={handleSubmitBallot}>
            <div style={{ marginBottom: '14px', background: '#1e293b', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Voter: <strong>{badgeNumber ? `Badge #${badgeNumber}` : phoneNumber}</strong></span>
              <button 
                type="button" 
                onClick={() => setStep('identify')}
                style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
              >
                Change
              </button>
            </div>

            {screening.films && screening.films.map((film, index) => {
              const currentRating = ratings[film.film_id] || 0;
              const isSkipped = skippedFilms[film.film_id];

              return (
                <div 
                  key={film.film_id}
                  style={{
                    background: '#1e293b',
                    border: currentRating > 0 ? '1px solid #10b981' : '1px solid #334155',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '16px',
                    opacity: isSkipped ? 0.5 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      {screening.block_type === 'short_block' && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase' }}>
                          Film {index + 1} of {screening.films.length}
                        </span>
                      )}
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2px 0 2px 0', color: '#fff' }}>
                        {film.title}
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        Directed by {film.director} · {film.runtime} mins
                      </div>
                    </div>

                    {/* Skip / Did not watch toggle */}
                    {screening.block_type === 'short_block' && (
                      <button
                        type="button"
                        onClick={() => handleSkipToggle(film.film_id)}
                        style={{
                          background: isSkipped ? '#334155' : 'transparent',
                          border: '1px solid #475569',
                          color: isSkipped ? '#fff' : '#94a3b8',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          cursor: 'pointer'
                        }}
                      >
                        {isSkipped ? 'Skipped' : 'Did Not Watch'}
                      </button>
                    )}
                  </div>

                  {!isSkipped && (
                    <div style={{ marginTop: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '8px' }}>
                        TAP STARS TO RATE (1 TO 5):
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleRatingChange(film.film_id, star)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              fontSize: '2rem',
                              cursor: 'pointer',
                              filter: star <= currentRating ? 'none' : 'grayscale(100%) opacity(30%)',
                              transform: star <= currentRating ? 'scale(1.15)' : 'scale(1)',
                              transition: 'transform 0.15s ease'
                            }}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      {currentRating > 0 && (
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', marginTop: '6px' }}>
                          {currentRating === 5 ? 'Masterpiece (5.0)' :
                           currentRating === 4 ? 'Very Good (4.0)' :
                           currentRating === 3 ? 'Good (3.0)' :
                           currentRating === 2 ? 'Fair (2.0)' : 'Poor (1.0)'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button 
              type="submit" 
              disabled={submittingVote}
              style={{
                width: '100%',
                padding: '16px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '1.05rem',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                marginBottom: '30px'
              }}
            >
              {submittingVote ? 'Submitting Official Vote...' : 'Submit Official Ballot ✓'}
            </button>
          </form>
        )}

        {/* ── STEP 3: VOTE CONFIRMED SCREEN ─────────────────────────────────── */}
        {step === 'success' && (
          <div style={{ background: '#1e293b', border: '1px solid #10b981', borderRadius: '16px', padding: '36px 24px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px 0', color: '#10b981' }}>
              Vote Confirmed!
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: '0 0 16px 0' }}>
              Thank you, <strong>{voteResult?.voter_name || 'Delegate'}</strong>!
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.5', margin: '0 0 24px 0' }}>
              Your {voteResult?.votes_recorded} ballot score(s) have been verified against your screening attendance and officially added to the Kashish Pride Film Festival Audience Choice tabulation.
            </p>

            <div style={{ background: '#0f172a', padding: '14px', borderRadius: '10px', fontSize: '0.8rem', color: '#64748b' }}>
              🔒 Verified Option 3 Screening Attendance Signature
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
