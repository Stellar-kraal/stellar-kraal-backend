'use client';

/**
 * Retirement History Table — portfolio view.
 *
 * Displays a sortable, filterable, paginated table of carbon-credit
 * retirement records. Fully accessible (WCAG 2.1 AA) with optional
 * row virtualization for large datasets.
 */

import { useMemo } from 'react';
import { AccessibleDataTable } from '../ui/AccessibleDataTable';
import { StatusIndicator } from '../ui/StatusIndicator';
import type { Column, RetirementRecord, RetirementStatus } from '../ui/types';

export interface RetirementHistoryTableProps {
  /** Array of retirement records */
  data: RetirementRecord[];
  /** True while fetching data */
  isLoading?: boolean;
  /** Enable virtual scrolling for > 100 rows */
  enableVirtualization?: boolean;
  /** Callback when row selection changes */
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('en-US').format(value);

const formatDate = (dateStr: string): string => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export function RetirementHistoryTable({
  data,
  isLoading = false,
  enableVirtualization = false,
  onSelectionChange,
}: RetirementHistoryTableProps) {
  const columns: Column<RetirementRecord>[] = useMemo(
    () => [
      {
        key: 'id',
        headerI18nKey: 'portfolio.column.retirementId',
        headerLabel: 'Retirement ID',
        accessor: (row) => row.id,
        sortable: true,
        width: '140px',
      },
      {
        key: 'creditType',
        headerI18nKey: 'portfolio.column.creditType',
        headerLabel: 'Credit Type',
        accessor: (row) => row.creditType,
        sortable: true,
      },
      {
        key: 'quantity',
        headerI18nKey: 'portfolio.column.quantity',
        headerLabel: 'Quantity',
        accessor: (row) => row.quantity,
        sortable: true,
        width: '110px',
        renderCell: (value) => formatNumber(value as number),
      },
      {
        key: 'retirementDate',
        headerI18nKey: 'portfolio.column.retirementDate',
        headerLabel: 'Retirement Date',
        accessor: (row) => row.retirementDate,
        sortable: true,
        width: '150px',
        renderCell: (value) => formatDate(value as string),
      },
      {
        key: 'status',
        headerI18nKey: 'portfolio.column.status',
        headerLabel: 'Status',
        accessor: (row) => row.status,
        sortable: true,
        width: '150px',
        renderCell: (value) => (
          <StatusIndicator status={value as RetirementStatus} ariaPrefix="Retirement status" />
        ),
      },
      {
        key: 'beneficiary',
        headerI18nKey: 'portfolio.column.beneficiary',
        headerLabel: 'Beneficiary',
        accessor: (row) => row.beneficiary,
        sortable: true,
      },
      {
        key: 'serialNumber',
        headerI18nKey: 'portfolio.column.serialNumber',
        headerLabel: 'Serial Number',
        accessor: (row) => row.serialNumber,
        sortable: false,
        width: '160px',
      },
    ],
    [],
  );

  return (
    <AccessibleDataTable<RetirementRecord>
      id="retirement-history-table"
      caption="Carbon credit retirement history"
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      enableVirtualization={enableVirtualization}
      enablePagination
      pageSize={20}
      enableFilter
      filterPlaceholder="Search by credit type or beneficiary…"
      enableSelection={!!onSelectionChange}
      onSelectionChange={onSelectionChange}
      isLoading={isLoading}
      emptyMessage="No retirement records match your search."
    />
  );
}
