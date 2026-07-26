/**
 * Shared types for accessible data table components.
 * Designed for WCAG 2.1 AA compliance with i18n-ready column headers.
 *
 * @module ui/types
 */

import type { ReactNode, CSSProperties } from 'react';

/* ------------------------------------------------------------------ */
/*  Column definition                                                  */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  /** Unique key identifying the column */
  key: string;
  /** i18n message key for the column header (e.g. "table.column.creditId") */
  headerI18nKey: string;
  /** Fallback display label when i18n is not configured */
  headerLabel: string;
  /** Accessor returning the raw cell value */
  accessor: (row: T) => string | number | ReactNode;
  /** Whether the column supports sorting */
  sortable?: boolean;
  /** Optional fixed width (CSS value) */
  width?: string;
  /** Custom cell renderer — receives the raw value and the full row */
  renderCell?: (value: unknown, row: T) => ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Sort / Filter / Pagination state                                   */
/* ------------------------------------------------------------------ */

export interface SortState {
  columnKey: string;
  direction: 'ascending' | 'descending' | 'none';
}

export interface FilterState {
  query: string;
  columnKey?: string;
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
}

/* ------------------------------------------------------------------ */
/*  Status types & display config                                      */
/* ------------------------------------------------------------------ */

export type CreditStatus = 'active' | 'pending' | 'sold' | 'expired' | 'cancelled';
export type RetirementStatus = 'completed' | 'pending' | 'processing' | 'failed' | 'cancelled';
export type StatusType = CreditStatus | RetirementStatus;

export interface StatusConfig {
  /** Visible label text */
  label: string;
  /** Foreground / icon color */
  color: string;
  /** Badge background color */
  bgColor: string;
  /** SVG path `d` attribute for the 16×16 icon */
  iconPath: string;
  /** SVG viewBox (default "0 0 16 16") */
  iconViewBox?: string;
}

/**
 * Maps each {@link StatusType} to its accessible display configuration.
 * Every status is represented by icon + colour + visible label so that
 * colour is never the sole differentiator (WCAG 1.4.1).
 */
export const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  /* ---- Credit statuses ---- */
  active: {
    label: 'Active',
    color: '#16a34a',
    bgColor: '#f0fdf4',
    // Checkmark circle
    iconPath:
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06 0L7 8.94 5.84 7.78a.75.75 0 1 0-1.06 1.06l1.7 1.7a.75.75 0 0 0 1.06 0l3.68-3.68a.75.75 0 0 0 0-1.06Z',
  },
  pending: {
    label: 'Pending',
    color: '#ca8a04',
    bgColor: '#fefce8',
    // Clock
    iconPath:
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm.75 3a.75.75 0 0 0-1.5 0v4c0 .2.08.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 7.69V4Z',
  },
  sold: {
    label: 'Sold',
    color: '#2563eb',
    bgColor: '#eff6ff',
    // Tag
    iconPath:
      'M2 3a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0L2.293 8.293A1 1 0 0 1 2 7.586V3Zm3.5 2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  },
  expired: {
    label: 'Expired',
    color: '#9333ea',
    bgColor: '#faf5ff',
    // Alert triangle
    iconPath:
      'M7.134 1.498a1 1 0 0 1 1.732 0l6 10.392A1 1 0 0 1 14 13.5H2a1 1 0 0 1-.866-1.61l6-10.392ZM8 5a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 8 5Zm1 7a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#dc2626',
    bgColor: '#fef2f2',
    // X circle
    iconPath:
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm2.47 4.47a.75.75 0 0 0-1.06 0L8 6.88 6.59 5.47a.75.75 0 1 0-1.06 1.06L6.94 8l-1.41 1.47a.75.75 0 1 0 1.06 1.06L8 9.12l1.41 1.41a.75.75 0 1 0 1.06-1.06L9.06 8l1.41-1.47a.75.75 0 0 0 0-1.06Z',
  },

  /* ---- Retirement statuses ---- */
  completed: {
    label: 'Completed',
    color: '#16a34a',
    bgColor: '#f0fdf4',
    // Checkmark circle (same as active)
    iconPath:
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.22 4.72a.75.75 0 0 0-1.06 0L7 8.94 5.84 7.78a.75.75 0 1 0-1.06 1.06l1.7 1.7a.75.75 0 0 0 1.06 0l3.68-3.68a.75.75 0 0 0 0-1.06Z',
  },
  processing: {
    label: 'Processing',
    color: '#0891b2',
    bgColor: '#ecfeff',
    // Spinning arrows / processing
    iconPath:
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm.75 3a.75.75 0 0 0-1.5 0v4c0 .2.08.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 7.69V4Z',
  },
  failed: {
    label: 'Failed',
    color: '#dc2626',
    bgColor: '#fef2f2',
    // X circle (same as cancelled)
    iconPath:
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm2.47 4.47a.75.75 0 0 0-1.06 0L8 6.88 6.59 5.47a.75.75 0 1 0-1.06 1.06L6.94 8l-1.41 1.47a.75.75 0 1 0 1.06 1.06L8 9.12l1.41 1.41a.75.75 0 1 0 1.06-1.06L9.06 8l1.41-1.47a.75.75 0 0 0 0-1.06Z',
  },
};

/* ------------------------------------------------------------------ */
/*  AccessibleDataTable props                                          */
/* ------------------------------------------------------------------ */

export interface AccessibleDataTableProps<T> {
  /** Unique DOM id for the table region (used for ARIA relationships) */
  id: string;
  /** Human-readable caption — always rendered but visually hidden */
  caption: string;
  /** Column definitions */
  columns: Column<T>[];
  /** Data rows */
  data: T[];
  /** Returns a stable, unique key for each row */
  getRowKey: (row: T) => string;
  /** Enable virtual scrolling for large datasets (>100 rows) */
  enableVirtualization?: boolean;
  /** Row height in px — required when virtualization is on */
  rowHeight?: number;
  /** Visible height of the scrollable table body in px */
  tableHeight?: number;
  /** Enable row selection via checkboxes */
  enableSelection?: boolean;
  /** Fires when the set of selected row keys changes */
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  /** Enable pagination controls */
  enablePagination?: boolean;
  /** Items per page (default 20) */
  pageSize?: number;
  /** Enable the filter search bar above the table */
  enableFilter?: boolean;
  /** Placeholder for the filter input */
  filterPlaceholder?: string;
  /** True while data is loading */
  isLoading?: boolean;
  /** Text shown when the (filtered) dataset is empty */
  emptyMessage?: string;
  /** Fires when the user changes the sort */
  onSortChange?: (sort: SortState) => void;
  /** Extra class name on the root element */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Domain data types                                                  */
/* ------------------------------------------------------------------ */

/** A carbon-credit listing on the marketplace. */
export interface CreditListing {
  id: string;
  projectName: string;
  vintage: number;
  status: CreditStatus;
  pricePerUnit: number;
  quantity: number;
  seller: string;
  listedDate: string;
}

/** A single retirement record in the user's portfolio. */
export interface RetirementRecord {
  id: string;
  creditType: string;
  quantity: number;
  retirementDate: string;
  status: RetirementStatus;
  beneficiary: string;
  serialNumber: string;
}
