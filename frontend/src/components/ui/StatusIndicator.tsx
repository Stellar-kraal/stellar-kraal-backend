'use client';

/**
 * Accessible status indicator badge.
 *
 * Renders an icon + colour + visible text label so that colour is never
 * the sole differentiator (WCAG 1.4.1). Uses `role="status"` with an
 * `aria-label` combining an optional context prefix and the status label.
 *
 * @example
 * <StatusIndicator status="active" ariaPrefix="Credit status" />
 */

import { type CSSProperties } from 'react';
import { STATUS_CONFIG, type StatusType } from './types';

export interface StatusIndicatorProps {
  /** The status value to display */
  status: StatusType;
  /** Optional prefix for the aria-label (e.g. "Credit status") */
  ariaPrefix?: string;
}

const badgeStyle = (color: string, bgColor: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 10px',
  borderRadius: '9999px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  lineHeight: '1.25rem',
  color,
  backgroundColor: bgColor,
  whiteSpace: 'nowrap',
});

const iconStyle: CSSProperties = {
  flexShrink: 0,
  width: '16px',
  height: '16px',
};

export function StatusIndicator({ status, ariaPrefix }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const ariaLabel = ariaPrefix
    ? `${ariaPrefix}: ${config.label}`
    : config.label;

  return (
    <span role="status" aria-label={ariaLabel} style={badgeStyle(config.color, config.bgColor)}>
      <svg
        aria-hidden="true"
        focusable="false"
        style={iconStyle}
        viewBox={config.iconViewBox ?? '0 0 16 16'}
        fill="currentColor"
      >
        <path d={config.iconPath} />
      </svg>
      <span>{config.label}</span>
    </span>
  );
}
