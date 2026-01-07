/**
 * Custom hook for managing wave data caching
 * Caches wave data to localStorage with 5-minute expiration
 */

'use client';

import { useState, useEffect } from 'react';
import type { WaveData } from '@/types/conditions';

const STORAGE_KEY = 'swimmingly-wave-cache';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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
function getWaveDataFromCache(): WaveData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const cached: CachedWaveData = JSON.parse(stored);
    const now = Date.now();

    // Check if cache is expired
    if (now >= cached.expiresAt) {
      // Cache expired, remove it
      localStorage.removeItem(STORAGE_KEY);
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
function saveWaveDataToCache(data: WaveData): void {
  try {
    const now = Date.now();
    const cached: CachedWaveData = {
      data,
      cachedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to save wave data to cache:', error);
  }
}

/**
 * Hook to manage wave data caching with localStorage persistence
 * SSR-safe: initializes on client side only
 */
export function useWaveDataCache(): UseWaveDataCacheReturn {
  const [cachedData, setCachedDataState] = useState<WaveData | null>(null);
  const [isCacheValid, setIsCacheValid] = useState(false);

  // Load cached data from localStorage on mount (client-side only)
  useEffect(() => {
    const cached = getWaveDataFromCache();
    if (cached) {
      setCachedDataState(cached);
      setIsCacheValid(true);
    }
  }, []);

  // Update cached data and persist to localStorage
  const setCachedData = (data: WaveData) => {
    saveWaveDataToCache(data);
    setCachedDataState(data);
    setIsCacheValid(true);
  };

  return {
    cachedData,
    setCachedData,
    isCacheValid,
  };
}
