import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Debounced server-side delegate search for the registration desk.
 * The backend matches name, email, phone (ignoring +91 / spaces / dashes),
 * KB26 labels and 6-digit badge numbers across the whole event — not just
 * the rows already loaded in the page.
 *
 * Returns null while the query is shorter than `minLength` (callers fall back
 * to their local list), otherwise the matching attendees.
 */
export default function useAttendeeSearch(searchText, { minLength = 2, limit = 50, delay = 250 } = {}) {
  const [matches, setMatches] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = (searchText || '').trim();
    if (q.length < minLength) {
      setMatches(null);
      setSearching(false);
      return undefined;
    }

    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api.get('/registration/attendees', { params: { search: q, limit } })
        .then((res) => { if (alive) setMatches(res.data?.attendees || []); })
        .catch(() => { if (alive) setMatches(null); })
        .finally(() => { if (alive) setSearching(false); });
    }, delay);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchText, minLength, limit, delay]);

  /** Patch one attendee in the current matches (e.g. after assigning a badge). */
  const updateMatch = (attendeeId, patch) => {
    setMatches(prev => (prev ? prev.map(a => (a.attendee_id === attendeeId ? { ...a, ...patch } : a)) : prev));
  };

  return { matches, searching, updateMatch };
}
