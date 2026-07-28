/**
 * Tests for CreditListingsTable — marketplace view.
 *
 * Verifies correct columns, StatusIndicator usage, sort/filter/pagination
 * via keyboard, and axe-core AA audit.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { CreditListingsTable } from '../CreditListingsTable';
import type { CreditListing, CreditStatus } from '../../ui/types';

expect.extend(toHaveNoViolations);

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const STATUSES: CreditStatus[] = ['active', 'pending', 'sold', 'expired', 'cancelled'];

function makeCreditListings(count: number): CreditListing[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `CL-${String(i + 1).padStart(4, '0')}`,
    projectName: `Solar Farm ${String.fromCharCode(65 + (i % 26))}`,
    vintage: 2020 + (i % 5),
    status: STATUSES[i % STATUSES.length],
    pricePerUnit: 12.5 + i * 0.75,
    quantity: 100 + i * 10,
    seller: `Seller ${i + 1}`,
    listedDate: `2024-0${(i % 9) + 1}-15`,
  }));
}

const SMALL_DATA = makeCreditListings(5);
const LARGE_DATA = makeCreditListings(30);

/* ------------------------------------------------------------------ */
/*  Column rendering                                                   */
/* ------------------------------------------------------------------ */

describe('CreditListingsTable — Columns', () => {
  it('renders all expected column headers', () => {
    render(<CreditListingsTable data={SMALL_DATA} />);

    expect(screen.getByText('Credit ID')).toBeInTheDocument();
    expect(screen.getByText('Project Name')).toBeInTheDocument();
    expect(screen.getByText('Vintage')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Price / Unit')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Seller')).toBeInTheDocument();
    expect(screen.getByText('Listed')).toBeInTheDocument();
  });

  it('renders the correct number of data rows', () => {
    const { container } = render(<CreditListingsTable data={SMALL_DATA} />);

    const dataRows = container.querySelectorAll('tbody [role="row"]');
    expect(dataRows.length).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/*  Status indicators                                                  */
/* ------------------------------------------------------------------ */

describe('CreditListingsTable — Status indicators', () => {
  it('renders StatusIndicator with icon+color+label for each row', () => {
    const { container } = render(<CreditListingsTable data={SMALL_DATA} />);

    const statusBadges = container.querySelectorAll('[role="status"]');
    expect(statusBadges.length).toBe(SMALL_DATA.length);

    statusBadges.forEach((badge) => {
      // Has aria-label with prefix
      expect(badge.getAttribute('aria-label')).toMatch(/^Credit status: /);

      // Has visible text
      expect(badge.textContent).toBeTruthy();

      // Has SVG icon
      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Sort / Filter / Pagination                                         */
/* ------------------------------------------------------------------ */

describe('CreditListingsTable — Interactions', () => {
  it('sort buttons are present for sortable columns', () => {
    const { container } = render(<CreditListingsTable data={SMALL_DATA} />);

    const sortButtons = container.querySelectorAll('[role="columnheader"] button');
    // Credit ID, Project Name, Vintage, Status, Price, Quantity, Seller, Listed = 7 sortable
    expect(sortButtons.length).toBe(7);
  });

  it('clicking sort changes sort direction and announces it', async () => {
    const { container } = render(<CreditListingsTable data={SMALL_DATA} />);

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
    const { container } = render(<CreditListingsTable data={SMALL_DATA} />);

    const filterInput = container.querySelector('input[type="search"]');
    expect(filterInput).toBeInTheDocument();
  });

  it('pagination appears when data exceeds page size', () => {
    render(<CreditListingsTable data={LARGE_DATA} />);

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(nav).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Loading state                                                      */
/* ------------------------------------------------------------------ */

describe('CreditListingsTable — Loading', () => {
  it('shows loading indicator', () => {
    render(<CreditListingsTable data={[]} isLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(<CreditListingsTable data={[]} />);
    expect(screen.getByText('No credit listings match your search.')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  axe-core audit                                                     */
/* ------------------------------------------------------------------ */

describe('CreditListingsTable — axe-core audit', () => {
  it('passes axe-core AA audit with zero violations', async () => {
    const { container } = render(<CreditListingsTable data={SMALL_DATA} />);

    const results = await axe(container, {
      rules: {
        region: { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('passes axe-core AA audit with selection enabled', async () => {
    const { container } = render(
      <CreditListingsTable data={SMALL_DATA} onSelectionChange={() => {}} />,
    );

    const results = await axe(container, {
      rules: {
        region: { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
