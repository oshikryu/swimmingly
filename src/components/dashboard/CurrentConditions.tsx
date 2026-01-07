'use client';

import { useEffect, useState } from 'react';
import type { CurrentConditions as CurrentConditionsType } from '@/types/conditions';
import SwimScore from './SwimScore';
import ConditionsCard from './ConditionsCard';

export default function CurrentConditions() {
  const [conditions, setConditions] = useState<CurrentConditionsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConditions();
    // Refresh every 5 minutes
    const interval = setInterval(fetchConditions, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchConditions() {
    try {
      const response = await fetch('/api/conditions');
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
          onClick={fetchConditions}
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

  // Safely get numeric values with fallbacks
  const waveHeight = waves?.waveHeightFeet ?? 0;
  const swellPeriod = waves?.swellPeriodSeconds ?? null;
  const tideHeight = tide?.heightFeet ?? 0;
  const windSpeed = weather?.windSpeedMph ?? 0;
  const temperature = weather?.temperatureF ?? 0;
  const visibility = weather?.visibilityMiles ?? 0;

  // Determine status for each condition
  const tideStatus = score.factors.tideAndCurrent.favorable ? 'good' : 'warning';
  const waveStatus = waveHeight < 3 ? 'good' : waveHeight < 5 ? 'warning' : 'danger';
  const weatherStatus = windSpeed < 15 ? 'good' : windSpeed < 25 ? 'warning' : 'danger';
  const waterQualityStatus =
    waterQuality?.status === 'safe' ? 'good' :
    waterQuality?.status === 'advisory' ? 'warning' : 'danger';

  return (
    <div className="space-y-6">
      {/* Swim Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <SwimScore score={score} />
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
              `Phase: ${tide?.currentPhase || 'Unknown'}`,
              tide?.nextHigh ? `Next high: ${new Date(tide.nextHigh.timestamp).toLocaleTimeString()}` : '',
              tide?.nextLow ? `Next low: ${new Date(tide.nextLow.timestamp).toLocaleTimeString()}` : '',
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Waves"
            value={waveHeight.toFixed(1)}
            unit="ft"
            status={waveStatus}
            icon="🌊"
            details={[
              swellPeriod ? `Period: ${swellPeriod.toFixed(0)}s` : '',
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Wind"
            value={windSpeed.toFixed(0)}
            unit="mph"
            status={weatherStatus}
            icon="💨"
            details={[
              `Temp: ${temperature.toFixed(0)}°F`,
              `Visibility: ${visibility.toFixed(1)} mi`,
              weather?.conditions || 'Unknown',
            ]}
          />

          <ConditionsCard
            title="Water Quality"
            value={waterQuality?.status?.toUpperCase() || 'UNKNOWN'}
            status={waterQualityStatus}
            icon="💧"
            details={[
              waterQuality?.enterococcusCount
                ? `Bacteria: ${waterQuality.enterococcusCount} MPN/100ml`
                : 'No recent data',
              waterQuality?.notes || '',
            ].filter(Boolean)}
          />
        </div>
      </div>
    </div>
  );
}
