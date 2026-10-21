import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import BulkAssignModal from './BulkAssignModal';
import { 
  CheckIcon, 
  CheckCircleIcon, 
  MovieIcon, 
  InfoIcon, 
  HourglassIcon, 
  LockIcon, 
  ArrowForwardIcon,
  ViewModuleIcon,
  ViewListIcon,
  SearchIcon,
  CloseIcon,
  AddIcon,
  StarIcon,
  TrophyIcon,
  PlayArrowIcon,
  ScheduleIcon,
  FlashOnIcon
} from '../common/Icons';

export default function JuryVotingBoard({ 
  stage,
  prevStage,
  nextStage,
  onAdvanceToResults, 
  onRefreshPipeline, 
  showToast,
  onViewFilm 
}) {
  const [categories, setCategories] = useState([]);
  const [availableJury, setAvailableJury] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [categoryJuryAssignments, setCategoryJuryAssignments] = useState([]);
  const [votingStats, setVotingStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancingLoading, setAdvancingLoading] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // Default to unified 'table' view
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  // Standard Master Table State (Row selection, expansion, and standard BulkAssignModal)
  const [selectedFilmIds, setSelectedFilmIds] = useState([]);
  const [expandedJurorRowIds, setExpandedJurorRowIds] = useState(new Set());
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [modalInitialJuryIds, setModalInitialJuryIds] = useState([]);

  const stageName = stage?.unique_name || stage?.name || 'Jury & Voting';
  const prevStageName = prevStage?.unique_name || prevStage?.name || 'Nominations';
  const nextStageName = nextStage?.unique_name || nextStage?.name || 'Finalists';

  // Helper to extract 2-letter initials
  const getInitials = (name) => {
    if (!name) return 'JU';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Fetch Board Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/submissions/jury-voting-board', {
        params: stage?.id ? { stage_id: stage.id } : {}
      });
      if (res.data?.success) {
        setCategories(res.data.categories || []);
        setAvailableJury(res.data.availableJury || []);
        setNominations(res.data.nominations || []);
        setCategoryJuryAssignments(res.data.categoryJuryAssignments || []);
        if (res.data.votingStats) {
          setVotingStats(res.data.votingStats);
        }
      }
    } catch (err) {
      console.error('Failed to load jury voting board:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [stage?.id]);

  // Derive unique films from nominations table so each film appears once in the Master Table
  const uniqueFilms = useMemo(() => {
    const map = new Map();
    for (const nom of nominations) {
      const subId = Number(nom.submission_id);
      if (!map.has(subId)) {
        map.set(subId, {
          id: subId,
          submission_id: subId,
          title: nom.title,
          director: nom.director,
          category: nom.category,
          runtime: nom.runtime,
          country: nom.country,
          status: nom.status,
          current_stage_name: nom.current_stage_name,
          rating: nom.rating,
          nominatedAwards: [nom.award_name],
          awardCategoryIds: nom.award_category_id ? [nom.award_category_id] : []
        });
      } else {
        const existing = map.get(subId);
        if (!existing.nominatedAwards.includes(nom.award_name)) {
          existing.nominatedAwards.push(nom.award_name);
        }
        if (nom.award_category_id && !existing.awardCategoryIds.includes(nom.award_category_id)) {
          existing.awardCategoryIds.push(nom.award_category_id);
        }
      }
    }
    return Array.from(map.values());
  }, [nominations]);

  // Check if a juror is assigned to a category
  const isJuryAssigned = (awardName, juryId) => {
    return categoryJuryAssignments.some(
      a => (a.award_name || '').toLowerCase() === (awardName || '').toLowerCase() && Number(a.jury_user_id) === Number(juryId)
    );
  };

  // Count assigned jurors for a category
  const getAssignedJuryCount = (awardName) => {
    return categoryJuryAssignments.filter(
      a => (a.award_name || '').toLowerCase() === (awardName || '').toLowerCase()
    ).length;
  };

  // Get nominated films for a category
  const getNominatedFilmsForCategory = (awardName) => {
    return nominations.filter(
      n => (n.award_name || '').toLowerCase() === (awardName || '').toLowerCase()
    );
  };

  // Get all assigned jurors for a specific film across all its nominated categories
  const getFilmAssignedJurors = (film) => {
    const assignedMap = new Map();

    // 1. Direct screening assignments returned from backend for this round
    if (votingStats?.assignments) {
      votingStats.assignments
        .filter(a => Number(a.film_id) === Number(film.id))
        .forEach(a => {
          assignedMap.set(Number(a.jury_user_id), {
            id: Number(a.jury_user_id),
            name: a.jury_name,
            status: a.assignment_status,
            hasReview: !!a.review_id,
            overallRating: a.overall_rating
          });
        });
    }

    // 2. Cross-reference with category jury assignments for this film's awards
    for (const award of film.nominatedAwards || []) {
      const catAssignments = categoryJuryAssignments.filter(
        cja => (cja.award_name || '').toLowerCase() === (award || '').toLowerCase()
      );
      for (const cja of catAssignments) {
        const jId = Number(cja.jury_user_id);
        if (!assignedMap.has(jId)) {
          const jUser = availableJury.find(u => Number(u.id) === jId);
          assignedMap.set(jId, {
            id: jId,
            name: jUser?.name || 'Juror',
            status: 'assigned',
            hasReview: false,
            overallRating: null
          });
        }
      }
    }

    return Array.from(assignedMap.values());
  };

  // Toggle row expansion for Juror Breakdown sub-row
  const toggleJurorExpand = (filmId) => {
    setExpandedJurorRowIds(prev => {
      const next = new Set(prev);
      if (next.has(filmId)) {
        next.delete(filmId);
      } else {
        next.add(filmId);
      }
      return next;
    });
  };

  // Row selection handler for bulk actions
  const handleToggleSelectRow = (filmId) => {
    setSelectedFilmIds(prev =>
      prev.includes(filmId) ? prev.filter(id => id !== filmId) : [...prev, filmId]
    );
  };

  // Bulk Advance selected films to next sequential stage (Matches screenshot 2)
  const handleBulkAdvance = async () => {
    if (selectedFilmIds.length === 0) return;
    if (!window.confirm(`Advance ${selectedFilmIds.length} selected film(s) to ${nextStageName}?`)) return;

    try {
      const res = await api.post('/submissions/bulk-advance', { 
        film_ids: selectedFilmIds,
        submission_ids: selectedFilmIds 
      });
      if (showToast) {
        showToast(res.data?.message || `Successfully advanced ${selectedFilmIds.length} film(s) to ${nextStageName}!`);
      }
      setSelectedFilmIds([]);
      fetchData();
      if (onRefreshPipeline) onRefreshPipeline();
    } catch (err) {
      console.error('Bulk advance error:', err);
      alert(err.response?.data?.error || 'Failed to bulk advance films.');
    }
  };

  // Bulk Reject selected films (Matches screenshot 2)
  const handleBulkReject = async () => {
    if (selectedFilmIds.length === 0) return;
    const reason = window.prompt(`Provide a rejection reason for ${selectedFilmIds.length} film(s) (min 10 characters):`, 'Does not meet program criteria.');
    if (!reason) return;
    if (reason.trim().length < 10) {
      alert('Rejection reason must be at least 10 characters.');
      return;
    }

    try {
      await api.post('/submissions/bulk-reject', {
        film_ids: selectedFilmIds,
        submission_ids: selectedFilmIds,
        reason: reason.trim()
      });
      if (showToast) {
        showToast(`Marked ${selectedFilmIds.length} film(s) as Rejected.`);
      }
      setSelectedFilmIds([]);
      fetchData();
      if (onRefreshPipeline) onRefreshPipeline();
    } catch (err) {
      console.error('Bulk reject error:', err);
      alert(err.response?.data?.error || 'Failed to bulk reject films.');
    }
  };

  // 1-Click Toggle Juror Assignment for a Category (used in Cards View)
  const handleToggleJury = async (cat, juror) => {
    const isCurrentlyAssigned = isJuryAssigned(cat.name, juror.id);

    // Optimistic UI update
    if (isCurrentlyAssigned) {
      setCategoryJuryAssignments(prev =>
        prev.filter(a => !(a.award_name.toLowerCase() === cat.name.toLowerCase() && Number(a.jury_user_id) === Number(juror.id)))
      );
    } else {
      setCategoryJuryAssignments(prev => [
        ...prev,
        {
          id: Date.now(),
          award_name: cat.name,
          award_category_id: cat.id || null,
          jury_user_id: juror.id
        }
      ]);
    }

    try {
      await api.post('/submissions/toggle-category-jury', {
        award_name: cat.name,
        jury_user_id: juror.id,
        award_category_id: cat.id || null,
        stage_id: stage?.id || null
      });

      if (showToast) {
        showToast(
          isCurrentlyAssigned
            ? `Unassigned ${juror.name} from ${cat.name}`
            : `Assigned ${juror.name} to ${cat.name}!`
        );
      }
      fetchData();
    } catch (err) {
      console.error('Failed to toggle category jury:', err);
      fetchData();
      alert('Failed to update jury assignment.');
    }
  };

  // Bulk Assign All / Clear All for a category (Cards View)
  const handleAssignAllCategory = async (cat, shouldAssign) => {
    try {
      if (shouldAssign) {
        setCategoryJuryAssignments(prev => {
          const filtered = prev.filter(a => a.award_name.toLowerCase() !== cat.name.toLowerCase());
          const newEntries = availableJury.map(j => ({
            id: Date.now() + j.id,
            award_name: cat.name,
            award_category_id: cat.id || null,
            jury_user_id: j.id
          }));
          return [...filtered, ...newEntries];
        });
      } else {
        setCategoryJuryAssignments(prev =>
          prev.filter(a => a.award_name.toLowerCase() !== cat.name.toLowerCase())
        );
      }

      await api.post('/submissions/assign-all-category-jury', {
        award_name: cat.name,
        award_category_id: cat.id || null,
        assign: shouldAssign,
        stage_id: stage?.id || null
      });

      if (showToast) {
        showToast(shouldAssign ? `Assigned all jurors to ${cat.name}` : `Cleared jurors for ${cat.name}`);
      }
      fetchData();
    } catch (err) {
      console.error('Failed to bulk assign category jury:', err);
      fetchData();
    }
  };

  // Check juror review status for a specific category
  const getJurorCategoryReviewStatus = (jurorId, categoryName) => {
    if (!votingStats?.assignments) return null;
    const catNomFilms = getNominatedFilmsForCategory(categoryName);
    if (catNomFilms.length === 0) return null;
    const filmIds = new Set(catNomFilms.map(n => n.submission_id));
    const jurorAssigns = votingStats.assignments.filter(
      a => Number(a.jury_user_id) === Number(jurorId) && filmIds.has(a.film_id)
    );
    if (jurorAssigns.length === 0) return null;
    const completed = jurorAssigns.filter(a => a.assignment_status === 'completed' || a.review_id).length;
    return {
      total: jurorAssigns.length,
      completed,
      isDone: completed === jurorAssigns.length
    };
  };

  // Advance to Results
  const handleViewResults = async () => {
    if (votingStats && !votingStats.allReviewsCompleted) {
      alert(`Cannot view results yet: ${votingStats.pendingAssignments} jury review(s) are still pending. All assigned jurors must review and rate their assigned films before results can be finalized.`);
      return;
    }

    if (!window.confirm(`All jury reviews are completed! Ready to conclude voting and advance to ${nextStageName}?`)) {
      return;
    }

    setAdvancingLoading(true);
    try {
      const res = await api.post('/submissions/advance-to-results', {
        current_stage_id: stage?.id || null,
        target_stage_id: nextStage?.id || null
      });
      if (res.data?.success) {
        if (showToast) {
          showToast(res.data.message || `Advanced to ${nextStageName}!`);
        }
        if (onAdvanceToResults) onAdvanceToResults(res.data);
        if (onRefreshPipeline) onRefreshPipeline();
      }
    } catch (err) {
      console.error('Failed to advance to results:', err);
      alert(err.response?.data?.error || 'Failed to advance to results.');
    } finally {
      setAdvancingLoading(false);
    }
  };

  // Only display categories that have nominated films (or all active categories)
  const displayCategories = useMemo(() => {
    if (categories.length === 0) return [];
    const withNoms = categories.filter(c => getNominatedFilmsForCategory(c.name).length > 0);
    return withNoms.length > 0 ? withNoms : categories;
  }, [categories, nominations]);

  // Count films without any assigned jurors
  const unassignedJuryFilmsCount = useMemo(() => {
    return uniqueFilms.filter(f => getFilmAssignedJurors(f).length === 0).length;
  }, [uniqueFilms, categoryJuryAssignments, votingStats]);

  // Filtered films list based on search and category pill
  const filteredFilms = useMemo(() => {
    let list = uniqueFilms;

    // 1. Filter Pill
    if (selectedCategoryFilter === 'unassigned') {
      list = list.filter(f => getFilmAssignedJurors(f).length === 0);
    } else if (selectedCategoryFilter !== 'all') {
      list = list.filter(f => 
        (f.nominatedAwards || []).some(a => a.toLowerCase() === selectedCategoryFilter.toLowerCase())
      );
    }

    // 2. Live Search
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
  }, [uniqueFilms, selectedCategoryFilter, searchQuery, categoryJuryAssignments, votingStats]);

  const handleSelectAll = () => {
    if (selectedFilmIds.length === filteredFilms.length) {
      setSelectedFilmIds([]);
    } else {
      setSelectedFilmIds(filteredFilms.map(f => f.id));
    }
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--fc-surface-card, #ffffff)', borderRadius: '12px', padding: '36px', textAlign: 'center', border: '1px solid var(--fc-border, #e2e8f0)', color: 'var(--fc-text-secondary, #64748b)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Loading jury assignment &amp; voting board...
      </div>
    );
  }

  return (
    <div className="fc-jury-voting-board animate-fade-in" style={{
      background: 'var(--fc-surface-card, #ffffff)',
      borderRadius: '12px',
      border: '1px solid var(--fc-border, #e2e8f0)',
      padding: '24px 28px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      marginBottom: '24px'
    }}>
      {/* ── TOP SUBHEADER BAR ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '16px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--fc-border, #f1f5f9)',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Left: Title & Stage Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--fc-brand, #a82f2f)', fontSize: '13px', lineHeight: 1 }}>●</span>
          <strong style={{ fontSize: '15px', color: 'var(--fc-text-main)' }}>
            Admin View — {stageName}
          </strong>
          <span style={{ fontSize: '12px', color: 'var(--fc-text-muted)', marginLeft: '6px' }}>
            ({uniqueFilms.length} Nominated Films · {availableJury.length} Jurors)
          </span>
        </div>

        {/* Right: View Mode Switcher (Table vs Cards) */}
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
            title="Cards Board View (Visual categories board)"
          >
            <ViewModuleIcon size={14} />
            <span>Cards View</span>
          </button>
        </div>
      </div>

      {uniqueFilms.length === 0 && (
        <div className="fc-nom-info-banner" style={{ marginBottom: '24px' }}>
          <div className="fc-nom-info-icon-box">ℹ</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fc-nom-info-title">
              No films nominated from {prevStageName} yet
            </div>
            <div className="fc-nom-info-desc">
              To evaluate films in {stageName}, first nominate official selection films for award categories in the <span className="fc-nom-stage-pill">{prevStageName}</span> stage.
            </div>
          </div>
        </div>
      )}

      {/* ── CONDITIONAL VIEW RENDERING: 1. TABLE VIEW vs 2. CARDS VIEW ── */}
      {viewMode === 'table' ? (
        /* ── 1. UNIFIED STANDARD MASTER TABLE VIEW (MATCHING STANDARD SUBMISSIONS VIEW) ── */
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
                  {votingStats ? `${votingStats.completedAssignments} of ${votingStats.totalAssignments} Reviews Done` : `${uniqueFilms.length} Films`}
                </span>
                <span style={{ color: 'var(--fc-border)' }}>·</span>
                <span>{availableJury.length} Available Jurors</span>
              </div>
            </div>

            {/* Row 2: Category Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--fc-text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Filter By Award:
              </span>

              {/* All Films Pill */}
              <button
                type="button"
                className={`fc-nom-filter-pill ${selectedCategoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategoryFilter('all')}
              >
                <span>All Films</span>
                <span style={{ opacity: 0.85, fontSize: '11px' }}>({uniqueFilms.length})</span>
              </button>

              {/* Dynamic Categories Pills */}
              {displayCategories.map(cat => {
                const count = getNominatedFilmsForCategory(cat.name).length;
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

              {/* Unassigned Jury Filter Pill */}
              {unassignedJuryFilmsCount > 0 && (
                <button
                  type="button"
                  className={`fc-nom-filter-pill warning-pill ${selectedCategoryFilter === 'unassigned' ? 'active' : ''}`}
                  onClick={() => setSelectedCategoryFilter('unassigned')}
                >
                  <span>⚠️ Unassigned Jury</span>
                  <span style={{ opacity: 0.85, fontSize: '11px' }}>({unassignedJuryFilmsCount})</span>
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
                    {/* Select All Checkbox */}
                    <th style={{ width: '38px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={filteredFilms.length > 0 && selectedFilmIds.length === filteredFilms.length}
                        onChange={handleSelectAll}
                        style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                        title="Select All"
                      />
                    </th>
                    <th style={{ minWidth: '220px' }}>TITLE &amp; DIRECTOR</th>
                    <th style={{ minWidth: '120px' }}>CATEGORY</th>
                    <th style={{ minWidth: '180px' }}>NOMINATED AWARDS</th>
                    <th style={{ minWidth: '90px', textAlign: 'center' }}>SCORE</th>
                    <th style={{ minWidth: '220px' }}>JURY &amp; EVALUATION</th>
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
                      const isChecked = selectedFilmIds.includes(film.id);
                      const isExpanded = expandedJurorRowIds.has(film.id);
                      const filmAssignedJurors = getFilmAssignedJurors(film);
                      const totalJurorsCount = filmAssignedJurors.length;
                      const completedReviewsCount = filmAssignedJurors.filter(j => j.hasReview || j.status === 'completed').length;
                      const juryNamesString = filmAssignedJurors.map(j => j.name).join(', ');

                      return (
                        <React.Fragment key={film.id}>
                          <tr
                            className={isChecked ? 'selected' : ''}
                            style={{ transition: 'background-color 0.15s ease' }}
                          >
                            {/* Checkbox (Admin Selection for Bulk Assign) */}
                            <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectRow(film.id)}
                                style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                              />
                            </td>

                            {/* Title & Director */}
                            <td>
                              <div 
                                style={{ 
                                  fontWeight: 700, 
                                  fontSize: '13px', 
                                  color: 'var(--fc-text-main)',
                                  cursor: onViewFilm ? 'pointer' : 'default',
                                  display: 'inline-block'
                                }}
                                onClick={() => onViewFilm && onViewFilm(film)}
                                title={onViewFilm ? "Click to view film details drawer" : undefined}
                              >
                                {film.title}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                                Dir. {film.director || 'Filmmaker'}
                                {film.country ? ` · ${film.country}` : ''}
                                {film.runtime ? ` · ${film.runtime}m` : ''}
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
                                {(film.nominatedAwards || []).map(award => (
                                  <span 
                                    key={award}
                                    className="fc-nom-award-badge"
                                    style={{ fontSize: '11px', padding: '2px 7px' }}
                                  >
                                    <TrophyIcon size={11} />
                                    <span>{award}</span>
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* Score */}
                            <td style={{ textAlign: 'center' }}>
                              {film.rating && film.rating !== 'Unrated' ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <StarIcon size={12} style={{ color: '#eab308' }} />
                                  <strong style={{ fontSize: '12.5px', color: 'var(--fc-text-main)' }}>
                                    {parseFloat(film.rating).toFixed(1)}
                                  </strong>
                                </div>
                              ) : (
                                <span style={{ fontSize: '11.5px', color: 'var(--fc-text-muted)', fontStyle: 'italic' }}>
                                  Unrated
                                </span>
                              )}
                            </td>

                            {/* JURY & EVALUATION (IDENTICAL TO STANDARD MASTER TABLE VIEW) */}
                            <td>
                              <div>
                                {/* Assigned jury names display */}
                                <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                                  {juryNamesString || 'Unassigned'}
                                </div>

                                {totalJurorsCount > 0 ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    {/* Juror Breakdown Toggle Button */}
                                    <button
                                      type="button"
                                      className="fc-btn-subtle"
                                      onClick={() => toggleJurorExpand(film.id)}
                                      style={{
                                        fontSize: '11px',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        background: isExpanded ? 'var(--fc-surface-hover)' : 'transparent',
                                        border: '1px solid var(--fc-border)',
                                        cursor: 'pointer',
                                        color: 'var(--fc-brand)',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      <PlayArrowIcon size={12} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
                                      <span>{isExpanded ? 'Hide Jurors' : `Juror Breakdown (${completedReviewsCount}/${totalJurorsCount})`}</span>
                                    </button>

                                    {/* Edit / Reassign Button */}
                                    <button
                                      type="button"
                                      className="fc-btn-subtle"
                                      onClick={() => {
                                        setSelectedFilmIds([film.id]);
                                        setModalInitialJuryIds(filmAssignedJurors.map(j => j.id));
                                        setBulkAssignModalOpen(true);
                                      }}
                                      title="Edit jury assignments"
                                      style={{
                                        fontSize: '11px',
                                        padding: '3px 7px',
                                        borderRadius: '4px',
                                        border: '1px solid var(--fc-border)',
                                        cursor: 'pointer',
                                        color: 'var(--fc-text-secondary)',
                                        fontWeight: 500
                                      }}
                                    >
                                      Edit
                                    </button>
                                  </div>
                                ) : (
                                  /* Assign Jury Button */
                                  <button
                                    type="button"
                                    className="fc-assign-action-btn"
                                    onClick={() => {
                                      setSelectedFilmIds([film.id]);
                                      setModalInitialJuryIds([]);
                                      setBulkAssignModalOpen(true);
                                    }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <AddIcon size={13} />
                                    <span>Assign Jury</span>
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
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

                          {/* ── EXPANDABLE JUROR SUB-ROW (IDENTICAL TO STANDARD MASTER TABLE VIEW) ── */}
                          {isExpanded && (
                            <tr className="expandable-juror-row">
                              <td colSpan="7">
                                <div className="juror-breakdown-title">
                                  EVALUATION SCORECARDS &amp; JURY BREAKDOWN FOR "{film.title}"
                                </div>
                                <div className="juror-matrix-strip">
                                  {filmAssignedJurors.map((juror, jIdx) => {
                                    const isDone = juror.hasReview || juror.status === 'completed';

                                    return (
                                      <div key={jIdx} className="juror-card-micro">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <strong style={{ fontSize: '13px', color: 'var(--fc-text-main)' }}>
                                            {juror.name}
                                          </strong>
                                          <span
                                            className={`juror-status-badge ${isDone ? 'completed' : 'in-progress'}`}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                          >
                                            {isDone ? (
                                              <><CheckCircleIcon size={11} /> Completed</>
                                            ) : (
                                              <><ScheduleIcon size={11} /> Pending</>
                                            )}
                                          </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)' }}>
                                            {juror.overallRating ? `★ ${parseFloat(juror.overallRating).toFixed(1)}` : 'Unrated'}
                                          </span>
                                          <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>
                                            · Jury Member
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '28px' }}>
          {displayCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--fc-text-muted, #94a3b8)', fontStyle: 'italic', border: '1px dashed var(--fc-border, #cbd5e1)', borderRadius: '10px' }}>
              No award categories configured. Please configure awards and nominate films first in the {prevStageName} stage.
            </div>
          ) : (
            displayCategories.map(cat => {
              const nominatedFilms = getNominatedFilmsForCategory(cat.name);
              const assignedCount = getAssignedJuryCount(cat.name);
              const isAllAssigned = availableJury.length > 0 && assignedCount === availableJury.length;

              return (
                <div
                  key={cat.id || cat.name}
                  className="fc-jury-category-card"
                  style={{
                    background: 'var(--fc-surface-card, #ffffff)',
                    border: '1px solid var(--fc-border, #e2e8f0)',
                    borderRadius: '10px',
                    padding: '18px 22px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                  }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TrophyIcon size={16} style={{ color: 'var(--fc-brand, #e11d48)' }} />
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--fc-text-main, #1e293b)', margin: 0 }}>
                        {cat.name}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fc-text-secondary, #64748b)' }}>
                        {nominatedFilms.length} {nominatedFilms.length === 1 ? 'film' : 'films'} ·{' '}
                        <span style={{ color: assignedCount > 0 ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-secondary, #64748b)', fontWeight: assignedCount > 0 ? 700 : 500 }}>
                          {assignedCount} jury assigned
                        </span>
                      </span>

                      {/* Quick Select All / Clear Toggle */}
                      {availableJury.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignAllCategory(cat, !isAllAssigned)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: isAllAssigned ? '#dc2626' : '#2563eb',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '0 4px',
                            textDecoration: 'underline'
                          }}
                        >
                          {isAllAssigned ? 'Clear all' : 'Assign all'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub-section 1: ASSIGN JURY MEMBERS */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--fc-text-muted, #94a3b8)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
                      ASSIGN JURY MEMBERS
                    </div>

                    {availableJury.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#b45309', fontStyle: 'italic' }}>
                        No jury members registered for this event yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {availableJury.map(juror => {
                          const assigned = isJuryAssigned(cat.name, juror.id);
                          const initials = getInitials(juror.name);

                          return (
                            <button
                              key={juror.id}
                              type="button"
                              onClick={() => handleToggleJury(cat, juror)}
                              title={assigned ? `Click to unassign ${juror.name}` : `Click to assign ${juror.name}`}
                              style={{
                                background: assigned ? 'var(--fc-brand-active-bg, rgba(225, 29, 72, 0.15))' : 'var(--fc-surface, #f8fafc)',
                                border: assigned ? '1.5px solid var(--fc-brand, #a82f2f)' : '1px solid var(--fc-border, #e2e8f0)',
                                borderRadius: '8px',
                                padding: '5px 12px 5px 6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                flexShrink: 0,
                                background: assigned ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-surface-hover, #e2e8f0)',
                                color: assigned ? '#ffffff' : 'var(--fc-text-secondary, #64748b)',
                                fontSize: '10px',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 1,
                                position: 'relative'
                              }}>
                                {(juror.thumbnailPic || juror.thumbnail) ? (
                                  <img
                                    src={juror.thumbnailPic || juror.thumbnail}
                                    alt={juror.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <span style={{ display: (juror.thumbnailPic || juror.thumbnail) ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                  {initials}
                                </span>
                              </span>

                              <span style={{
                                fontSize: '12px',
                                fontWeight: assigned ? 700 : 500,
                                color: assigned ? 'var(--fc-brand, #a82f2f)' : 'var(--fc-text-main, #334155)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                <span>{juror.name}</span>
                                {assigned && (() => {
                                  const revStatus = getJurorCategoryReviewStatus(juror.id, cat.name);
                                  if (!revStatus || revStatus.total === 0) return null;
                                  if (revStatus.isDone) {
                                    return (
                                      <span style={{
                                        fontSize: '9.5px',
                                        fontWeight: 800,
                                        color: '#16a34a',
                                        background: '#dcfce7',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px'
                                      }}>
                                        <CheckIcon size={9} /> Reviewed
                                      </span>
                                    );
                                  }
                                  return (
                                    <span style={{
                                      fontSize: '9.5px',
                                      fontWeight: 700,
                                      color: '#b45309',
                                      background: '#fef3c7',
                                      padding: '1px 5px',
                                      borderRadius: '4px'
                                    }}>
                                      {revStatus.completed}/{revStatus.total}
                                    </span>
                                  );
                                })()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Sub-section 2: NOMINATED FILMS */}
                  <div>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--fc-text-muted, #94a3b8)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
                      NOMINATED FILMS
                    </div>

                    {nominatedFilms.length === 0 ? (
                      <div className="fc-nom-empty-card-slot">
                        <span className="fc-nom-empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <MovieIcon size={24} />
                        </span>
                        <div>
                          <div className="fc-nom-empty-title">
                            No films nominated for this category yet
                          </div>
                          <div className="fc-nom-empty-desc">
                            Return to the <span className="fc-nom-stage-pill">{prevStageName}</span> stage to nominate official selection films for this award.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {nominatedFilms.map(nom => {
                          const filmStats = votingStats?.filmReviewStats?.[nom.submission_id];
                          return (
                            <span
                              key={nom.id || nom.submission_id}
                              style={{
                                background: 'var(--fc-surface-hover, #f5f3ff)',
                                border: '1px solid var(--fc-border, #ddd6fe)',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'var(--fc-text-main, #6d28d9)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: onViewFilm ? 'pointer' : 'default'
                              }}
                              onClick={() => onViewFilm && onViewFilm({ id: nom.submission_id, title: nom.title, director: nom.director, category: nom.category })}
                              title={onViewFilm ? "Click to view film details drawer" : undefined}
                            >
                              <span>{nom.title}</span>
                              {filmStats && filmStats.total > 0 && (
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: filmStats.completed === filmStats.total ? '#16a34a' : 'var(--fc-brand, #7c3aed)',
                                  background: filmStats.completed === filmStats.total ? 'rgba(34, 197, 94, 0.14)' : 'rgba(168, 85, 247, 0.14)',
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}>
                                  {filmStats.completed}/{filmStats.total} reviews
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── FLOATING STICKY BULK ACTION BAR (IDENTICAL TO SCREENSHOT 2 / MASTER VIEW) ── */}
      {selectedFilmIds.length > 0 && (
        <div className="floating-bulk-bar">
          <div className="floating-bulk-count">
            <span className="floating-badge">{selectedFilmIds.length}</span>
            <span>Films Selected</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="fc-btn fc-btn-secondary fc-btn-sm"
              onClick={() => {
                setModalInitialJuryIds([]);
                setBulkAssignModalOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <AddIcon size={14} />
              <span>Assign Jury</span>
            </button>

            <button
              type="button"
              className="fc-btn fc-btn-primary fc-btn-sm"
              onClick={handleBulkAdvance}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <FlashOnIcon size={14} />
              <span>Advance Stage</span>
            </button>

            <button
              type="button"
              className="fc-btn fc-btn-danger fc-btn-sm"
              onClick={handleBulkReject}
            >
              Reject Selected
            </button>

            <button
              type="button"
              className="fc-btn fc-btn-outline fc-btn-sm"
              style={{ background: '#292524', color: '#e7e5e4', borderColor: '#44403c' }}
              onClick={() => setSelectedFilmIds([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── STANDARD BULK JURY ASSIGNMENT MODAL (IDENTICAL TO STANDARD SUBMISSIONS HUB) ── */}
      <BulkAssignModal
        isOpen={bulkAssignModalOpen}
        onClose={() => setBulkAssignModalOpen(false)}
        selectedFilmIds={selectedFilmIds}
        selectedFilms={uniqueFilms.filter(f => selectedFilmIds.includes(f.id))}
        availableJury={availableJury}
        initialJuryIds={modalInitialJuryIds}
        roundNumber={votingStats?.roundNumber || stage?.stage_order || 5}
        stageId={stage?.id}
        onSuccess={() => {
          fetchData();
          if (onRefreshPipeline) onRefreshPipeline();
          if (showToast) {
            showToast(`Assigned reviewers to ${selectedFilmIds.length} film(s)!`);
          }
          setSelectedFilmIds([]);
        }}
      />

      {/* ── VOTING PROGRESS & LOCKING BANNER ───────────────────────────── */}
      {/* ── VOTING PROGRESS & LOCKING BANNER (HIGH CONTRAST LIGHT & DARK) ── */}
      {votingStats && (
        <div style={{ marginBottom: '18px' }}>
          {votingStats.totalAssignments === 0 ? (
            <div className="fc-voting-status-banner unassigned">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div className="fc-status-icon-box">
                  <InfoIcon size={20} />
                </div>
                <div>
                  <div className="fc-status-title">No Jury Assigned Yet</div>
                  <div className="fc-status-desc">
                    Assign jury members to films or award categories above to initiate film screening and voting.
                  </div>
                </div>
              </div>
            </div>
          ) : !votingStats.allReviewsCompleted ? (
            <div className="fc-voting-status-banner in-progress">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div className="fc-status-icon-box">
                  <HourglassIcon size={20} />
                </div>
                <div>
                  <div className="fc-status-title">
                    Jury Voting in Progress — {votingStats.completedAssignments} of {votingStats.totalAssignments} Reviews Completed
                  </div>
                  <div className="fc-status-desc">
                    Results are locked until all assigned jurors finish reviewing and rating the films ({votingStats.pendingAssignments} pending).
                  </div>
                </div>
              </div>

              {votingStats.pendingList && votingStats.pendingList.length > 0 && (
                <div className="fc-awaiting-badge">
                  <span>Awaiting review by: </span>
                  <strong>{[...new Set(votingStats.pendingList.map(p => p.juryName))].join(', ')}</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="fc-voting-status-banner completed">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div className="fc-status-icon-box">
                  <CheckCircleIcon size={20} />
                </div>
                <div>
                  <div className="fc-status-title">
                    All Jury Reviews Completed ({votingStats.totalAssignments}/{votingStats.totalAssignments})!
                  </div>
                  <div className="fc-status-desc">
                    Every assigned juror has submitted their review and ratings. Results are ready to view in {nextStageName}.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BOTTOM ACTIONS ─────────────────────────────────────────────── */}
      <div style={{ paddingTop: '4px' }}>
        {votingStats && !votingStats.allReviewsCompleted ? (
          <button
            type="button"
            className="fc-btn-locked-status"
            disabled
            title="All assigned jurors must review and rate their assigned films before viewing results"
          >
            <LockIcon size={14} className="lock-icon" />
            <span>
              View Results (Locked — {votingStats.totalAssignments === 0 ? 'No Jury Assigned' : `${votingStats.pendingAssignments} Reviews Pending`})
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleViewResults}
            disabled={advancingLoading || (votingStats && votingStats.totalAssignments === 0)}
            style={{
              background: 'var(--fc-brand, #a82f2f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '11px 24px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: advancingLoading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(168, 47, 47, 0.25)',
              transition: 'background 0.15s ease'
            }}
          >
            {advancingLoading ? `Advancing to ${nextStageName}...` : (<>View Results &amp; {nextStageName} Rankings <ArrowForwardIcon size={14} /></>)}
          </button>
        )}
      </div>
    </div>
  );
}
