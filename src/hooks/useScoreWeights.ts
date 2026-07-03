'use client';

import { useState, useEffect } from 'react';
import type { ScoreWeights } from '@/types/conditions';
import { SCORE_WEIGHTS } from '@/config/thresholds';

const BASE_STORAGE_KEY = 'swimmingly-score-weights';

function storageKeyFor(prefix: string): string {
  return prefix ? `${BASE_STORAGE_KEY}-${prefix}` : BASE_STORAGE_KEY;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  waterQuality: SCORE_WEIGHTS.waterQuality,
  tideAndCurrent: SCORE_WEIGHTS.tideAndCurrent,
  waves: SCORE_WEIGHTS.waves,
  weather: SCORE_WEIGHTS.weather,
};

interface UseScoreWeightsReturn {
  weights: ScoreWeights;
  setWeights: (weights: ScoreWeights) => void;
  resetWeights: () => void;
  isLoaded: boolean;
  isCustom: boolean;
}

function isValidWeights(value: unknown): value is ScoreWeights {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  const keys: (keyof ScoreWeights)[] = ['waterQuality', 'tideAndCurrent', 'waves', 'weather'];
  for (const key of keys) {
    if (typeof obj[key] !== 'number' || obj[key] < 0 || obj[key] > 100) return false;
  }
  const sum = keys.reduce((s, k) => s + (obj[k] as number), 0);
  return Math.abs(sum - 100) < 2; // allow small rounding drift
}

function areWeightsEqual(a: ScoreWeights, b: ScoreWeights): boolean {
  return (
    a.waterQuality === b.waterQuality &&
    a.tideAndCurrent === b.tideAndCurrent &&
    a.waves === b.waves &&
    a.weather === b.weather
  );
}

/**
 * @param storageKeyPrefix Distinguishes weights between locations (e.g. 'lajollacove').
 * Defaults to '' to preserve Aquatic Park's existing storage key.
 */
export function useScoreWeights(storageKeyPrefix: string = ''): UseScoreWeightsReturn {
  const storageKey = storageKeyFor(storageKeyPrefix);
  const [weights, setWeightsState] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidWeights(parsed)) {
          setWeightsState(parsed);
        }
      }
    } catch {
      console.warn('Failed to load score weights from localStorage');
    } finally {
      setIsLoaded(true);
    }
  }, [storageKey]);

  const setWeights = (newWeights: ScoreWeights) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newWeights));
      setWeightsState(newWeights);
    } catch {
      console.warn('Failed to save score weights to localStorage');
      setWeightsState(newWeights);
    }
  };

  const resetWeights = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setWeightsState(DEFAULT_WEIGHTS);
  };

  const isCustom = !areWeightsEqual(weights, DEFAULT_WEIGHTS);

  return { weights, setWeights, resetWeights, isLoaded, isCustom };
}
