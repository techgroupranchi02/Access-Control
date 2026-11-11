/**
 * KashishVotingBoard: the Voting page for festivals whose audience votes come from the
 * Kashish Pride app (Settings › Audience › Voting Rules › "Kashish Pride app"; docs/adr/0004).
 *
 * Two tabs only:
 *   - Leaderboard: standings by Kashish film name (films are not FestiPlus submissions),
 *     Approve & Publish (freezes the published results), Publish again, winners screen link.
 *   - Sync status: last sync, why votes did or didn't count, per-film counts, recent syncs.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import {
  TrophyIcon,
  SyncIcon,
  CheckCircleIcon,
  WarningIcon,
  InfoIcon,
  OpenInNewIcon
} from '../common/Icons';

const OUTCOME_TILES = [
  { key: 'counted', label: 'Counted', hint: 'Registered, checked-in delegates, inside the voting period', tone: 'success' },
  { key: 'unregistered', label: 'Not a registered delegate', hint: 'No KASHISH registration with the same email or mobile number', tone: 'warning' },
  { key: 'not_checked_in', label: 'Not checked in', hint: 'Registered, but no check-in at the festival yet', tone: 'warning' },
  { key: 'outside_period', label: 'Outside voting period', hint: 'Cast before or after the voting dates in Settings', tone: 'neutral' },
  { key: 'other', label: 'Other', hint: 'Not verified by Kashish, invalid rating, or a repeat vote', tone: 'neutral' }
];

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function errorText(err, fallback) {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

export default function KashishVotingBoard({ initialData, festivalId }) {
  const [tab, setTab] = useState('leaderboard');
  const [data, setData] = useState(initialData || {});
  const [summary, setSummary] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState(null); // { tone: 'success' | 'error', text }

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await api.get('/voting/leaderboard');
      setData(res.data || {});
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get('/kashish-sync/external-summary');
      setSummary(res.data || null);
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, 'Could not load the sync status.') });
    }
  }, []);

  // Leaderboard refreshes quietly every 15s (auto-sync brings in new votes); sync status loads on open
  useEffect(() => {
    if (tab === 'sync') {
      loadSummary();
      return undefined;
    }
    const t = setInterval(loadLeaderboard, 15000);
    return () => clearInterval(t);
  }, [tab, loadLeaderboard, loadSummary]);

  const handleSync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await api.post('/kashish-sync/sync-votes');
      setNotice({ tone: 'success', text: res.data?.message || 'Sync completed.' });
      await Promise.all([loadLeaderboard(), loadSummary()]);
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, 'Sync failed. Please try again.') });
    } finally {
      setSyncing(false);
    }
  };

  const handlePublish = async () => {
    const again = data?.approval?.is_approved;
    const ok = window.confirm(again
      ? 'Publish the current standings? The winners screen and the Kashish app will switch to them.'
      : 'Publish these standings as the official Audience Choice results? The winners screen and the Kashish app will show them.');
    if (!ok) return;
    setPublishing(true);
    setNotice(null);
    try {
      const res = await api.post('/voting/approve-results');
      setNotice({ tone: 'success', text: res.data?.message || 'Results published.' });
      await loadLeaderboard();
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, 'Could not publish the results.') });
    } finally {
      setPublishing(false);
    }
  };

  const rows = data?.leaderboard || [];
  const approval = data?.approval || { is_approved: false };
  const period = data?.voting_period || {};
  const countedTotal = rows.reduce((t, r) => t + Number(r.total_votes || 0), 0);
  const periodText = period.from || period.to
    ? `${period.from ? formatDateTime(period.from) : 'any time'} – ${period.to ? formatDateTime(period.to) : 'no end date'}`
    : null;

  return (
    <div className="fc-kv">
      <div className="fc-kv-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'leaderboard'} className={`fc-kv-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
          <TrophyIcon size={14} /> Leaderboard
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sync'} className={`fc-kv-tab ${tab === 'sync' ? 'active' : ''}`} onClick={() => setTab('sync')}>
          <SyncIcon size={14} /> Sync status
        </button>
      </div>

      {notice && (
        <div className={`fc-kv-notice is-${notice.tone}`} role="status">
          {notice.tone === 'success' ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} />}
          <span>{notice.text}</span>
          <button type="button" className="fc-kv-notice-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {tab === 'leaderboard' && (
        <section className="fc-kv-card">
          {/* Publish banner */}
          <div className={`fc-kv-banner ${approval.is_approved ? 'is-published' : 'is-draft'}`}>
            <div className="fc-kv-banner-text">
              <div className="fc-kv-banner-title">
                {approval.is_approved ? <CheckCircleIcon size={18} /> : <WarningIcon size={18} />}
                <strong>{approval.is_approved ? 'Results published' : 'Draft standings, not published yet'}</strong>
              </div>
              <p>
                {approval.is_approved
                  ? `Published by ${approval.approved_by || 'Festival Administration'} on ${formatDateTime(approval.approved_at)}. The winners screen and the Kashish app show these standings.`
                  : 'The winners screen and the Kashish app show results only after you publish.'}
              </p>
              {approval.is_approved && approval.changed_since && (
                <p className="fc-kv-banner-warn">
                  <InfoIcon size={14} /> Votes have changed since then. Publish again to update the public results.
                </p>
              )}
            </div>
            <div className="fc-kv-banner-actions">
              {approval.is_approved && festivalId && (
                <a className="fc-kv-btn" href={`/results/${festivalId}`} target="_blank" rel="noopener noreferrer">
                  Open winners screen <OpenInNewIcon size={13} />
                </a>
              )}
              <button type="button" className="fc-kv-btn fc-kv-btn--primary" onClick={handlePublish} disabled={publishing || countedTotal === 0} title={countedTotal === 0 ? 'Nothing to publish until at least one vote counts' : undefined}>
                {publishing ? 'Publishing…' : approval.is_approved ? 'Publish again' : 'Approve & Publish'}
              </button>
            </div>
          </div>

          <div className="fc-kv-head">
            <div>
              <h2>Audience Choice standings</h2>
              <p>
                Votes from the Kashish Pride app
                {data?.last_sync_at ? ` · Last synced ${formatDateTime(data.last_sync_at)}` : ' · Not synced yet'}
                {periodText ? ` · Voting period ${periodText}` : ''}
              </p>
              <p>Ranked by Bayesian score (m = {data?.adjustment_number ?? 10}). Ties: more votes, then higher average.</p>
            </div>
            <button type="button" className="fc-kv-btn" onClick={loadLeaderboard}>
              <SyncIcon size={13} /> Refresh
            </button>
          </div>

          {!periodText && (
            <div className="fc-kv-hint">
              <InfoIcon size={15} />
              <span>
                No voting period is set, so votes from any date count.{' '}
                <Link to="/settings/audience">Set the voting dates</Link> in Settings › Audience › Voting Rules.
              </span>
            </div>
          )}

          {rows.length > 0 && countedTotal === 0 && (
            <div className="fc-kv-hint">
              <InfoIcon size={15} />
              <span>
                No votes have counted yet.{' '}
                <button type="button" className="fc-kv-link" onClick={() => setTab('sync')}>See why on Sync status</button>.
              </span>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="fc-kv-empty">No films yet. Films appear here after the first sync with the Kashish app.</div>
          ) : (
            <div className="fc-kv-table-wrap">
              <table className="fc-kv-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Film</th>
                    <th className="num">Votes</th>
                    <th className="num">Avg rating</th>
                    <th className="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const rank = r.standing_rank || i + 1;
                    const podium = Number(r.total_votes) > 0 && rank <= 3;
                    return (
                      <tr key={r.film_id} className={podium && rank === 1 ? 'is-leader' : undefined}>
                        <td className="fc-kv-rank" data-label="Rank">
                          {Number(r.total_votes) > 0 ? <>{podium && <TrophyIcon size={14} />} #{rank}</> : '—'}
                        </td>
                        <td className="fc-kv-film" data-label="Film">{r.film_title}</td>
                        <td className="num" data-label="Votes">{Number(r.total_votes)}</td>
                        <td className="num" data-label="Avg rating">{Number(r.total_votes) > 0 ? `${Number(r.raw_average).toFixed(2)} ★` : '—'}</td>
                        <td className="num fc-kv-score" data-label="Score">{Number(r.total_votes) > 0 ? Number(r.bayesian_score).toFixed(3) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'sync' && (
        <section className="fc-kv-card">
          <div className="fc-kv-head">
            <div>
              <h2>Kashish Pride app sync</h2>
              <p>
                Votes are pulled automatically every few minutes during the voting period.
                {summary?.last_sync ? ` Last sync ${formatDateTime(summary.last_sync.completed_at)}.` : ''}
              </p>
            </div>
            <button type="button" className="fc-kv-btn fc-kv-btn--primary" onClick={handleSync} disabled={syncing}>
              <SyncIcon size={13} /> {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>

          {!summary ? (
            <div className="fc-kv-empty">Loading sync status…</div>
          ) : (
            <>
              <div className="fc-kv-tiles">
                {OUTCOME_TILES.map(t => {
                  const o = summary.outcomes || {};
                  const value = t.key === 'other' ? (o.not_verified || 0) + (o.invalid || 0) + (o.duplicate || 0) : (o[t.key] || 0);
                  return (
                    <div key={t.key} className={`fc-kv-tile is-${t.tone}`}>
                      <div className="fc-kv-tile-value">{value}</div>
                      <div className="fc-kv-tile-label">{t.label}</div>
                      <div className="fc-kv-tile-hint">{t.hint}</div>
                    </div>
                  );
                })}
              </div>
              <p className="fc-kv-note">
                {summary.total} votes received from the Kashish app. Voters are matched to KASHISH delegates by email, then by mobile number, so delegates should use the same email or phone in the Kashish app as when they registered.
              </p>

              <h3 className="fc-kv-subhead">Votes by film</h3>
              {summary.films?.length ? (
                <div className="fc-kv-table-wrap">
                  <table className="fc-kv-table">
                    <thead>
                      <tr>
                        <th>Film</th>
                        <th className="num">Counted</th>
                        <th className="num">Not registered</th>
                        <th className="num">Not checked in</th>
                        <th className="num">Outside period</th>
                        <th className="num">Other</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.films.map(f => (
                        <tr key={f.film_id}>
                          <td className="fc-kv-film" data-label="Film">{f.film_title}</td>
                          <td className="num" data-label="Counted"><strong>{f.counted}</strong></td>
                          <td className="num" data-label="Not registered">{f.unregistered}</td>
                          <td className="num" data-label="Not checked in">{f.not_checked_in}</td>
                          <td className="num" data-label="Outside period">{f.outside_period}</td>
                          <td className="num" data-label="Other">{f.other_skipped}</td>
                          <td className="num" data-label="Total">{f.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="fc-kv-empty">No votes received yet.</div>
              )}

              <h3 className="fc-kv-subhead">Recent syncs</h3>
              {summary.recent_syncs?.length ? (
                <div className="fc-kv-table-wrap">
                  <table className="fc-kv-table">
                    <thead>
                      <tr>
                        <th>Started</th>
                        <th>Status</th>
                        <th className="num">Votes received</th>
                        <th className="num">Counted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_syncs.map(l => (
                        <tr key={l.id}>
                          <td data-label="Started">{formatDateTime(l.started_at)}</td>
                          <td data-label="Status">
                            <span className={`fc-kv-status is-${l.status}`} title={l.error_message || undefined}>
                              {l.status === 'completed' ? 'Completed' : l.status === 'failed' ? 'Failed' : 'Running'}
                            </span>
                          </td>
                          <td className="num" data-label="Votes received">{l.total_fetched ?? '—'}</td>
                          <td className="num" data-label="Counted">{l.counted ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="fc-kv-empty">No syncs yet.</div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
