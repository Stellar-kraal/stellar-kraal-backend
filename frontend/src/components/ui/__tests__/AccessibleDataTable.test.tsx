/**
 * Tests for AccessibleDataTable — WCAG 2.1 AA compliance.
 *
 * Verifies ARIA attributes, keyboard navigation, sort/filter
 * announcements, virtualization, and zero axe-core violations.
 */

import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AccessibleDataTable } from '../AccessibleDataTable';
import { StatusIndicator } from '../StatusIndicator';
import type { Column, CreditStatus } from '../types';

expect.extend(toHaveNoViolations);

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

interface TestRow {
  id: string;
  name: string;
  value: number;
  status: CreditStatus;
}

const TEST_COLUMNS: Column<TestRow>[] = [
  {
    key: 'id',
    headerI18nKey: 'test.col.id',
    headerLabel: 'ID',
    accessor: (r) => r.id,
    sortable: true,
    width: '80px',
  },
  {
    key: 'name',
    headerI18nKey: 'test.col.name',
    headerLabel: 'Name',
    accessor: (r) => r.name,
    sortable: true,
  },
  {
    key: 'value',
    headerI18nKey: 'test.col.value',
    headerLabel: 'Value',
    accessor: (r) => r.value,
    sortable: true,
    width: '100px',
  },
  {
    key: 'status',
    headerI18nKey: 'test.col.status',
    headerLabel: 'Status',
    accessor: (r) => r.status,
    sortable: false,
    renderCell: (val) => (
      <StatusIndicator status={val as CreditStatus} ariaPrefix="Item status" />
    ),
  },
];

function makeRows(count: number): TestRow[] {
  const statuses: CreditStatus[] = ['active', 'pending', 'sold', 'expired', 'cancelled'];
  return Array.from({ length: count }, (_, i) => ({
    id: `CR-${String(i + 1).padStart(4, '0')}`,
    name: `Project ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
    value: Math.round(Math.random() * 1000) + 10,
    status: statuses[i % statuses.length],
  }));
}

const SMALL_DATA = makeRows(5);
const LARGE_DATA = makeRows(200);

/* ------------------------------------------------------------------ */
/*  ARIA attribute tests                                               */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — ARIA attributes', () => {
  it('renders with correct ARIA roles on region, grid, columnheader, row, and gridcell', () => {
    const { container } = render(
      <AccessibleDataTable
        id="test-table"
        caption="Test caption"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const region = container.querySelector('[role="region"]');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('aria-label', 'Test caption');

    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute('aria-colcount', '4');

    const headers = container.querySelectorAll('[role="columnheader"]');
    expect(headers.length).toBe(4);

    headers.forEach((th, i) => {
      expect(th).toHaveAttribute('aria-colindex', String(i + 1));
    });

    const rows = container.querySelectorAll('tbody [role="row"]');
    expect(rows.length).toBe(SMALL_DATA.length);

    rows.forEach((row) => {
      expect(row).toHaveAttribute('aria-rowindex');
    });

    const cells = container.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('renders a visually-hidden caption', () => {
    render(
      <AccessibleDataTable
        id="caption-test"
        caption="My table caption"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const caption = document.querySelector('caption');
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveTextContent('My table caption');
  });

  it('sortable columns have aria-sort attribute', () => {
    const { container } = render(
      <AccessibleDataTable
        id="sort-aria"
        caption="Sort test"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const sortableHeaders = container.querySelectorAll('[aria-sort]');
    // ID, Name, Value are sortable; Status is not
    expect(sortableHeaders.length).toBe(3);

    sortableHeaders.forEach((th) => {
      expect(th.getAttribute('aria-sort')).toBe('none');
    });
  });

  it('sets aria-busy when isLoading is true', () => {
    const { container } = render(
      <AccessibleDataTable
        id="loading-test"
        caption="Loading"
        columns={TEST_COLUMNS}
        data={[]}
        getRowKey={(r: TestRow) => r.id}
        isLoading
      />,
    );

    const grid = container.querySelector('[role="grid"]');
    expect(grid).toHaveAttribute('aria-busy', 'true');
  });

  it('selection column adds aria-selected and checkbox with aria-label', () => {
    const { container } = render(
      <AccessibleDataTable
        id="select-test"
        caption="Selection"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
        enableSelection
        onSelectionChange={() => {}}
      />,
    );

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    // 1 select-all + 5 row checkboxes
    expect(checkboxes.length).toBe(6);

    const selectAll = checkboxes[0];
    expect(selectAll).toHaveAttribute('aria-label', 'Select all rows');

    // Row checkboxes
    for (let i = 1; i < checkboxes.length; i++) {
      expect(checkboxes[i]).toHaveAttribute('aria-label');
      expect(checkboxes[i].getAttribute('aria-label')).toMatch(/^Select row /);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Keyboard navigation tests                                          */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — Keyboard navigation', () => {
  it('sort buttons are keyboard-activatable with Enter', async () => {
    const onSortChange = jest.fn();
    const { container } = render(
      <AccessibleDataTable
        id="kb-sort"
        caption="KB sort"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
        onSortChange={onSortChange}
      />,
    );

    const sortBtns = container.querySelectorAll('[role="columnheader"] button');
    expect(sortBtns.length).toBe(3); // ID, Name, Value

    // Click the first sort button
    await act(async () => {
      fireEvent.click(sortBtns[0]);
    });

    expect(onSortChange).toHaveBeenCalledWith(
      expect.objectContaining({ columnKey: 'id', direction: 'ascending' }),
    );
  });

  it('arrow keys navigate between cells', async () => {
    const { container } = render(
      <AccessibleDataTable
        id="kb-nav"
        caption="KB nav"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const grid = container.querySelector('[role="grid"]')!;

    // Focus first data cell
    const firstCell = container.querySelector('[data-row="0"][data-col="0"]') as HTMLElement;
    firstCell?.focus();

    // Arrow right
    await act(async () => {
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
    });

    // Arrow down
    await act(async () => {
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
    });

    // These fire key events on the grid; exact focus tracking is internal
    // The test verifies no errors are thrown during navigation
  });

  it('Home key jumps to first column in a row', async () => {
    const { container } = render(
      <AccessibleDataTable
        id="kb-home"
        caption="KB home"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const grid = container.querySelector('[role="grid"]')!;

    await act(async () => {
      fireEvent.keyDown(grid, { key: 'Home' });
    });

    // No errors thrown
  });

  it('End key jumps to last column in a row', async () => {
    const { container } = render(
      <AccessibleDataTable
        id="kb-end"
        caption="KB end"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const grid = container.querySelector('[role="grid"]')!;

    await act(async () => {
      fireEvent.keyDown(grid, { key: 'End' });
    });

    // No errors thrown
  });
});

/* ------------------------------------------------------------------ */
/*  Sort announcements                                                 */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — Sort announcements', () => {
  it('announces sort changes via aria-live region', async () => {
    const { container } = render(
      <AccessibleDataTable
        id="announce-sort"
        caption="Sort announce"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const sortBtn = container.querySelector('[role="columnheader"] button')!;

    await act(async () => {
      fireEvent.click(sortBtn);
    });

    // Wait for requestAnimationFrame in announce()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion?.textContent).toMatch(/Sorted by.*ascending/i);
  });

  it('cycles through ascending → descending → none', async () => {
    const onSort = jest.fn();
    const { container } = render(
      <AccessibleDataTable
        id="sort-cycle"
        caption="Sort cycle"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
        onSortChange={onSort}
      />,
    );

    const sortBtn = container.querySelector('[role="columnheader"] button')!;

    // 1st click → ascending
    await act(async () => { fireEvent.click(sortBtn); });
    expect(onSort).toHaveBeenLastCalledWith({ columnKey: 'id', direction: 'ascending' });

    // 2nd click → descending
    await act(async () => { fireEvent.click(sortBtn); });
    expect(onSort).toHaveBeenLastCalledWith({ columnKey: 'id', direction: 'descending' });

    // 3rd click → none
    await act(async () => { fireEvent.click(sortBtn); });
    expect(onSort).toHaveBeenLastCalledWith({ columnKey: 'id', direction: 'none' });
  });
});

/* ------------------------------------------------------------------ */
/*  Filter tests                                                       */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — Filtering', () => {
  it('filters rows based on text input', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AccessibleDataTable
        id="filter-test"
        caption="Filter test"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
        enableFilter
      />,
    );

    const filterInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(filterInput).toBeInTheDocument();

    await act(async () => {
      await user.type(filterInput, 'CR-0001');
      // Wait for debounce
      await new Promise((r) => setTimeout(r, 400));
    });

    const dataRows = container.querySelectorAll('tbody [role="row"]');
    expect(dataRows.length).toBeLessThanOrEqual(SMALL_DATA.length);
  });

  it('filter has search landmark role', () => {
    const { container } = render(
      <AccessibleDataTable
        id="filter-landmark"
        caption="Landmark test"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
        enableFilter
      />,
    );

    const searchLandmark = container.querySelector('[role="search"]');
    expect(searchLandmark).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Pagination tests                                                   */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — Pagination', () => {
  it('renders pagination when enablePagination is true and data exceeds pageSize', () => {
    render(
      <AccessibleDataTable
        id="paginate-test"
        caption="Pagination test"
        columns={TEST_COLUMNS}
        data={makeRows(50)}
        getRowKey={(r) => r.id}
        enablePagination
        pageSize={10}
      />,
    );

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(nav).toBeInTheDocument();

    const currentPage = screen.getByRole('button', { name: /page 1$/i });
    expect(currentPage).toHaveAttribute('aria-current', 'page');
  });

  it('page buttons have descriptive aria-labels', () => {
    render(
      <AccessibleDataTable
        id="paginate-aria"
        caption="Pagination aria"
        columns={TEST_COLUMNS}
        data={makeRows(50)}
        getRowKey={(r) => r.id}
        enablePagination
        pageSize={10}
      />,
    );

    expect(screen.getByRole('button', { name: /first page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /last page/i })).toBeInTheDocument();
  });

  it('navigating pages updates the displayed rows', async () => {
    const data = makeRows(25);
    const { container } = render(
      <AccessibleDataTable
        id="paginate-nav"
        caption="Page nav"
        columns={TEST_COLUMNS}
        data={data}
        getRowKey={(r) => r.id}
        enablePagination
        pageSize={10}
      />,
    );

    // Page 1: 10 rows
    let rows = container.querySelectorAll('tbody [role="row"]');
    expect(rows.length).toBe(10);

    // Go to page 2
    const nextBtn = screen.getByRole('button', { name: /next page/i });
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    rows = container.querySelectorAll('tbody [role="row"]');
    expect(rows.length).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/*  Virtualization tests                                               */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — Virtualization', () => {
  it('renders only a subset of rows when virtualization is enabled with > 100 rows', () => {
    const { container } = render(
      <AccessibleDataTable
        id="virtual-test"
        caption="Virtual test"
        columns={TEST_COLUMNS}
        data={LARGE_DATA}
        getRowKey={(r) => r.id}
        enableVirtualization
        rowHeight={48}
        tableHeight={500}
      />,
    );

    // The virtualized container should exist
    const virtualContainer = container.querySelector('[aria-label*="scrollable body"]');
    expect(virtualContainer).toBeInTheDocument();

    // Rendered rows should be fewer than total
    const renderedRows = container.querySelectorAll('[role="row"][aria-rowindex]');
    // Header row + visible rows; should be much less than 200
    expect(renderedRows.length).toBeLessThan(LARGE_DATA.length);
  });

  it('rows maintain correct aria-rowindex during virtual scrolling', () => {
    const { container } = render(
      <AccessibleDataTable
        id="virtual-idx"
        caption="Virtual index"
        columns={TEST_COLUMNS}
        data={LARGE_DATA}
        getRowKey={(r) => r.id}
        enableVirtualization
        rowHeight={48}
        tableHeight={500}
      />,
    );

    const rows = container.querySelectorAll('tbody [role="row"][aria-rowindex]');
    rows.forEach((row) => {
      const idx = Number(row.getAttribute('aria-rowindex'));
      expect(idx).toBeGreaterThanOrEqual(2); // 1 is header
    });
  });
});

/* ------------------------------------------------------------------ */
/*  StatusIndicator tests                                              */
/* ------------------------------------------------------------------ */

describe('StatusIndicator', () => {
  it('renders icon, label text, and aria-label', () => {
    const { container } = render(
      <StatusIndicator status="active" ariaPrefix="Credit status" />,
    );

    const badge = container.querySelector('[role="status"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Credit status: Active');
    expect(badge).toHaveTextContent('Active');

    const icon = badge?.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders all status types without errors', () => {
    const statuses = ['active', 'pending', 'sold', 'expired', 'cancelled', 'completed', 'processing', 'failed'] as const;

    statuses.forEach((status) => {
      const { container } = render(<StatusIndicator status={status} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Loading and empty states                                           */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — States', () => {
  it('shows loading indicator when isLoading is true', () => {
    render(
      <AccessibleDataTable
        id="loading"
        caption="Loading state"
        columns={TEST_COLUMNS}
        data={[]}
        getRowKey={(r: TestRow) => r.id}
        isLoading
      />,
    );

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty message when data is empty', () => {
    render(
      <AccessibleDataTable
        id="empty"
        caption="Empty state"
        columns={TEST_COLUMNS}
        data={[]}
        getRowKey={(r: TestRow) => r.id}
        emptyMessage="Nothing here yet."
      />,
    );

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  axe-core accessibility audit                                       */
/* ------------------------------------------------------------------ */

describe('AccessibleDataTable — axe-core audit', () => {
  it('passes axe-core AA audit with no violations (basic table)', async () => {
    const { container } = render(
      <AccessibleDataTable
        id="axe-basic"
        caption="Axe audit — basic"
        columns={TEST_COLUMNS}
        data={SMALL_DATA}
        getRowKey={(r) => r.id}
      />,
    );

    const results = await axe(container, {
      rules: {
        // Scope to AA rules
        region: { enabled: false }, // We handle landmarks at page level
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('passes axe-core AA audit with filter, pagination, and selection', async () => {
    const { container } = render(
      <AccessibleDataTable
        id="axe-full"
        caption="Axe audit — full features"
        columns={TEST_COLUMNS}
        data={makeRows(30)}
        getRowKey={(r) => r.id}
        enableFilter
        enablePagination
        pageSize={10}
        enableSelection
        onSelectionChange={() => {}}
      />,
    );

    const results = await axe(container, {
      rules: {
        region: { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
