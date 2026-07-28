'use client';

/**
 * Credit Listings Table — marketplace view.
 *
 * Displays a sortable, filterable, paginated table of carbon-credit
 * listings. Fully accessible (WCAG 2.1 AA) with optional row
 * virtualization for large datasets.
 */

import { useMemo } from 'react';
import { AccessibleDataTable } from '../ui/AccessibleDataTable';
import { StatusIndicator } from '../ui/StatusIndicator';
import type { Column, CreditListing, CreditStatus } from '../ui/types';

export interface CreditListingsTableProps {
  /** Array of credit listing data */
  data: CreditListing[];
  /** True while fetching data */
  isLoading?: boolean;
  /** Enable virtual scrolling for > 100 rows */
  enableVirtualization?: boolean;
  /** Callback when row selection changes */
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

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

export function CreditListingsTable({
  data,
  isLoading = false,
  enableVirtualization = false,
  onSelectionChange,
}: CreditListingsTableProps) {
  const columns: Column<CreditListing>[] = useMemo(
    () => [
      {
        key: 'id',
        headerI18nKey: 'marketplace.column.creditId',
        headerLabel: 'Credit ID',
        accessor: (row) => row.id,
        sortable: true,
        width: '120px',
      },
      {
        key: 'projectName',
        headerI18nKey: 'marketplace.column.projectName',
        headerLabel: 'Project Name',
        accessor: (row) => row.projectName,
        sortable: true,
      },
      {
        key: 'vintage',
        headerI18nKey: 'marketplace.column.vintage',
        headerLabel: 'Vintage',
        accessor: (row) => row.vintage,
        sortable: true,
        width: '100px',
      },
      {
        key: 'status',
        headerI18nKey: 'marketplace.column.status',
        headerLabel: 'Status',
        accessor: (row) => row.status,
        sortable: true,
        width: '140px',
        renderCell: (value) => (
          <StatusIndicator status={value as CreditStatus} ariaPrefix="Credit status" />
        ),
      },
      {
        key: 'pricePerUnit',
        headerI18nKey: 'marketplace.column.price',
        headerLabel: 'Price / Unit',
        accessor: (row) => row.pricePerUnit,
        sortable: true,
        width: '130px',
        renderCell: (value) => formatCurrency(value as number),
      },
      {
        key: 'quantity',
        headerI18nKey: 'marketplace.column.quantity',
        headerLabel: 'Quantity',
        accessor: (row) => row.quantity,
        sortable: true,
        width: '110px',
        renderCell: (value) => formatNumber(value as number),
      },
      {
        key: 'seller',
        headerI18nKey: 'marketplace.column.seller',
        headerLabel: 'Seller',
        accessor: (row) => row.seller,
        sortable: true,
      },
      {
        key: 'listedDate',
        headerI18nKey: 'marketplace.column.listedDate',
        headerLabel: 'Listed',
        accessor: (row) => row.listedDate,
        sortable: true,
        width: '130px',
        renderCell: (value) => formatDate(value as string),
      },
    ],
    [],
  );

  return (
    <AccessibleDataTable<CreditListing>
      id="credit-listings-table"
      caption="Carbon credit listings available on the marketplace"
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      enableVirtualization={enableVirtualization}
      enablePagination
      pageSize={20}
      enableFilter
      filterPlaceholder="Search credits by project or ID…"
      enableSelection={!!onSelectionChange}
      onSelectionChange={onSelectionChange}
      isLoading={isLoading}
      emptyMessage="No credit listings match your search."
    />
  );
}
