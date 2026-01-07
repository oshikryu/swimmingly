'use client';

import { useEffect, useState } from 'react';
import type { CurrentConditions as CurrentConditionsType } from '@/types/conditions';
import { useTidePreference } from '@/hooks/useTidePreference';
import SwimScore from './SwimScore';
import ConditionsCard from './ConditionsCard';

export default function CurrentConditions() {
  const [conditions, setConditions] = useState<CurrentConditionsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { preference, setPreference, isLoaded } = useTidePreference();

  // Fetch conditions when component mounts or preference changes
  useEffect(() => {
    // Only fetch when preference is loaded to avoid double-fetching
    if (isLoaded) {
      fetchConditions(preference);
    }
  }, [isLoaded, preference]);

  // Setup auto-refresh interval
  useEffect(() => {
    // Refresh every 5 minutes
    const interval = setInterval(() => fetchConditions(preference), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [preference]);

  async function fetchConditions(tidePreference: typeof preference) {
    try {
      // Include tide preference in API call
      const params = new URLSearchParams();
      if (tidePreference) {
        params.append('tidePhasePreference', tidePreference);
      }

      const url = `/api/conditions${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch conditions');
      }
      const data = await response.json();
      setConditions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // Handle tide preference change from SwimScore component
  const handleTidePreferenceChange = (newPreference: typeof preference) => {
    // Update localStorage and state
    setPreference(newPreference);
    // Immediately refetch with new preference
    setLoading(true);
    fetchConditions(newPreference);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading conditions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          Error Loading Data
        </h3>
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <button
          onClick={() => fetchConditions(preference)}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!conditions) {
    return null;
  }

  const { score, tide, weather, waves, waterQuality } = conditions;

  // Get values from score factors with safe defaults (ensures sync with score calculation)
  const waveHeight = score?.factors?.waves?.heightFeet ?? 0;
  const swellPeriod = waves?.swellPeriodSeconds ?? null;
  const tideHeight = score?.factors?.tideAndCurrent?.tideHeight ?? 0;
  const windSpeed = score?.factors?.weather?.windSpeed ?? 0;
  const temperature = score?.factors?.weather?.temperature ?? 0;
  const visibility = score?.factors?.visibility?.miles ?? 0;

  // Map score factor statuses to card statuses
  const mapWaveStatus = (status: string): 'good' | 'warning' | 'danger' | 'info' => {
    if (status === 'calm') return 'good';
    if (status === 'moderate') return 'warning';
    if (status === 'rough' || status === 'dangerous') return 'danger';
    return 'info';
  };

  const mapWeatherStatus = (condition: string): 'good' | 'warning' | 'danger' | 'info' => {
    if (condition === 'calm' || condition === 'light') return 'good';
    if (condition === 'moderate') return 'warning';
    if (condition === 'strong') return 'danger';
    return 'info';
  };

  const mapWaterQualityStatus = (status: string): 'good' | 'warning' | 'danger' | 'info' => {
    if (status === 'safe') return 'good';
    if (status === 'advisory') return 'warning';
    if (status === 'warning' || status === 'dangerous') return 'danger';
    return 'info';
  };

  // Use statuses from score factors with safe defaults (ensures sync with score calculation)
  const tideStatus = score?.factors?.tideAndCurrent?.favorable ? 'good' : 'warning';
  const waveStatus = mapWaveStatus(score?.factors?.waves?.status ?? 'calm');
  const weatherStatus = mapWeatherStatus(score?.factors?.weather?.windCondition ?? 'calm');
  const waterQualityStatus = mapWaterQualityStatus(score?.factors?.waterQuality?.status ?? 'safe');

  return (
    <div className="space-y-6">
      {/* Swim Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <SwimScore
            score={score}
            tidePreference={preference}
            onTidePreferenceChange={handleTidePreferenceChange}
            isPreferenceLoaded={isLoaded}
          />
        </div>

        {/* Condition Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConditionsCard
            title="Tide"
            value={tideHeight.toFixed(1)}
            unit="ft"
            status={tideStatus}
            icon="🌊"
            details={[
              `Phase: ${score?.factors?.tideAndCurrent?.phase ?? 'unknown'}`,
              `Current: ${(score?.factors?.tideAndCurrent?.currentSpeed ?? 0).toFixed(1)} knots`,
              tide?.nextHigh ? `Next high: ${new Date(tide.nextHigh.timestamp).toLocaleTimeString()}` : '',
              tide?.nextLow ? `Next low: ${new Date(tide.nextLow.timestamp).toLocaleTimeString()}` : '',
              ...(score?.factors?.tideAndCurrent?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Waves"
            value={waveHeight.toFixed(1)}
            unit="ft"
            status={waveStatus}
            icon="🌊"
            details={[
              `Status: ${score?.factors?.waves?.status ?? 'unknown'}`,
              swellPeriod ? `Period: ${swellPeriod.toFixed(0)}s` : '',
              ...(score?.factors?.waves?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Wind"
            value={windSpeed.toFixed(0)}
            unit="mph"
            status={weatherStatus}
            icon="💨"
            details={[
              `Condition: ${score?.factors?.weather?.windCondition ?? 'unknown'}`,
              `Temp: ${temperature.toFixed(0)}°F`,
              `Visibility: ${visibility.toFixed(1)} mi (${score?.factors?.visibility?.status ?? 'unknown'})`,
              weather?.conditions || 'Unknown',
              ...(score?.factors?.weather?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Water Quality"
            value={(score?.factors?.waterQuality?.status ?? 'unknown').toUpperCase()}
            status={waterQualityStatus}
            icon="💧"
            details={[
              `Bacteria: ${score?.factors?.waterQuality?.bacteriaLevel ?? 'unknown'}`,
              score?.factors?.waterQuality?.recentSSO
                ? `SSO ${score?.factors?.waterQuality?.daysSinceSSO ?? '?'} days ago`
                : '',
              waterQuality?.notes || '',
              ...(score?.factors?.waterQuality?.issues ?? []),
            ].filter(Boolean)}
          />
        </div>
      </div>
    </div>
  );
}
