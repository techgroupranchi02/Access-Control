import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import { 
  TrophyIcon, 
  MovieIcon, 
  FileDownloadIcon, 
  ArrowBackIcon, 
  CrownIcon, 
  HourglassIcon, 
  StarIcon,
  ViewModuleIcon,
  ViewListIcon,
  SearchIcon,
  CloseIcon
} from '../common/Icons';

export default function WinnersBoard({
  stage,
  prevStage,
  nextStage,
  onGoToFinalists,
  onRefreshPipeline,
  onViewFilm,
  showToast
}) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryWinners, setCategoryWinners] = useState([]);
  const [unassignedWinners, setUnassignedWinners] = useState([]);
  const [finalistNoms, setFinalistNoms] = useState([]);
  const [stats, setStats] = useState({ totalCategories: 0, awardedCategories: 0, totalWinningFilms: 0 });
  const [viewMode, setViewMode] = useState('table'); // Default to unified 'table' view
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedFilterPill, setSelectedFilterPill] = useState('all');

  const stageName = stage?.unique_name || stage?.name || 'Festival Award Winners';
  const prevStageName = prevStage?.unique_name || prevStage?.name || 'Finalists';

  // Fetch Winners Board Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/submissions/winners-board', {
        params: stage?.id ? { stage_id: stage.id } : {}
      });
      if (res.data?.success) {
        setCategories(res.data.categories || []);
        setCategoryWinners(res.data.categoryWinners || []);
        setUnassignedWinners(res.data.unassignedWinners || []);
        setFinalistNoms(res.data.finalistNoms || []);
        setStats(res.data.stats || { totalCategories: 0, awardedCategories: 0, totalWinningFilms: 0 });
      }
    } catch (err) {
      console.error('Failed to load winners board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [stage?.id]);

  // Admin revoking a winner title
  const handleRevokeWinner = async (awardName, film) => {
    if (!window.confirm(`Revoke the Winner title for "${film.title}" in "${awardName}"?`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/submissions/remove-winner', {
        award_name: awardName,
        submission_id: film.submission_id || film.id
      });
      if (res.data?.success) {
        if (showToast) {
          showToast(res.data.message || `Winner revoked for "${awardName}".`);
        }
        await fetchData();
        if (onRefreshPipeline) onRefreshPipeline();
      }
    } catch (err) {
      console.error('Failed to revoke winner:', err);
      alert(err.response?.data?.error || 'Failed to revoke winner.');
    } finally {
      setActionLoading(false);
    }
  };

  // Export Winners as CSV
  const handleExportCsv = () => {
    const rows = [
      ['Award Category', 'Winner Film', 'Director', 'Category / Format', 'Country', 'Runtime (mins)', 'Jury Rating', 'Reviews Count']
    ];

    categoryWinners.forEach(c => {
      if (c.winner) {
        rows.push([
          c.category_name,
          c.winner.title || '',
          c.winner.director || '',
          c.winner.category || '',
          c.winner.country || '',
          c.winner.runtime_minutes || c.winner.runtime || '',
          c.winner.jury_rating || 'Unrated',
          c.winner.review_count || 0
        ]);
      } else {
        rows.push([c.category_name, 'No Winner Selected', '', '', '', '', '', '']);
      }
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `festival_official_winners_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered categories
  const filteredCategoryWinners = useMemo(() => {
    return categoryWinners.filter(c => {
      // 1. Filter pill
      if (selectedFilterPill === 'awarded' && !c.winner) return false;
      if (selectedFilterPill === 'pending' && c.winner) return false;
      if (selectedFilterPill !== 'all' && selectedFilterPill !== 'awarded' && selectedFilterPill !== 'pending') {
        if (c.category_name.toLowerCase() !== selectedFilterPill.toLowerCase()) return false;
      }

      // 2. Search query
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      const catMatch = c.category_name.toLowerCase().includes(q);
      const filmMatch = c.winner && (
        (c.winner.title && c.winner.title.toLowerCase().includes(q)) ||
        (c.winner.director && c.winner.director.toLowerCase().includes(q)) ||
        (c.winner.category && c.winner.category.toLowerCase().includes(q)) ||
        (c.winner.country && c.winner.country.toLowerCase().includes(q))
      );
      const nomineeMatch = c.nominees && c.nominees.some(n =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.director && n.director.toLowerCase().includes(q))
      );
      return catMatch || filmMatch || nomineeMatch;
    });
  }, [categoryWinners, selectedFilterPill, filterQuery]);

  if (loading) {
    return (
      <div style={{ background: 'var(--fc-surface-card, #ffffff)', borderRadius: '12px', padding: '36px', textAlign: 'center', border: '1px solid var(--fc-border, #e2e8f0)', color: 'var(--fc-text-muted, #64748b)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Loading official festival winners by category...
      </div>
    );
  }

  return (
    <div className="fc-winners-board animate-fade-in" style={{
      background: 'var(--fc-surface-card, #ffffff)',
      borderRadius: '12px',
      border: '1px solid var(--fc-border, #e2e8f0)',
      padding: '24px 28px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      marginBottom: '24px'
    }}>
      {/* ── TOP HEADER ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        paddingBottom: '18px',
        marginBottom: '22px',
        borderBottom: '1px solid var(--fc-border, #f1f5f9)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrophyIcon size={20} style={{ color: 'var(--fc-brand, #a82f2f)' }} />
            <strong style={{ fontSize: '16px', color: 'var(--fc-text-main, #0f172a)', fontWeight: 800 }}>
              {stageName} — Official Honours
            </strong>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--fc-text-secondary, #64748b)', marginTop: '4px' }}>
            Official category-wise award winners crowned by the festival director and jury panel.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="fc-winner-stats-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <TrophyIcon size={14} /> {stats.awardedCategories} / {stats.totalCategories} Categories Awarded
          </div>

          <div style={{
            background: 'var(--fc-surface, #f8fafc)',
            border: '1px solid var(--fc-border, #e2e8f0)',
            color: 'var(--fc-text-secondary, #334155)',
            borderRadius: '999px',
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <MovieIcon size={14} /> {stats.totalWinningFilms} Winning Film{stats.totalWinningFilms === 1 ? '' : 's'}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              background: 'var(--fc-surface-card, #ffffff)',
              border: '1px solid var(--fc-border, #cbd5e1)',
              color: 'var(--fc-text-main, #334155)',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileDownloadIcon size={14} /> Export CSV
          </button>

          {/* View Mode Switcher: Table vs Cards */}
          <div className="fc-nom-view-switcher">
            <button
              type="button"
              className={`fc-nom-view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Standard Master Table View (Single unified table)"
            >
              <ViewListIcon size={14} />
              <span>Table View</span>
            </button>
            <button
              type="button"
              className={`fc-nom-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Cards Board View (Detailed category cards)"
            >
              <ViewModuleIcon size={14} />
              <span>Cards View</span>
            </button>
          </div>

          {onGoToFinalists && (
            <button
              type="button"
              onClick={onGoToFinalists}
              style={{
                background: 'var(--fc-surface-card, #f8fafc)',
                border: '1px solid var(--fc-border, #cbd5e1)',
                color: 'var(--fc-text-secondary, #475569)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ArrowBackIcon size={14} /> Back to {prevStageName}
            </button>
          )}
        </div>
      </div>

      {/* ── FILTER & SEARCH TOOLBAR ─────────────────────────────────────── */}
      <div className="fc-stage-filter-bar" style={{ marginBottom: '16px' }}>
        {/* Row 1: Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '10px', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              <SearchIcon size={15} />
            </span>
            <input
              type="text"
              className="fc-input"
              placeholder="Search award category, winning film or director..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingRight: filterQuery ? '30px' : '12px',
                fontSize: '12.5px',
                height: '34px',
                borderRadius: '8px'
              }}
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--fc-text-muted)',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Clear filter"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: 'var(--fc-brand)' }}>
              {stats.awardedCategories} Winners Crowned
            </span>
            <span style={{ color: 'var(--fc-border)' }}>·</span>
            <span>{categoryWinners.length} Award Categories Total</span>
          </div>
        </div>

        {/* Row 2: Category Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fc-text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Filter:
          </span>

          {/* All Categories Pill */}
          <button
            type="button"
            className={`fc-nom-filter-pill ${selectedFilterPill === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedFilterPill('all')}
          >
            <span>All Categories</span>
            <span style={{ opacity: 0.85, fontSize: '11px' }}>({categoryWinners.length})</span>
          </button>

          {/* Awarded Categories Pill */}
          <button
            type="button"
            className={`fc-nom-filter-pill winner-pill ${selectedFilterPill === 'awarded' ? 'active' : ''}`}
            onClick={() => setSelectedFilterPill('awarded')}
          >
            <CrownIcon size={12} />
            <span>Awarded</span>
            <span style={{ opacity: 0.85, fontSize: '11px' }}>({stats.awardedCategories})</span>
          </button>

          {/* Pending Categories Pill */}
          {stats.totalCategories - stats.awardedCategories > 0 && (
            <button
              type="button"
              className={`fc-nom-filter-pill pending-pill ${selectedFilterPill === 'pending' ? 'active' : ''}`}
              onClick={() => setSelectedFilterPill('pending')}
            >
              <HourglassIcon size={12} />
              <span>Unawarded</span>
              <span style={{ opacity: 0.85, fontSize: '11px' }}>({stats.totalCategories - stats.awardedCategories})</span>
            </button>
          )}

          {/* Dynamic Category Pills */}
          {categories.map(cat => {
            const isActive = selectedFilterPill === cat.name;
            const cWin = categoryWinners.find(cw => cw.category_name.toLowerCase() === cat.name.toLowerCase());
            const hasWin = !!cWin?.winner;

            return (
              <button
                key={cat.id || cat.name}
                type="button"
                className={`fc-nom-filter-pill ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedFilterPill(cat.name)}
              >
                <TrophyIcon size={12} style={{ color: isActive ? '#ffffff' : (hasWin ? '#d97706' : undefined) }} />
                <span>{cat.name}</span>
                {hasWin && <span style={{ color: isActive ? '#ffffff' : '#16a34a', fontSize: '10px' }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONDITIONAL RENDERING: TABLE VIEW vs CARDS VIEW ─────────────── */}
      {viewMode === 'table' ? (
        /* ── 1. UNIFIED STANDARD MASTER TABLE VIEW ──────────────────────── */
        <div className="fc-card" style={{ marginTop: '10px', overflow: 'visible', minHeight: '380px', marginBottom: '24px' }}>
          <div style={{ overflowX: 'auto', overflowY: 'visible', minHeight: '360px', paddingBottom: '30px' }}>
            <table className="fc-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                  <th style={{ minWidth: '180px' }}>AWARD CATEGORY</th>
                  <th style={{ minWidth: '240px' }}>OFFICIAL WINNER</th>
                  <th style={{ minWidth: '120px' }}>CATEGORY</th>
                  <th style={{ minWidth: '130px', textAlign: 'center' }}>JURY RATING</th>
                  <th style={{ minWidth: '220px' }}>RUNNER-UPS &amp; NOMINEES</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategoryWinners.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--fc-text-muted, #94a3b8)', fontStyle: 'italic' }}>
                      {filterQuery ? `No categories or winners match "${filterQuery}".` : 'No categories found for the selected filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredCategoryWinners.map((cat, idx) => {
                    const winner = cat.winner;
                    const ratingVal = winner ? parseFloat(winner.jury_rating || 0) : null;
                    const nominees = cat.nominees || [];

                    return (
                      <tr
                        key={cat.category_id || cat.category_name}
                        className={winner ? 'fc-nom-table-row-selected' : ''}
                        style={{ transition: 'background-color 0.15s ease' }}
                      >
                        {/* Row Index */}
                        <td style={{ textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '12px' }}>
                          {idx + 1}
                        </td>

                        {/* Award Category */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrophyIcon size={14} style={{ color: winner ? 'var(--fc-badge-amber, #d97706)' : 'var(--fc-text-muted)' }} />
                            <strong style={{ fontSize: '13px', color: 'var(--fc-text-main, #1e293b)' }}>
                              {cat.category_name}
                            </strong>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--fc-text-muted, #64748b)', marginTop: '2px', marginLeft: '22px' }}>
                            {cat.total_nominees} total {cat.total_nominees === 1 ? 'nominee' : 'nominees'}
                          </div>
                        </td>

                        {/* Official Winner */}
                        <td>
                          {winner ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CrownIcon size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                                <strong 
                                  style={{ 
                                    fontSize: '13.5px', 
                                    color: 'var(--fc-text-main, #0f172a)',
                                    cursor: onViewFilm ? 'pointer' : 'default'
                                  }}
                                  onClick={() => onViewFilm && onViewFilm({ id: winner.submission_id || winner.id, title: winner.title, director: winner.director, category: winner.category })}
                                  title={onViewFilm ? "Click to view film details drawer" : undefined}
                                >
                                  {winner.title}
                                </strong>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--fc-text-muted, #64748b)', marginTop: '2px', marginLeft: '20px' }}>
                                Dir. {winner.director || 'Filmmaker'}
                                {winner.country ? ` · ${winner.country}` : ''}
                                {winner.runtime_minutes ? ` · ${winner.runtime_minutes}m` : ''}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#b45309', background: '#fef3c7', padding: '3px 8px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <HourglassIcon size={11} /> No winner crowned yet
                            </span>
                          )}
                        </td>

                        {/* Category / Format */}
                        <td>
                          {winner ? (
                            <span className="fc-category-pill">
                              {winner.category || 'General'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: 'var(--fc-text-muted)', fontStyle: 'italic' }}>
                              —
                            </span>
                          )}
                        </td>

                        {/* Jury Rating */}
                        <td style={{ textAlign: 'center' }}>
                          {winner && ratingVal !== null ? (
                            <div>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: ratingVal >= 4.5 ? '#f0fdf4' : ratingVal >= 4.0 ? '#eff6ff' : '#f8fafc',
                                color: ratingVal >= 4.5 ? '#15803d' : ratingVal >= 4.0 ? '#1d4ed8' : '#475569',
                                border: `1px solid ${ratingVal >= 4.5 ? '#bbf7d0' : ratingVal >= 4.0 ? '#bfdbfe' : '#e2e8f0'}`,
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 800
                              }}>
                                <StarIcon size={12} style={{ color: '#eab308' }} />
                                <span>{ratingVal > 0 ? ratingVal.toFixed(2) : 'Unrated'}</span>
                                <span style={{ fontSize: '10px', fontWeight: 500, color: '#64748b' }}>/ 5.0</span>
                              </div>
                              {winner.review_count > 0 && (
                                <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                                  {winner.review_count} reviews
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: 'var(--fc-text-muted)', fontStyle: 'italic' }}>
                              —
                            </span>
                          )}
                        </td>

                        {/* Runner-ups & Nominees */}
                        <td>
                          {nominees.length === 0 ? (
                            <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)', fontStyle: 'italic' }}>
                              No runner-up films
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {nominees.slice(0, 3).map((nom, nIdx) => (
                                <span
                                  key={nom.submission_id || nom.id || nIdx}
                                  style={{
                                    background: 'var(--fc-surface-hover, #f1f5f9)',
                                    border: '1px solid var(--fc-border, #e2e8f0)',
                                    color: 'var(--fc-text-main, #334155)',
                                    borderRadius: '5px',
                                    padding: '2px 7px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    cursor: onViewFilm ? 'pointer' : 'default'
                                  }}
                                  onClick={() => onViewFilm && onViewFilm({ id: nom.submission_id || nom.id, title: nom.title, director: nom.director, category: nom.category })}
                                  title={onViewFilm ? `Click to view "${nom.title}" details drawer` : undefined}
                                >
                                  #{nIdx + 2} {nom.title}
                                </span>
                              ))}
                              {nominees.length > 3 && (
                                <span style={{ fontSize: '10.5px', color: 'var(--fc-text-muted)', alignSelf: 'center' }}>
                                  +{nominees.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {winner ? (
                              <>
                                <button
                                  type="button"
                                  className="fc-btn fc-btn-outline fc-btn-xs"
                                  onClick={() => onViewFilm && onViewFilm({ id: winner.submission_id || winner.id, title: winner.title, director: winner.director, category: winner.category })}
                                  title="View full film details drawer"
                                  style={{ padding: '3px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeWinner(cat.category_name, winner)}
                                  disabled={actionLoading}
                                  title="Revoke winner title"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#dc2626',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                                    padding: '2px 4px',
                                    textDecoration: 'underline'
                                  }}
                                >
                                  Revoke
                                </button>
                              </>
                            ) : (
                              onGoToFinalists && (
                                <button
                                  type="button"
                                  className="fc-btn fc-btn-primary fc-btn-xs"
                                  onClick={onGoToFinalists}
                                  title={`Go to ${prevStageName} to select winner for this award`}
                                  style={{ padding: '3px 9px', fontSize: '11px', borderRadius: '6px' }}
                                >
                                  Crown Winner
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── 2. CARDS BOARD VIEW (Detailed Showcase Cards) ──────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {filteredCategoryWinners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontStyle: 'italic', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
              No award categories matched your search.
            </div>
          ) : (
            filteredCategoryWinners.map(cat => {
              const winner = cat.winner;
              const nominees = cat.nominees || [];

              return (
                <div
                  key={cat.category_id || cat.category_name}
                  style={{
                    background: 'var(--fc-surface-card, #ffffff)',
                    border: winner ? '1.5px solid var(--fc-badge-amber, #fde68a)' : '1px solid var(--fc-border, #e2e8f0)',
                    borderRadius: '12px',
                    padding: '20px 24px',
                    boxShadow: winner ? '0 2px 10px rgba(245, 158, 11, 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.02)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Category Header Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <TrophyIcon size={16} style={{ color: 'var(--fc-brand, #a82f2f)' }} />
                      <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--fc-text-main, #0f172a)', margin: 0 }}>
                        {cat.category_name}
                      </h3>
                      <span style={{ fontSize: '11.5px', color: 'var(--fc-text-muted, #64748b)', fontWeight: 500 }}>
                        ({cat.total_nominees} total {cat.total_nominees === 1 ? 'film' : 'films'})
                      </span>
                    </div>

                    {winner ? (
                      <div className="fc-winner-crowned-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <CrownIcon size={14} /> Winner Crowned
                      </div>
                    ) : (
                      <div className="fc-winner-pending-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <HourglassIcon size={12} /> No winner chosen yet
                      </div>
                    )}
                  </div>

                  {/* ── WINNER SHOWCASE CARD ───────────────────────────────── */}
                  {winner ? (
                    <div className="fc-winner-showcase-card" style={{
                      borderRadius: '10px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '14px'
                    }}>
                      {/* Left: Trophy & Title Info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '260px' }}>
                        <div className="fc-winner-crown-badge" style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <CrownIcon size={24} style={{ color: '#d97706' }} />
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              background: '#eab308',
                              color: '#ffffff',
                              fontWeight: 900,
                              fontSize: '10px',
                              letterSpacing: '0.6px',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              textTransform: 'uppercase'
                            }}>
                              Official Winner
                            </span>
                            <strong 
                              style={{ 
                                fontSize: '15px', 
                                color: 'var(--fc-text-main, #1e293b)',
                                cursor: onViewFilm ? 'pointer' : 'default'
                              }}
                              onClick={() => onViewFilm && onViewFilm({ id: winner.submission_id || winner.id, title: winner.title, director: winner.director, category: winner.category })}
                              title={onViewFilm ? "Click to view film details drawer" : undefined}
                            >
                              {winner.title}
                            </strong>
                          </div>

                          <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary, #475569)', marginTop: '4px' }}>
                            {winner.director ? <span style={{ fontWeight: 600 }}>Dir: {winner.director}</span> : null}
                            {winner.category ? <span> · {winner.category}</span> : null}
                            {winner.country ? <span> · {winner.country}</span> : null}
                            {winner.runtime_minutes ? <span> · {winner.runtime_minutes} mins</span> : null}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Rating Display */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          background: 'var(--fc-surface-card, #ffffff)',
                          border: '1px solid rgba(234, 179, 8, 0.4)',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <StarIcon size={14} style={{ color: '#eab308' }} />
                          <strong style={{ fontSize: '13.5px', color: '#854d0e' }}>
                            {parseFloat(winner.jury_rating || 0).toFixed(2)}
                          </strong>
                          <span style={{ fontSize: '11px', color: '#a16207' }}>/ 5.0</span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {onViewFilm && (
                          <button
                            type="button"
                            onClick={() => onViewFilm({ id: winner.submission_id || winner.id, title: winner.title, director: winner.director, category: winner.category })}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            View Film
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRevokeWinner(cat.category_name, winner)}
                          disabled={actionLoading}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '4px',
                            textDecoration: 'underline'
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      background: 'var(--fc-surface, #f8fafc)',
                      border: '1px dashed var(--fc-border, #cbd5e1)',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                      fontSize: '12.5px',
                      color: 'var(--fc-text-secondary, #64748b)'
                    }}>
                      No official winner selected for this category yet.{' '}
                      {onGoToFinalists && (
                        <button
                          type="button"
                          onClick={onGoToFinalists}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--fc-brand, #a82f2f)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            marginLeft: '4px'
                          }}
                        >
                          Select a winner in {prevStageName}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── RUNNER-UP NOMINEES LIST ─────────────────────────────── */}
                  {nominees.length > 0 && (
                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Other Nominated Finalists ({nominees.length})
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {nominees.map((nom, idx) => (
                          <div
                            key={nom.submission_id || nom.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: 'var(--fc-surface, #fafafa)',
                              border: '1px solid var(--fc-border, #f1f5f9)',
                              fontSize: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '11px' }}>#{idx + 2}</span>
                              <strong 
                                style={{ 
                                  color: 'var(--fc-text-main, #334155)',
                                  cursor: onViewFilm ? 'pointer' : 'default'
                                }}
                                onClick={() => onViewFilm && onViewFilm({ id: nom.submission_id || nom.id, title: nom.title, director: nom.director, category: nom.category })}
                              >
                                {nom.title}
                              </strong>
                              <span style={{ color: '#64748b', fontSize: '11px' }}>
                                {nom.director ? `(${nom.director})` : ''} · {nom.category || 'General'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <StarIcon size={11} style={{ color: '#eab308' }} /> {parseFloat(nom.jury_rating || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Unassigned Winners (if any) */}
          {unassignedWinners.length > 0 && (
            <div style={{
              background: 'var(--fc-surface, #fafafa)',
              border: '1px dashed var(--fc-border, #cbd5e1)',
              borderRadius: '10px',
              padding: '20px 24px'
            }}>
              <div style={{ marginBottom: '14px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fc-text-main, #334155)', margin: 0 }}>
                  Other Winner Films ({unassignedWinners.length})
                </h4>
                <div style={{ fontSize: '11.5px', color: 'var(--fc-text-secondary, #64748b)', marginTop: '2px' }}>
                  These films have reached the Winner stage through custom pipeline rules.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {unassignedWinners.map((film, idx) => (
                  <div
                    key={film.submission_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: 'var(--fc-surface-card, #ffffff)',
                      border: '1px solid var(--fc-border, #e2e8f0)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--fc-text-muted, #94a3b8)', fontWeight: 600 }}>#{idx + 1}</span>
                      <strong 
                        style={{ fontSize: '13px', color: 'var(--fc-text-main, #1e293b)', cursor: onViewFilm ? 'pointer' : 'default' }}
                        onClick={() => onViewFilm && onViewFilm({ id: film.submission_id, title: film.title, director: film.director, category: film.category })}
                      >
                        {film.title}
                      </strong>
                      <span style={{ fontSize: '11px', color: 'var(--fc-text-secondary, #64748b)' }}>
                        {film.director ? `(${film.director})` : ''} · {film.category || 'General'}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                        Winner Stage
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BOTTOM ACTIONS ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        paddingTop: '16px',
        borderTop: '1px solid var(--fc-border, #f1f5f9)'
      }}>
        <div style={{ fontSize: '12.5px', color: 'var(--fc-text-secondary, #64748b)' }}>
          Official Festival Winners list can be exported as CSV for press releases, certificates, and trophy engraving.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              background: 'var(--fc-surface-card, #ffffff)',
              border: '1px solid var(--fc-border, #cbd5e1)',
              color: 'var(--fc-text-main, #334155)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileDownloadIcon size={14} /> Download Press List (CSV)
          </button>

          {onGoToFinalists && (
            <button
              type="button"
              onClick={onGoToFinalists}
              style={{
                background: 'var(--fc-brand, #a82f2f)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(168, 47, 47, 0.25)'
              }}
            >
              <ArrowBackIcon size={14} /> Back to {prevStageName}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
