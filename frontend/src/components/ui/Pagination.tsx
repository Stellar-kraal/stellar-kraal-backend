'use client';

/**
 * Accessible pagination component.
 *
 * Renders a `<nav>` landmark with keyboard-navigable page buttons.
 * Announces page changes via an `aria-live` region.
 */

import { useCallback, useState, useEffect, type CSSProperties } from 'react';

export interface PaginationProps {
  /** Current 1-based page number */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Fires when the user navigates to a different page */
  onPageChange: (page: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  padding: '12px 0',
};

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '36px',
  height: '36px',
  padding: '0 10px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  background: '#fff',
  color: '#334155',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s',
};

const btnActive: CSSProperties = {
  ...btnBase,
  background: '#3b82f6',
  color: '#fff',
  borderColor: '#3b82f6',
  fontWeight: 600,
};

const btnDisabled: CSSProperties = {
  ...btnBase,
  opacity: 0.4,
  cursor: 'not-allowed',
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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns an array of page numbers to render, with -1 as ellipsis. */
function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: number[] = [1];

  if (current > 3) pages.push(-1);

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push(-1);

  pages.push(total);
  return pages;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const [announcement, setAnnouncement] = useState('');

  const goTo = useCallback(
    (page: number) => {
      if (page < 1 || page > totalPages || page === currentPage) return;
      onPageChange(page);
    },
    [currentPage, totalPages, onPageChange],
  );

  // Announce page changes to screen readers
  useEffect(() => {
    setAnnouncement(`Page ${currentPage} of ${totalPages}`);
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav aria-label="Table pagination" style={navStyle}>
      {/* Live region for screen-reader announcements */}
      <span aria-live="polite" aria-atomic="true" style={srOnly}>
        {announcement}
      </span>

      {/* First */}
      <button
        type="button"
        onClick={() => goTo(1)}
        disabled={currentPage === 1}
        aria-label="Go to first page"
        aria-disabled={currentPage === 1}
        style={currentPage === 1 ? btnDisabled : btnBase}
      >
        ⟨⟨
      </button>

      {/* Previous */}
      <button
        type="button"
        onClick={() => goTo(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Go to previous page"
        aria-disabled={currentPage === 1}
        style={currentPage === 1 ? btnDisabled : btnBase}
      >
        ⟨
      </button>

      {/* Page numbers */}
      {pages.map((p, idx) =>
        p === -1 ? (
          <span key={`ellipsis-${idx}`} style={{ ...btnBase, border: 'none', cursor: 'default' }} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => goTo(p)}
            aria-label={`Go to page ${p}`}
            aria-current={p === currentPage ? 'page' : undefined}
            style={p === currentPage ? btnActive : btnBase}
          >
            {p}
          </button>
        ),
      )}

      {/* Next */}
      <button
        type="button"
        onClick={() => goTo(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Go to next page"
        aria-disabled={currentPage === totalPages}
        style={currentPage === totalPages ? btnDisabled : btnBase}
      >
        ⟩
      </button>

      {/* Last */}
      <button
        type="button"
        onClick={() => goTo(totalPages)}
        disabled={currentPage === totalPages}
        aria-label="Go to last page"
        aria-disabled={currentPage === totalPages}
        style={currentPage === totalPages ? btnDisabled : btnBase}
      >
        ⟩⟩
      </button>
    </nav>
  );
}
