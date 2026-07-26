'use client';

/**
 * Accessible filter input for data tables.
 *
 * Wrapped in a `<div role="search">` landmark with debounced input,
 * a clear button, and an `aria-live` region that announces the result
 * count after filtering.
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties, type KeyboardEvent } from 'react';

export interface TableFilterProps {
  /** Unique DOM id for the input */
  id: string;
  /** Current filter value (controlled) */
  value: string;
  /** Fires with the new value (may be debounced internally) */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Description shown to screen readers via aria-describedby */
  description?: string;
  /** Debounce delay in ms (default 300) */
  debounceMs?: number;
  /** When provided, the live region announces "{count} results found" */
  resultCount?: number;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const wrapperStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  maxWidth: '360px',
  marginBottom: '12px',
};

const iconWrapperStyle: CSSProperties = {
  position: 'absolute',
  left: '10px',
  display: 'flex',
  alignItems: 'center',
  pointerEvents: 'none',
  color: '#94a3b8',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 36px 8px 36px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: '#1e293b',
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const clearBtnStyle: CSSProperties = {
  position: 'absolute',
  right: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  border: 'none',
  borderRadius: '50%',
  background: '#f1f5f9',
  color: '#64748b',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
  padding: 0,
};

const srOnly: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TableFilter({
  id,
  value,
  onChange,
  placeholder = 'Filter…',
  description,
  debounceMs = 300,
  resultCount,
}: TableFilterProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync controlled value → local
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced propagation
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (localValue !== value) onChange(localValue);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localValue, debounceMs]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    },
    [handleClear],
  );

  const descId = `${id}-desc`;
  const liveId = `${id}-live`;

  return (
    <div role="search" style={wrapperStyle}>
      {/* Search icon */}
      <span style={iconWrapperStyle} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
      </span>

      <input
        ref={inputRef}
        id={id}
        type="search"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-describedby={description ? descId : undefined}
        autoComplete="off"
        style={inputStyle}
      />

      {/* Hidden description for screen readers */}
      {description && (
        <span id={descId} style={srOnly}>
          {description}
        </span>
      )}

      {/* Clear button */}
      {localValue && (
        <button type="button" onClick={handleClear} aria-label="Clear filter" style={clearBtnStyle}>
          ✕
        </button>
      )}

      {/* Live region — result count */}
      <span id={liveId} aria-live="polite" aria-atomic="true" style={srOnly}>
        {localValue && resultCount !== undefined ? `${resultCount} results found` : ''}
      </span>
    </div>
  );
}
