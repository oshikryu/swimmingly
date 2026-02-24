/**
 * Maps score factor values to conditions card display statuses.
 * These statuses control the card's background/border colors:
 *   good    → green
 *   info    → blue
 *   warning → yellow/amber
 *   danger  → red
 */

import { SAFETY_THRESHOLDS } from '@/config/thresholds';

export type CardStatus = 'good' | 'warning' | 'danger' | 'info';

export function mapTideCurrentStatus(
  speedKnots: number,
  favorable: boolean,
): CardStatus {
  if (speedKnots >= SAFETY_THRESHOLDS.current.veryStrong) return 'danger';
  if (speedKnots >= SAFETY_THRESHOLDS.current.strong) return 'warning';
  if (speedKnots >= SAFETY_THRESHOLDS.current.moderate) {
    return favorable ? 'info' : 'warning';
  }
  return favorable ? 'good' : 'info';
}

export function mapWaveStatus(status: string): CardStatus {
  if (status === 'calm') return 'good';
  if (status === 'moderate') return 'warning';
  if (status === 'rough' || status === 'dangerous') return 'danger';
  return 'info';
}

export function mapWeatherStatus(condition: string): CardStatus {
  if (condition === 'calm') return 'good';
  if (condition === 'light') return 'info';
  if (condition === 'moderate') return 'warning';
  if (condition === 'strong') return 'danger';
  return 'info';
}

export function mapWaterQualityStatus(status: string): CardStatus {
  if (status === 'safe') return 'good';
  if (status === 'advisory') return 'warning';
  if (status === 'warning' || status === 'dangerous') return 'danger';
  return 'info';
}

export function mapDamReleasesStatus(level: string): CardStatus {
  if (level === 'low') return 'good';
  if (level === 'moderate') return 'info';
  if (level === 'high') return 'warning';
  if (level === 'extreme') return 'danger';
  return 'info';
}
