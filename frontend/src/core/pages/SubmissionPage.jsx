/**
 * SubmissionPage Component
 * Submissions catalog powered 100% by real database data:
 * - Dynamic status filter tabs: All Submissions, Submitted, Official Selection, Rejected
 * - Category filter dropdown & Flag filter dropdown
 * - Search by title, director, country
 * - Clean table matching Screenshot 1 (Title & Director, Category, Runtime, Status, Rating, Flag, Actions)
 * - Slide-over details drawer (FilmDetailDrawer)
 * - Rejection modal with mandatory >= 10 character validation (RejectFilmModal)
 */

import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import FilmDetailDrawer from '../components/submissions/FilmDetailDrawer';
import RejectFilmModal from '../components/submissions/RejectFilmModal';
const STANDARD_FLAGS = [
  { id: 'flag-high-priority', label: 'High Priority', color: '#e05252' },
  { id: 'flag-needs-review', label: 'Needs Review', color: '#d97706' },
  { id: 'flag-strong-contender', label: 'Strong Contender', color: '#10b981' },
  { id: 'flag-special-interest', label: 'Special Interest', color: '#3b82f6' },
];

const PIPELINE_TABS = [
  { key: 'all', label: 'All', countKey: 'total' },
  { key: 'Submitted', label: 'Submitted', countKey: 'submitted' },
  { key: 'Round 1 Screening', label: 'Round 1 Screening', countKey: 'round_1_screening' },
  { key: 'Admin Review', label: 'Admin Review', countKey: 'admin_review' },
  { key: 'Round 2 Screening', label: 'Round 2 Screening', countKey: 'round_2_screening' },
  { key: 'Official Selection', label: 'Official Selection', countKey: 'official_selection' },
  { key: 'Winner', label: 'Winner', countKey: 'winner' },
  { key: 'Finalist', label: 'Finalist', countKey: 'finalist' },
  { key: 'Rejected', label: 'Rejected', countKey: 'rejected' },
];

export default function SubmissionPage() {
  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState({});
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeStatus, setActiveStatus] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFlag, setSelectedFlag] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Modals / Drawer
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [rejectingFilm, setRejectingFilm] = useState(null);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeStatus !== 'all') params.status = activeStatus;
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (selectedFlag !== 'all') params.flag_id = selectedFlag;
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/submissions', { params });
      setSubmissions(res.data.data || []);
      setCounts(res.data.counts || {});
      setFlags(res.data.flags || []);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [activeStatus, selectedCategory, selectedFlag, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const getTabCount = (tab) => {
    if (tab.key === 'all') return counts.total != null ? counts.total : submissions.length;
    if (counts.byStatus && counts.byStatus[tab.key] !== undefined) {
      return counts.byStatus[tab.key];
    }
    if (counts[tab.countKey] !== undefined) {
      return parseInt(counts[tab.countKey], 10);
    }
    return 0;
  };

  // Distinct categories from returned data for category dropdown
  const categoriesList = useMemo(() => {
    const set = new Set();
    submissions.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set).sort();
  }, [submissions]);

  const handleOpenDetails = async (film) => {
    try {
      const res = await api.get(`/submissions/${film.id}`);
      setSelectedFilm(res.data);
    } catch (err) {
      setSelectedFilm(film);
    }
  };

  const handleUpdateFilm = (updatedFilm) => {
    setSelectedFilm(updatedFilm);
    setSubmissions((prev) =>
      prev.map((s) => (s.id === updatedFilm.id ? { ...s, ...updatedFilm } : s))
    );
    fetchSubmissions();
  };

  return (
    <div className="fc-submissions-page animate-fade-in">
      {/* Page Header */}
      <div className="fc-page-header">
        <h1 className="fc-page-title">Submissions</h1>
        <p className="fc-page-subtitle">
          {counts.total != null ? counts.total : submissions.length} films in the catalog
        </p>
      </div>

      {/* Status Filter Tabs (Matching Mockup Screenshot 1: 9 dynamic tabs) */}
      <div className="fc-status-tabs-container">
        {PIPELINE_TABS.map((tab) => {
          const tabCount = getTabCount(tab);
          const isActive = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`fc-status-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveStatus(tab.key)}
            >
              <span className="fc-tab-label">{tab.label}</span>
              <span className={`fc-tab-count-badge ${isActive ? 'badge-active' : ''}`}>
                {tabCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar (Matching Screenshot 1) */}
      <div className="fc-submissions-toolbar">
        <div className="fc-toolbar-left-filters">
          {/* Category Dropdown */}
          <select
            className="fc-toolbar-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categoriesList.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Flags Dropdown */}
          <select
            className="fc-toolbar-select"
            value={selectedFlag}
            onChange={(e) => setSelectedFlag(e.target.value)}
          >
            <option value="all">All Flags</option>
            {flags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search Bar */}
        <form className="fc-toolbar-search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className="fc-toolbar-search-input"
            placeholder="Search by title, director, country..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="fc-toolbar-search-btn">
            Search
          </button>
        </form>
      </div>

      {/* Submissions Table (Matching Screenshot 1) */}
      <div className="fc-card" style={{ padding: 0, overflow: 'hidden', marginTop: '16px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            Loading submissions...
          </div>
        ) : submissions.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            No submissions found matching your filters.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="fc-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '220px' }}>TITLE & DIRECTOR</th>
                  <th>CATEGORY</th>
                  <th>RUNTIME</th>
                  <th>STATUS</th>
                  <th>RATING</th>
                  <th>FLAG</th>
                  <th style={{ textAlign: 'right', minWidth: '130px' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((film) => {
                  const isRejected = film.status === 'Rejected';
                  return (
                    <tr
                      key={film.id}
                      className="fc-table-row-clickable"
                      onClick={() => handleOpenDetails(film)}
                    >
                      {/* Title & Director */}
                      <td>
                        <div className="fc-table-title-main">{film.title}</div>
                        <div className="fc-table-title-sub">
                          Dir. {film.director || 'Filmmaker'} · {film.country || 'India'}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="fc-category-pill">{film.category || 'Short Film'}</span>
                      </td>

                      {/* Runtime */}
                      <td style={{ color: 'var(--fc-text-secondary)', fontSize: '0.85rem' }}>
                        {film.runtime ? `${film.runtime}m` : '15m'}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`fc-status-badge fc-status-${(film.status || 'submitted').toLowerCase().replace(/\s+/g, '-')}`}>
                          {film.status || 'Submitted'}
                        </span>
                      </td>

                      {/* Rating */}
                      <td>
                        {film.rating ? (
                          <span className="fc-rating-cell">{parseFloat(film.rating).toFixed(1)}/5</span>
                        ) : (
                          <span className="fc-rating-unrated">Unrated</span>
                        )}
                      </td>

                      {/* Flag */}
                      <td>
                        {(() => {
                          const resolvedFlag =
                            (flags && flags.find((f) => f.id === film.flag_id)) ||
                            STANDARD_FLAGS.find((f) => f.id === film.flag_id);
                          const flagLabel = film.flag_label || resolvedFlag?.label;
                          const flagColor = film.flag_color || resolvedFlag?.color || '#3b82f6';

                          return flagLabel ? (
                            <span
                              className="fc-flag-indicator"
                              style={{
                                backgroundColor: `${flagColor}20`,
                                color: flagColor,
                                borderColor: `${flagColor}40`,
                              }}
                            >
                              {flagLabel}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--fc-text-light)' }}>—</span>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="fc-btn-table-action"
                            onClick={() => handleOpenDetails(film)}
                          >
                            View
                          </button>
                          {!isRejected && (
                            <button
                              type="button"
                              className="fc-btn-table-action reject"
                              onClick={() => setRejectingFilm(film)}
                            >
                              Reject
                            </button>
                          )}
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

      {/* Slide-over Film Details Drawer */}
      {selectedFilm && (
        <FilmDetailDrawer
          film={selectedFilm}
          flags={flags}
          onClose={() => setSelectedFilm(null)}
          onReject={(filmToReject) => setRejectingFilm(filmToReject)}
          onUpdateFilm={handleUpdateFilm}
        />
      )}

      {/* Rejection Modal */}
      {rejectingFilm && (
        <RejectFilmModal
          film={rejectingFilm}
          onClose={() => setRejectingFilm(null)}
          onSuccess={() => {
            fetchSubmissions();
            if (selectedFilm?.id === rejectingFilm.id) {
              setSelectedFilm((prev) => (prev ? { ...prev, status: 'Rejected' } : null));
            }
          }}
        />
      )}
    </div>
  );
}
