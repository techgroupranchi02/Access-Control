import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { 
  TrophyIcon, 
  CheckIcon, 
  MovieIcon, 
  ArrowForwardIcon, 
  ViewModuleIcon, 
  ViewListIcon, 
  StarIcon,
  SearchIcon,
  CloseIcon,
  AddIcon
} from '../common/Icons';

export default function NominationsBoard({ 
  stage, 
  prevStage, 
  nextStage, 
  onAdvanceToJury, 
  onRefreshPipeline, 
  showToast,
  onViewFilm 
}) {
  const [categories, setCategories] = useState([]);
  const [films, setFilms] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advancingLoading, setAdvancingLoading] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // Default to unified 'table' view
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [activeDropdownFilmId, setActiveDropdownFilmId] = useState(null);
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0, maxHeight: 360 });
  const [awardFilterQuery, setAwardFilterQuery] = useState('');
  const dropdownRef = useRef(null);

  const stageName = stage?.unique_name || stage?.name || 'Nominations';
  const prevStageName = prevStage?.unique_name || prevStage?.name || 'Official Selection';
  const nextStageName = nextStage?.unique_name || nextStage?.name || 'Jury & Voting';

  // Fetch nominations board data
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/submissions/nominations-board', {
        params: stage?.id ? { stage_id: stage.id } : {}
      });
      if (res.data?.success) {
        setCategories(res.data.categories || []);
        setFilms(res.data.films || []);
        setNominations(res.data.nominations || []);
      }
    } catch (err) {
      console.error('Failed to load nominations board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [stage?.id]);

  // Active film object for the open popover
  const activeDropdownFilm = useMemo(() => {
    return films.find(f => f.id === activeDropdownFilmId) || null;
  }, [films, activeDropdownFilmId]);

  // Open Portal Popover with precise viewport coordinates
  const handleOpenDropdown = (film, e) => {
    e.stopPropagation();
    if (activeDropdownFilmId === film.id) {
      setActiveDropdownFilmId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const popoverWidth = 290;
    const popoverHeight = Math.min(380, categories.length * 40 + 110);

    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

    let top = openUp 
      ? Math.max(12, rect.top - popoverHeight - 6) 
      : Math.min(window.innerHeight - popoverHeight - 16, rect.bottom + 6);

    let maxHeight = openUp ? Math.min(380, spaceAbove - 10) : Math.min(380, spaceBelow - 10);

    // If near right edge of screen, align with right side of button
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = Math.max(16, rect.right - popoverWidth);
    }
    if (left < 16) left = 16;

    setDropdownCoords({ top, left, maxHeight: Math.max(220, maxHeight) });
    setActiveDropdownFilmId(film.id);
    setAwardFilterQuery('');
  };

  // Close portal popover when user scrolls the page
  useEffect(() => {
    if (!activeDropdownFilmId) return;
    const handleScroll = (e) => {
      if (e.target && e.target.closest && e.target.closest('.fc-nom-portal-popover')) {
        return;
      }
      setActiveDropdownFilmId(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [activeDropdownFilmId]);

  // Check if a film is nominated for an award
  const isFilmNominated = (awardName, filmId) => {
    return nominations.some(
      n => (n.award_name || '').toLowerCase() === (awardName || '').toLowerCase() && Number(n.submission_id) === Number(filmId)
    );
  };

  // Get active nominations for a film
  const getFilmNominations = (filmId) => {
    return nominations.filter(n => Number(n.submission_id) === Number(filmId));
  };

  // Count nominees per award
  const getNominationCount = (awardName) => {
    return nominations.filter(
      n => (n.award_name || '').toLowerCase() === (awardName || '').toLowerCase()
    ).length;
  };

  // Count of films without any nominations
  const unnominatedCount = useMemo(() => {
    return films.filter(f => !nominations.some(n => Number(n.submission_id) === Number(f.id))).length;
  }, [films, nominations]);

  // Filtered films list based on category filter and search query
  const filteredFilms = useMemo(() => {
    let list = films;

    // 1. Award Category Filter Pill
    if (selectedCategoryFilter === 'unnominated') {
      list = list.filter(f => !nominations.some(n => Number(n.submission_id) === Number(f.id)));
    } else if (selectedCategoryFilter !== 'all') {
      list = list.filter(f => isFilmNominated(selectedCategoryFilter, f.id));
    }

    // 2. Search Query (Title, Director, Genre/Category, Country)
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
  }, [films, nominations, selectedCategoryFilter, searchQuery]);

  // Distinct nominated films count
  const distinctNominatedFilmsCount = useMemo(() => {
    const ids = new Set(nominations.map(n => Number(n.submission_id)));
    return ids.size;
  }, [nominations]);

  // Toggle nomination (optimistic update)
  const handleToggleNomination = async (awardName, film) => {
    const alreadyNominated = isFilmNominated(awardName, film.id);

    // Optimistic update
    if (alreadyNominated) {
      setNominations(prev =>
        prev.filter(n => !((n.award_name || '').toLowerCase() === (awardName || '').toLowerCase() && Number(n.submission_id) === Number(film.id)))
      );
    } else {
      const categoryObj = categories.find(c => (c.name || '').toLowerCase() === (awardName || '').toLowerCase());
      setNominations(prev => [
        ...prev,
        {
          id: Date.now(),
          award_name: awardName,
          submission_id: film.id,
          award_category_id: categoryObj?.id || null
        }
      ]);
    }

    try {
      const categoryObj = categories.find(c => (c.name || '').toLowerCase() === (awardName || '').toLowerCase());
      await api.post('/submissions/toggle-nomination', {
        award_name: awardName,
        submission_id: film.id,
        award_category_id: categoryObj?.id || null
      });
      if (showToast) {
        showToast(
          alreadyNominated
            ? `Removed "${film.title}" from ${awardName}`
            : `Nominated "${film.title}" for ${awardName}!`
        );
      }
    } catch (err) {
      console.error('Failed to toggle nomination:', err);
      // Revert on error
      fetchData();
      alert('Failed to update nomination. Please try again.');
    }
  };

  // Advance to Next Stage (Jury / Voting)
  const handleContinueToJury = async () => {
    if (films.length === 0) {
      alert(`There are no films currently in the ${stageName} stage. Please advance films from the ${prevStageName} stage first.`);
      return;
    }

    const totalNominations = nominations.length;
    if (totalNominations === 0) {
      if (!window.confirm(`No films have been nominated for any award categories yet. Do you still want to continue to the ${nextStageName} stage?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Ready to continue to ${nextStageName}? All ${distinctNominatedFilmsCount} film(s) with active nominations will be advanced to the next stage.`)) {
        return;
      }
    }

    setAdvancingLoading(true);
    try {
      const res = await api.post('/submissions/advance-nominations-to-jury', {
        current_stage_id: stage?.id,
        target_stage_id: nextStage?.id
      });
      if (res.data?.success) {
        if (showToast) {
          showToast(res.data.message || `Films advanced to ${res.data.targetStage || nextStageName}!`);
        }
        if (onAdvanceToJury) onAdvanceToJury(res.data);
        if (onRefreshPipeline) onRefreshPipeline();
      }
    } catch (err) {
      console.error('Failed to advance nominations to jury:', err);
      alert(err.response?.data?.error || `Failed to advance films to ${nextStageName}.`);
    } finally {
      setAdvancingLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--fc-surface-card, #ffffff)', borderRadius: '12px', padding: '36px', textAlign: 'center', border: '1px solid var(--fc-border, #e2e8f0)', color: 'var(--fc-text-secondary, #64748b)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Loading {stageName} &amp; films...
      </div>
    );
  }

  return (
    <div className="fc-nominations-board animate-fade-in" style={{
      borderRadius: '14px',
      padding: '24px 28px',
      marginBottom: '24px'
    }}>
      {/* ── HEADER WITH VIEW MODE SWITCHER ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--fc-text-main, #1e293b)', margin: '0 0 6px 0', letterSpacing: '-0.2px' }}>
            {stageName} &amp; Award Categories
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--fc-text-secondary, #64748b)', margin: 0, lineHeight: 1.5 }}>
            Nominate films selected in the <span className="fc-nom-stage-pill">{prevStageName}</span> stage and advanced here across configured awards. Each film appears once, and can be nominated for multiple awards.
          </p>
        </div>

        {/* View Switcher: Table (Unified) vs Cards */}
        <div className="fc-nom-view-switcher">
          <button
            type="button"
            className={`fc-nom-view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Standard Master Table View (Single unified table with award tags)"
          >
            <ViewListIcon size={14} />
            <span>Table View</span>
          </button>
          <button
            type="button"
            className={`fc-nom-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Cards Board View (Visual categories board)"
          >
            <ViewModuleIcon size={14} />
            <span>Cards View</span>
          </button>
        </div>
      </div>

      {films.length === 0 && (
        <div className="fc-nom-info-banner">
          <div className="fc-nom-info-icon-box">
            ℹ
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fc-nom-info-title">
              No films currently advanced from {prevStageName}
            </div>
            <div className="fc-nom-info-desc">
              Only films that have been selected in the <span className="fc-nom-stage-pill">{prevStageName}</span> stage and advanced to <span className="fc-nom-stage-pill">{stageName}</span> are eligible for award nomination. Currently, no films have been advanced to this stage yet.
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '42px 24px',
          color: 'var(--fc-text-muted, #94a3b8)',
          fontSize: '13.5px',
          border: '1px dashed var(--fc-border, #cbd5e1)',
          borderRadius: '12px',
          background: 'var(--fc-surface-subtle, rgba(0, 0, 0, 0.02))',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', color: 'var(--fc-brand, #e11d48)' }}>
            <TrophyIcon size={28} />
          </div>
          <div style={{ fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', fontSize: '14.5px', marginBottom: '4px' }}>
            No Award Categories Configured
          </div>
          <div style={{ maxWidth: '460px', margin: '0 auto', lineHeight: 1.5 }}>
            Award categories for this stage can only be added and managed from <strong>Review Stage Settings</strong>.
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* ── 1. UNIFIED STANDARD MASTER TABLE VIEW (RECOMMENDED) ─────────── */
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
                  {distinctNominatedFilmsCount} of {films.length}
                </span>
                <span>films nominated</span>
                <span style={{ color: 'var(--fc-border)' }}>·</span>
                <span>{nominations.length} total nominations active</span>
              </div>
            </div>

            {/* Row 2: Category Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fc-text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Category Filter:
              </span>

              {/* All Films Pill */}
              <button
                type="button"
                className={`fc-nom-filter-pill ${selectedCategoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategoryFilter('all')}
              >
                <span>All Films</span>
                <span style={{ opacity: 0.85, fontSize: '11px' }}>({films.length})</span>
              </button>

              {/* Dynamic Categories Pills */}
              {categories.map(cat => {
                const count = getNominationCount(cat.name);
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

              {/* Unnominated Filter Pill */}
              <button
                type="button"
                className={`fc-nom-filter-pill ${selectedCategoryFilter === 'unnominated' ? 'active' : ''}`}
                onClick={() => setSelectedCategoryFilter('unnominated')}
              >
                <span>Unnominated</span>
                <span style={{ opacity: 0.85, fontSize: '11px' }}>({unnominatedCount})</span>
              </button>
            </div>
          </div>

          {/* Master Unified Table */}
          <div className="fc-card" style={{ marginTop: '10px', overflow: 'visible', minHeight: '400px' }}>
            <div style={{ overflowX: 'auto', overflowY: 'visible', minHeight: '380px', paddingBottom: '60px' }}>
              <table className="fc-table" style={{ width: '100%', margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                    <th style={{ minWidth: '220px' }}>TITLE &amp; DIRECTOR</th>
                    <th style={{ minWidth: '120px' }}>CATEGORY</th>
                    <th style={{ minWidth: '130px' }}>STAGE</th>
                    <th style={{ minWidth: '100px', textAlign: 'center' }}>ROUND SCORE</th>
                    <th style={{ minWidth: '320px' }}>AWARD NOMINATIONS</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFilms.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--fc-text-muted, #94a3b8)', fontStyle: 'italic' }}>
                        {searchQuery ? `No films match "${searchQuery}".` : 'No films found for the selected filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredFilms.map((film, idx) => {
                      const filmNoms = getFilmNominations(film.id);
                      const isNominated = filmNoms.length > 0;
                      // Smart positioning: if row is in lower half of table, open upward to prevent clipping
                      const isDropUp = (filteredFilms.length <= 4 && idx >= 1) || (idx >= Math.max(1, filteredFilms.length - 2));

                      return (
                        <tr
                          key={film.id}
                          className={isNominated ? 'fc-nom-table-row-selected' : ''}
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
                                display: 'inline-block'
                              }}
                              onClick={() => onViewFilm && onViewFilm(film)}
                              title={onViewFilm ? "Click to view film details drawer" : undefined}
                            >
                              {film.title}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--fc-text-muted, #64748b)', marginTop: '2px' }}>
                              Dir. {film.director || 'Filmmaker'}
                              {film.country ? ` · ${film.country}` : ''}
                              {film.runtime ? ` · ${film.runtime}m` : ''}
                            </div>
                          </td>

                          {/* Genre / Submission Category */}
                          <td>
                            <span className="fc-category-pill">
                              {film.category || 'General'}
                            </span>
                          </td>

                          {/* Stage */}
                          <td>
                            <span className="fc-status-pill status-jury-voting">
                              {film.current_stage_name || film.status || stageName}
                            </span>
                          </td>

                          {/* Round Score */}
                          <td style={{ textAlign: 'center' }}>
                            {film.rating && film.rating !== 'Unrated' ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <StarIcon size={13} style={{ color: '#eab308' }} />
                                <strong style={{ fontSize: '13px', color: 'var(--fc-text-main)' }}>
                                  {parseFloat(film.rating).toFixed(1)}
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>/ 5</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '11.5px', color: 'var(--fc-text-light, #94a3b8)', fontStyle: 'italic' }}>
                                Unrated
                              </span>
                            )}
                          </td>

                          {/* Award Nominations (Interactive badges + Nominate Popover) */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', position: 'relative' }}>
                              {/* Active Nomination Trophy Badges */}
                              {filmNoms.map(nom => (
                                <span 
                                  key={nom.award_name} 
                                  className="fc-nom-award-badge animate-fade-in"
                                  title={`Nominated for ${nom.award_name}. Click × to remove.`}
                                >
                                  <TrophyIcon size={12} />
                                  <span>{nom.award_name}</span>
                                  <button
                                    type="button"
                                    className="fc-nom-award-remove"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleNomination(nom.award_name, film);
                                    }}
                                    aria-label={`Remove nomination for ${nom.award_name}`}
                                  >
                                    <CloseIcon size={10} />
                                  </button>
                                </span>
                              ))}

                              {/* Interactive Nominate Dropdown Trigger */}
                              <button
                                type="button"
                                className="fc-nom-add-pill-btn"
                                onClick={(e) => handleOpenDropdown(film, e)}
                                title="Nominate film for award category"
                              >
                                <AddIcon size={11} />
                                <span>{filmNoms.length === 0 ? 'Nominate' : 'Add'}</span>
                              </button>
                            </div>
                          </td>

                          {/* Actions: View Film Drawer */}
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
        /* ── 2. CARDS BOARD VIEW (Visual Categories Grid) ───────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
          {categories.map(cat => {
            const nomCount = getNominationCount(cat.name);

            return (
              <div
                key={cat.id || cat.name}
                className="fc-nom-category-card"
                style={{ padding: '18px 22px' }}
              >
                {/* Category Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'var(--fc-brand-tint, rgba(225, 29, 72, 0.12))',
                      border: '1px solid var(--fc-brand-border, rgba(225, 29, 72, 0.25))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--fc-brand, #e11d48)'
                    }}>
                      <TrophyIcon size={16} />
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', margin: 0 }}>
                      {cat.name}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={`fc-nom-count-badge ${nomCount > 0 ? 'active' : 'zero'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {nomCount > 0 ? (<><CheckIcon size={11} /> {nomCount} nominated</>) : '0 nominated'}
                    </span>
                  </div>
                </div>

                {/* Films Pill Container */}
                {films.length === 0 ? (
                  <div className="fc-nom-empty-card-slot">
                    <span className="fc-nom-empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MovieIcon size={24} />
                    </span>
                    <div>
                      <div className="fc-nom-empty-title">
                        No films currently advanced to this category
                      </div>
                      <div className="fc-nom-empty-desc">
                        Select and advance films from the <span className="fc-nom-stage-pill">{prevStageName}</span> stage to nominate them here.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {films.map(film => {
                      const nominated = isFilmNominated(cat.name, film.id);

                      return (
                        <button
                          key={film.id}
                          type="button"
                          className={`fc-nom-pill ${nominated ? 'selected' : ''}`}
                          onClick={() => handleToggleNomination(cat.name, film)}
                          title={`${nominated ? 'Click to un-nominate' : 'Click to nominate'} "${film.title}"`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {nominated && <CheckIcon size={11} />}
                          <span>{film.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── BOTTOM ADVANCE TO JURY / VOTING ACTION ──────────────────────── */}
      <div style={{ 
        paddingTop: '16px', 
        borderTop: '1px solid var(--fc-border, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ fontSize: '13px', color: 'var(--fc-text-secondary, #64748b)' }}>
          {distinctNominatedFilmsCount > 0 ? (
            <span>
              <strong>{distinctNominatedFilmsCount}</strong> film{distinctNominatedFilmsCount === 1 ? '' : 's'} nominated across <strong>{nominations.length}</strong> award categories ready for jury evaluation.
            </span>
          ) : (
            <span>No films nominated yet. Tag films with awards to advance them.</span>
          )}
        </div>

        <button
          type="button"
          className="fc-nom-continue-btn"
          onClick={handleContinueToJury}
          disabled={advancingLoading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          {advancingLoading ? `Advancing to ${nextStageName}...` : (<>Continue to {nextStageName} <ArrowForwardIcon size={14} /></>)}
        </button>
      </div>

      {/* ── PORTAL-BASED POPUP (MOUNTED TO DOCUMENT.BODY: IMPOSSIBLE TO CLIP) ── */}
      {activeDropdownFilm && createPortal(
        <>
          {/* Transparent Backdrop to detect click-outside */}
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 99998, background: 'rgba(0, 0, 0, 0.04)' }} 
            onClick={() => setActiveDropdownFilmId(null)} 
          />

          {/* Floating Card Popover */}
          <div
            className="fc-nom-portal-popover"
            style={{
              top: `${dropdownCoords.top}px`,
              left: `${dropdownCoords.left}px`,
              maxHeight: `${dropdownCoords.maxHeight}px`,
              width: '290px',
              zIndex: 99999
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="fc-nom-portal-header">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrophyIcon size={13} style={{ color: 'var(--fc-brand, #e11d48)' }} />
                  <span>Nominate for Award</span>
                </div>
                <div 
                  style={{ 
                    fontSize: '11px', 
                    color: 'var(--fc-text-muted, #64748b)', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap', 
                    maxWidth: '220px',
                    fontWeight: 500,
                    marginTop: '1px'
                  }} 
                  title={activeDropdownFilm.title}
                >
                  {activeDropdownFilm.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDropdownFilmId(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  color: 'var(--fc-text-muted, #64748b)', 
                  padding: '3px', 
                  display: 'flex', 
                  alignItems: 'center',
                  borderRadius: '4px'
                }}
                aria-label="Close menu"
              >
                <CloseIcon size={13} />
              </button>
            </div>

            {/* Optional category search filter if > 4 categories */}
            {categories.length > 4 && (
              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--fc-border, #e2e8f0)', background: 'var(--fc-surface-card, #ffffff)' }}>
                <input
                  type="text"
                  className="fc-input"
                  placeholder="Search awards..."
                  value={awardFilterQuery}
                  onChange={e => setAwardFilterQuery(e.target.value)}
                  style={{ width: '100%', fontSize: '11.5px', height: '28px', padding: '0 8px', borderRadius: '6px' }}
                />
              </div>
            )}

            {/* Categories Checklist List */}
            <div className="fc-nom-portal-list">
              {categories
                .filter(cat => !awardFilterQuery.trim() || (cat.name || '').toLowerCase().includes(awardFilterQuery.toLowerCase()))
                .map(cat => {
                  const isNom = isFilmNominated(cat.name, activeDropdownFilm.id);

                  return (
                    <div 
                      key={cat.id || cat.name} 
                      className={`fc-nom-dropdown-option ${isNom ? 'checked' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleNomination(cat.name, activeDropdownFilm);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isNom}
                        onChange={() => {}}
                        style={{ pointerEvents: 'none' }}
                      />
                      <span style={{ flex: 1, fontSize: '12px' }}>{cat.name}</span>
                      {isNom && (
                        <span style={{ fontSize: '10.5px', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                          <CheckIcon size={11} /> Active
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Footer with active count and Done button */}
            <div className="fc-nom-portal-footer">
              <span style={{ fontSize: '11px', color: 'var(--fc-text-secondary, #64748b)', fontWeight: 500 }}>
                {getFilmNominations(activeDropdownFilm.id).length} nominated
              </span>
              <button
                type="button"
                className="fc-btn fc-btn-primary fc-btn-xs"
                onClick={() => setActiveDropdownFilmId(null)}
                style={{ padding: '3px 12px', fontSize: '11.5px', borderRadius: '6px', fontWeight: 600 }}
              >
                Done
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
