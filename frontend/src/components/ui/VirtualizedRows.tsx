'use client';

/**
 * Virtual-scrolling utilities for data tables with > 100 rows.
 *
 * Provides a `useVirtualization` hook that computes which rows are
 * visible in the current scroll viewport (plus configurable overscan)
 * and a `VirtualizedContainer` wrapper that handles the scrollable
 * region with a spacer for total height.
 */

import {
  useState,
  useCallback,
  useRef,
  useMemo,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
  type RefObject,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseVirtualizationOptions<T> {
  /** Full array of data items */
  items: T[];
  /** Fixed height of each row in px */
  rowHeight: number;
  /** Visible height of the scroll container in px */
  containerHeight: number;
  /** Extra rows to render above/below the viewport (default 5) */
  overscan?: number;
}

export interface VirtualItem<T> {
  /** The data item */
  item: T;
  /** Index in the full dataset */
  index: number;
  /** Absolute-positioning style for the row */
  style: CSSProperties;
}

export interface UseVirtualizationReturn<T> {
  /** Items currently rendered (viewport + overscan) */
  visibleItems: VirtualItem<T>[];
  /** Total scrollable height in px */
  totalHeight: number;
  /** Ref to attach to the scroll container */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Scroll handler to attach to the container */
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
}

export function useVirtualization<T>({
  items,
  rowHeight,
  containerHeight,
  overscan = 5,
}: UseVirtualizationOptions<T>): UseVirtualizationReturn<T> {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  }, []);

  const totalHeight = items.length * rowHeight;

  const visibleItems = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const endIdx = Math.min(items.length, startIdx + visibleCount + overscan * 2);

    const result: VirtualItem<T>[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      result.push({
        item: items[i],
        index: i,
        style: {
          position: 'absolute',
          top: `${i * rowHeight}px`,
          left: 0,
          right: 0,
          height: `${rowHeight}px`,
          display: 'flex',
          alignItems: 'center',
        },
      });
    }
    return result;
  }, [items, rowHeight, containerHeight, scrollTop, overscan]);

  return { visibleItems, totalHeight, containerRef, onScroll };
}

/* ------------------------------------------------------------------ */
/*  Container component                                                */
/* ------------------------------------------------------------------ */

export interface VirtualizedContainerProps {
  /** Total scrollable height produced by the hook */
  totalHeight: number;
  /** Visible container height */
  containerHeight: number;
  /** Ref from the hook */
  containerRef: RefObject<HTMLDivElement | null>;
  /** onScroll from the hook */
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
  /** Rendered (visible) row elements */
  children: ReactNode;
  /** ARIA role for the container (e.g. "rowgroup") */
  role?: string;
  /** Accessible label */
  ariaLabel?: string;
}

const containerStyle = (height: number): CSSProperties => ({
  overflowY: 'auto',
  position: 'relative',
  height: `${height}px`,
  willChange: 'transform',
});

const spacerStyle = (totalHeight: number): CSSProperties => ({
  height: `${totalHeight}px`,
  position: 'relative',
  width: '100%',
});

export function VirtualizedContainer({
  totalHeight,
  containerHeight,
  containerRef,
  onScroll,
  children,
  role,
  ariaLabel,
}: VirtualizedContainerProps) {
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={containerStyle(containerHeight)}
      role={role}
      aria-label={ariaLabel}
      tabIndex={-1}
    >
      <div style={spacerStyle(totalHeight)}>{children}</div>
    </div>
  );
}
