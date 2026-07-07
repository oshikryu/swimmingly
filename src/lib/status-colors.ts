/**
 * Single source of truth for status → color mapping across the app.
 * Both per-card statuses and the overall score gauge pull from this palette
 * so a given severity always renders the same hue everywhere.
 */

export type CardStatus = 'good' | 'warning' | 'danger' | 'info';

/** CardStatus plus one extra tier only needed for the 5-band swim score gauge. */
export type ScoreSeverity = CardStatus | 'critical';

export interface StatusPalette {
  /** Card background + border (light & dark) */
  card: string;
  /** Primary big value text color (light & dark) */
  text: string;
  /** Threshold-badge / colored-detail-line text color (light & dark) */
  badge: string;
  /** Hex for inline styles (conic-gradient gauge, etc.) */
  hex: string;
}

export const STATUS_PALETTE: Record<ScoreSeverity, StatusPalette> = {
  good: {
    card: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
    text: 'text-green-800 dark:text-green-200',
    badge: 'text-green-600 dark:text-green-400',
    hex: '#22c55e',
  },
  info: {
    card: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-200',
    badge: 'text-blue-600 dark:text-blue-400',
    hex: '#3b82f6',
  },
  warning: {
    card: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
    text: 'text-yellow-800 dark:text-yellow-200',
    badge: 'text-yellow-600 dark:text-yellow-400',
    hex: '#f59e0b',
  },
  danger: {
    card: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    badge: 'text-red-600 dark:text-red-400',
    hex: '#ef4444',
  },
  critical: {
    card: 'bg-red-100 border-red-400 dark:bg-red-950/40 dark:border-red-700',
    text: 'text-red-900 dark:text-red-300',
    badge: 'text-red-800 dark:text-red-300',
    hex: '#991b1b',
  },
};

/** Bold marks "needs attention" — a signal axis distinct from color. */
export function isEmphasized(status: ScoreSeverity | undefined): boolean {
  return status === 'warning' || status === 'danger' || status === 'critical';
}
