/**
 * SubmissionPage Component — Production Master Submissions Hub
 * 
 * Features:
 * - 6-Stage Sequential Pipeline Stepper (Round 1: Screening ➔ Round 2: Consideration ➔ Official Selection Nominations ➔ Jury & Voting ➔ Finalist ➔ Winner)
 * - Stage Decision Banner with cutoffs and automated advancement execution
 * - Clean Scope Pills: All Films, Submitted (New Queue), Rejected
 * - Toolbar: Dynamic Category dropdown, Flag dropdown, Search, Export CSV
 * - Master Table: Multi-select checkboxes, Inline Category changer, Stage pills, Rating & Composite score, Jury summary
 * - Expandable Juror Sub-Rows (▶ Juror Breakdown) with micro-cards showing juror score, status, criteria notes
 * - Floating Sticky Bulk Action Bar (Assign Jury, Advance Stage, Reject, Clear)
 * - Integrated Modals: BulkAssignModal, StageCompletionModal, RejectFilmModal, FilmDetailDrawer
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useFestivalConfig } from '../hooks/useFestivalConfig';
import FilmDetailDrawer from '../components/submissions/FilmDetailDrawer';
import RejectFilmModal from '../components/submissions/RejectFilmModal';
import AdvanceFilmModal from '../components/submissions/AdvanceFilmModal';
import BulkAssignModal from '../components/submissions/BulkAssignModal';
import FilterDrawer from '../components/submissions/FilterDrawer';
import FlagManagerModal from '../components/submissions/FlagManagerModal';
import NominationsBoard from '../components/submissions/NominationsBoard';
import JuryVotingBoard from '../components/submissions/JuryVotingBoard';
import FinalistsBoard from '../components/submissions/FinalistsBoard';
import WinnersBoard from '../components/submissions/WinnersBoard';
import ActivityLogBoard from '../components/submissions/ActivityLogBoard';
import {
  SearchIcon,
  FilterListIcon,
  FileDownloadIcon,
  FlashOnIcon,
  PlayArrowIcon,
  CancelIcon,
  CloseIcon,
  CheckCircleIcon,
  ScheduleIcon,
  StarIcon,
  EditIcon,
  AddIcon,
  ArrowForwardIcon,
  SettingsIcon,
  LockIcon
} from '../components/common/Icons';

const STANDARD_FLAGS = [
  { id: 'flag-high-priority', label: 'High Priority', color: '#e05252' },
  { id: 'flag-needs-review', label: 'Needs Review', color: '#d97706' },
  { id: 'flag-strong-contender', label: 'Strong Contender', color: '#10b981' },
  { id: 'flag-special-interest', label: 'Special Interest', color: '#3b82f6' },
];

const DEFAULT_STAGES = [
  { id: 1, stage_order: 1, unique_name: 'Round 1: Screening', name: 'Round 1: Screening', auto_advance_cutoff: '3.80', auto_reject_cutoff: '2.50', count: 0, jury_assignment_mode: 'auto' },
  { id: 2, stage_order: 2, unique_name: 'Round 2: Consideration', name: 'Round 2: Consideration', auto_advance_cutoff: '4.00', auto_reject_cutoff: '3.00', count: 0, jury_assignment_mode: 'auto' },
  { id: 3, stage_order: 3, unique_name: 'Official Selection', name: 'Official Selection', auto_advance_cutoff: '4.20', auto_reject_cutoff: '3.20', count: 0, jury_assignment_mode: 'manual' },
  { id: 4, stage_order: 4, unique_name: 'Nominations', name: 'Nominations', auto_advance_cutoff: '4.35', auto_reject_cutoff: '3.35', count: 0, jury_assignment_mode: 'manual' },
  { id: 5, stage_order: 5, unique_name: 'Jury & Voting', name: 'Jury & Voting', auto_advance_cutoff: '4.50', auto_reject_cutoff: '3.50', count: 0, jury_assignment_mode: 'manual' },
  { id: 6, stage_order: 6, unique_name: 'Finalist', name: 'Finalist', auto_advance_cutoff: '4.80', auto_reject_cutoff: '4.00', count: 0, jury_assignment_mode: 'none' },
  { id: 7, stage_order: 7, unique_name: 'Winner', name: 'Winner', auto_advance_cutoff: '5.00', auto_reject_cutoff: '4.50', count: 0, jury_assignment_mode: 'none' },
];

/**
 * Resolve stage from URL pathname or dynamic route parameter
 */
export const resolveStageFromPath = (pathname, stageIdParam, stages) => {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const path = (pathname || '').replace(/\/+$/, '').toLowerCase();

  // If dynamic :stageId is provided in URL
  if (stageIdParam || path.includes('/submissions/stage/')) {
    const rawId = stageIdParam || path.split('/submissions/stage/')[1]?.split('/')[0]?.split('?')[0];
    if (rawId) {
      return stages.find(s => String(s.id) === String(rawId)) || { id: isNaN(Number(rawId)) ? rawId : Number(rawId), unique_name: `Stage ${rawId}` };
    }
  }

  if (path === '/submissions/winners' || path === '/submissions/winner') {
    return stages.find(s => (s.unique_name || s.name || '').toLowerCase().includes('winner')) || null;
  }
  if (path === '/submissions/finalists' || path === '/submissions/finalist') {
    return stages.find(s => (s.unique_name || s.name || '').toLowerCase().includes('finalist')) || null;
  }
  if (path === '/submissions/jury-voting') {
    return stages.find(s => {
      const n = (s.unique_name || s.name || '').toLowerCase();
      return (n.includes('voting') || n.includes('jury')) && !n.includes('screening');
    }) || null;
  }
  if (path === '/submissions/nominations') {
    return stages.find(s => (s.unique_name || s.name || '').toLowerCase().includes('nomination')) || null;
  }
  if (path === '/submissions/official-selection') {
    return stages.find(s => (s.unique_name || s.name || '').toLowerCase().includes('official selection')) || null;
  }
  if (path === '/submissions/consideration') {
    return stages.find(s => {
      const n = (s.unique_name || s.name || '').toLowerCase();
      return n.includes('consideration') || n.includes('round 2');
    }) || null;
  }
  if (path === '/submissions/screening') {
    return stages.find(s => {
      const n = (s.unique_name || s.name || '').toLowerCase();
      return n.includes('screening') || n.includes('round 1');
    }) || null;
  }

  return null;
};

/**
 * Returns the canonical friendly URL (or /submissions/stage/:id) for a stage
 */
export const getStageUrl = (stage) => {
  if (!stage) return '/submissions/under-review';
  const name = (stage.unique_name || stage.name || '').toLowerCase();

  if (name.includes('winner')) {
    return '/submissions/winners';
  }
  if (name.includes('finalist')) {
    return '/submissions/finalists';
  }
  if ((name.includes('voting') || name.includes('jury')) && !name.includes('screening')) {
    return '/submissions/jury-voting';
  }
  if (name.includes('nomination')) {
    return '/submissions/nominations';
  }
  if (name.includes('official selection')) {
    return '/submissions/official-selection';
  }
  if (name.includes('consideration') || name.includes('round 2')) {
    return '/submissions/consideration';
  }
  if (name.includes('screening') || name.includes('round 1')) {
    return '/submissions/screening';
  }

  return `/submissions/stage/${stage.id}`;
};

/**
 * Determine initial scope and stage from initial location pathname
 */
const getInitialRouteState = (pathname, stageIdParam) => {
  const path = (pathname || (typeof window !== 'undefined' ? window.location.pathname : '')).replace(/\/+$/, '').toLowerCase();
  if (path === '/submissions/new-submissions') return { scope: 'submitted', stageId: null };
  if (path === '/submissions/under-review') return { scope: 'under_review', stageId: null };
  if (path === '/submissions/rejected') return { scope: 'rejected', stageId: null };
  if (path === '/submissions/activity' || path === '/submissions/activity-log') return { scope: 'activity', stageId: null };
  if (stageIdParam || path.includes('/submissions/stage/')) {
    const rawId = stageIdParam || path.split('/submissions/stage/')[1]?.split('/')[0]?.split('?')[0];
    return { scope: 'under_review', stageId: isNaN(Number(rawId)) ? rawId : Number(rawId) };
  }
  const matched = resolveStageFromPath(path, stageIdParam, DEFAULT_STAGES);
  if (matched) {
    return { scope: 'under_review', stageId: matched.id };
  }
  return { scope: 'all', stageId: null };
};

export default function SubmissionPage() {
  const { currentFestival } = useFestivalConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isJuryUser = Boolean(user?.current_group === 'jury' || user?.current_group === 'judge');

  const initialRoute = useMemo(() => getInitialRouteState(location.pathname, params.stageId), []);

  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState({});
  const [flags, setFlags] = useState([]);
  const [pipelineStepper, setPipelineStepper] = useState([]);
  const [availableJury, setAvailableJury] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters initialized with route & query context
  const [activeScope, setActiveScope] = useState(initialRoute.scope); // 'all' | 'submitted' | 'under_review' | 'rejected'
  const [activeStageId, setActiveStageId] = useState(initialRoute.stageId);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [selectedFlag, setSelectedFlag] = useState(searchParams.get('flag_id') || searchParams.get('flag') || 'all');
  const [search, setSearch] = useState(searchParams.get('search') || searchParams.get('q') || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || searchParams.get('q') || '');

  // Advanced Filters (Approach B)
  const [selectedScore, setSelectedScore] = useState('all');
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedRuntime, setSelectedRuntime] = useState('all');
  const [availableCountries, setAvailableCountries] = useState([]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Table Interaction
  const [selectedFilmIds, setSelectedFilmIds] = useState([]);
  const [expandedJurorRowIds, setExpandedJurorRowIds] = useState(new Set());
  const [inlineCategoryEditingId, setInlineCategoryEditingId] = useState(null);

  // Modals & Drawers
  const [selectedFilm, setSelectedFilm] = useState(null);
  const [rejectingFilm, setRejectingFilm] = useState(null);
  const [advancingFilm, setAdvancingFilm] = useState(null);
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [flagManagerOpen, setFlagManagerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const activeStageObj = useMemo(() => {
    return pipelineStepper.find(s => Number(s.id) === Number(activeStageId));
  }, [pipelineStepper, activeStageId]);

  const sortedStages = useMemo(() => {
    if (!Array.isArray(pipelineStepper)) return [];
    return [...pipelineStepper].sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
  }, [pipelineStepper]);

  const activeStageIndex = useMemo(() => {
    if (!activeStageObj || sortedStages.length === 0) return -1;
    return sortedStages.findIndex(s => Number(s.id) === Number(activeStageObj.id));
  }, [sortedStages, activeStageObj]);

  const prevStageObj = useMemo(() => {
    if (activeStageIndex > 0) return sortedStages[activeStageIndex - 1];
    return null;
  }, [sortedStages, activeStageIndex]);

  const nextStageObj = useMemo(() => {
    if (activeStageIndex >= 0 && activeStageIndex < sortedStages.length - 1) {
      return sortedStages[activeStageIndex + 1];
    }
    return null;
  }, [sortedStages, activeStageIndex]);

  // Dynamic Stage Archetype Resolver (100% decoupled from fixed stage names or stage numbers)
  const stageArchetype = useMemo(() => {
    if (!activeStageObj) return 'STANDARD_TABLE';

    const sorted = [...sortedStages];
    const isTerminal = sorted.length > 0 && Number(sorted[sorted.length - 1].id) === Number(activeStageObj.id);
    const isSecondLast = sorted.length > 1 && Number(sorted[sorted.length - 2].id) === Number(activeStageObj.id);
    const hasAwardCriteria = (Array.isArray(activeStageObj.award_criteria) && activeStageObj.award_criteria.length > 0) ||
                             (Array.isArray(activeStageObj.award_categories) && activeStageObj.award_categories.length > 0);

    const nameLower = (activeStageObj.unique_name || activeStageObj.name || '').toLowerCase();

    // 1. Terminal / Winner Showcase stage
    if (isTerminal && (nameLower.includes('winner') || activeStageObj.rank_mode === 'podium' || hasAwardCriteria)) {
      return 'WINNERS_SHOWCASE';
    }

    // 2. Finalist Ranking & Winner Selection stage
    if (activeStageObj.rank_mode === 'podium' || activeStageObj.rank_mode === 'top_n' || nameLower.includes('finalist') || (isSecondLast && hasAwardCriteria && !nameLower.includes('nomination'))) {
      return 'FINALIST_RANKING';
    }

    // 3. Jury Voting & Ballot stage
    if (activeStageObj.review_type === 'vote_based' || activeStageObj.vote_mode === 'single' || activeStageObj.vote_mode === 'multi' || nameLower.includes('voting') || (nameLower.includes('jury') && !nameLower.includes('screening'))) {
      return 'JURY_VOTING';
    }

    // 4. Award Nominations stage
    if (hasAwardCriteria || activeStageObj.vote_mode === 'nomination' || activeStageObj.review_type === 'vote_nomination' || nameLower.includes('nomination') || nameLower.includes('award')) {
      return 'AWARD_NOMINATIONS';
    }

    // 5. Default: Criteria Rubric Scoring
    return 'STANDARD_TABLE';
  }, [activeStageObj, sortedStages]);

  const isNominationsStage = stageArchetype === 'AWARD_NOMINATIONS';
  const isJuryVotingStage = stageArchetype === 'JURY_VOTING';
  const isFinalistStage = stageArchetype === 'FINALIST_RANKING';
  const isWinnerStage = stageArchetype === 'WINNERS_SHOWCASE';

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Fetch available jury members for assignments
  useEffect(() => {
    api.get('/reviews/jury')
      .catch(() => api.get('/reviews/judges'))
      .then(res => {
        setAvailableJury(res.data?.data || []);
      })
      .catch(err => {
        console.error('Failed to load jury members:', err);
      });
  }, []);

  // Fetch submissions and stepper counts
  const fetchSubmissions = async () => {
    if (activeScope === 'activity') {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = {};

      if (!isJuryUser) {
        if (activeStageId) {
          params.stage_id = activeStageId;
        } else if (activeScope === 'submitted') {
          params.scope = 'submitted';
        } else if (activeScope === 'under_review') {
          params.scope = 'under_review';
        } else if (activeScope === 'rejected') {
          params.scope = 'rejected';
        }
      }

      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (selectedFlag !== 'all') params.flag_id = selectedFlag;
      if (selectedScore !== 'all') params.score_range = selectedScore;
      if (selectedAssignmentStatus !== 'all') params.assignment_status = selectedAssignmentStatus;
      if (selectedCountry !== 'all') params.country = selectedCountry;
      if (selectedRuntime !== 'all') params.runtime_range = selectedRuntime;
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/submissions', { params });
      setSubmissions(res.data.data || []);
      setCounts(res.data.counts || {});
      setFlags(res.data.flags || []);
      if (res.data.availableCountries) {
        setAvailableCountries(res.data.availableCountries);
      }

      if (res.data.pipelineStepper) {
        setPipelineStepper(res.data.pipelineStepper);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Navigation helper that preserves current URL search parameters
  const navigateToView = useCallback((targetPath) => {
    const currentSearch = location.search || '';
    if (location.pathname === targetPath) return;
    navigate(`${targetPath}${currentSearch}`);
  }, [location.pathname, location.search, navigate]);

  // Synchronize activeScope and activeStageId bidirectionally with URL pathname & route params
  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, '').toLowerCase();

    if (path === '/submissions' || path === '/submissions/all') {
      setActiveScope('all');
      setActiveStageId(null);
    } else if (path === '/submissions/new-submissions') {
      setActiveScope('submitted');
      setActiveStageId(null);
    } else if (path === '/submissions/under-review') {
      setActiveScope('under_review');
      setActiveStageId(null);
    } else if (path === '/submissions/rejected') {
      setActiveScope('rejected');
      setActiveStageId(null);
    } else if (path === '/submissions/activity' || path === '/submissions/activity-log') {
      setActiveScope('activity');
      setActiveStageId(null);
    } else {
      const matched = resolveStageFromPath(location.pathname, params.stageId, pipelineStepper);
      if (matched) {
        setActiveScope('under_review');
        setActiveStageId(matched.id);
      }
    }
  }, [location.pathname, params.stageId, pipelineStepper]);

  useEffect(() => {
    fetchSubmissions();
  }, [
    currentFestival?.id,
    activeScope,
    activeStageId,
    selectedCategory,
    selectedFlag,
    search,
    selectedScore,
    selectedAssignmentStatus,
    selectedCountry,
    selectedRuntime
  ]);

  const searchInputRef = useRef(null);

  // Real-time 250ms debounced live search with URL query synchronization
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      setSearch(trimmed);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (trimmed) {
          next.set('search', trimmed);
        } else {
          next.delete('search');
          next.delete('q');
        }
        return next;
      }, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, setSearchParams]);

  // Global '/' keyboard shortcut to focus search, and 'Escape' to clear/blur
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        const tagName = document.activeElement?.tagName?.toLowerCase();
        if (tagName !== 'input' && tagName !== 'textarea' && !document.activeElement?.isContentEditable) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Helper to highlight matching text in table
  const highlightMatch = (text, query) => {
    if (!query || !text) return text;
    const parts = String(text).split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ background: 'rgba(225, 29, 72, 0.28)', color: 'inherit', padding: '0 2px', borderRadius: '3px' }}>
          {part}
        </mark>
      ) : part
    );
  };

  // Category options
  const categoriesList = useMemo(() => {
    const set = new Set();
    submissions.forEach(s => {
      if (s.category) set.add(s.category);
    });
    ['Documentary', 'Short Film', 'Feature Film', 'Animation', 'Student Film'].forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [submissions]);

  // Active filter count and handlers
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (selectedFlag !== 'all') count++;
    if (selectedScore !== 'all') count++;
    if (selectedAssignmentStatus !== 'all') count++;
    if (selectedCountry !== 'all') count++;
    if (selectedRuntime !== 'all') count++;
    return count;
  }, [selectedCategory, selectedFlag, selectedScore, selectedAssignmentStatus, selectedCountry, selectedRuntime]);

  const handleFilterChange = (key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value && value !== 'all') {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    }, { replace: true });

    if (key === 'category') setSelectedCategory(value);
    else if (key === 'flag_id') setSelectedFlag(value);
    else if (key === 'score_range') setSelectedScore(value);
    else if (key === 'assignment_status') setSelectedAssignmentStatus(value);
    else if (key === 'country') setSelectedCountry(value);
    else if (key === 'runtime_range') setSelectedRuntime(value);
  };

  const resetAllFilters = () => {
    setSelectedCategory('all');
    setSelectedFlag('all');
    setSelectedScore('all');
    setSelectedAssignmentStatus('all');
    setSelectedCountry('all');
    setSelectedRuntime('all');
    setSearch('');
    setSearchInput('');
    setSearchParams(prev => {
      const next = new URLSearchParams();
      if (prev.has('film')) next.set('film', prev.get('film'));
      return next;
    }, { replace: true });
  };


  // Selection Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedFilmIds(submissions.map(s => s.id));
    } else {
      setSelectedFilmIds([]);
    }
  };

  const handleToggleSelectRow = (filmId) => {
    setSelectedFilmIds(prev =>
      prev.includes(filmId) ? prev.filter(id => id !== filmId) : [...prev, filmId]
    );
  };

  // Juror Expand Handlers
  const toggleJurorExpand = (filmId) => {
    setExpandedJurorRowIds(prev => {
      const next = new Set(prev);
      if (next.has(filmId)) next.delete(filmId);
      else next.add(filmId);
      return next;
    });
  };

  // Inline Category changer
  const handleInlineCategoryChange = async (filmId, newCategory) => {
    try {
      await api.put(`/submissions/${filmId}/category`, { category: newCategory });
      setSubmissions(prev =>
        prev.map(s => s.id === filmId ? { ...s, category: newCategory } : s)
      );
      setInlineCategoryEditingId(null);
      showToast(`Category updated to "${newCategory}"`);
    } catch (err) {
      console.error('Failed to update category:', err);
      alert('Failed to update category.');
    }
  };

  // Direct Single Film Advance
  const handleAdvanceFilm = async (film) => {
    try {
      const res = await api.post(`/submissions/${film.id}/advance`);
      const nextStage = res.data?.next_stage_name || 'Next Stage';
      showToast(`"${film.title}" advanced to ${nextStage}!`);
      fetchSubmissions();
    } catch (err) {
      console.error('Failed to advance film:', err);
      alert(err.response?.data?.error || 'Failed to advance film.');
    }
  };

  // Bulk Actions
  const handleBulkAdvance = async () => {
    if (selectedFilmIds.length === 0) return;
    if (!window.confirm(`Advance ${selectedFilmIds.length} selected film(s) to their next sequential stage?`)) return;

    try {
      const res = await api.post('/submissions/bulk-advance', { 
        film_ids: selectedFilmIds,
        submission_ids: selectedFilmIds 
      });
      showToast(res.data?.message || `Successfully advanced ${selectedFilmIds.length} film(s)!`);
      setSelectedFilmIds([]);
      fetchSubmissions();
    } catch (err) {
      console.error('Bulk advance error:', err);
      alert(err.response?.data?.error || 'Failed to bulk advance films.');
    }
  };

  const handleBulkReject = async () => {
    if (selectedFilmIds.length === 0) return;
    const reason = window.prompt(`Provide a rejection reason for ${selectedFilmIds.length} films (min 10 characters):`, 'Does not meet program criteria.');
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
      showToast(`Marked ${selectedFilmIds.length} films as Rejected.`);
      setSelectedFilmIds([]);
      fetchSubmissions();
    } catch (err) {
      console.error('Bulk reject error:', err);
      alert(err.response?.data?.error || 'Failed to bulk reject films.');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const token = localStorage.getItem('token');
    const url = `/api/submissions/export${activeStageId ? `?stage_id=${activeStageId}` : ''}`;
    window.open(url, '_blank');
  };

  // URL Deep-linking for film drawer (?film=:id or ?filmId=:id)
  const filmParam = searchParams.get('film') || searchParams.get('filmId');
  useEffect(() => {
    if (filmParam && (!selectedFilm || String(selectedFilm.id) !== String(filmParam))) {
      api.get(`/submissions/${filmParam}`)
        .then(res => {
          if (res.data) setSelectedFilm(res.data);
        })
        .catch(err => {
          console.warn('Failed to load film from URL parameter:', err);
        });
    }
  }, [filmParam]);

  const handleOpenDetails = async (film) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('film', film.id);
      return next;
    }, { replace: true });

    try {
      const res = await api.get(`/submissions/${film.id}`);
      setSelectedFilm(res.data);
    } catch (err) {
      setSelectedFilm(film);
    }
  };

  const handleCloseDetails = () => {
    setSelectedFilm(null);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('film');
      next.delete('filmId');
      return next;
    }, { replace: true });
  };

  const getStageStatusClass = (statusName) => {
    const s = (statusName || '').toLowerCase();
    if (s.includes('round 1') || s.includes('screening')) return 'status-round-1';
    if (s.includes('round 2') || s.includes('consideration') || s.includes('admin review')) return 'status-round-2';
    if (s.includes('official selection')) return 'status-official-selection';
    if (s.includes('nomination')) return 'status-nominations';
    if (s.includes('jury') || s.includes('voting')) return 'status-jury-voting';
    if (s.includes('finalist')) return 'status-finalist';
    if (s.includes('winner')) return 'status-winner';
    if (s.includes('rejected')) return 'status-rejected';
    return 'status-submitted';
  };

  return (
    <div className="fc-submissions-page animate-fade-in" style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="toast-box" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircleIcon size={16} /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="fc-page-header" style={{ marginBottom: '18px' }}>
        <h1 className="fc-page-title">
          {activeScope === 'activity'
            ? (isJuryUser ? 'My Activity Log' : 'Festival Activity Log')
            : (isJuryUser ? 'Assigned Submissions' : 'Submissions Hub')}
        </h1>
        <p className="fc-page-subtitle">
          {activeScope === 'activity'
            ? (isJuryUser
                ? 'Immutable audit trail of your submitted reviews, scorecards, and evaluations'
                : 'Immutable audit trail of all festival submissions, stage advancements, jury reviews, and winner declarations')
            : (isJuryUser
                ? `Your Jury Screening Queue · ${submissions.length} assigned ${submissions.length === 1 ? 'film' : 'films'}`
                : `Sequential Review Pipeline & Master Catalog · ${counts.total != null ? counts.total : submissions.length} total entries`)}
        </p>
      </div>

      {/* ── HIGH-LEVEL SCOPE NAVIGATION TABS (All Films, New Submissions, Under Review, Rejected, Activity Log) ── */}
      <div className="scope-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeScope === 'all' && !activeStageId}
          className={`scope-tab-btn ${activeScope === 'all' && !activeStageId ? 'active' : ''}`}
          onClick={() => navigateToView('/submissions')}
        >
          {isJuryUser ? 'My Assigned Films' : 'All Films'}{' '}
          <span className="tab-badge">
            {isJuryUser ? submissions.length : (counts.total != null ? counts.total : submissions.length)}
          </span>
        </button>

        {!isJuryUser && (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={activeScope === 'submitted' && !activeStageId}
              className={`scope-tab-btn ${activeScope === 'submitted' && !activeStageId ? 'active' : ''}`}
              onClick={() => navigateToView('/submissions/new-submissions')}
            >
              New Submissions <span className="tab-badge">{counts.submitted != null ? counts.submitted : 0}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeScope === 'under_review' || Boolean(activeStageId)}
              className={`scope-tab-btn ${activeScope === 'under_review' || activeStageId ? 'active' : ''}`}
              onClick={() => navigateToView('/submissions/under-review')}
            >
              Under Review <span className="tab-badge">{counts.under_review != null ? counts.under_review : 0}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeScope === 'rejected' && !activeStageId}
              className={`scope-tab-btn ${activeScope === 'rejected' && !activeStageId ? 'active' : ''}`}
              onClick={() => navigateToView('/submissions/rejected')}
            >
              Rejected <span className="tab-badge">{counts.rejected != null ? counts.rejected : 0}</span>
            </button>
          </>
        )}

        <button
          type="button"
          role="tab"
          aria-selected={activeScope === 'activity'}
          className={`scope-tab-btn ${activeScope === 'activity' ? 'active' : ''}`}
          onClick={() => navigateToView('/submissions/activity')}
        >
          Activity Log
        </button>
      </div>

      {/* ── 6-STAGE SEQUENTIAL PIPELINE STEPPER (Shifted under Under Review, Hidden for Jury) ── */}
      {!isJuryUser && (activeScope === 'under_review' || activeStageId) && pipelineStepper && pipelineStepper.length > 0 && (
        <div className="pipeline-stepper" style={{ marginBottom: '16px' }}>
          {pipelineStepper
            .filter(s => s.status !== 'inactive')
            .map((stage, idx, activeStepperList) => {
              const isSelected = activeStageId === stage.id;
              const stageCount = stage.film_count != null ? stage.film_count : (stage.count != null ? stage.count : 0);

              return (
                <React.Fragment key={stage.id || idx}>
                  <div
                    className={`stepper-node ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      if (activeStageId === stage.id) {
                        navigateToView('/submissions/under-review');
                      } else {
                        navigateToView(getStageUrl(stage));
                      }
                    }}
                    title={`Filter by ${stage.unique_name || stage.name}`}
                  >
                    <div className="step-circle">
                      {idx + 1}
                    </div>
                    <div className="step-info-col">
                      <span className="step-title">{stage.unique_name || stage.name}</span>
                      <span className="step-sub">
                        {stageCount} {stageCount === 1 ? 'film' : 'films'}
                      </span>
                    </div>
                  </div>
                  {idx < activeStepperList.length - 1 && (
                    <div className="step-arrow" style={{ display: 'flex', alignItems: 'center' }}>
                      <ArrowForwardIcon size={13} style={{ color: 'var(--fc-text-muted)' }} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
        </div>
      )}

      {/* ── ACTIVITY AUDIT LOG TAB VIEW ─────────────────────────── */}
      {activeScope === 'activity' ? (
        <ActivityLogBoard
          isJuryUser={isJuryUser}
          onViewFilm={(film) => handleOpenDetails(film)}
        />
      ) : !isJuryUser && isNominationsStage ? (
        <NominationsBoard
          stage={activeStageObj}
          prevStage={prevStageObj}
          nextStage={nextStageObj}
          showToast={showToast}
          onViewFilm={(film) => handleOpenDetails(film)}
          onRefreshPipeline={() => fetchSubmissions()}
          onAdvanceToJury={(advanceResult) => {
            fetchSubmissions();
            if (advanceResult?.targetStageId) {
              const target = pipelineStepper.find(s => Number(s.id) === Number(advanceResult.targetStageId));
              navigateToView(target ? getStageUrl(target) : `/submissions/stage/${advanceResult.targetStageId}`);
            } else if (nextStageObj) {
              navigateToView(getStageUrl(nextStageObj));
            } else {
              const juryStage = pipelineStepper.find(s => {
                const n = (s.unique_name || s.name || '').toLowerCase();
                return (n.includes('jury') || n.includes('voting')) && !n.includes('screening');
              });
              navigateToView(juryStage ? getStageUrl(juryStage) : '/submissions/jury-voting');
            }
          }}
        />
      ) : !isJuryUser && isJuryVotingStage ? (
        <JuryVotingBoard
          stage={activeStageObj}
          prevStage={prevStageObj}
          nextStage={nextStageObj}
          showToast={showToast}
          onViewFilm={(film) => handleOpenDetails(film)}
          onRefreshPipeline={() => fetchSubmissions()}
          onAdvanceToResults={(advanceResult) => {
            fetchSubmissions();
            if (advanceResult?.targetStageId) {
              const target = pipelineStepper.find(s => Number(s.id) === Number(advanceResult.targetStageId));
              navigateToView(target ? getStageUrl(target) : `/submissions/stage/${advanceResult.targetStageId}`);
            } else if (nextStageObj) {
              navigateToView(getStageUrl(nextStageObj));
            } else {
              const nextStage = pipelineStepper.find(s => (s.unique_name || s.name || '').toLowerCase().includes('finalist'));
              navigateToView(nextStage ? getStageUrl(nextStage) : '/submissions/finalists');
            }
          }}
        />
      ) : !isJuryUser && isFinalistStage ? (
        <FinalistsBoard
          stage={activeStageObj}
          prevStage={prevStageObj}
          nextStage={nextStageObj}
          showToast={showToast}
          onViewFilm={(film) => handleOpenDetails(film)}
          onRefreshPipeline={() => fetchSubmissions()}
          onAdvanceToWinners={(advanceResult) => {
            fetchSubmissions();
            if (advanceResult?.targetStageId) {
              const target = pipelineStepper.find(s => Number(s.id) === Number(advanceResult.targetStageId));
              navigateToView(target ? getStageUrl(target) : `/submissions/stage/${advanceResult.targetStageId}`);
            } else if (nextStageObj) {
              navigateToView(getStageUrl(nextStageObj));
            } else {
              const winnerStage = pipelineStepper.find(s => (s.unique_name || s.name || '').toLowerCase().includes('winner'));
              navigateToView(winnerStage ? getStageUrl(winnerStage) : '/submissions/winners');
            }
          }}
        />
      ) : !isJuryUser && isWinnerStage ? (
        <WinnersBoard
          stage={activeStageObj}
          prevStage={prevStageObj}
          nextStage={nextStageObj}
          showToast={showToast}
          onRefreshPipeline={() => fetchSubmissions()}
          onViewFilm={(film) => handleOpenDetails(film)}
          onGoToFinalists={() => {
            if (prevStageObj) {
              navigateToView(getStageUrl(prevStageObj));
            } else {
              const finalistStage = pipelineStepper.find(s => (s.unique_name || s.name || '').toLowerCase().includes('finalist'));
              navigateToView(finalistStage ? getStageUrl(finalistStage) : '/submissions/finalists');
            }
          }}
        />
      ) : (
        <>
          {/* ── TOOLBAR (Search on Left, Filters & Export on Right) ───────────── */}
          <div className="toolbar-bar">
        {/* Left: Advanced Live Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', maxWidth: '420px' }}>
          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              <SearchIcon size={16} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="fc-input fc-search-input"
              placeholder="Search title, director, category, #ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchInput('');
                  setSearch('');
                  searchInputRef.current?.blur();
                }
              }}
              style={{
                width: '100%',
                paddingLeft: '34px',
                paddingRight: searchInput ? '32px' : '44px',
                borderRadius: '8px',
                fontSize: '13px'
              }}
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--fc-text-muted)',
                  fontSize: '13px',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Clear search (Esc)"
                aria-label="Clear search"
              >
                <CloseIcon size={13} />
              </button>
            ) : (
              <span
                style={{
                  position: 'absolute',
                  right: '10px',
                  fontSize: '11px',
                  color: 'var(--fc-text-muted)',
                  border: '1px solid var(--fc-border)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  opacity: 0.7
                }}
                title="Press / to search"
              >
                /
              </span>
            )}
          </div>
        </div>

        {/* Right: Filters & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Active Search & Filters Tag */}
          {(activeFilterCount > 0 || search) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {search && (
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: 'var(--fc-brand)',
                    background: 'rgba(225, 29, 72, 0.1)',
                    border: '1px solid rgba(225, 29, 72, 0.25)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Matching "{search}" ({submissions.length})
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearch('');
                    }}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '11px', fontWeight: 800 }}
                    title="Clear search query"
                  >
                    <CloseIcon size={11} />
                  </button>
                </span>
              )}
              <button
                type="button"
                className="fc-btn fc-btn-link fc-btn-sm"
                onClick={resetAllFilters}
                style={{ fontSize: '12px', color: 'var(--fc-text-muted)', textDecoration: 'underline', padding: '0 4px' }}
              >
                Clear all
              </button>
            </div>
          )}

          {/* ⚡ Approach B Filter Drawer Trigger */}
          <button
            type="button"
            className="fc-btn fc-btn-outline fc-btn-sm"
            onClick={() => setFilterDrawerOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              padding: '7px 14px',
              borderRadius: '8px',
              background: activeFilterCount > 0 ? 'var(--fc-brand-tint)' : 'var(--fc-surface-card)',
              borderColor: activeFilterCount > 0 ? 'var(--fc-brand)' : 'var(--fc-border)',
              color: activeFilterCount > 0 ? 'var(--fc-brand)' : 'var(--fc-text-main)'
            }}
          >
            <FilterListIcon size={15} style={{ marginRight: '6px' }} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span style={{
                background: 'var(--fc-brand)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '999px'
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            className="fc-btn fc-btn-outline fc-btn-sm"
            onClick={handleExportCsv}
            title="Export filtered records to CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              padding: '7px 14px',
              borderRadius: '8px'
            }}
          >
            <FileDownloadIcon size={15} style={{ marginRight: '6px' }} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── ACTIVE FILTER CHIPS ROW ────────────────────────────────────────── */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', fontSize: '12px' }}>
          <span style={{ color: 'var(--fc-text-muted)', fontWeight: 600 }}>Active filters:</span>
          {selectedCategory !== 'all' && (
            <span className="fc-filter-chip">
              Category: {selectedCategory}
              <button type="button" onClick={() => setSelectedCategory('all')}>
                <CloseIcon size={11} />
              </button>
            </span>
          )}
          {selectedFlag !== 'all' && (
            <span className="fc-filter-chip">
              Flag: {flags.find(f => String(f.id) === String(selectedFlag))?.label || 'Custom'}
              <button type="button" onClick={() => setSelectedFlag('all')}>
                <CloseIcon size={11} />
              </button>
            </span>
          )}
          {selectedScore !== 'all' && (
            <span className="fc-filter-chip">
              Score: {
                selectedScore === 'high' ? '≥ 4.0' :
                selectedScore === 'mid' ? '3.0 – 3.9' :
                selectedScore === 'low' ? '< 3.0' : 'Unrated'
              } <StarIcon size={11} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />
              <button type="button" onClick={() => setSelectedScore('all')}>
                <CloseIcon size={11} />
              </button>
            </span>
          )}
          {selectedAssignmentStatus !== 'all' && (
            <span className="fc-filter-chip">
              Jury: {
                selectedAssignmentStatus === 'unassigned' ? 'Unassigned' :
                selectedAssignmentStatus === 'assigned' ? 'Assigned' : 'Reviewed'
              }
              <button type="button" onClick={() => setSelectedAssignmentStatus('all')}>
                <CloseIcon size={11} />
              </button>
            </span>
          )}
          {selectedCountry !== 'all' && (
            <span className="fc-filter-chip">
              Country: {selectedCountry}
              <button type="button" onClick={() => setSelectedCountry('all')}>
                <CloseIcon size={11} />
              </button>
            </span>
          )}
          {selectedRuntime !== 'all' && (
            <span className="fc-filter-chip">
              Length: {
                selectedRuntime === 'short' ? '< 15 mins' :
                selectedRuntime === 'medium' ? '15 – 45 mins' : '> 45 mins'
              }
              <button type="button" onClick={() => setSelectedRuntime('all')}>
                <CloseIcon size={11} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* ── MASTER SUBMISSIONS TABLE ───────────────────────────────────────── */}
      <div className="fc-card" style={{ marginTop: '10px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            Loading submissions catalog...
          </div>
        ) : submissions.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--fc-text-muted)' }}>
            No submissions found matching your filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
            <table className="fc-table">
              <thead>
                <tr>
                  {!isJuryUser && (
                    <th style={{ width: '38px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={submissions.length > 0 && selectedFilmIds.length === submissions.length}
                        onChange={handleSelectAll}
                        style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                      />
                    </th>
                  )}
                  <th style={{ minWidth: '220px' }}>TITLE & DIRECTOR</th>
                  <th style={{ minWidth: '130px' }}>CATEGORY</th>
                  <th style={{ minWidth: '160px' }}>STAGE</th>
                  {isJuryUser ? (
                    <>
                      <th style={{ minWidth: '130px' }}>YOUR SCORE</th>
                      <th style={{ minWidth: '150px' }}>YOUR EVALUATION</th>
                    </>
                  ) : (
                    <>
                      <th style={{ minWidth: '110px' }}>SCORE</th>
                      <th style={{ minWidth: '200px' }}>JURY & EVALUATION</th>
                      <th style={{ minWidth: '100px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span>FLAG</span>
                          <button
                            type="button"
                            className="fc-flag-th-shortcut"
                            onClick={() => setFlagManagerOpen(true)}
                            title="Manage Film Flags"
                            aria-label="Manage Film Flags"
                          >
                            <SettingsIcon size={14} />
                          </button>
                        </div>
                      </th>
                    </>
                  )}
                  <th style={{ textAlign: 'right', minWidth: isJuryUser ? '140px' : '170px' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(film => {
                  const isChecked = selectedFilmIds.includes(film.id);
                  const isExpanded = expandedJurorRowIds.has(film.id);
                  const isRejected = film.status === 'Rejected' || String(film.status).toLowerCase() === 'rejected';
                  const rawStage = isRejected ? 'Rejected' : (film.current_stage_name || film.status || 'Round 1: Screening');
                  const stageName = (rawStage === 'Submitted' || rawStage === 'submitted' || rawStage === 'New Submission') ? 'New Submission' : rawStage;
                  const stageClass = getStageStatusClass(stageName);
                  const scoresList = film.jurorScores || [];
                  const completedReviewsCount = scoresList.filter(s => s.status === 'Done' || s.status === 'completed').length;
                  const totalJurorsCount = scoresList.length;

                  // Jury personal status and score
                  const isCompletedByMe = Boolean(
                    film.my_review_status === 'Done' ||
                    (film.my_rating && film.my_rating !== '0.0') ||
                    (isJuryUser && film.rating && film.rating !== '0.0' && film.rating !== '0')
                  );
                  const myScoreValue = film.my_rating || (isJuryUser ? film.rating : null);

                  return (
                    <React.Fragment key={film.id}>
                      <tr className={`${isChecked ? 'selected' : ''} ${isRejected ? 'fc-rejected-film-row' : ''}`}>
                        {/* Checkbox (Admin Only) */}
                        {!isJuryUser && (
                          <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectRow(film.id)}
                              style={{ accentColor: 'var(--fc-brand)', cursor: 'pointer' }}
                            />
                          </td>
                        )}

                        {/* Title & Director */}
                        <td
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            if (isJuryUser) {
                              navigate(`/submissions/${film.id}/review`);
                            } else {
                              handleOpenDetails(film);
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isRejected && (
                              <CancelIcon size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                            )}
                            <div style={{ fontWeight: 700, color: isRejected ? 'var(--fc-rejected-title, #f87171)' : 'var(--fc-text-main)', fontSize: '13px' }}>
                              {highlightMatch(film.title, search)}
                            </div>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--fc-text-muted)', marginTop: '2px' }}>
                            Dir. {highlightMatch(film.director || 'Filmmaker', search)} · {highlightMatch(film.country || 'India', search)} · {film.runtime ? `${film.runtime}m` : '15m'}
                          </div>
                          {isRejected && film.rejection_reason && (
                            <div style={{ fontSize: '11px', color: 'var(--fc-rejected-reason, #fca5a5)', marginTop: '3px', fontWeight: 500 }}>
                              <span style={{ fontWeight: 700 }}>Reason:</span> {highlightMatch(film.rejection_reason, search)}
                            </div>
                          )}
                        </td>

                        {/* Category with quick inline changer (Admin only editing) */}
                        <td onClick={e => e.stopPropagation()}>
                          {inlineCategoryEditingId === film.id && !isRejected && !isJuryUser ? (
                            <select
                              className="fc-select"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              value={film.category || 'Short Film'}
                              onChange={(e) => handleInlineCategoryChange(film.id, e.target.value)}
                              onBlur={() => setInlineCategoryEditingId(null)}
                              autoFocus
                            >
                              {categoriesList.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className="fc-category-pill"
                              style={{ cursor: (!isRejected && !isJuryUser) ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title={isJuryUser ? 'Category' : (isRejected ? 'Category' : 'Click to edit category')}
                              onClick={() => {
                                if (!isRejected && !isJuryUser) setInlineCategoryEditingId(film.id);
                              }}
                            >
                              {film.category || 'Short Film'}
                              {!isRejected && !isJuryUser && (
                                <EditIcon size={11} style={{ opacity: 0.6, marginLeft: '4px' }} />
                              )}
                            </span>
                          )}
                        </td>

                        {/* Review Stage */}
                        <td>
                          {isRejected ? (
                            <div>
                              <span className="fc-status-pill status-rejected" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CancelIcon size={12} /> Rejected
                              </span>
                              {film.current_stage_name && (
                                <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px', fontWeight: 500 }}>
                                  at {film.current_stage_name}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <span className={`fc-status-pill ${stageClass}`}>
                                {stageName}
                              </span>
                              {film.auto_promoted === 1 && (
                                <span style={{ fontSize: '10px', color: '#16a34a', marginLeft: '6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px' }} title="Auto-advanced based on qualifying score">
                                  <FlashOnIcon size={11} /> Auto
                                </span>
                              )}
                            </>
                          )}
                        </td>

                        {/* ── JURY VIEW: Your Score & Your Evaluation ── */}
                        {isJuryUser ? (
                          <>
                            {/* Your Score */}
                            <td>
                              {isCompletedByMe && myScoreValue ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: '#eab308', fontSize: '12px' }}>★</span>
                                  <strong style={{ fontSize: '13px', color: 'var(--fc-text-main)' }}>
                                    {parseFloat(myScoreValue).toFixed(1)}
                                  </strong>
                                  <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>/ 5</span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--fc-text-light)', fontSize: '12px', fontStyle: 'italic' }}>
                                  Not Rated
                                </span>
                              )}
                            </td>

                            {/* Your Evaluation Status */}
                            <td>
                              {isCompletedByMe ? (
                                <span className="fc-eval-status-badge completed">
                                  <CheckCircleIcon size={13} style={{ marginRight: '3px' }} /> Completed
                                </span>
                              ) : (
                                <span className="fc-eval-status-badge pending">
                                  <ScheduleIcon size={13} style={{ marginRight: '3px' }} /> Pending Review
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* Admin: Rating & Composite Score */}
                            <td>
                              {film.rating ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <StarIcon size={14} style={{ color: '#eab308' }} />
                                  <strong style={{ fontSize: '13px', color: 'var(--fc-text-main)' }}>
                                    {parseFloat(film.rating).toFixed(1)}
                                  </strong>
                                  <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>/ 5</span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--fc-text-light)', fontSize: '12px' }}>Unrated</span>
                              )}
                            </td>

                            {/* Admin: Jury Assignment & Juror Breakdown Toggle */}
                            <td>
                              {(() => {
                                const filmStage = pipelineStepper.find(s => 
                                  (film.review_state_id && Number(s.id) === Number(film.review_state_id)) ||
                                  (film.current_stage_name && (s.unique_name || '').toLowerCase() === film.current_stage_name.toLowerCase()) ||
                                  (film.status && (s.unique_name || '').toLowerCase() === film.status.toLowerCase())
                                );
                                const isNoJuryStage = Boolean(
                                  film.is_no_jury_stage ||
                                  film.jury_assignment_mode === 'none' ||
                                  filmStage?.jury_assignment_mode === 'none' ||
                                  film.status === 'Winner' ||
                                  film.current_stage_name === 'Winner'
                                );

                                if (isRejected) {
                                  return (
                                    <div>
                                      <div style={{ fontSize: '12px', color: totalJurorsCount > 0 ? 'var(--fc-text-secondary)' : '#94a3b8', fontStyle: totalJurorsCount > 0 ? 'normal' : 'italic', marginBottom: '3px' }}>
                                        {totalJurorsCount > 0 ? (film.jury || 'Assigned Jury') : 'No jury assigned'}
                                      </div>
                                      {totalJurorsCount > 0 ? (
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
                                      ) : (
                                        <span style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                          <CancelIcon size={12} /> Evaluation Closed
                                        </span>
                                      )}
                                    </div>
                                  );
                                }

                                if (isNoJuryStage) {
                                  return (
                                    <div>
                                      <div style={{ fontSize: '12px', color: 'var(--fc-text-muted, #64748b)', fontStyle: 'italic', marginBottom: '4px' }}>
                                        No jury required
                                      </div>
                                      {totalJurorsCount > 0 ? (
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
                                      ) : (
                                        <span style={{
                                          fontSize: '11px',
                                          color: 'var(--fc-text-muted, #64748b)',
                                          fontWeight: 600,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: 'var(--fc-surface-subtle, #f1f5f9)',
                                          padding: '2px 8px',
                                          borderRadius: '4px',
                                          border: '1px solid var(--fc-border, #e2e8f0)'
                                        }}>
                                          <LockIcon size={11} style={{ opacity: 0.7 }} /> Admin-Only Stage
                                        </span>
                                      )}
                                    </div>
                                  );
                                }

                                return (
                                  <div>
                                    <div style={{ fontSize: '12px', color: 'var(--fc-text-secondary)', marginBottom: '4px' }}>
                                      {film.jury || 'Unassigned'}
                                    </div>
                                    {totalJurorsCount > 0 ? (
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
                                    ) : (
                                      <button
                                        type="button"
                                        className={`fc-assign-action-btn ${(!film.review_state_id || ['Submitted', 'New Submission'].includes(film.status) || ['Submitted', 'New Submission'].includes(film.current_stage_name)) ? 'is-advance-assign' : ''}`}
                                        onClick={() => {
                                          setSelectedFilmIds([film.id]);
                                          setBulkAssignModalOpen(true);
                                        }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        {(!film.review_state_id || ['Submitted', 'New Submission'].includes(film.status) || ['Submitted', 'New Submission'].includes(film.current_stage_name)) ? (
                                          <>
                                            <FlashOnIcon size={13} />
                                            <span>Advance & Assign</span>
                                          </>
                                        ) : (
                                          <>
                                            <AddIcon size={13} />
                                            <span>Assign Jury</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Admin: Flag Indicator */}
                            <td>
                              {(() => {
                                const resolvedFlag =
                                  (flags && flags.find(f => f.id === film.flag_id)) ||
                                  STANDARD_FLAGS.find(f => f.id === film.flag_id);
                                const flagLabel = film.flag_label || resolvedFlag?.label;
                                const flagColor = film.flag_color || resolvedFlag?.color || '#3b82f6';

                                return flagLabel ? (
                                  <span
                                    className="fc-flag-indicator"
                                    style={{
                                      backgroundColor: `${flagColor}18`,
                                      color: flagColor,
                                      borderColor: `${flagColor}40`,
                                      fontSize: '11px',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    {flagLabel}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--fc-text-light)' }}>—</span>
                                );
                              })()}
                            </td>
                          </>
                        )}

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {!isJuryUser && !isRejected && stageName !== 'Winner' && (
                              <button
                                type="button"
                                className="fc-btn fc-btn-primary fc-btn-sm"
                                onClick={() => setAdvancingFilm(film)}
                                title="Advance film to next sequential stage"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <FlashOnIcon size={13} />
                                <span>Advance</span>
                              </button>
                            )}

                            {isJuryUser ? (
                              <button
                                type="button"
                                className="fc-btn fc-btn-primary fc-btn-sm"
                                style={{
                                  background: isCompletedByMe ? 'var(--fc-surface-card)' : 'var(--fc-brand)',
                                  borderColor: isCompletedByMe ? 'var(--fc-border)' : 'var(--fc-brand)',
                                  color: isCompletedByMe ? 'var(--fc-text-main)' : '#fff',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: isCompletedByMe ? 'none' : '0 1px 3px rgba(168, 47, 47, 0.25)'
                                }}
                                onClick={() => navigate(`/submissions/${film.id}/review`)}
                              >
                                <StarIcon size={13} style={{ color: '#eab308' }} />
                                <span>{isCompletedByMe ? 'Edit Review' : 'Rate & Review'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="fc-btn fc-btn-outline fc-btn-sm"
                                onClick={() => handleOpenDetails(film)}
                              >
                                View
                              </button>
                            )}

                            {!isJuryUser && !isRejected && (
                              <button
                                type="button"
                                className="fc-btn fc-btn-danger-light fc-btn-sm"
                                onClick={() => setRejectingFilm(film)}
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── EXPANDABLE JUROR SUB-ROW (ADMIN ONLY) ── */}
                      {!isJuryUser && isExpanded && (
                        <tr className="expandable-juror-row">
                          <td colSpan="8">
                            <div className="juror-breakdown-title">
                              EVALUATION SCORECARDS & JURY BREAKDOWN FOR "{film.title}"
                            </div>
                            <div className="juror-matrix-strip">
                              {scoresList.map((juror, jIdx) => (
                                <div key={jIdx} className="juror-card-micro">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div
                                        style={{
                                          width: '22px',
                                          height: '22px',
                                          borderRadius: '50%',
                                          overflow: 'hidden',
                                          flexShrink: 0,
                                          background: 'var(--fc-surface-sunken, #e2e8f0)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          color: 'var(--fc-text-secondary, #64748b)',
                                          position: 'relative'
                                        }}
                                      >
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
                                          {(juror.name || 'J').charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                      <strong style={{ fontSize: '13px', color: 'var(--fc-text-main)' }}>
                                        {juror.name}
                                      </strong>
                                    </div>
                                    <span
                                      className={`juror-status-badge ${juror.status === 'Done' ? 'completed' : 'in-progress'}`}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      {juror.status === 'Done' ? (
                                        <><CheckCircleIcon size={11} /> Completed</>
                                      ) : (
                                        <><ScheduleIcon size={11} /> Pending</>
                                      )}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fc-text-main)' }}>
                                      {juror.score}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--fc-text-muted)' }}>
                                      · {juror.role || 'Screening Jury'}
                                    </span>
                                  </div>

                                  {juror.note && (
                                    <div className="juror-note-box">
                                      "{juror.note}"
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* ── FLOATING STICKY BULK ACTION BAR ───────────────────────────────── */}
      {!isJuryUser && selectedFilmIds.length > 0 && (() => {
        const selectedFilmsList = submissions.filter(s => selectedFilmIds.includes(s.id));
        const allSelectedRejected = selectedFilmsList.length > 0 && selectedFilmsList.every(s => s.status === 'Rejected');

        return (
          <div className="floating-bulk-bar">
            <div className="floating-bulk-count">
              <span className="floating-badge">{selectedFilmIds.length}</span>
              <span>Films Selected</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {allSelectedRejected ? (
                <span style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 600 }}>
                  Selected films are rejected (No jury or advancement actions)
                </span>
              ) : (
                <>
                  {!selectedFilmIds.every(id => {
                    const f = submissions.find(s => s.id === id);
                    if (!f) return false;
                    const fStage = pipelineStepper.find(s => 
                      (f.review_state_id && Number(s.id) === Number(f.review_state_id)) ||
                      (f.current_stage_name && (s.unique_name || '').toLowerCase() === f.current_stage_name.toLowerCase()) ||
                      (f.status && (s.unique_name || '').toLowerCase() === f.status.toLowerCase())
                    );
                    return Boolean(
                      f.is_no_jury_stage ||
                      f.jury_assignment_mode === 'none' ||
                      fStage?.jury_assignment_mode === 'none' ||
                      f.status === 'Winner' ||
                      f.current_stage_name === 'Winner'
                    );
                  }) && (
                    <button
                      type="button"
                      className="fc-btn fc-btn-secondary fc-btn-sm"
                      onClick={() => setBulkAssignModalOpen(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      {selectedFilmIds.some(id => {
                        const f = submissions.find(s => s.id === id);
                        return f && (!f.review_state_id || ['Submitted', 'New Submission'].includes(f.status) || ['Submitted', 'New Submission'].includes(f.current_stage_name));
                      }) ? (
                        <>
                          <FlashOnIcon size={14} />
                          <span>Advance & Assign Jury</span>
                        </>
                      ) : (
                        <>
                          <AddIcon size={14} />
                          <span>Assign Jury</span>
                        </>
                      )}
                    </button>
                  )}

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
                </>
              )}

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
        );
      })()}

      {/* ── SLIDE-OVER FILM DETAILS DRAWER ────────────────────────────────── */}
      {selectedFilm && (
        <FilmDetailDrawer
          film={selectedFilm}
          flags={flags}
          stages={pipelineStepper}
          onClose={handleCloseDetails}
          onReject={(filmToReject) => setRejectingFilm(filmToReject)}
          onAdvance={(filmToAdvance) => setAdvancingFilm(filmToAdvance)}
          onUpdateFilm={(updatedFilm) => {
            setSelectedFilm(updatedFilm);
            setSubmissions(prev =>
              prev.map(s => s.id === updatedFilm.id ? { ...s, ...updatedFilm } : s)
            );
            fetchSubmissions();
          }}
        />
      )}

      {/* ── BULK JURY ASSIGNMENT MODAL ────────────────────────────────────── */}
      <BulkAssignModal
        isOpen={bulkAssignModalOpen}
        onClose={() => setBulkAssignModalOpen(false)}
        selectedFilmIds={selectedFilmIds}
        selectedFilms={submissions.filter(s => selectedFilmIds.includes(s.id))}
        stages={pipelineStepper}
        availableJury={availableJury}
        onSuccess={() => {
          showToast(`Assigned reviewers & updated stage for ${selectedFilmIds.length} film(s)!`);
          setSelectedFilmIds([]);
          fetchSubmissions();
        }}
      />


      {/* ── REJECTION MODAL WITH MANDATORY >= 10 CHARS ────────────────────── */}
      {rejectingFilm && (
        <RejectFilmModal
          film={rejectingFilm}
          onClose={() => setRejectingFilm(null)}
          onSuccess={() => {
            showToast(`"${rejectingFilm.title}" marked as Rejected.`);
            fetchSubmissions();
            if (selectedFilm?.id === rejectingFilm.id) {
              setSelectedFilm(prev => prev ? { ...prev, status: 'Rejected' } : null);
            }
          }}
        />
      )}

      {/* ── ADVANCE CONFIRMATION MODAL ────────────────────────────────────── */}
      {advancingFilm && (
        <AdvanceFilmModal
          film={advancingFilm}
          stages={pipelineStepper}
          onClose={() => setAdvancingFilm(null)}
          onSuccess={(data) => {
            const nextStage = data?.next_stage_name || 'Next Stage';
            showToast(`"${advancingFilm.title}" advanced to ${nextStage}!`);
            fetchSubmissions();
            if (selectedFilm?.id === advancingFilm.id) {
              setSelectedFilm(prev => prev ? { ...prev, current_stage_name: nextStage, status: nextStage } : null);
            }
          }}
        />
      )}
      {/* ── ADVANCED FILTER DRAWER (Approach B) ─────────────────────────── */}
      <FilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        categories={categoriesList}
        flags={flags}
        countries={availableCountries.length > 0 ? availableCountries : ['India', 'Nepal', 'Albania', 'Argentina']}
        filters={{
          category: selectedCategory,
          flag_id: selectedFlag,
          score_range: selectedScore,
          assignment_status: selectedAssignmentStatus,
          country: selectedCountry,
          runtime_range: selectedRuntime
        }}
        onChangeFilter={handleFilterChange}
        onResetFilters={resetAllFilters}
        onApplyFilters={fetchSubmissions}
        activeFilterCount={activeFilterCount}
      />

      {/* ── FILM FLAGS SETTINGS MODAL (Option 2 Table Header Shortcut) ──── */}
      <FlagManagerModal
        isOpen={flagManagerOpen}
        onClose={() => {
          setFlagManagerOpen(false);
          fetchSubmissions();
        }}
        flags={flags}
        onFlagsUpdated={(updatedFlags) => {
          setFlags(updatedFlags);
        }}
        showToast={showToast}
      />
    </div>
  );
}
