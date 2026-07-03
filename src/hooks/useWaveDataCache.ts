/**
 * Custom hook for managing wave data caching
 * Caches wave data to localStorage with 5-minute expiration
 */

'use client';

import { useState, useEffect } from 'react';
import type { WaveData } from '@/types/conditions';

const BASE_STORAGE_KEY = 'swimmingly-wave-cache';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function storageKeyFor(prefix: string): string {
  return prefix ? `${BASE_STORAGE_KEY}-${prefix}` : BASE_STORAGE_KEY;
}

interface CachedWaveData {
  data: WaveData;
  cachedAt: number;
  expiresAt: number;
}

interface UseWaveDataCacheReturn {
  cachedData: WaveData | null;
  setCachedData: (data: WaveData) => void;
  isCacheValid: boolean;
}

/**
 * Get wave data from localStorage cache
 * Returns null if cache is expired or invalid
 */
function getWaveDataFromCache(storageKey: string): WaveData | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;

    const cached: CachedWaveData = JSON.parse(stored);
    const now = Date.now();

    // Check if cache is expired
    if (now >= cached.expiresAt) {
      // Cache expired, remove it
      localStorage.removeItem(storageKey);
      return null;
    }

    return cached.data;
  } catch (error) {
    console.warn('Failed to load wave data from cache:', error);
    return null;
  }
}

/**
 * Save wave data to localStorage cache
 * Sets expiration time to 5 minutes from now
 */
function saveWaveDataToCache(storageKey: string, data: WaveData): void {
  try {
    const now = Date.now();
    const cached: CachedWaveData = {
      data,
      cachedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    };
    localStorage.setItem(storageKey, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to save wave data to cache:', error);
  }
}

/**
 * Hook to manage wave data caching with localStorage persistence
 * SSR-safe: initializes on client side only
 *
 * @param storageKeyPrefix Distinguishes caches between locations (e.g. 'lajollacove').
 * Defaults to '' to preserve Aquatic Park's existing storage key.
 */
export function useWaveDataCache(storageKeyPrefix: string = ''): UseWaveDataCacheReturn {
  const storageKey = storageKeyFor(storageKeyPrefix);
  const [cachedData, setCachedDataState] = useState<WaveData | null>(null);
  const [isCacheValid, setIsCacheValid] = useState(false);

  // Load cached data from localStorage on mount (client-side only)
  useEffect(() => {
    const cached = getWaveDataFromCache(storageKey);
    if (cached) {
      setCachedDataState(cached);
      setIsCacheValid(true);
    }
  }, [storageKey]);

  // Update cached data and persist to localStorage
  const setCachedData = (data: WaveData) => {
    saveWaveDataToCache(storageKey, data);
    setCachedDataState(data);
    setIsCacheValid(true);
  };

  return {
    cachedData,
    setCachedData,
    isCacheValid,
  };
}
