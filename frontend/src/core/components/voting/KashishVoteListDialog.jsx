/**
 * KashishVoteListDialog: the votes behind one Sync status count (Voting › Sync status), so staff can
 * see who a vote that didn't count belongs to and why (docs/adr/0004).
 *
 * Shows the voter's Kashish name, email and mobile, the film and rating, when they voted, the
 * delegate they matched (if any) with that delegate's scans, and the reason. Search, pages and a
 * CSV export of every matching vote. Data: GET /api/kashish-sync/external-votes (voting.audit_fraud).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import SearchInput from '../common/SearchInput';
import Pagination from '../common/Pagination';
import { CloseIcon, FileDownloadIcon } from '../common/Icons';

const PAGE_SIZE = 25;

function formatDateTime(value, withSeconds = false) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) });
}

function errorText(err, fallback) {
  return err?.response?.data?.error || fallback;
}

export default function KashishVoteListDialog({ group, label, hint, onClose }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const requestRef = useRef(0);
  const listRef = useRef(null);

  // Debounce the search box; a new search starts at page 1
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/kashish-sync/external-votes', { params: { group, search: search || undefined, page, page_size: PAGE_SIZE } });
      if (id !== requestRef.current) return;
      setData(res.data);
      if (res.data.page && res.data.page !== page) setPage(res.data.page);
    } catch (err) {
      if (id === requestRef.current) setError(errorText(err, 'Could not load the votes.'));
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [group, search, page]);

  useEffect(() => { load(); }, [load]);

  // Escape closes the dialog
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changePage = (p) => {
    setPage(p);
    listRef.current?.scrollTo({ top: 0 });
  };

  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await api.get('/kashish-sync/external-votes', { params: { group, search: search || undefined, format: 'csv' }, responseType: 'blob' });
      const name = /filename="([^"]+)"/.exec(res.headers?.['content-disposition'] || '')?.[1] || `kashish-votes-${group}.csv`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Could not export the votes.');
    } finally {
      setExporting(false);
    }
  };

  const votes = data?.votes || [];
  const total = data?.total ?? 0;
  // Votes that never reach the delegate check have no matched delegate or scans to show
  const showDelegate = votes.some((v) => v.delegate) || !['unregistered', 'unscheduled', 'removed'].includes(group);
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="fc-modal-overlay" onClick={onClose}>
      <div className="fc-modal-card fc-kvl" role="dialog" aria-modal="true" aria-labelledby="fc-kvl-title" onClick={(e) => e.stopPropagation()}>
        <div className="fc-kvl-head">
          <div className="fc-kvl-head-text">
            <h2 id="fc-kvl-title">{label} <span className="fc-kvl-count">({total})</span></h2>
            {hint && <p>{hint}</p>}
          </div>
          <button type="button" className="fc-modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={16} /></button>
        </div>

        <div className="fc-kvl-tools">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            loading={loading && Boolean(searchInput)}
            placeholder="Search voter, email, mobile, film or delegate"
            maxWidth="420px"
            style={{ flex: '1 1 260px' }}
          />
          <button type="button" className="fc-kv-btn" onClick={exportCsv} disabled={exporting || !total}>
            <FileDownloadIcon size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        {error && <p className="fc-kv-banner is-warning fc-kvl-error" role="alert">{error}</p>}

        <div className="fc-kvl-list" ref={listRef}>
          {!data && loading ? (
            <div className="fc-kv-empty">Loading votes…</div>
          ) : !votes.length ? (
            <div className="fc-kv-empty">{search ? `No votes match "${search}".` : 'No votes in this group.'}</div>
          ) : (
            <table className="fc-kv-table fc-kvl-table">
              <thead>
                <tr>
                  <th>Voter (Kashish app)</th>
                  <th>Film</th>
                  <th>Voted</th>
                  {showDelegate && <th>Matched delegate</th>}
                  <th>{group === 'counted' ? 'Result' : "Why it didn't count"}</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => (
                  <tr key={v.id}>
                    <td data-label="Voter">
                      <div className="fc-kvl-strong">{v.voter.name || 'No name'}</div>
                      {v.voter.email && <div className="fc-kvl-sub">{v.voter.email}</div>}
                      {v.voter.mobile && <div className="fc-kvl-sub">{v.voter.mobile}</div>}
                    </td>
                    <td data-label="Film">
                      <div className="fc-kvl-strong">{v.film.title}</div>
                      {v.stars !== null && <div className="fc-kvl-sub">{v.stars} ★</div>}
                    </td>
                    <td data-label="Voted" className="fc-kvl-nowrap">{formatDateTime(v.voted_at, true)}</td>
                    {showDelegate && (
                      <td data-label="Matched delegate">
                        {v.delegate ? (
                          <>
                            <div className="fc-kvl-strong">{v.delegate.name}</div>
                            {v.delegate.phone && <div className="fc-kvl-sub">{v.delegate.phone}</div>}
                            {v.scans.length ? (
                              <ul className="fc-kvl-scans">
                                {v.scans.map((s, i) => (
                                  <li key={i}>
                                    Scanned for {s.show} at {formatDateTime(s.scanned_at, true)}{' '}
                                    <span className={s.status === 'valid' ? 'fc-kvl-in' : 'fc-kvl-out'}>{s.status === 'valid' ? 'in window' : 'outside window'}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <div className="fc-kvl-sub">Never scanned</div>}
                          </>
                        ) : <span className="fc-kvl-sub">None</span>}
                      </td>
                    )}
                    <td data-label="Why" className="fc-kvl-reason">{v.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > 0 && (
          <div className="fc-pg-bar fc-kvl-foot">
            <span className="fc-pg-summary">Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong></span>
            <Pagination page={page} totalPages={data?.total_pages || 1} onChange={changePage} />
          </div>
        )}
      </div>
    </div>
  );
}
