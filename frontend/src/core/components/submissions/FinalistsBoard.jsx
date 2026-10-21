import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import { 
  TrophyIcon, 
  MedalIcon, 
  MovieIcon, 
  HourglassIcon, 
  StarIcon, 
  ArrowForwardIcon,
  ViewModuleIcon,
  ViewListIcon,
  SearchIcon,
  CloseIcon,
  CrownIcon
} from '../common/Icons';

export default function FinalistsBoard({ 
  stage,
  prevStage,
  nextStage,
  onAdvanceToWinners, 
  onRefreshPipeline, 
  showToast,
  onViewFilm 
}) {
  const [categories, setCategories] = useState([]);
  const [finalistsByCategory, setFinalistsByCategory] = useState({});
  const [allStageFinalists, setAllStageFinalists] = useState([]);
  const [unassignedFinalists, setUnassignedFinalists] = useState([]);
  const [finalistNoms, setFinalistNoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // Default to unified 'table' view
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  const stageName = stage?.unique_name || stage?.name || 'Finalists';
  const prevStageName = prevStage?.unique_name || prevStage?.name || 'Jury & Voting';
  const nextStageName = nextStage?.unique_name || nextStage?.name || 'Winners';

  // Fetch Finalists Board Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/submissions/finalists-board', {
        params: stage?.id ? { stage_id: stage.id } : {}
      });
      if (res.data?.success) {
        setCategories(res.data.categories || []);
        setFinalistsByCategory(res.data.finalistsByCategory || {});
        setAllStageFinalists(res.data.allStageFinalists || []);
        setUnassignedFinalists(res.data.unassignedFinalists || []);
        setFinalistNoms(res.data.finalistNoms || []);
      }
    } catch (err) {
      console.error('Failed to load finalists board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [stage?.id]);

  // Derive unique finalist films from finalist nominations and stage finalists
  const uniqueFinalistFilms = useMemo(() => {
    const map = new Map();

    // 1. Group nominations by submission_id
    for (const nom of finalistNoms) {
      const subId = Number(nom.submission_id);
      if (!map.has(subId)) {
        map.set(subId, {
          id: subId,
          submission_id: subId,
          title: nom.title,
          director: nom.director,
          category: nom.category,
          country: nom.country,
          runtime: nom.runtime || nom.runtime_minutes,
          runtime_minutes: nom.runtime_minutes || nom.runtime,
          status: nom.status,
          current_stage_name: nom.current_stage_name,
          jury_rating: nom.jury_rating,
          review_count: nom.review_count || 0,
          awards: [{
            award_name: nom.award_name,
            award_category_id: nom.award_category_id,
            is_winner: Number(nom.is_winner) === 1,
            jury_rating: nom.jury_rating,
            review_count: nom.review_count
          }]
        });
      } else {
        const existing = map.get(subId);
        if (!existing.awards.some(a => a.award_name.toLowerCase() === nom.award_name.toLowerCase())) {
          existing.awards.push({
            award_name: nom.award_name,
            award_category_id: nom.award_category_id,
            is_winner: Number(nom.is_winner) === 1,
            jury_rating: nom.jury_rating,
            review_count: nom.review_count
          });
        }
        // If higher rating found, keep higher rating for display
        if (parseFloat(nom.jury_rating || 0) > parseFloat(existing.jury_rating || 0)) {
          existing.jury_rating = nom.jury_rating;
          existing.review_count = nom.review_count;
        }
      }
    }

    // 2. Also incorporate any unassigned finalists
    for (const unassigned of unassignedFinalists) {
      const subId = Number(unassigned.submission_id);
      if (!map.has(subId)) {
        map.set(subId, {
          id: subId,
          submission_id: subId,
          title: unassigned.title,
          director: unassigned.director,
          category: unassigned.category,
          country: unassigned.country,
          runtime: unassigned.runtime,
          runtime_minutes: unassigned.runtime_minutes || unassigned.runtime,
          status: unassigned.status,
          current_stage_name: unassigned.current_stage_name,
          jury_rating: unassigned.jury_rating,
          review_count: unassigned.review_count || 0,
          awards: []
        });
      }
    }

    return Array.from(map.values());
  }, [finalistNoms, unassignedFinalists]);

  // Admin chooses a winner for a category
  const handleSelectWinner = async (awardName, film, catId) => {
    if (!window.confirm(`Crown "${film.title}" as the Official Winner for "${awardName}"?`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/submissions/select-winner', {
        award_name: awardName,
        submission_id: film.submission_id || film.id,
        award_category_id: catId || null
      });

      if (res.data?.success) {
        if (showToast) {
          showToast(res.data.message || `"${film.title}" selected as Winner of ${awardName}!`);
        }
        await fetchData();
        if (onRefreshPipeline) onRefreshPipeline();
      }
    } catch (err) {
      console.error('Failed to select winner:', err);
      alert(err.response?.data?.error || 'Failed to select winner.');
    } finally {
      setActionLoading(false);
    }
  };

  // Revoke winner status
  const handleRemoveWinner = async (awardName, film) => {
    if (!window.confirm(`Revoke Winner title for "${film.title}" in "${awardName}"?`)) {
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
          showToast(res.data.message || 'Winner status removed.');
        }
        await fetchData();
        if (onRefreshPipeline) onRefreshPipeline();
      }
    } catch (err) {
      console.error('Failed to remove winner:', err);
      alert(err.response?.data?.error || 'Failed to remove winner.');
    } finally {
      setActionLoading(false);
    }
  };

  // Count total winners chosen
  const totalWinnersChosen = useMemo(() => {
    return Object.values(finalistsByCategory)
      .flat()
      .filter(f => Number(f.is_winner) === 1).length;
  }, [finalistsByCategory]);

  // Filtered films list
  const filteredFilms = useMemo(() => {
    let list = uniqueFinalistFilms;

    // Filter pill
    if (selectedCategoryFilter === 'winners') {
      list = list.filter(f => f.awards.some(a => a.is_winner));
    } else if (selectedCategoryFilter !== 'all') {
      list = list.filter(f => 
        f.awards.some(a => a.award_name.toLowerCase() === selectedCategoryFilter.toLowerCase())
      );
    }

    // Live Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f =>
        (f.title || '').toLowerCase().includes(q) ||
        (f.director || '').toLowerCase().includes(q) ||
        (f.category || '').toLowerCase().includes(q) ||
        (f.country || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [uniqueFinalistFilms, selectedCategoryFilter, searchQuery]);

  // Rank badge styling helper
  const getRankBadge = (index) => {
    if (index === 0) {
      return (
        <span className="fc-finalist-rank-1" style={{
          background: 'linear-gradient(135deg, #fef08a 0%, #facc15 100%)',
          color: '#713f12',
          padding: '3px 9px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          boxShadow: '0 1px 2px rgba(234, 179, 8, 0.3)'
        }}>
          <MedalIcon size={13} /> 1st Place
        </span>
      );
    }
    if (index === 1) {
      return (
        <span className="fc-finalist-rank-2" style={{
          background: '#f1f5f9',
          color: '#475569',
          padding: '3px 9px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid #cbd5e1'
        }}>
          <MedalIcon size={13} /> 2nd Place
        </span>
      );
    }
    if (index === 2) {
      return (
        <span className="fc-finalist-rank-3" style={{
          background: '#ffedd5',
          color: '#9a3412',
          padding: '3px 9px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid #fed7aa'
        }}>
          <MedalIcon size={13} /> 3rd Place
        </span>
      );
    }
    return (
      <span className="fc-finalist-rank-default" style={{
        background: '#f8fafc',
        color: '#64748b',
        padding: '3px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        border: '1px solid #e2e8f0'
      }}>
        #{index + 1}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--fc-surface-card, #ffffff)', borderRadius: '12px', padding: '36px', textAlign: 'center', border: '1px solid var(--fc-border, #e2e8f0)', color: 'var(--fc-text-muted, #64748b)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Loading finalist rankings &amp; jury scores...
      </div>
    );
  }

  return (
    <div className="fc-finalists-board animate-fade-in" style={{
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
        gap: '12px',
        paddingBottom: '16px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--fc-border, #f1f5f9)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--fc-brand, #a82f2f)', fontSize: '13px', lineHeight: 1 }}>●</span>
            <strong style={{ fontSize: '15px', color: 'var(--fc-text-main, #1e293b)' }}>
              Admin View — {stageName} &amp; Winner Selection
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--fc-text-muted, #64748b)', marginLeft: '6px' }}>
              ({uniqueFinalistFilms.length} Finalists)
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary, #64748b)', marginTop: '3px' }}>
            Finalist films ranked according to jury ratings. Crown one official winner for each award category.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {totalWinnersChosen > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(202, 138, 4, 0.12) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              color: '#b45309',
              borderRadius: '999px',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <TrophyIcon size={14} style={{ color: '#d97706' }} /> {totalWinnersChosen} Winner{totalWinnersChosen === 1 ? '' : 's'} Selected
            </div>
          )}

          {/* View Switcher: Table vs Cards */}
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
              title="Cards Board View (Breakdown by Category)"
            >
              <ViewModuleIcon size={14} />
              <span>Cards View</span>
            </button>
          </div>
        </div>
      </div>

      {uniqueFinalistFilms.length === 0 && (
        <div className="fc-nom-info-banner" style={{ marginBottom: '24px' }}>
          <div className="fc-nom-info-icon-box">ℹ</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fc-nom-info-title">
              No finalist films available from {prevStageName}
            </div>
            <div className="fc-nom-info-desc">
              All films evaluated in the <span className="fc-nom-stage-pill">{prevStageName}</span> stage will appear here once voting reviews are submitted and advanced.
            </div>
          </div>
        </div>
      )}

      {/* ── CONDITIONAL RENDERING: TABLE VIEW vs CARDS VIEW ─────────────── */}
      {viewMode === 'table' ? (
        /* ── 1. UNIFIED STANDARD MASTER TABLE VIEW ──────────────────────── */
        <div style={{ marginBottom: '24px' }}>
          {/* Top Filter Bar: Search + Category Filter Pills */}
          <div className="fc-stage-filter-bar">
            {/* Row 1: Search + Summary Stats */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '380px', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                  <SearchIcon size={15} />
                </span>
                <input
                  type="text"
                  className="fc-input"
                  placeholder="Filter by film title, director, category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '32px',
                    paddingRight: searchQuery ? '30px' : '12px',
                    fontSize: '12.5px',
                    height: '34px',
                    borderRadius: '8px'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
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

              {/* Status summary */}
              <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, color: 'var(--fc-brand)' }}>
                  {totalWinnersChosen} of {categories.length} Categories Awarded
                </span>
                <span style={{ color: 'var(--fc-border)' }}>·</span>
                <span>{uniqueFinalistFilms.length} Finalists Competing</span>
              </div>
            </div>

            {/* Row 2: Category Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fc-text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Filter By Award:
              </span>

              {/* All Finalists Pill */}
              <button
                type="button"
                className={`fc-nom-filter-pill ${selectedCategoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategoryFilter('all')}
              >
                <span>All Finalists</span>
                <span style={{ opacity: 0.85, fontSize: '11px' }}>({uniqueFinalistFilms.length})</span>
              </button>

              {/* Dynamic Categories Pills */}
              {categories.map(cat => {
                const count = (finalistsByCategory[cat.name] || []).length;
                const isActive = selectedCategoryFilter === cat.name;

                return (
                  <button
                    key={cat.id || cat.name}
                    type="button"
                    className={`fc-nom-filter-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedCategoryFilter(cat.name)}
                  >
                    <TrophyIcon size={12} />
                    <span>{cat.name}</span>
                    <span style={{ opacity: 0.85, fontSize: '11px' }}>({count})</span>
                  </button>
                );
              })}

              {/* Crowned Winners Filter Pill */}
              {totalWinnersChosen > 0 && (
                <button
                  type="button"
                  className={`fc-nom-filter-pill winner-pill ${selectedCategoryFilter === 'winners' ? 'active' : ''}`}
                  onClick={() => setSelectedCategoryFilter('winners')}
                >
                  <TrophyIcon size={12} />
                  <span>Crowned Winners</span>
                  <span style={{ opacity: 0.85, fontSize: '11px' }}>({totalWinnersChosen})</span>
                </button>
              )}
            </div>
          </div>

          {/* Master Unified Table */}
          <div className="fc-card" style={{ marginTop: '10px', overflow: 'visible', minHeight: '380px' }}>
            <div style={{ overflowX: 'auto', overflowY: 'visible', minHeight: '360px', paddingBottom: '30px' }}>
              <table className="fc-table" style={{ width: '100%', margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th style={{ minWidth: '220px' }}>TITLE &amp; DIRECTOR</th>
                    <th style={{ minWidth: '120px' }}>CATEGORY</th>
                    <th style={{ minWidth: '200px' }}>AWARD NOMINATIONS</th>
                    <th style={{ minWidth: '130px', textAlign: 'center' }}>JURY RATING</th>
                    <th style={{ minWidth: '220px' }}>WINNER SELECTION</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFilms.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--fc-text-muted, #94a3b8)', fontStyle: 'italic' }}>
                        {searchQuery ? `No finalists match "${searchQuery}".` : 'No finalist films found for the selected filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredFilms.map((film, idx) => {
                      const ratingVal = parseFloat(film.jury_rating || 0);
                      const isAnyWinner = film.awards.some(a => a.is_winner);

                      return (
                        <tr
                          key={film.id}
                          className={isAnyWinner ? 'fc-nom-table-row-selected' : ''}
                          style={{ transition: 'background-color 0.15s ease' }}
                        >
                          {/* Row Index */}
                          <td style={{ textAlign: 'center', color: 'var(--fc-text-muted)', fontSize: '12px' }}>
                            {idx + 1}
                          </td>

                          {/* Title & Director */}
                          <td>
                            <div 
                              style={{ 
                                fontWeight: 700, 
                                fontSize: '13px', 
                                color: 'var(--fc-text-main, #0f172a)',
                                cursor: onViewFilm ? 'pointer' : 'default',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              onClick={() => onViewFilm && onViewFilm(film)}
                              title={onViewFilm ? "Click to view film details drawer" : undefined}
                            >
                              <span>{film.title}</span>
                              {isAnyWinner && (
                                <span style={{ fontSize: '10px', fontWeight: 800, background: '#facc15', color: '#713f12', padding: '1px 6px', borderRadius: '4px' }}>
                                  WINNER
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--fc-text-muted, #64748b)', marginTop: '2px' }}>
                              Dir. {film.director || 'Filmmaker'}
                              {film.country ? ` · ${film.country}` : ''}
                              {film.runtime_minutes ? ` · ${film.runtime_minutes}m` : ''}
                            </div>
                          </td>

                          {/* Submission Category / Format */}
                          <td>
                            <span className="fc-category-pill">
                              {film.category || 'General'}
                            </span>
                          </td>

                          {/* Nominated Awards Chips */}
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {film.awards.length === 0 ? (
                                <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)', fontStyle: 'italic' }}>
                                  General Finalist
                                </span>
                              ) : (
                                film.awards.map(a => (
                                  <span 
                                    key={a.award_name}
                                    className="fc-nom-award-badge"
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 7px',
                                      background: a.is_winner ? '#fef3c7' : undefined,
                                      borderColor: a.is_winner ? '#facc15' : undefined,
                                      color: a.is_winner ? '#713f12' : undefined,
                                      fontWeight: a.is_winner ? 800 : 600
                                    }}
                                  >
                                    <TrophyIcon size={11} style={{ color: a.is_winner ? '#d97706' : undefined }} />
                                    <span>{a.award_name}</span>
                                    {a.is_winner && (
                                      <span style={{ fontSize: '9.5px', background: '#facc15', color: '#713f12', padding: '0 4px', borderRadius: '3px', fontWeight: 800 }}>
                                        ★
                                      </span>
                                    )}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>

                          {/* Jury Rating */}
                          <td style={{ textAlign: 'center' }}>
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
                            {film.review_count > 0 && (
                              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                                {film.review_count} review{film.review_count === 1 ? '' : 's'}
                              </div>
                            )}
                          </td>

                          {/* Winner Selection Actions */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {film.awards.map(a => {
                                const catObj = categories.find(c => c.name.toLowerCase() === a.award_name.toLowerCase());
                                const currentCatWinner = (finalistsByCategory[a.award_name] || []).find(f => Number(f.is_winner) === 1);

                                if (a.is_winner) {
                                  return (
                                    <div key={a.award_name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{
                                        background: '#fef3c7',
                                        color: '#92400e',
                                        border: '1px solid #fde68a',
                                        borderRadius: '6px',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}>
                                        <TrophyIcon size={11} style={{ color: '#d97706' }} /> Winner: {a.award_name}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveWinner(a.award_name, film)}
                                        disabled={actionLoading}
                                        title="Revoke winner status"
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#dc2626',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          padding: '2px 4px',
                                          textDecoration: 'underline'
                                        }}
                                      >
                                        Change
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={a.award_name}>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectWinner(a.award_name, film, a.award_category_id || catObj?.id)}
                                      disabled={actionLoading}
                                      style={{
                                        background: currentCatWinner ? 'var(--fc-surface-card, #ffffff)' : 'var(--fc-brand, #a82f2f)',
                                        color: currentCatWinner ? 'var(--fc-text-secondary, #334155)' : '#ffffff',
                                        border: currentCatWinner ? '1px solid var(--fc-border, #cbd5e1)' : 'none',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        boxShadow: currentCatWinner ? 'none' : '0 1px 3px rgba(168, 47, 47, 0.25)',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title={currentCatWinner ? `Change winner from "${currentCatWinner.title}" to this film` : `Crown "${film.title}" as Winner for ${a.award_name}`}
                                    >
                                      <TrophyIcon size={12} /> Crown for {a.award_name}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          {/* Actions: View Details Drawer */}
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="fc-btn fc-btn-outline fc-btn-xs"
                              onClick={() => onViewFilm && onViewFilm(film)}
                              title="View full film details drawer"
                              style={{ padding: '3px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ── 2. CARDS BOARD VIEW (Breakdown By Category Cards) ─────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', marginBottom: '28px' }}>
          {categories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--fc-text-muted, #94a3b8)', fontStyle: 'italic', border: '1px dashed var(--fc-border, #cbd5e1)', borderRadius: '10px' }}>
              No award categories found for this festival.
            </div>
          ) : (
            categories.map(cat => {
              const finalists = finalistsByCategory[cat.name] || [];
              const winnerFilm = finalists.find(f => Number(f.is_winner) === 1);

              return (
                <div
                  key={cat.id || cat.name}
                  style={{
                    background: 'var(--fc-surface-card, #ffffff)',
                    border: winnerFilm ? '1.5px solid var(--fc-badge-amber, #fde68a)' : '1px solid var(--fc-border, #e2e8f0)',
                    borderRadius: '10px',
                    padding: '20px 24px',
                    boxShadow: winnerFilm ? '0 2px 8px rgba(245, 158, 11, 0.08)' : '0 1px 2px rgba(0, 0, 0, 0.02)'
                  }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <TrophyIcon size={16} style={{ color: 'var(--fc-brand, #e11d48)' }} />
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', margin: 0 }}>
                        {cat.name}
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--fc-text-secondary, #64748b)', fontWeight: 500 }}>
                        ({finalists.length} {finalists.length === 1 ? 'finalist' : 'finalists'})
                      </span>
                    </div>

                    {winnerFilm ? (
                      <div className="fc-winner-crowned-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <TrophyIcon size={14} /> Official Winner: {winnerFilm.title}
                      </div>
                    ) : (
                      <span className="fc-winner-pending-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <HourglassIcon size={12} /> No winner chosen yet
                      </span>
                    )}
                  </div>

                  {/* Finalists Ranked List */}
                  {finalists.length === 0 ? (
                    <div className="fc-nom-empty-card-slot">
                      <span className="fc-nom-empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MovieIcon size={24} />
                      </span>
                      <div>
                        <div className="fc-nom-empty-title">
                          No finalist films nominated for this award category
                        </div>
                        <div className="fc-nom-empty-desc">
                          Nominate films in the <span className="fc-nom-stage-pill">{prevStageName}</span> stage to score and rank them here.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {finalists.map((film, idx) => {
                        const isWinner = Number(film.is_winner) === 1;
                        const ratingVal = parseFloat(film.jury_rating || 0);

                        return (
                          <div
                            key={film.submission_id || film.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              borderRadius: '8px',
                              background: isWinner ? 'rgba(234, 179, 8, 0.12)' : idx === 0 ? 'var(--fc-surface-hover, #fafafa)' : 'var(--fc-surface, #ffffff)',
                              border: isWinner ? '1.5px solid var(--fc-badge-amber, #facc15)' : '1px solid var(--fc-border, #e2e8f0)',
                              transition: 'all 0.15s ease',
                              flexWrap: 'wrap',
                              gap: '12px'
                            }}
                          >
                            {/* Left: Rank & Film Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
                              {getRankBadge(idx)}

                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <strong 
                                    style={{ 
                                      fontSize: '13.5px', 
                                      color: 'var(--fc-text-main, #1e293b)',
                                      cursor: onViewFilm ? 'pointer' : 'default'
                                    }}
                                    onClick={() => onViewFilm && onViewFilm({ id: film.submission_id || film.id, title: film.title, director: film.director, category: film.category })}
                                    title={onViewFilm ? "Click to view film details drawer" : undefined}
                                  >
                                    {film.title}
                                  </strong>
                                  {isWinner && (
                                    <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#facc15', color: '#713f12', padding: '1px 6px', borderRadius: '4px' }}>
                                      WINNER
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'var(--fc-text-secondary, #64748b)', marginTop: '2px' }}>
                                  {film.director ? `Dir: ${film.director}` : ''}
                                  {film.category ? ` · ${film.category}` : ''}
                                  {film.country ? ` · ${film.country}` : ''}
                                  {film.runtime_minutes ? ` · ${film.runtime_minutes} mins` : ''}
                                </div>
                              </div>
                            </div>

                            {/* Middle: Jury Rating */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '150px' }}>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: ratingVal >= 4.5 ? '#f0fdf4' : ratingVal >= 4.0 ? '#eff6ff' : '#f8fafc',
                                color: ratingVal >= 4.5 ? '#15803d' : ratingVal >= 4.0 ? '#1d4ed8' : '#475569',
                                border: `1px solid ${ratingVal >= 4.5 ? '#bbf7d0' : ratingVal >= 4.0 ? '#bfdbfe' : '#e2e8f0'}`,
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: 800
                              }}>
                                <StarIcon size={12} style={{ color: '#eab308' }} />
                                <span>{ratingVal > 0 ? ratingVal.toFixed(2) : 'Unrated'}</span>
                                <span style={{ fontSize: '10.5px', fontWeight: 500, color: '#64748b' }}>/ 5.0</span>
                              </div>
                              {film.review_count > 0 && (
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                  ({film.review_count} review{film.review_count === 1 ? '' : 's'})
                                </span>
                              )}
                            </div>

                            {/* Right: Choose Winner Action */}
                            <div>
                              {isWinner ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    background: '#fef3c7',
                                    color: '#92400e',
                                    border: '1px solid #fde68a',
                                    borderRadius: '8px',
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}>
                                    <TrophyIcon size={14} /> Winner Crowned
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveWinner(cat.name, film)}
                                    disabled={actionLoading}
                                    title="Revoke winner title"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#dc2626',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      padding: '4px',
                                      textDecoration: 'underline'
                                    }}
                                  >
                                    Change
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectWinner(cat.name, film, cat.id)}
                                  disabled={actionLoading}
                                  style={{
                                    background: winnerFilm ? 'var(--fc-surface-card, #ffffff)' : 'var(--fc-brand, #a82f2f)',
                                    color: winnerFilm ? 'var(--fc-text-secondary, #334155)' : '#ffffff',
                                    border: winnerFilm ? '1px solid var(--fc-border, #cbd5e1)' : 'none',
                                    borderRadius: '8px',
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: winnerFilm ? 'none' : '0 1px 3px rgba(168, 47, 47, 0.25)',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <TrophyIcon size={14} /> Choose as Winner
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })
          )}

          {/* Unassigned Finalists (if any) */}
          {unassignedFinalists.length > 0 && (
            <div style={{
              background: 'var(--fc-surface, #fafafa)',
              border: '1px dashed var(--fc-border, #cbd5e1)',
              borderRadius: '10px',
              padding: '20px 24px'
            }}>
              <div style={{ marginBottom: '14px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fc-text-main, #334155)', margin: 0 }}>
                  Other Finalist Films ({unassignedFinalists.length})
                </h4>
                <div style={{ fontSize: '11.5px', color: 'var(--fc-text-secondary, #64748b)', marginTop: '2px' }}>
                  These films are in the Finalist stage but not yet assigned to an award category.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {unassignedFinalists.map((film, idx) => (
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <StarIcon size={12} style={{ color: '#eab308' }} /> {parseFloat(film.jury_rating || 0).toFixed(2)} / 5.0
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Status: {film.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BOTTOM ADVANCE ACTIONS ───────────────────────────────────────── */}
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
          {totalWinnersChosen > 0 ? (
            <span><strong>{totalWinnersChosen}</strong> award winner(s) crowned and ready to be showcased in {nextStageName}.</span>
          ) : (
            <span>Crown at least one category winner above before advancing to the final showcase.</span>
          )}
        </div>

        {onAdvanceToWinners && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={async () => {
              if (totalWinnersChosen === 0) {
                if (!window.confirm(`No winners have been crowned yet. Do you still want to proceed to ${nextStageName}?`)) {
                  return;
                }
              }
              setActionLoading(true);
              try {
                const res = await api.post('/submissions/advance-to-winners', {
                  current_stage_id: stage?.id || null,
                  target_stage_id: nextStage?.id || null
                });
                if (showToast) {
                  showToast(res.data?.message || `Official award winners advanced to ${nextStageName}!`);
                }
                if (onAdvanceToWinners) onAdvanceToWinners(res.data);
                if (onRefreshPipeline) onRefreshPipeline();
              } catch (e) {
                console.warn('advance-to-winners error:', e);
                alert(e.response?.data?.error || 'Failed to advance to winners.');
              } finally {
                setActionLoading(false);
              }
            }}
            style={{
              background: 'var(--fc-brand, #a82f2f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 22px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(168, 47, 47, 0.25)',
              transition: 'background 0.15s ease'
            }}
          >
            <TrophyIcon size={15} /> View Official {nextStageName} <ArrowForwardIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
