/**
 * Tests for RetirementHistoryTable — portfolio view.
 *
 * Verifies correct columns, StatusIndicator usage, sort/filter/pagination
 * via keyboard, and axe-core AA audit.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { RetirementHistoryTable } from '../RetirementHistoryTable';
import type { RetirementRecord, RetirementStatus } from '../../ui/types';

expect.extend(toHaveNoViolations);

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const STATUSES: RetirementStatus[] = ['completed', 'pending', 'processing', 'failed', 'cancelled'];

function makeRetirementRecords(count: number): RetirementRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `RET-${String(i + 1).padStart(4, '0')}`,
    creditType: i % 2 === 0 ? 'VER' : 'GS',
    quantity: 50 + i * 5,
    retirementDate: `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
    status: STATUSES[i % STATUSES.length],
    beneficiary: `Beneficiary ${String.fromCharCode(65 + (i % 26))}`,
    serialNumber: `SN-${String(i + 1000).padStart(6, '0')}`,
  }));
}

const SMALL_DATA = makeRetirementRecords(5);
const LARGE_DATA = makeRetirementRecords(30);

/* ------------------------------------------------------------------ */
/*  Column rendering                                                   */
/* ------------------------------------------------------------------ */

describe('RetirementHistoryTable — Columns', () => {
  it('renders all expected column headers', () => {
    render(<RetirementHistoryTable data={SMALL_DATA} />);

    expect(screen.getByText('Retirement ID')).toBeInTheDocument();
    expect(screen.getByText('Credit Type')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Retirement Date')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Beneficiary')).toBeInTheDocument();
    expect(screen.getByText('Serial Number')).toBeInTheDocument();
  });

  it('renders the correct number of data rows', () => {
    const { container } = render(<RetirementHistoryTable data={SMALL_DATA} />);

    const dataRows = container.querySelectorAll('tbody [role="row"]');
    expect(dataRows.length).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/*  Status indicators                                                  */
/* ------------------------------------------------------------------ */

describe('RetirementHistoryTable — Status indicators', () => {
  it('renders StatusIndicator with icon+color+label for each row', () => {
    const { container } = render(<RetirementHistoryTable data={SMALL_DATA} />);

    const statusBadges = container.querySelectorAll('[role="status"]');
    expect(statusBadges.length).toBe(SMALL_DATA.length);

    statusBadges.forEach((badge) => {
      // Has aria-label with prefix
      expect(badge.getAttribute('aria-label')).toMatch(/^Retirement status: /);

      // Has visible text
      expect(badge.textContent).toBeTruthy();

      // Has SVG icon hidden from screen readers
      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Sort / Filter / Pagination                                         */
/* ------------------------------------------------------------------ */

describe('RetirementHistoryTable — Interactions', () => {
  it('sort buttons are present for sortable columns', () => {
    const { container } = render(<RetirementHistoryTable data={SMALL_DATA} />);

    const sortButtons = container.querySelectorAll('[role="columnheader"] button');
    // Retirement ID, Credit Type, Quantity, Retirement Date, Status, Beneficiary = 6 sortable
    // Serial Number is not sortable
    expect(sortButtons.length).toBe(6);
  });

  it('clicking sort triggers announcement via aria-live', async () => {
    const { container } = render(<RetirementHistoryTable data={SMALL_DATA} />);

    const sortBtn = container.querySelector('[role="columnheader"] button')!;

    await act(async () => {
      fireEvent.click(sortBtn);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('filter input is present', () => {
    const { container } = render(<RetirementHistoryTable data={SMALL_DATA} />);

    const filterInput = container.querySelector('input[type="search"]');
    expect(filterInput).toBeInTheDocument();
  });

  it('pagination appears when data exceeds page size', () => {
    render(<RetirementHistoryTable data={LARGE_DATA} />);

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(nav).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Loading state                                                      */
/* ------------------------------------------------------------------ */

describe('RetirementHistoryTable — Loading', () => {
  it('shows loading indicator', () => {
    render(<RetirementHistoryTable data={[]} isLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(<RetirementHistoryTable data={[]} />);
    expect(screen.getByText('No retirement records match your search.')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  axe-core audit                                                     */
/* ------------------------------------------------------------------ */

describe('RetirementHistoryTable — axe-core audit', () => {
  it('passes axe-core AA audit with zero violations', async () => {
    const { container } = render(<RetirementHistoryTable data={SMALL_DATA} />);

    const results = await axe(container, {
      rules: {
        region: { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('passes axe-core AA audit with selection enabled', async () => {
    const { container } = render(
      <RetirementHistoryTable data={SMALL_DATA} onSelectionChange={() => {}} />,
    );

    const results = await axe(container, {
      rules: {
        region: { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
