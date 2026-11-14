/**
 * ScreeningsEditor — the festival schedule (Settings › Audience › Screenings).
 *
 * Each show is a screening block: date, start, end, title, type, Audience Choice voting on/off and,
 * for festivals whose votes come from the Kashish app, the Kashish films it plays. Every show has an
 * attendance window (from `before` minutes before the start to `endBefore` minutes before the end,
 * Voting Rules); a vote for a film counts only with a scan inside a window of one of its shows,
 * before the vote. A delayed show is edited here and its window moves with it; stored votes are
 * re-checked on save. See docs/adr/0004-kashish-external-leaderboard.md, Amendment 2.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { AddIcon, EditIcon, DeleteIcon, CloseIcon, WarningIcon, CheckCircleIcon, ScheduleIcon, HowToVoteIcon } from '../common/Icons';

const TYPES = [
  { value: 'feature', label: 'Feature' },
  { value: 'short_block', label: 'Shorts package' },
  { value: 'panel', label: 'Panel or talk' },
  { value: 'gala', label: 'Ceremony' }
];
const typeLabel = (v) => TYPES.find((t) => t.value === v)?.label || 'Feature';

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromMin = (n) => {
  const t = ((n % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/** '13:45' → '1:45 PM' */
function clock(hhmm) {
  const n = toMin(hhmm);
  if (n === null) return '';
  const h = Math.floor(n / 60) % 24;
  const m = n % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function runMinutes(start, end) {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return null;
  return e > s ? e - s : e + 1440 - s;
}
/** Attendance window labels for a start/end, mirroring showWindows.service.js. */
function windowFor(start, end, before, endBefore) {
  const s = toMin(start);
  const run = runMinutes(start, end);
  if (s === null || !run) return null;
  const opens = s - before;
  let closes = s + run - endBefore;
  if (closes <= opens) closes = opens + 1;
  return { opens: fromMin(opens), closes: fromMin(closes) };
}
const dayLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const norm = (t) => String(t || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const EMPTY = { title: '', screening_date: '', start_time: '', end_time: '', duration_min: '', block_type: 'feature', voting_enabled: true, venue_id: '', kashish_films: [] };

export default function ScreeningsEditor({ venues = [], isKashish = false }) {
  const [shows, setShows] = useState([]);
  const [offsets, setOffsets] = useState({ before_min: 15, end_before_min: 15 });
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { kind: 'ok' | 'warn', text }
  const [editing, setEditing] = useState(null); // { id|null, form }
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, m] = await Promise.all([
        api.get('/audience/screenings'),
        isKashish ? api.get('/audience/screenings/kashish-movies').catch(() => ({ data: { movies: [] } })) : Promise.resolve({ data: { movies: [] } })
      ]);
      setShows(s.data.screenings || []);
      if (s.data.attendance_window) setOffsets(s.data.attendance_window);
      setMovies(m.data.movies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [isKashish]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const map = new Map();
    shows.forEach((s) => {
      if (!map.has(s.screening_date)) map.set(s.screening_date, []);
      map.get(s.screening_date).push(s);
    });
    return [...map.entries()];
  }, [shows]);
  const unscheduled = movies.filter((m) => !m.screening_ids.length);

  const openNew = () => {
    const last = shows[shows.length - 1];
    setEditing({ id: null, form: { ...EMPTY, screening_date: last?.screening_date || '', venue_id: last?.venue_id || '' } });
  };
  const openEdit = (s) => setEditing({
    id: s.id,
    form: {
      title: s.title,
      screening_date: s.screening_date,
      start_time: s.start_time,
      end_time: s.end_time,
      duration_min: String(runMinutes(s.start_time, s.end_time) || ''),
      block_type: s.block_type,
      voting_enabled: s.voting_enabled,
      venue_id: s.venue_id || '',
      kashish_films: s.kashish_films || []
    }
  });

  const remove = async (s) => {
    setConfirmDelete(null);
    try {
      await api.delete(`/audience/screenings/${s.id}`);
      setNotice({ kind: 'ok', text: `Removed ${s.title}.` });
      load();
    } catch (err) {
      setNotice({ kind: 'warn', text: err.response?.data?.error || 'Could not remove the show.' });
    }
  };

  return (
    <div className="fc-sch">
      <div className="fc-sch-head">
        <div>
          <h2 className="fc-sch-title">Screenings</h2>
          <p className="fc-sch-sub">
            Each show&apos;s attendance window runs from {offsets.before_min} min before it starts to {offsets.end_before_min} min before it ends (Voting Rules).
            {isKashish ? ' A vote for a film counts only when the delegate was scanned in during a window of one of its shows, before voting.' : ''}
            {' '}When a show is delayed, change its times here: the window moves with it.
          </p>
        </div>
        <button type="button" className="fc-sch-btn is-primary" onClick={openNew}><AddIcon size={16} /> Add show</button>
      </div>

      {notice && (
        <div className={`fc-sch-notice ${notice.kind === 'warn' ? 'is-warn' : ''}`} role="status">
          {notice.kind === 'warn' ? <WarningIcon size={16} /> : <CheckCircleIcon size={16} />}
          <span>{notice.text}</span>
          <button type="button" className="fc-sch-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss"><CloseIcon size={14} /></button>
        </div>
      )}
      {error && <div className="fc-sch-notice is-warn" role="alert"><WarningIcon size={16} /> <span>{error}</span></div>}

      {isKashish && unscheduled.length > 0 && (
        <div className="fc-sch-unscheduled">
          <div className="fc-sch-unscheduled-head"><WarningIcon size={16} /> {unscheduled.length} Kashish film{unscheduled.length === 1 ? '' : 's'} with votes {unscheduled.length === 1 ? 'is' : 'are'} not on any show</div>
          <p>Their votes don&apos;t count until the film is added to the show it plays in.</p>
          <div className="fc-sch-chips">
            {unscheduled.map((m) => <span key={m.id} className="fc-sch-chip is-muted">{m.title} · {m.votes} vote{m.votes === 1 ? '' : 's'}</span>)}
          </div>
        </div>
      )}

      {loading ? (
        <div className="fc-sch-empty">Loading the schedule…</div>
      ) : shows.length === 0 ? (
        <div className="fc-sch-empty">No shows yet. Add each show of the festival with its date and times.</div>
      ) : (
        days.map(([date, list]) => (
          <section key={date} className="fc-sch-day">
            <h3 className="fc-sch-day-title">{dayLabel(date)}</h3>
            <div className="fc-sch-list">
              {list.map((s) => (
                <article key={s.id} className="fc-sch-row">
                  <div className="fc-sch-time">
                    <strong>{clock(s.start_time)}</strong>
                    <span>to {clock(s.end_time)}</span>
                  </div>
                  <div className="fc-sch-main">
                    <div className="fc-sch-row-title">
                      {s.title}
                      <span className="fc-sch-tag">{typeLabel(s.block_type)}</span>
                      {s.voting_enabled
                        ? <span className="fc-sch-tag is-vote"><HowToVoteIcon size={12} /> Voting</span>
                        : <span className="fc-sch-tag is-muted">No voting</span>}
                    </div>
                    <div className="fc-sch-meta">
                      {s.attendance_window && <span><ScheduleIcon size={13} /> Attendance {clock(s.attendance_window.opens)}–{clock(s.attendance_window.closes)}</span>}
                      {s.venue_name && <span>{s.venue_name}</span>}
                      <span>{Number(s.checked_in_count) || 0} checked in{Number(s.scan_count) > Number(s.checked_in_count) ? ` · ${s.scan_count} scans` : ''}</span>
                    </div>
                    {isKashish && (
                      <div className="fc-sch-chips">
                        {(s.kashish_films || []).length
                          ? s.kashish_films.map((f) => <span key={f.id} className="fc-sch-chip">{f.title || f.id}</span>)
                          : s.voting_enabled && <span className="fc-sch-chip is-warn">No Kashish films linked</span>}
                      </div>
                    )}
                  </div>
                  <div className="fc-sch-actions">
                    {confirmDelete === s.id ? (
                      <>
                        <span className="fc-sch-confirm">Remove?</span>
                        <button type="button" className="fc-sch-btn is-danger is-small" onClick={() => remove(s)}>Remove</button>
                        <button type="button" className="fc-sch-btn is-small" onClick={() => setConfirmDelete(null)}>Keep</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="fc-sch-icon-btn" onClick={() => openEdit(s)} aria-label={`Edit ${s.title}`} title="Edit"><EditIcon size={16} /></button>
                        <button type="button" className="fc-sch-icon-btn" onClick={() => setConfirmDelete(s.id)} aria-label={`Remove ${s.title}`} title="Remove"><DeleteIcon size={16} /></button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      {editing && (
        <ShowDialog
          initial={editing}
          offsets={offsets}
          venues={venues}
          isKashish={isKashish}
          movies={movies}
          shows={shows}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNotice(msg); load(); }}
        />
      )}
    </div>
  );
}

function ShowDialog({ initial, offsets, venues, isKashish, movies, shows, onClose, onSaved }) {
  const [form, setForm] = useState(initial.form);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pick, setPick] = useState('');
  const [manual, setManual] = useState({ id: '', title: '' });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Running time and end time stay in step
  const setStart = (start_time) => {
    const d = Number(form.duration_min);
    set({ start_time, ...(d > 0 && toMin(start_time) !== null ? { end_time: fromMin(toMin(start_time) + d) } : {}) });
  };
  const setDuration = (duration_min) => {
    const d = Number(duration_min);
    set({ duration_min, ...(d > 0 && toMin(form.start_time) !== null ? { end_time: fromMin(toMin(form.start_time) + d) } : {}) });
  };
  const setEnd = (end_time) => set({ end_time, duration_min: String(runMinutes(form.start_time, end_time) || '') });

  const win = windowFor(form.start_time, form.end_time, offsets.before_min, offsets.end_before_min);
  const linked = new Set(form.kashish_films.map((f) => f.id));
  const showTitle = (id) => shows.find((s) => s.id === id)?.title;
  // Suggest Kashish films whose titles appear in the show title (e.g. a feature shown on its own)
  const suggestions = movies.filter((m) => !linked.has(m.id) && norm(form.title) && (norm(m.title).includes(norm(form.title)) || norm(form.title).includes(norm(m.title))));

  const addFilm = (f) => { if (f.id && !linked.has(f.id)) set({ kashish_films: [...form.kashish_films, f] }); };
  const removeFilm = (id) => set({ kashish_films: form.kashish_films.filter((f) => f.id !== id) });

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body = {
      title: form.title,
      screening_date: form.screening_date,
      start_time: form.start_time,
      end_time: form.end_time,
      block_type: form.block_type,
      voting_enabled: form.voting_enabled,
      venue_id: form.venue_id || null,
      ...(isKashish ? { kashish_films: form.kashish_films } : {})
    };
    try {
      const res = initial.id ? await api.put(`/audience/screenings/${initial.id}`, body) : await api.post('/audience/screenings', body);
      const warnings = res.data.warnings || [];
      onSaved(warnings.length ? { kind: 'warn', text: `${res.data.message} ${warnings.join(' ')}` } : { kind: 'ok', text: res.data.message });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the show.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fc-sch-overlay" role="presentation">
      <form className="fc-sch-dialog" role="dialog" aria-modal="true" aria-labelledby="fc-sch-dialog-title" onSubmit={save}>
        <div className="fc-sch-dialog-head">
          <h2 id="fc-sch-dialog-title">{initial.id ? 'Edit show' : 'Add show'}</h2>
          <button type="button" className="fc-sch-icon-btn" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </div>
        <div className="fc-sch-dialog-body">
          <label className="fc-sch-field">
            <span>Title</span>
            <input type="text" value={form.title} maxLength={255} onChange={(e) => set({ title: e.target.value })} placeholder="For example: TINY TAILS" required />
          </label>
          <div className="fc-sch-grid">
            <label className="fc-sch-field">
              <span>Date</span>
              <input type="date" value={form.screening_date} onChange={(e) => set({ screening_date: e.target.value })} required />
            </label>
            <label className="fc-sch-field">
              <span>Type</span>
              <select value={form.block_type} onChange={(e) => set({ block_type: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <div className="fc-sch-grid is-three">
            <label className="fc-sch-field">
              <span>Starts</span>
              <input type="time" value={form.start_time} onChange={(e) => setStart(e.target.value)} required />
            </label>
            <label className="fc-sch-field">
              <span>Running time (min)</span>
              <input type="number" min={1} max={720} value={form.duration_min} onChange={(e) => setDuration(e.target.value)} />
            </label>
            <label className="fc-sch-field">
              <span>Ends</span>
              <input type="time" value={form.end_time} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          </div>
          {win && (
            <div className="fc-sch-window"><ScheduleIcon size={14} /> Attendance window: <strong>{clock(win.opens)} – {clock(win.closes)}</strong></div>
          )}
          {venues.length > 0 && (
            <label className="fc-sch-field">
              <span>Venue</span>
              <select value={form.venue_id} onChange={(e) => set({ venue_id: e.target.value })}>
                <option value="">Not set</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          )}
          <label className="fc-sch-check">
            <input type="checkbox" checked={form.voting_enabled} onChange={(e) => set({ voting_enabled: e.target.checked })} />
            <span>Audience Choice voting for this show <small>Turn off for ceremonies, panels and talks.</small></span>
          </label>

          {isKashish && form.voting_enabled && (
            <div className="fc-sch-films">
              <span className="fc-sch-label">Kashish films in this show</span>
              <div className="fc-sch-chips">
                {form.kashish_films.length === 0 && <span className="fc-sch-hint">No films yet. Votes for a film count only once it is linked to its show.</span>}
                {form.kashish_films.map((f) => (
                  <span key={f.id} className="fc-sch-chip">
                    {f.title || f.id}
                    <button type="button" onClick={() => removeFilm(f.id)} aria-label={`Remove ${f.title || f.id}`}><CloseIcon size={12} /></button>
                  </span>
                ))}
              </div>
              {suggestions.length > 0 && (
                <div className="fc-sch-suggest">
                  Matches the title:
                  {suggestions.map((m) => <button key={m.id} type="button" className="fc-sch-btn is-small" onClick={() => addFilm({ id: m.id, title: m.title })}><AddIcon size={13} /> {m.title}</button>)}
                </div>
              )}
              <div className="fc-sch-pick">
                <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Kashish film">
                  <option value="">Choose a film that has votes…</option>
                  {movies.filter((m) => !linked.has(m.id)).map((m) => {
                    const elsewhere = m.screening_ids.filter((id) => id !== initial.id).map(showTitle).filter(Boolean);
                    return <option key={m.id} value={m.id}>{m.title} ({m.votes} vote{m.votes === 1 ? '' : 's'}){elsewhere.length ? ` · also in ${elsewhere.join(', ')}` : ''}</option>;
                  })}
                </select>
                <button type="button" className="fc-sch-btn is-small" disabled={!pick} onClick={() => { const m = movies.find((x) => x.id === pick); if (m) addFilm({ id: m.id, title: m.title }); setPick(''); }}>Add</button>
              </div>
              <div className="fc-sch-pick">
                <input type="text" value={manual.id} maxLength={64} onChange={(e) => setManual({ ...manual, id: e.target.value.trim() })} placeholder="Kashish movie ID" aria-label="Kashish movie ID" />
                <input type="text" value={manual.title} maxLength={255} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="Film title" aria-label="Film title" />
                <button type="button" className="fc-sch-btn is-small" disabled={!/^[A-Za-z0-9_-]{1,64}$/.test(manual.id)} onClick={() => { addFilm({ id: manual.id, title: manual.title.trim() }); setManual({ id: '', title: '' }); }}>Add</button>
              </div>
              <span className="fc-sch-hint">Films that haven&apos;t had a vote yet can be added by their Kashish movie ID.</span>
            </div>
          )}
          {error && <div className="fc-sch-notice is-warn" role="alert"><WarningIcon size={16} /> <span>{error}</span></div>}
        </div>
        <div className="fc-sch-dialog-foot">
          <button type="button" className="fc-sch-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="fc-sch-btn is-primary" disabled={saving}>{saving ? 'Saving…' : initial.id ? 'Save show' : 'Add show'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
