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
import { MovieIcon, LockIcon, CheckCircleIcon } from '../components/common/Icons';

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
    if (!badgeNumber.trim()) {
      setAuthError('Please enter the 6-digit badge number printed on your festival pass.');
      return;
    }
    if (phoneNumber.replace(/\D/g, '').length < 4) {
      setAuthError('Please enter the last 4 digits of your registered mobile number.');
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontFamily: 'var(--fc-font-family)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '12px', color: 'var(--fc-brand-text)' }}><MovieIcon size={32} /></div>
          <div style={{ fontWeight: 600 }}>Loading Official Festival Ballot...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fc-surface)', padding: '20px', fontFamily: 'var(--fc-font-family)' }}>
        <div style={{ background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)', borderRadius: '16px', maxWidth: '440px', padding: '32px', textAlign: 'center', color: 'var(--fc-text-main)' }}>
          <div style={{ marginBottom: '12px', color: 'var(--fc-text-muted)' }}><LockIcon size={40} /></div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0', color: 'var(--fc-danger-text)' }}>Voting Not Available</h2>
          <p style={{ color: 'var(--fc-text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fc-surface)', color: 'var(--fc-text-main)', fontFamily: 'var(--fc-font-family)', padding: '16px' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', paddingTop: '20px' }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--fc-brand-text)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            KASHISH PRIDE FILM FESTIVAL · BANGALORE
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0 2px 0' }}>
            Audience Choice Award
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-muted)' }}>
            {screening.title} · {screening.venue}
          </div>
        </div>

        {/* ── STEP 1: VOTER IDENTIFICATION ──────────────────────────────────── */}
        {step === 'identify' && (
          <div style={{ background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px 0' }}>
              Confirm Attendance to Vote
            </h2>
            <p style={{ color: 'var(--fc-text-muted)', fontSize: '0.85rem', margin: '0 0 20px 0', lineHeight: 1.4 }}>
              To ensure award integrity, only audience members who checked into this screening door can vote.
            </p>

            {authError && (
              <div style={{ background: 'var(--fc-danger-bg)', border: '1px solid var(--fc-danger-border)', color: 'var(--fc-danger-text)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleVerifyVoter}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                  Badge Number
                </label>
                <input 
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 418312"
                  value={badgeNumber}
                  onChange={(e) => setBadgeNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--fc-border-hover)',
                    background: 'var(--fc-surface)',
                    color: 'var(--fc-text-main)',
                    fontSize: '1.1rem',
                    fontWeight: 700
                  }}
                />
                <small style={{ color: 'var(--fc-text-muted)', display: 'block', marginTop: '4px', fontSize: '0.75rem' }}>
                  The 6-digit number printed under the QR code on your badge.
                </small>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--fc-text-secondary)', marginBottom: '6px' }}>
                  Last 4 Digits of Registered Mobile
                </label>
                <input 
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="e.g. 3210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--fc-border-hover)',
                    background: 'var(--fc-surface)',
                    color: 'var(--fc-text-main)',
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
                  background: 'var(--fc-brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(168, 47, 47, 0.4)',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fc-brand-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--fc-brand)')}
              >
                Continue to Official Ballot →
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: OFFICIAL BALLOT SCORECARD ────────────────────────────── */}
        {step === 'ballot' && (
          <form onSubmit={handleSubmitBallot}>
            <div style={{ marginBottom: '14px', background: 'var(--fc-surface-card)', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--fc-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Voter: <strong>{`Badge #${badgeNumber}`}</strong></span>
              <button 
                type="button" 
                onClick={() => setStep('identify')}
                style={{ background: 'transparent', border: 'none', color: 'var(--fc-info-text)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
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
                    background: 'var(--fc-surface-card)',
                    border: currentRating > 0 ? '1px solid var(--fc-success)' : '1px solid var(--fc-border)',
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
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--fc-brand-text)', textTransform: 'uppercase' }}>
                          Film {index + 1} of {screening.films.length}
                        </span>
                      )}
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '2px 0 2px 0', color: 'var(--fc-text-main)' }}>
                        {film.title}
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
                        Directed by {film.director} · {film.runtime} mins
                      </div>
                    </div>

                    {/* Skip / Did not watch toggle */}
                    {screening.block_type === 'short_block' && (
                      <button
                        type="button"
                        onClick={() => handleSkipToggle(film.film_id)}
                        style={{
                          background: isSkipped ? 'var(--fc-surface-active)' : 'transparent',
                          border: '1px solid var(--fc-border-hover)',
                          color: isSkipped ? 'var(--fc-text-main)' : 'var(--fc-text-muted)',
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
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
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--fc-success-text)', marginTop: '6px' }}>
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
                background: 'var(--fc-success)',
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
              {submittingVote ? 'Submitting Official Vote...' : 'Submit Official Ballot'}
            </button>
          </form>
        )}

        {/* ── STEP 3: VOTE CONFIRMED SCREEN ─────────────────────────────────── */}
        {step === 'success' && (
          <div style={{ background: 'var(--fc-surface-card)', border: '1px solid var(--fc-success)', borderRadius: '16px', padding: '36px 24px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
            <div style={{ marginBottom: '16px', color: 'var(--fc-success)' }}><CheckCircleIcon size={56} /></div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--fc-success-text)' }}>
              Vote Confirmed!
            </h2>
            <p style={{ color: 'var(--fc-text-secondary)', fontSize: '0.95rem', margin: '0 0 16px 0' }}>
              Thank you, <strong>{voteResult?.voter_name || 'Delegate'}</strong>!
            </p>
            <p style={{ color: 'var(--fc-text-muted)', fontSize: '0.85rem', lineHeight: '1.5', margin: '0 0 24px 0' }}>
              Your {voteResult?.votes_recorded} ballot score(s) have been verified against your screening attendance and officially added to the Kashish Pride Film Festival Audience Choice tabulation.
            </p>

            <div style={{ background: 'var(--fc-surface)', padding: '14px', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--fc-text-muted)' }}>
              Attendance verified at the screening entrance
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
