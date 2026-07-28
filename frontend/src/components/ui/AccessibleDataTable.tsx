'use client';

/**
 * Accessible, virtualizable data table.
 *
 * Implements WCAG 2.1 AA grid pattern with:
 *  - Proper ARIA roles (grid, columnheader, row, gridcell)
 *  - Keyboard navigation (arrow keys, Home/End, Enter/Space)
 *  - aria-live announcements for sort, filter, and page changes
 *  - Optional row virtualization for datasets > 100 rows
 *  - Optional row selection, pagination, and filtering
 *
 * Column headers support i18n keys; the fallback `headerLabel` is used
 * until a translation function is wired in.
 */

import { useState, useCallback, useMemo, useRef, useEffect, type CSSProperties, type KeyboardEvent } from 'react';
import type { AccessibleDataTableProps, SortState, Column } from './types';
import { TableFilter } from './TableFilter';
import { Pagination } from './Pagination';
import { useVirtualization, VirtualizedContainer } from './VirtualizedRows';

/* ------------------------------------------------------------------ */
/*  Style constants                                                    */
/* ------------------------------------------------------------------ */

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

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  borderSpacing: 0,
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: '#1e293b',
};

const thStyle: CSSProperties = {
  padding: '10px 16px',
  background: '#f8fafc',
  fontWeight: 600,
  fontSize: '0.75rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#64748b',
  textAlign: 'left',
  borderBottom: '2px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  userSelect: 'none',
};

const sortBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 600,
  fontSize: '0.75rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#64748b',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #e2e8f0',
  verticalAlign: 'middle',
};

const focusCellOutline: CSSProperties = {
  outline: '2px solid #3b82f6',
  outlineOffset: '-2px',
  borderRadius: '2px',
};

const rowHover: CSSProperties = {
  background: '#f1f5f9',
};

const rowSelected: CSSProperties = {
  background: '#eff6ff',
};

const tableWrapperStyle: CSSProperties = {
  width: '100%',
  overflowX: 'auto',
};

/* ------------------------------------------------------------------ */
/*  Sorting helpers                                                    */
/* ------------------------------------------------------------------ */

function sortData<T>(data: T[], sort: SortState, columns: Column<T>[]): T[] {
  if (sort.direction === 'none') return data;

  const col = columns.find((c) => c.key === sort.columnKey);
  if (!col) return data;

  const dir = sort.direction === 'ascending' ? 1 : -1;

  return [...data].sort((a, b) => {
    const va = col.accessor(a);
    const vb = col.accessor(b);

    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
  });
}

function filterData<T>(data: T[], query: string, columns: Column<T>[]): T[] {
  if (!query.trim()) return data;
  const q = query.toLowerCase();
  return data.filter((row) =>
    columns.some((col) => {
      const v = col.accessor(row);
      return typeof v === 'string' || typeof v === 'number'
        ? String(v).toLowerCase().includes(q)
        : false;
    }),
  );
}

function nextSortDirection(current: SortState['direction']): SortState['direction'] {
  if (current === 'none') return 'ascending';
  if (current === 'ascending') return 'descending';
  return 'none';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AccessibleDataTable<T>({
  id,
  caption,
  columns,
  data,
  getRowKey,
  enableVirtualization = false,
  rowHeight = 48,
  tableHeight = 500,
  enableSelection = false,
  onSelectionChange,
  enablePagination = false,
  pageSize = 20,
  enableFilter = false,
  filterPlaceholder = 'Filter table…',
  isLoading = false,
  emptyMessage = 'No data available.',
  onSortChange,
  className,
}: AccessibleDataTableProps<T>) {
  /* ---- state ---- */
  const [sort, setSort] = useState<SortState>({ columnKey: '', direction: 'none' });
  const [filterQuery, setFilterQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({ row: -1, col: -1 });
  const [announcement, setAnnouncement] = useState('');

  const tableRef = useRef<HTMLTableElement | null>(null);

  /* ---- derived data ---- */
  const filtered = useMemo(() => filterData(data, filterQuery, columns), [data, filterQuery, columns]);
  const sorted = useMemo(() => sortData(filtered, sort, columns), [filtered, sort, columns]);

  const totalPages = enablePagination ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const paginated = enablePagination ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sorted;

  const shouldVirtualize = enableVirtualization && paginated.length > 100;

  const totalColCount = (enableSelection ? 1 : 0) + columns.length;

  /* ---- virtualization hook (always called to satisfy rules of hooks) ---- */
  const virtualResult = useVirtualization({
    items: paginated,
    rowHeight,
    containerHeight: tableHeight,
    overscan: 5,
  });

  /* ---- helpers ---- */
  const announce = useCallback((msg: string) => {
    // Clear first so the same message is re-announced
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(msg));
  }, []);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterQuery]);

  // Announce filter result count
  useEffect(() => {
    if (filterQuery) {
      announce(`${filtered.length} results found`);
    }
  }, [filtered.length, filterQuery, announce]);

  /* ---- sort handler ---- */
  const handleSort = useCallback(
    (colKey: string) => {
      setSort((prev) => {
        const dir = prev.columnKey === colKey ? nextSortDirection(prev.direction) : 'ascending';
        const next: SortState = { columnKey: colKey, direction: dir };
        const col = columns.find((c) => c.key === colKey);
        announce(`Sorted by ${col?.headerLabel ?? colKey}, ${dir}`);
        onSortChange?.(next);
        return next;
      });
    },
    [columns, announce, onSortChange],
  );

  /* ---- selection handlers ---- */
  const toggleRow = useCallback(
    (key: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onSelectionChange?.(next);
        return next;
      });
    },
    [onSelectionChange],
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allKeys = paginated.map(getRowKey);
      const next = prev.size === allKeys.length ? new Set<string>() : new Set(allKeys);
      onSelectionChange?.(next);
      return next;
    });
  }, [paginated, getRowKey, onSelectionChange]);

  /* ---- focus management ---- */
  const focusCell = useCallback(
    (row: number, col: number) => {
      const maxRow = paginated.length - 1;
      const maxCol = totalColCount - 1;
      const r = Math.max(-1, Math.min(row, maxRow)); // -1 = header
      const c = Math.max(0, Math.min(col, maxCol));
      setFocusedCell({ row: r, col: c });

      // DOM focus
      requestAnimationFrame(() => {
        const selector =
          r === -1
            ? `[data-col="${c}"] button, [data-col="${c}"]`
            : `[data-row="${r}"][data-col="${c}"]`;
        const el = tableRef.current?.querySelector<HTMLElement>(selector);
        el?.focus();
      });
    },
    [paginated.length, totalColCount],
  );

  const handleTableKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableElement>) => {
      const { row, col } = focusedCell;
      let handled = true;

      switch (e.key) {
        case 'ArrowDown':
          focusCell(row + 1, col);
          break;
        case 'ArrowUp':
          focusCell(row - 1, col);
          break;
        case 'ArrowRight':
          focusCell(row, col + 1);
          break;
        case 'ArrowLeft':
          focusCell(row, col - 1);
          break;
        case 'Home':
          focusCell(row, 0);
          break;
        case 'End':
          focusCell(row, totalColCount - 1);
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [focusedCell, focusCell, totalColCount],
  );

  /* ---- cell tabIndex helper ---- */
  const cellTabIndex = (row: number, col: number) =>
    focusedCell.row === row && focusedCell.col === col ? 0 : -1;

  /* ---- render helpers ---- */
  const renderSortIndicator = (colKey: string) => {
    if (sort.columnKey !== colKey || sort.direction === 'none') return <span aria-hidden="true"> ⇅</span>;
    return <span aria-hidden="true">{sort.direction === 'ascending' ? ' ▲' : ' ▼'}</span>;
  };

  const renderRow = (row: T, rowIdx: number, style?: CSSProperties) => {
    const key = getRowKey(row);
    const isSelected = selected.has(key);
    const colOffset = enableSelection ? 1 : 0;

    const rowStyle: CSSProperties = {
      ...(style ?? {}),
      ...(isSelected ? rowSelected : {}),
    };

    return (
      <tr
        key={key}
        role="row"
        aria-rowindex={rowIdx + 2} // +2 because header is row 1
        aria-selected={enableSelection ? isSelected : undefined}
        style={rowStyle}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = rowHover.background!;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = isSelected ? rowSelected.background! : '';
        }}
      >
        {enableSelection && (
          <td
            role="gridcell"
            aria-colindex={1}
            data-row={rowIdx}
            data-col={0}
            tabIndex={cellTabIndex(rowIdx, 0)}
            style={{
              ...tdStyle,
              width: '48px',
              textAlign: 'center',
              ...(focusedCell.row === rowIdx && focusedCell.col === 0 ? focusCellOutline : {}),
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleRow(key)}
              aria-label={`Select row ${key}`}
              tabIndex={-1}
            />
          </td>
        )}
        {columns.map((col, colIdx) => {
          const cIdx = colIdx + colOffset;
          const rawValue = col.accessor(row);
          const cellContent = col.renderCell ? col.renderCell(rawValue, row) : rawValue;
          const isFocused = focusedCell.row === rowIdx && focusedCell.col === cIdx;
          return (
            <td
              key={col.key}
              role="gridcell"
              aria-colindex={cIdx + 1}
              data-row={rowIdx}
              data-col={cIdx}
              tabIndex={cellTabIndex(rowIdx, cIdx)}
              style={{
                ...tdStyle,
                ...(col.width ? { width: col.width } : {}),
                ...(isFocused ? focusCellOutline : {}),
              }}
            >
              {cellContent}
            </td>
          );
        })}
      </tr>
    );
  };

  /* ---- main render ---- */
  return (
    <div id={id} role="region" aria-label={caption} className={className} style={tableWrapperStyle}>
      {/* Live announcement region */}
      <div aria-live="polite" aria-atomic="true" style={srOnly}>
        {announcement}
      </div>

      {/* Filter */}
      {enableFilter && (
        <TableFilter
          id={`${id}-filter`}
          value={filterQuery}
          onChange={setFilterQuery}
          placeholder={filterPlaceholder}
          description="Type to filter table rows. Press Escape to clear."
          resultCount={filterQuery ? filtered.length : undefined}
        />
      )}

      {/* Table */}
      <table
        ref={tableRef}
        role="grid"
        aria-rowcount={sorted.length + 1}
        aria-colcount={totalColCount}
        aria-busy={isLoading}
        aria-label={caption}
        style={tableStyle}
        onKeyDown={handleTableKeyDown}
      >
        <caption style={srOnly}>{caption}</caption>

        <thead>
          <tr role="row" aria-rowindex={1}>
            {enableSelection && (
              <th
                role="columnheader"
                scope="col"
                aria-colindex={1}
                data-col={0}
                style={{ ...thStyle, width: '48px', textAlign: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && selected.size === paginated.length}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                  tabIndex={cellTabIndex(-1, 0)}
                />
              </th>
            )}
            {columns.map((col, colIdx) => {
              const cIdx = colIdx + (enableSelection ? 1 : 0);
              const ariaSortValue =
                sort.columnKey === col.key && sort.direction !== 'none' ? sort.direction : undefined;
              return (
                <th
                  key={col.key}
                  role="columnheader"
                  scope="col"
                  aria-colindex={cIdx + 1}
                  aria-sort={col.sortable ? (ariaSortValue ?? 'none') : undefined}
                  data-col={cIdx}
                  style={{ ...thStyle, ...(col.width ? { width: col.width } : {}) }}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      style={sortBtnStyle}
                      onClick={() => handleSort(col.key)}
                      aria-label={`Sort by ${col.headerLabel}, currently ${
                        sort.columnKey === col.key ? sort.direction : 'none'
                      }`}
                      tabIndex={cellTabIndex(-1, cIdx)}
                    >
                      {col.headerLabel}
                      {renderSortIndicator(col.key)}
                    </button>
                  ) : (
                    <span tabIndex={cellTabIndex(-1, cIdx)}>{col.headerLabel}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Table body — virtualised or standard */}
        {shouldVirtualize ? (
          <tbody>
            {/* Spacer row to create scroll height */}
            <tr aria-hidden="true" style={{ height: 0 }}>
              <td colSpan={totalColCount} style={{ padding: 0, border: 'none', height: 0 }} />
            </tr>
          </tbody>
        ) : (
          <tbody>
            {isLoading && (
              <tr role="row">
                <td
                  role="gridcell"
                  colSpan={totalColCount}
                  style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}
                >
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && paginated.length === 0 && (
              <tr role="row">
                <td
                  role="gridcell"
                  colSpan={totalColCount}
                  style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!isLoading && paginated.map((row, idx) => renderRow(row, idx))}
          </tbody>
        )}
      </table>

      {/* Virtualised body rendered outside the table for scroll containment */}
      {shouldVirtualize && (
        <VirtualizedContainer
          totalHeight={virtualResult.totalHeight}
          containerHeight={tableHeight}
          containerRef={virtualResult.containerRef}
          onScroll={virtualResult.onScroll}
          ariaLabel={`${caption} scrollable body`}
        >
          <table role="presentation" style={{ ...tableStyle, tableLayout: 'fixed' }}>
            <tbody>
              {virtualResult.visibleItems.map(({ item, index, style }) => renderRow(item, index, style))}
            </tbody>
          </table>
        </VirtualizedContainer>
      )}

      {/* Pagination */}
      {enablePagination && totalPages > 1 && (
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      )}
    </div>
  );
}
