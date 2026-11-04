/**
 * PublicResultsPage (/results/:eventId) — big-screen Audience Choice winners display.
 *
 * Public, no login. Shows "Results pending" until the festival team approves the results
 * (the API returns 403 results_not_approved before that) and re-checks every 30 seconds,
 * so it can be left open on the projector and flips to the winners on approval.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const POLL_MS = 30000;

const shell = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at 50% 0%, var(--fc-brand-active-bg) 0%, var(--fc-surface) 60%)',
  color: 'var(--fc-text-main)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: 'clamp(16px, 4vw, 56px)',
  boxSizing: 'border-box'
};

function Stars({ value }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value} out of 5`} style={{ color: 'var(--fc-warning)', letterSpacing: '2px' }}>
      {'★'.repeat(full)}<span style={{ color: 'var(--fc-text-light)' }}>{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

export default function PublicResultsPage() {
  const { eventId } = useParams();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    const load = () => {
      axios.get(`/api/public/results/${encodeURIComponent(eventId)}`)
        .then(res => { if (alive) setState({ loading: false, data: res.data }); })
        .catch(err => {
          if (!alive) return;
          const body = err.response?.data;
          if (err.response?.status === 403 && body?.status === 'results_not_approved') {
            setState({ loading: false, pending: true, event: body.event });
          } else {
            setState({ loading: false, error: body?.error || 'Results are not available right now.' });
          }
        });
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [eventId]);

  if (state.loading) {
    return <div className="dark-theme" style={{ ...shell, display: 'grid', placeItems: 'center' }}>Loading results…</div>;
  }

  if (state.error) {
    return <div className="dark-theme" style={{ ...shell, display: 'grid', placeItems: 'center', color: 'var(--fc-danger-text)' }}>{state.error}</div>;
  }

  if (state.pending) {
    return (
      <div className="dark-theme" style={{ ...shell, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 'clamp(14px, 1.6vw, 22px)', letterSpacing: '0.3em', color: 'var(--fc-brand-text)', fontWeight: 800 }}>
            {state.event?.name || 'Festival'}
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 88px)', margin: '16px 0 8px' }}>Audience Choice Award</h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 28px)', color: 'var(--fc-text-muted)' }}>Results will be announced shortly.</p>
        </div>
      </div>
    );
  }

  const { event, winner, standings = [] } = state.data;
  const runnersUp = standings.filter(s => !winner || s.film_id !== winner.film_id).slice(0, 4);

  return (
    <div className="dark-theme" style={shell}>
      <header style={{ textAlign: 'center', marginBottom: 'clamp(20px, 4vh, 48px)' }}>
        <div style={{ fontSize: 'clamp(13px, 1.4vw, 20px)', letterSpacing: '0.3em', color: 'var(--fc-brand-text)', fontWeight: 800 }}>
          {event?.name}
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 64px)', margin: '10px 0 0' }}>Audience Choice Award</h1>
      </header>

      {winner && (
        <section style={{
          maxWidth: '980px', margin: '0 auto clamp(24px, 5vh, 56px)', textAlign: 'center',
          padding: 'clamp(20px, 4vw, 48px)', borderRadius: '20px',
          background: 'linear-gradient(135deg, var(--fc-brand-active-bg), var(--fc-warning-bg))',
          border: '1px solid var(--fc-warning-border)'
        }}>
          <div style={{ fontSize: 'clamp(14px, 1.5vw, 22px)', color: 'var(--fc-warning-text)', fontWeight: 800, letterSpacing: '0.2em' }}>🏆 WINNER</div>
          <h2 style={{ fontSize: 'clamp(30px, 5.5vw, 80px)', margin: '12px 0 6px', lineHeight: 1.1 }}>{winner.film_title}</h2>
          {winner.director && <div style={{ fontSize: 'clamp(16px, 2vw, 28px)', color: 'var(--fc-text-secondary)' }}>Directed by {winner.director}</div>}
          <div style={{ marginTop: '14px', fontSize: 'clamp(16px, 1.8vw, 26px)' }}>
            <Stars value={winner.average_rating} />{' '}
            <span style={{ color: 'var(--fc-text-muted)' }}>{winner.average_rating.toFixed(2)} · {winner.total_votes} votes</span>
          </div>
        </section>
      )}

      {runnersUp.length > 0 && (
        <section style={{ maxWidth: '980px', margin: '0 auto' }}>
          {runnersUp.map(s => (
            <div key={s.film_id} style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', marginBottom: '10px',
              borderRadius: '12px', background: 'var(--fc-surface-card)', border: '1px solid var(--fc-border)'
            }}>
              <div style={{ fontSize: 'clamp(18px, 2vw, 30px)', fontWeight: 900, color: 'var(--fc-text-muted)', minWidth: '2.2em' }}>#{s.rank}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'clamp(16px, 1.9vw, 28px)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.film_title}</div>
                {s.director && <div style={{ fontSize: 'clamp(12px, 1.2vw, 18px)', color: 'var(--fc-text-muted)' }}>{s.director}</div>}
              </div>
              <div style={{ textAlign: 'right', fontSize: 'clamp(13px, 1.4vw, 20px)', whiteSpace: 'nowrap' }}>
                <Stars value={s.average_rating} />
                <div style={{ color: 'var(--fc-text-muted)' }}>{s.total_votes} votes</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {!winner && <p style={{ textAlign: 'center', color: 'var(--fc-text-muted)' }}>No eligible films yet.</p>}
    </div>
  );
}
