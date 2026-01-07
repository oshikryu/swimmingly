/**
 * Custom hook for managing conditions data caching
 * Caches all conditions data to localStorage with 5-minute expiration
 */

'use client';

import { useState, useEffect } from 'react';
import type { CurrentConditions, CachedData } from '@/types/conditions';

const STORAGE_KEY = 'swimmingly-conditions-cache';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface UseConditionsCacheReturn {
  cachedData: CurrentConditions | null;
  setCachedData: (data: CurrentConditions) => void;
  isCacheValid: boolean;
  clearCache: () => void;
}

/**
 * Get conditions data from localStorage cache
 * Returns null if cache is expired or invalid
 */
function getConditionsFromCache(): CurrentConditions | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const cached: CachedData<CurrentConditions> = JSON.parse(stored);
    const now = Date.now();

    // Check if cache is expired
    if (now >= cached.expiresAt) {
      // Cache expired, remove it
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return cached.data;
  } catch (error) {
    console.warn('Failed to load conditions from cache:', error);
    return null;
  }
}

/**
 * Save conditions data to localStorage cache
 * Sets expiration time to 5 minutes from now
 */
function saveConditionsToCache(data: CurrentConditions): void {
  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const cached: CachedData<CurrentConditions> = {
      data,
      cachedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to save conditions to cache:', error);
  }
}

/**
 * Clear conditions cache from localStorage
 */
function clearConditionsCache(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear conditions cache:', error);
  }
}

/**
 * Hook to manage conditions data caching with localStorage persistence
 * SSR-safe: initializes on client side only
 */
export function useConditionsCache(): UseConditionsCacheReturn {
  const [cachedData, setCachedDataState] = useState<CurrentConditions | null>(null);
  const [isCacheValid, setIsCacheValid] = useState(false);

  // Load cached data from localStorage on mount (client-side only)
  useEffect(() => {
    const cached = getConditionsFromCache();
    if (cached) {
      setCachedDataState(cached);
      setIsCacheValid(true);
    }
  }, []);

  // Update cached data and persist to localStorage
  const setCachedData = (data: CurrentConditions) => {
    saveConditionsToCache(data);
    setCachedDataState(data);
    setIsCacheValid(true);
  };

  // Clear cache
  const clearCache = () => {
    clearConditionsCache();
    setCachedDataState(null);
    setIsCacheValid(false);
  };

  return {
    cachedData,
    setCachedData,
    isCacheValid,
    clearCache,
  };
}
