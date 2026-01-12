'use client';

import { useEffect, useState } from 'react';
import type { CurrentConditions as CurrentConditionsType } from '@/types/conditions';
import { useTidePreference } from '@/hooks/useTidePreference';
import { useConditionsCache } from '@/hooks/useConditionsCache';
import { SAFETY_THRESHOLDS } from '@/config/thresholds';
import SwimScore from './SwimScore';
import ConditionsCard from './ConditionsCard';

/**
 * Format timestamp for display
 * Shows relative time for recent data, absolute time for older data
 */
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60));

  if (diffMinutes === 0) return 'just now';
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CurrentConditions() {
  const [conditions, setConditions] = useState<CurrentConditionsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { preference, setPreference, isLoaded } = useTidePreference();
  const { cachedData, setCachedData, isCacheValid } = useConditionsCache();

  // Load cached data immediately on mount
  useEffect(() => {
    if (isCacheValid && cachedData) {
      setConditions(cachedData);
      setLoading(false);
    }
  }, [isCacheValid, cachedData]);

  // Fetch conditions when component mounts or preference changes
  useEffect(() => {
    // Only fetch when preference is loaded to avoid double-fetching
    if (isLoaded) {
      // If we have valid cache, fetch in background
      if (isCacheValid && cachedData) {
        fetchConditions(preference, true); // background fetch
      } else {
        fetchConditions(preference, false); // foreground fetch
      }
    }
  }, [isLoaded, preference]);

  // Setup auto-refresh interval
  useEffect(() => {
    // Refresh every 5 minutes
    const interval = setInterval(() => fetchConditions(preference, true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [preference]);

  async function fetchConditions(tidePreference: typeof preference, isBackgroundFetch = false) {
    try {
      // Only show loading state if not a background fetch
      if (!isBackgroundFetch) {
        setLoading(true);
      }

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

      // Only update cache and state if we have valid data
      // Don't overwrite good cached data with null/missing data
      if (data && data.tide && data.score) {
        setCachedData(data);
        setConditions(data);
        setError(null);
      } else {
        console.warn('Received incomplete data from API, keeping cached data');
        // If we have cached data, keep using it
        if (!conditions && cachedData) {
          setConditions(cachedData);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!isBackgroundFetch) {
        setLoading(false);
      }
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

  const { score, tide, current, weather, waves, waterQuality, damReleases } = conditions;

  // Get values from score factors with safe defaults (ensures sync with score calculation)
  const waveHeight = score?.factors?.waves?.heightFeet ?? 0;
  const swellPeriod = waves?.swellPeriodSeconds ?? null;
  const tideHeight = score?.factors?.tideAndCurrent?.tideHeight ?? 0;
  const currentSpeed = score?.factors?.tideAndCurrent?.currentSpeed ?? 0;
  const windSpeed = score?.factors?.weather?.windSpeed ?? 0;
  const temperature = score?.factors?.weather?.temperature ?? 0;

  // Determine if current is measured or calculated
  const isCurrentCalculated = current?.source === 'calculated-from-tide-rate';
  const currentSource = isCurrentCalculated ? '(estimated from tide)' : '';

  // Determine wind data source and format display
  const windSource = weather?.source || 'unavailable';
  const isOpenMeteoWind = windSource.includes('open-meteo');
  const windSourceDisplay = isOpenMeteoWind ? 'Open-Meteo' : windSource === 'NOAA-NWS' ? 'NOAA' : '';
  const windGust = weather?.windGustMph;
  const windDirection = weather?.windDirection;

  // Determine latest timestamp for tide/current data
  const tideTimestamp = tide?.timestamp ? new Date(tide.timestamp) : null;
  const currentTimestamp = current?.timestamp ? new Date(current.timestamp) : null;
  const latestTideCurrentTimestamp = tideTimestamp && currentTimestamp
    ? (tideTimestamp > currentTimestamp ? tideTimestamp : currentTimestamp)
    : (tideTimestamp || currentTimestamp);

  // Check if using cached data (comparing with conditions.dataFreshness)
  const tideDataAge = conditions.dataFreshness?.tide
    ? Math.floor((Date.now() - new Date(conditions.dataFreshness.tide).getTime()) / (1000 * 60))
    : null;
  const isUsingCachedTideData = tideDataAge && tideDataAge > 5; // More than 5 minutes old = likely cached

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

  const mapDamReleasesStatus = (level: string): 'good' | 'warning' | 'danger' | 'info' => {
    if (level === 'low') return 'good';
    if (level === 'moderate') return 'info';
    if (level === 'high') return 'warning';
    if (level === 'extreme') return 'danger';
    return 'info';
  };

  // Use statuses from score factors with safe defaults (ensures sync with score calculation)
  const tideStatus = score?.factors?.tideAndCurrent?.favorable ? 'good' : 'warning';
  const waveStatus = mapWaveStatus(score?.factors?.waves?.status ?? 'calm');
  const weatherStatus = mapWeatherStatus(score?.factors?.weather?.windCondition ?? 'calm');
  const waterQualityStatus = mapWaterQualityStatus(score?.factors?.waterQuality?.status ?? 'safe');
  const damReleasesStatus = mapDamReleasesStatus(score?.factors?.damReleases?.releaseLevel ?? 'low');

  // Clear localStorage and refresh
  const handleClearCache = () => {
    if (confirm('Clear all cached data and refresh?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Clear Cache Button */}
      <div className="flex justify-end">
        <button
          onClick={handleClearCache}
          className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md transition-colors border border-gray-300 dark:border-gray-600"
          title="Clear cached data and refresh"
        >
          🗑️ Clear Cache
        </button>
      </div>

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
            title="Tide & Current"
            value={tideHeight.toFixed(1)}
            unit="ft"
            threshold={`Slack <${SAFETY_THRESHOLDS.current.slack}kt, Moderate <${SAFETY_THRESHOLDS.current.moderate}kt, Strong <${SAFETY_THRESHOLDS.current.strong}kt, Dangerous >${SAFETY_THRESHOLDS.current.veryStrong}kt`}
            status={tideStatus}
            icon="🌊"
            details={[
              `Phase: ${score?.factors?.tideAndCurrent?.phase ?? 'unknown'}`,
              `Current: ${currentSpeed.toFixed(1)} knots ${currentSource}`,
              // Sort next high/low by timestamp - show whichever comes first
              ...((() => {
                const tideEvents = [];
                if (tide?.nextHigh) {
                  tideEvents.push({
                    label: 'Next high',
                    timestamp: new Date(tide.nextHigh.timestamp),
                    heightFeet: tide.nextHigh.heightFeet
                  });
                }
                if (tide?.nextLow) {
                  tideEvents.push({
                    label: 'Next low',
                    timestamp: new Date(tide.nextLow.timestamp),
                    heightFeet: tide.nextLow.heightFeet
                  });
                }
                // Sort by timestamp (earliest first)
                tideEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                return tideEvents.map(event =>
                  `${event.label}: ${event.timestamp.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} (${event.heightFeet.toFixed(1)} ft)`
                );
              })()),
              latestTideCurrentTimestamp ? `Updated: ${latestTideCurrentTimestamp.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST${isUsingCachedTideData ? ' (cached)' : ''}` : '',
              ...(score?.factors?.tideAndCurrent?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Waves"
            value={waveHeight.toFixed(1)}
            unit="ft"
            threshold={`Calm <${SAFETY_THRESHOLDS.waves.calm}ft, Safe <${SAFETY_THRESHOLDS.waves.safe}ft, Moderate <${SAFETY_THRESHOLDS.waves.moderate}ft, Rough <${SAFETY_THRESHOLDS.waves.rough}ft`}
            status={waveStatus}
            icon="🌊"
            details={[
              `Status: ${score?.factors?.waves?.status ?? 'unknown'}`,
              swellPeriod ? `Period: ${swellPeriod.toFixed(0)}s` : '',
              conditions.waves?.source ? `Station: ${conditions.waves.source}` : '',
              conditions.waves?.timestamp ? `Updated: ${new Date(conditions.waves.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST` : '',
              ...(score?.factors?.waves?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Wind"
            value={windSpeed.toFixed(0)}
            unit="mph"
            threshold={`Calm <${SAFETY_THRESHOLDS.wind.calm}mph, Light <${SAFETY_THRESHOLDS.wind.light}mph, Moderate <${SAFETY_THRESHOLDS.wind.moderate}mph, Strong <${SAFETY_THRESHOLDS.wind.strong}mph`}
            status={weatherStatus}
            icon="💨"
            details={[
              `Condition: ${score?.factors?.weather?.windCondition ?? 'unknown'}`,
              windGust ? `Gusts: ${windGust.toFixed(0)} mph` : '',
              windDirection !== undefined ? `Direction: ${windDirection}°` : '',
              `Air Temp: ${temperature.toFixed(0)}°F`,
              weather?.timestamp ? `Updated: ${formatTimestamp(weather.timestamp)}` : '',
              windSourceDisplay ? `Source: ${windSourceDisplay}` : '',
              ...(score?.factors?.weather?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Water Quality"
            value={(score?.factors?.waterQuality?.status ?? 'unknown').toUpperCase()}
            threshold={`Safe <${SAFETY_THRESHOLDS.waterQuality.enterococcus.safe}, Advisory <${SAFETY_THRESHOLDS.waterQuality.enterococcus.advisory}, Dangerous >${SAFETY_THRESHOLDS.waterQuality.enterococcus.dangerous} MPN/100ml`}
            status={waterQualityStatus}
            icon="💧"
            details={[
              `Bacteria: ${score?.factors?.waterQuality?.bacteriaLevel ?? 'unknown'}`,
              waterQuality?.enterococcusCount !== undefined
                ? `Enterococcus: ${waterQuality.enterococcusCount.toFixed(0)} MPN/100ml`
                : '',
              waterQuality?.coliformCount !== undefined
                ? `Total Coliform: ${waterQuality.coliformCount.toFixed(0)} MPN/100ml`
                : '',
              score?.factors?.waterQuality?.recentSSO
                ? `SSO ${score?.factors?.waterQuality?.daysSinceSSO ?? '?'} days ago`
                : '',
              waterQuality?.notes || '', // Shows "Sampled X days ago"
              waterQuality?.source ? `Source: ${waterQuality.source}` : '', // Show which API
              waterQuality?.source === 'SF Beach Water Quality'
                ? '🔗 https://data.sfgov.org/Energy-and-Environment/Beach-Water-Quality-Monitoring/v3fv-x3ux'
                : '',
              ...(score?.factors?.waterQuality?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Dam Releases"
            value={score?.factors?.damReleases?.totalFlowCFS
              ? Math.round(score.factors.damReleases.totalFlowCFS / 1000).toString() + 'k'
              : '0'}
            unit="CFS"
            threshold={`Low <${SAFETY_THRESHOLDS.damReleases.moderate.toLocaleString()}CFS, Moderate <${SAFETY_THRESHOLDS.damReleases.high.toLocaleString()}CFS, High <${SAFETY_THRESHOLDS.damReleases.extreme.toLocaleString()}CFS`}
            status={damReleasesStatus}
            icon="🏔️"
            details={[
              `Level: ${score?.factors?.damReleases?.releaseLevel ?? 'unknown'}`,

              // Current snapshot
              `Current: ${score?.factors?.damReleases?.totalFlowCFS?.toLocaleString() ?? '0'} CFS`,

              // 48-hour historical context
              damReleases?.historical48h?.averageFlowCFS
                ? `48h Average: ${Math.round(damReleases.historical48h.averageFlowCFS).toLocaleString()} CFS`
                : '',

              damReleases?.historical48h?.peakFlowCFS
                ? `48h Peak: ${Math.round(damReleases.historical48h.peakFlowCFS).toLocaleString()} CFS`
                : '',

              // Trend indicator with emoji
              damReleases?.historical48h?.trendDirection
                ? `Trend: ${damReleases.historical48h.trendDirection === 'increasing' ? '↗️ Increasing'
                    : damReleases.historical48h.trendDirection === 'decreasing' ? '↘️ Decreasing'
                    : '→ Stable'}`
                : '',

              // Explanatory note about time lag
              '⏱️ Dam releases take 24-48 hours to reach SF Bay',
              'Score reflects recent releases affecting current conditions',

              // Top source
              `Top Source: ${score?.factors?.damReleases?.topContributor ?? 'Unknown'}`,

              // Individual dam contributions with 48h peak
              ...(damReleases?.dams
                .filter(dam => dam.current.flowCFS > 0)
                .sort((a, b) => b.current.flowCFS - a.current.flowCFS)
                .slice(0, 3)  // Top 3 dams
                .map(dam =>
                  `${dam.name}: ${Math.round(dam.current.flowCFS).toLocaleString()} CFS (${dam.current.percentOfTotal.toFixed(0)}%)` +
                  (dam.historical48h?.peakFlowCFS ? ` - 48h peak: ${Math.round(dam.historical48h.peakFlowCFS).toLocaleString()}` : '')
                )
                || []
              ),

              // Latest data timestamp
              damReleases?.latestDataTimestamp
                ? `Latest Data: ${new Date(damReleases.latestDataTimestamp).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST`
                : '',

              // Issues/warnings from scoring algorithm
              ...(score?.factors?.damReleases?.issues ?? []),
            ].filter(Boolean)}
          />
        </div>
      </div>
    </div>
  );
}
