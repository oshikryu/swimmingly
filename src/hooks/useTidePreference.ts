/**
 * Custom hook for managing tide phase preference
 * Persists user's preferred tide phase to localStorage
 */

'use client';

import { useState, useEffect } from 'react';

export type TidePhaseType = 'slack' | 'flood' | 'ebb';

const STORAGE_KEY = 'swimmingly-tide-preference';
const DEFAULT_PREFERENCE: TidePhaseType = 'slack';

interface UseTidePreferenceReturn {
  preference: TidePhaseType;
  setPreference: (phase: TidePhaseType) => void;
  isLoaded: boolean;
}

/**
 * Hook to manage tide phase preference with localStorage persistence
 * SSR-safe: initializes on client side only
 */
export function useTidePreference(): UseTidePreferenceReturn {
  const [preference, setPreferenceState] = useState<TidePhaseType>(DEFAULT_PREFERENCE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preference from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidTidePhase(stored)) {
        setPreferenceState(stored as TidePhaseType);
      }
    } catch (error) {
      // localStorage not available or error reading - use default
      console.warn('Failed to load tide preference from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Update preference and persist to localStorage
  const setPreference = (phase: TidePhaseType) => {
    try {
      localStorage.setItem(STORAGE_KEY, phase);
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
