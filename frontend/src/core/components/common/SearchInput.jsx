/**
 * SearchInput — the standard toolbar search box (docs/design.md §7.3), same look as Submissions.
 *
 * - SearchIcon on the left, clear (×) button while there is text, "/" hint when empty
 * - "/" anywhere on the page focuses it (unless typing in another field); Esc clears and blurs
 * - Optional `loading` shows a small spinner in place of the hint
 *
 * Props: value, onChange(nextValue), placeholder, ariaLabel, shortcut (default true),
 *        loading, maxWidth, style (outer wrapper), inputRef (optional external ref)
 */
import React, { useEffect, useRef } from 'react';
import { SearchIcon, CloseIcon } from './Icons';

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel,
  shortcut = true,
  loading = false,
  maxWidth = '420px',
  style,
  inputRef
}) {
  const localRef = useRef(null);
  const ref = inputRef || localRef;

  useEffect(() => {
    if (!shortcut) return undefined;
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (el === ref.current || tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut, ref]);

  const hasValue = Boolean(value);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 240px', minWidth: 0, maxWidth, ...style }}>
      <span style={{ position: 'absolute', left: '12px', color: 'var(--fc-text-muted)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
        <SearchIcon size={16} />
      </span>
      <input
        ref={ref}
        type="text"
        className="fc-input fc-search-input"
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            ref.current?.blur();
          }
        }}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          paddingLeft: '34px',
          paddingRight: hasValue ? '32px' : '44px',
          borderRadius: '8px',
          fontSize: '13px',
          height: '36px',
          boxSizing: 'border-box'
        }}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => { onChange(''); ref.current?.focus(); }}
          title="Clear search (Esc)"
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fc-text-muted)',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {loading ? <span className="fc-search-input-spinner" style={{ position: 'static', display: 'inline-block', width: '13px', height: '13px' }} /> : <CloseIcon size={13} />}
        </button>
      ) : shortcut && (
        <span
          aria-hidden="true"
          title="Press / to search"
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
        >
          /
        </span>
      )}
    </div>
  );
}
