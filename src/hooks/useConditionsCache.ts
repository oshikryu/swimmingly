/**
 * Custom hook for managing conditions data caching
 * Caches all conditions data to localStorage with 5-minute expiration
 */

'use client';

import { useState, useEffect } from 'react';
import type { CurrentConditions, CachedData } from '@/types/conditions';

const BASE_STORAGE_KEY = 'swimmingly-conditions-cache';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function storageKeyFor(prefix: string): string {
  return prefix ? `${BASE_STORAGE_KEY}-${prefix}` : BASE_STORAGE_KEY;
}

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
function getConditionsFromCache(storageKey: string): CurrentConditions | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;

    const cached: CachedData<CurrentConditions> = JSON.parse(stored);
    const now = Date.now();

    // Check if cache is expired
    if (now >= cached.expiresAt) {
      // Cache expired, remove it
      localStorage.removeItem(storageKey);
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
function saveConditionsToCache(storageKey: string, data: CurrentConditions): void {
  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const cached: CachedData<CurrentConditions> = {
      data,
      cachedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    };
    localStorage.setItem(storageKey, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to save conditions to cache:', error);
  }
}

/**
 * Clear conditions cache from localStorage
 */
function clearConditionsCache(storageKey: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Failed to clear conditions cache:', error);
  }
}

/**
 * Hook to manage conditions data caching with localStorage persistence
 * SSR-safe: initializes on client side only
 *
 * @param storageKeyPrefix Distinguishes caches between locations (e.g. 'lajollacove').
 * Defaults to '' to preserve Aquatic Park's existing cache key.
 */
export function useConditionsCache(storageKeyPrefix: string = ''): UseConditionsCacheReturn {
  const storageKey = storageKeyFor(storageKeyPrefix);
  const [cachedData, setCachedDataState] = useState<CurrentConditions | null>(null);
  const [isCacheValid, setIsCacheValid] = useState(false);

  // Load cached data from localStorage on mount (client-side only)
  useEffect(() => {
    const cached = getConditionsFromCache(storageKey);
    if (cached) {
      setCachedDataState(cached);
      setIsCacheValid(true);
    }
  }, [storageKey]);

  // Update cached data and persist to localStorage
  const setCachedData = (data: CurrentConditions) => {
    saveConditionsToCache(storageKey, data);
    setCachedDataState(data);
    setIsCacheValid(true);
  };

  // Clear cache
  const clearCache = () => {
    clearConditionsCache(storageKey);
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
