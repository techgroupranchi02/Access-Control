/**
 * Pagination: compact, windowed pager.
 *
 * Desktop: ‹ Previous  1 … 4 5 6 … 19  Next ›   (first, last, current ± siblings, gaps as "…")
 * Phone (≤ 640px): ‹  Page 5 of 19  ›   (no number row, so it never scrolls sideways)
 *
 * Usage: <Pagination page={page} totalPages={total} onChange={setPage} />
 */
import React from 'react';
import { ArrowBackIcon, ArrowForwardIcon } from './Icons';

/**
 * Page numbers to show, with gaps for skipped ranges. Always the same number of slots
 * (5 + 2 × siblings), so the buttons don't shift while paging:
 *   1 2 3 4 5 … 19   ·   1 … 9 10 11 … 19   ·   1 … 15 16 17 18 19
 */
export function pageItems(current, total, siblings = 1) {
  const slots = 5 + 2 * siblings;
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  if (total <= slots) return range(1, total);
  const edge = slots - 2; // numbers shown next to a single gap
  if (current <= edge - siblings) return [...range(1, edge), 'gap-end', total];
  if (current >= total - edge + 1 + siblings) return [1, 'gap-start', ...range(total - edge + 1, total)];
  return [1, 'gap-start', ...range(current - siblings, current + siblings), 'gap-end', total];
}

export default function Pagination({ page, totalPages, onChange, siblings = 1, className = '' }) {
  if (!totalPages || totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const go = (p) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== current) onChange(next);
  };

  return (
    <nav className={`fc-pg ${className}`} aria-label="Pagination">
      <button type="button" className="fc-pg-btn fc-pg-step" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous page">
        <ArrowBackIcon size={14} /> <span className="fc-pg-step-label">Previous</span>
      </button>

      <ul className="fc-pg-pages">
        {pageItems(current, totalPages, siblings).map((item) => (
          typeof item === 'number' ? (
            <li key={item}>
              <button
                type="button"
                className={`fc-pg-btn fc-pg-num ${item === current ? 'is-current' : ''}`}
                onClick={() => go(item)}
                aria-label={`Page ${item}`}
                aria-current={item === current ? 'page' : undefined}
              >
                {item}
              </button>
            </li>
          ) : (
            <li key={item} className="fc-pg-gap" aria-hidden="true">…</li>
          )
        ))}
      </ul>

      <span className="fc-pg-compact" aria-live="polite">Page <strong>{current}</strong> of <strong>{totalPages}</strong></span>

      <button type="button" className="fc-pg-btn fc-pg-step" onClick={() => go(current + 1)} disabled={current >= totalPages} aria-label="Next page">
        <span className="fc-pg-step-label">Next</span> <ArrowForwardIcon size={14} />
      </button>
    </nav>
  );
}
