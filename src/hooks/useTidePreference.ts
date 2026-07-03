/**
 * Custom hook for managing tide phase preference
 * Persists user's preferred tide phase to localStorage
 */

'use client';

import { useState, useEffect } from 'react';

export type TidePhaseType = 'slack' | 'flood' | 'ebb';

const BASE_STORAGE_KEY = 'swimmingly-tide-preference';
const DEFAULT_PREFERENCE: TidePhaseType = 'slack';

function storageKeyFor(prefix: string): string {
  return prefix ? `${BASE_STORAGE_KEY}-${prefix}` : BASE_STORAGE_KEY;
}

interface UseTidePreferenceReturn {
  preference: TidePhaseType;
  setPreference: (phase: TidePhaseType) => void;
  isLoaded: boolean;
}

/**
 * Hook to manage tide phase preference with localStorage persistence
 * SSR-safe: initializes on client side only
 *
 * @param storageKeyPrefix Distinguishes preferences between locations (e.g. 'lajollacove').
 * Defaults to '' to preserve Aquatic Park's existing storage key.
 */
export function useTidePreference(storageKeyPrefix: string = ''): UseTidePreferenceReturn {
  const storageKey = storageKeyFor(storageKeyPrefix);
  const [preference, setPreferenceState] = useState<TidePhaseType>(DEFAULT_PREFERENCE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preference from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && isValidTidePhase(stored)) {
        setPreferenceState(stored as TidePhaseType);
      }
    } catch (error) {
      // localStorage not available or error reading - use default
      console.warn('Failed to load tide preference from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, [storageKey]);

  // Update preference and persist to localStorage
  const setPreference = (phase: TidePhaseType) => {
    try {
      localStorage.setItem(storageKey, phase);
      setPreferenceState(phase);
    } catch (error) {
      // localStorage not available - still update state
      console.warn('Failed to save tide preference to localStorage:', error);
      setPreferenceState(phase);
    }
  };

  return {
    preference,
    setPreference,
    isLoaded,
  };
}

/**
 * Type guard to validate tide phase values
 */
function isValidTidePhase(value: unknown): value is TidePhaseType {
  return typeof value === 'string' && ['slack', 'flood', 'ebb'].includes(value);
}
