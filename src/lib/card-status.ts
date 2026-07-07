/**
 * Maps score factor values to conditions card display statuses.
 * These statuses control the card's background/border colors:
 *   good    → green
 *   info    → blue
 *   warning → yellow/amber
 *   danger  → red
 */

import { SAFETY_THRESHOLDS } from '@/config/thresholds';
import type { CardStatus } from './status-colors';

export type { CardStatus };

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

export function mapWaterTempStatus(tempF: number): CardStatus {
  const wt = SAFETY_THRESHOLDS.waterTemp;
  if (tempF < wt.cold) return 'danger';
  if (tempF < wt.cool) return 'warning';
  if (tempF < wt.comfortable) return 'info';
  return 'good';
}

export function mapBarometricPressureStatus(mb: number): CardStatus {
  const bp = SAFETY_THRESHOLDS.barometricPressure;
  if (mb >= bp.veryHigh) return 'good';
  if (mb >= bp.standard) return 'info';
  if (mb >= bp.low) return 'warning';
  return 'danger';
}

export function mapWindSpeedStatus(speedMph: number): CardStatus {
  const w = SAFETY_THRESHOLDS.wind;
  if (speedMph < w.calm) return 'good';
  if (speedMph < w.light) return 'info';
  if (speedMph < w.moderate) return 'warning';
  return 'danger';
}

export function mapSsoStatus(daysSinceSSO: number | undefined): CardStatus {
  if (daysSinceSSO === undefined) return 'info';
  const sso = SAFETY_THRESHOLDS.sso;
  if (daysSinceSSO <= sso.cautionDays) return 'danger';
  if (daysSinceSSO <= sso.warningDays) return 'warning';
  return 'info';
}

export function mapBacteriaStatus(count: number, safeLimit: number, dangerousLimit: number): CardStatus {
  if (count > dangerousLimit) return 'danger';
  if (count > safeLimit) return 'warning';
  return 'good';
}

export function mapRainfallStatus(inches: number): CardStatus {
  const r = SAFETY_THRESHOLDS.rainfall;
  if (inches >= r.heavy) return 'danger';
  if (inches >= r.moderate) return 'warning';
  return 'good';
}
