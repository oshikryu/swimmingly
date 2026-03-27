'use client';

import { useEffect, useState, useRef } from 'react';
import type { CurrentConditions as CurrentConditionsType, TidePhasePreferences, ScoreWeights } from '@/types/conditions';
import { useTidePreference } from '@/hooks/useTidePreference';
import { useScoreWeights } from '@/hooks/useScoreWeights';
import { useConditionsCache } from '@/hooks/useConditionsCache';
import { SAFETY_THRESHOLDS } from '@/config/thresholds';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';
import SwimScore from './SwimScore';
import ConditionsCard, { type ThresholdSegment } from './ConditionsCard';
import {
  mapTideCurrentStatus,
  mapWaveStatus,
  mapWeatherStatus,
  mapWaterQualityStatus,
  mapDamReleasesStatus,
} from '@/lib/card-status';

// Raw data type for client-side recalculation
interface RawConditionsData {
  tide: CurrentConditionsType['tide'];
  current: CurrentConditionsType['current'];
  weather: CurrentConditionsType['weather'];
  waves: CurrentConditionsType['waves'];
  waterQuality: CurrentConditionsType['waterQuality'];
  waterTemperature: CurrentConditionsType['waterTemperature'];
  damReleases: CurrentConditionsType['damReleases'];
  rainfall: CurrentConditionsType['rainfall'];
  dataFreshness: CurrentConditionsType['dataFreshness'];
  timestamp?: CurrentConditionsType['timestamp'];
}

/**
 * Convert wind direction in degrees to cardinal direction (N, NE, E, etc.)
 */
function degreesToCardinal(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
  return directions[index];
}

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
  const { weights, setWeights, resetWeights, isCustom: isWeightsCustom } = useScoreWeights();
  const { cachedData, setCachedData, isCacheValid } = useConditionsCache();
  // Store raw data for client-side recalculation
  const rawDataRef = useRef<RawConditionsData | null>(null);

  // Helper to check if we're using static data (GitHub Pages or static build mode)
  const isStaticMode = typeof window !== 'undefined' && (
    window.location.hostname.includes('github.io') ||
    process.env.NEXT_PUBLIC_BUILD_MODE === 'static'
  );

  // Build tide preferences object from preference string
  const buildTidePreferences = (pref: string | null): TidePhasePreferences | undefined => {
    if (!pref) return undefined;
    return {
      slack: pref === 'slack' ? 100 : 85,
      flood: pref === 'flood' ? 100 : 85,
      ebb: pref === 'ebb' ? 100 : 85,
    };
  };

  // Recalculate score client-side using raw data
  const recalculateScore = (rawData: RawConditionsData, tidePreference: string | null, customWeights?: ScoreWeights): CurrentConditionsType => {
    const customTidePreferences = buildTidePreferences(tidePreference);
    const newScore = calculateSwimScore(
      rawData.tide,
      rawData.current,
      rawData.weather,
      rawData.waves,
      rawData.waterQuality,
      [],
      rawData.damReleases ?? null,
      customTidePreferences,
      customWeights,
      rawData.rainfall ?? null
    );
    return {
      ...rawData,
      timestamp: rawData.timestamp || new Date(),
      score: newScore,
    };
  };

  // Load cached data immediately on mount
  useEffect(() => {
    if (isCacheValid && cachedData) {
      setConditions(cachedData);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('conditions-updated', {
        detail: { timestamp: cachedData.timestamp || new Date().toISOString() }
      }));
    }
  }, [isCacheValid, cachedData]);

  // Fetch conditions when component mounts or preference changes
  useEffect(() => {
    // Only fetch when preference is loaded to avoid double-fetching
    if (isLoaded) {
      // When raw data is available, recalculate client-side instead of refetching
      if (rawDataRef.current) {
        const recalculated = recalculateScore(rawDataRef.current, preference, isWeightsCustom ? weights : undefined);
        setConditions(recalculated);
        return;
      }
      // If we have valid cache, fetch in background
      if (isCacheValid && cachedData) {
        fetchConditions(preference, true); // background fetch
      } else {
        fetchConditions(preference, false); // foreground fetch
      }
    }
  }, [isLoaded, preference]);

  // Setup auto-refresh interval (disabled on GitHub Pages static site)
  useEffect(() => {
    // Only set up auto-refresh in dynamic mode (not on GitHub Pages)
    if (!isStaticMode) {
      // Refresh every 5 minutes
      const interval = setInterval(() => fetchConditions(preference, true), 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [preference, isStaticMode]);

  async function fetchConditions(tidePreference: typeof preference, isBackgroundFetch = false) {
    try {
      // Only show loading state if not a background fetch
      if (!isBackgroundFetch) {
        setLoading(true);
      }

      // Build the URL based on environment
      const url = isStaticMode
        ? '/swimmingly/static-data.json'
        : (() => {
            // Include tide preference in API call for dynamic mode
            const params = new URLSearchParams();
            if (tidePreference) {
              params.append('tidePhasePreference', tidePreference);
            }
            return `/api/conditions${params.toString() ? `?${params.toString()}` : ''}`;
          })();

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch conditions');
      }
      const data = await response.json();

      // Only update cache and state if we have valid data
      // Don't overwrite good cached data with null/missing data
      if (data && data.tide && data.score) {
        // Always store raw data for client-side recalculation
        rawDataRef.current = {
          tide: data.tide,
          current: data.current,
          weather: data.weather,
          waves: data.waves,
          waterQuality: data.waterQuality,
          waterTemperature: data.waterTemperature,
          damReleases: data.damReleases,
          rainfall: data.rainfall,
          dataFreshness: data.dataFreshness,
          timestamp: data.buildTimestamp || data.timestamp,
        };

        // Re-apply custom weights if set
        if (isWeightsCustom) {
          const recalculated = recalculateScore(rawDataRef.current, tidePreference, weights);
          setCachedData(recalculated);
          setConditions(recalculated);
        } else if (isStaticMode) {
          // Static mode: recalculate with tide preference
          const recalculated = recalculateScore(rawDataRef.current, tidePreference);
          setCachedData(recalculated);
          setConditions(recalculated);
        } else {
          setCachedData(data);
          setConditions(data);
        }
        setError(null);
        // Notify header of the data timestamp (prefer buildTimestamp for static builds)
        window.dispatchEvent(new CustomEvent('conditions-updated', {
          detail: { timestamp: data.buildTimestamp || data.timestamp || new Date().toISOString() }
        }));
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

  // Handle tide preference change - always recalculate client-side when raw data available
  const handleTidePreferenceChange = (newPreference: typeof preference) => {
    setPreference(newPreference);

    if (rawDataRef.current) {
      const recalculated = recalculateScore(rawDataRef.current, newPreference, isWeightsCustom ? weights : undefined);
      setConditions(recalculated);
      return;
    }

    // Fallback: refetch from API
    setLoading(true);
    fetchConditions(newPreference);
  };

  // Handle weight changes - always recalculate client-side
  const handleWeightsChange = (newWeights: ScoreWeights) => {
    setWeights(newWeights);

    if (rawDataRef.current) {
      const recalculated = recalculateScore(rawDataRef.current, preference, newWeights);
      setConditions(recalculated);
    }
  };

  // Handle weight reset
  const handleWeightsReset = () => {
    resetWeights();

    if (rawDataRef.current) {
      const recalculated = recalculateScore(rawDataRef.current, preference);
      setConditions(recalculated);
    }
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

  const { score, tide, current, weather, waves, waterQuality, damReleases, rainfall } = conditions;

  // Get values from score factors with safe defaults (ensures sync with score calculation)
  const waveHeight = score?.factors?.waves?.heightFeet ?? 0;
  const swellPeriod = waves?.swellPeriodSeconds ?? null;
  const tideHeight = score?.factors?.tideAndCurrent?.tideHeight ?? 0;
  const currentSpeedRaw = score?.factors?.tideAndCurrent?.currentSpeed ?? 0;
  const tidePhase = score?.factors?.tideAndCurrent?.phase ?? 'slack';
  // Display current as negative for ebb, positive for flood
  const currentSpeed = tidePhase === 'ebb' ? -currentSpeedRaw : currentSpeedRaw;
  const windSpeed = score?.factors?.weather?.windSpeed ?? 0;
  const temperature = score?.factors?.weather?.temperature ?? 0;

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

  // Use statuses from score factors with safe defaults (ensures sync with score calculation)
  const tideStatus = mapTideCurrentStatus(
    currentSpeedRaw,
    score?.factors?.tideAndCurrent?.favorable ?? true,
  );
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
      {/* Clear Cache Button - hidden on static site */}
      {!isStaticMode && (
        <div className="flex justify-end">
          <button
            onClick={handleClearCache}
            className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md transition-colors border border-gray-300 dark:border-gray-600"
            title="Clear cached data and refresh"
          >
            🗑️ Clear Cache
          </button>
        </div>
      )}

      {/* Swim Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <SwimScore
            score={score}
            tidePreference={preference}
            onTidePreferenceChange={handleTidePreferenceChange}
            isPreferenceLoaded={isLoaded}
            weights={weights}
            onWeightsChange={handleWeightsChange}
            onWeightsReset={handleWeightsReset}
            isWeightsCustom={isWeightsCustom}
          />
        </div>

        {/* Condition Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConditionsCard
            title="Tide & Current"
            value={tideHeight.toFixed(1)}
            unit="ft"
            secondaryValue={`${currentSpeed >= 0 ? '+' : ''}${currentSpeed.toFixed(2)}`}
            secondaryUnit="kt"
            thresholds={[
              { label: 'Slack', value: `<${SAFETY_THRESHOLDS.current.slack}kt`, status: 'good' },
              { label: 'Moderate', value: `<${SAFETY_THRESHOLDS.current.moderate}kt`, status: 'info' },
              { label: 'Strong', value: `<${SAFETY_THRESHOLDS.current.strong}kt`, status: 'warning' },
              { label: 'Dangerous', value: `>${SAFETY_THRESHOLDS.current.veryStrong}kt`, status: 'danger' },
            ] as ThresholdSegment[]}
            status={tideStatus}
            icon="🌊"
            details={[
              `Phase: ${score?.factors?.tideAndCurrent?.phase ?? 'unknown'} (${tidePhase === 'flood' ? '+' : tidePhase === 'ebb' ? '−' : '~'} current)`,
              // Show previous tide with styled label
              ...((() => {
                // Determine which previous tide is most recent (the one we just passed)
                const prevHigh = tide?.previousHigh ? { label: 'Prev high', timestamp: new Date(tide.previousHigh.timestamp), heightFeet: tide.previousHigh.heightFeet } : null;
                const prevLow = tide?.previousLow ? { label: 'Prev low', timestamp: new Date(tide.previousLow.timestamp), heightFeet: tide.previousLow.heightFeet } : null;
                // Show the most recent previous tide
                const mostRecentPrev = prevHigh && prevLow
                  ? (prevHigh.timestamp > prevLow.timestamp ? prevHigh : prevLow)
                  : (prevHigh || prevLow);
                return mostRecentPrev
                  ? [`↩ ${mostRecentPrev.label}: ${mostRecentPrev.timestamp.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} (${mostRecentPrev.heightFeet.toFixed(1)} ft)`]
                  : [];
              })()),
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
                  `→ ${event.label}: ${event.timestamp.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} (${event.heightFeet.toFixed(1)} ft)`
                );
              })()),
              latestTideCurrentTimestamp ? `Updated: ${latestTideCurrentTimestamp.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST${isUsingCachedTideData ? ' (cached)' : ''}` : '',
              ...(score?.factors?.tideAndCurrent?.issues?.filter(issue => !issue.toLowerCase().includes('current')) ?? []),
              // Data source link
              '🔗 https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9414290',
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Waves"
            value={waveHeight.toFixed(1)}
            unit="ft"
            thresholds={[
              { label: 'Calm', value: `<${SAFETY_THRESHOLDS.waves.calm}ft`, status: 'good' },
              { label: 'Safe', value: `<${SAFETY_THRESHOLDS.waves.safe}ft`, status: 'info' },
              { label: 'Moderate', value: `<${SAFETY_THRESHOLDS.waves.moderate}ft`, status: 'warning' },
              { label: 'Rough', value: `<${SAFETY_THRESHOLDS.waves.rough}ft`, status: 'danger' },
            ] as ThresholdSegment[]}
            status={waveStatus}
            icon="🌊"
            details={[
              `Status: ${score?.factors?.waves?.status ?? 'unknown'}`,
              swellPeriod ? `Period: ${swellPeriod.toFixed(0)}s` : '',
              conditions.waves?.source ? `Station: ${conditions.waves.source}` : '',
              conditions.waves?.timestamp ? `Updated: ${new Date(conditions.waves.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST` : '',
              // Add data source links
              conditions.waves?.source?.toLowerCase().includes('openwaterlog')
                ? '🔗 https://openwaterlog.com/locations/aquatic-park/'
                : conditions.waves?.source?.includes('NOAA-NDBC Buoy')
                ? `🔗 https://www.ndbc.noaa.gov/station_page.php?station=${conditions.waves.source.match(/\d{5}/)?.[0] || '46237'}`
                : '',
              ...(score?.factors?.waves?.issues ?? []),
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Wind"
            value={windSpeed.toFixed(0)}
            unit="mph"
            thresholds={[
              { label: 'Calm', value: `<${SAFETY_THRESHOLDS.wind.calm}mph`, status: 'good' },
              { label: 'Light', value: `<${SAFETY_THRESHOLDS.wind.light}mph`, status: 'info' },
              { label: 'Moderate', value: `<${SAFETY_THRESHOLDS.wind.moderate}mph`, status: 'warning' },
              { label: 'Strong', value: `<${SAFETY_THRESHOLDS.wind.strong}mph`, status: 'danger' },
            ] as ThresholdSegment[]}
            status={weatherStatus}
            icon="💨"
            details={[
              `Condition: ${score?.factors?.weather?.windCondition ?? 'unknown'}`,
              windGust ? `Gusts: ${windGust.toFixed(0)} mph` : '',
              windDirection !== undefined ? `Direction: ${windDirection}° ${degreesToCardinal(windDirection)}` : '',
              `Air Temp: ${temperature.toFixed(0)}°F`,
              conditions?.waterTemperature
                ? `Water Temp: ${conditions.waterTemperature.temperatureF.toFixed(1)}°F (${conditions.waterTemperature.source})`
                : '',
              weather?.timestamp ? `Updated: ${formatTimestamp(weather.timestamp)}` : '',
              windSourceDisplay ? `Source: ${windSourceDisplay}` : '',
              ...(score?.factors?.weather?.issues ?? []),
              // Data source links
              isOpenMeteoWind
                ? '🔗 https://open-meteo.com/'
                : windSource?.includes('NOAA')
                ? '🔗 https://www.weather.gov/'
                : '',
              conditions?.waterTemperature
                ? '🔗 https://seatemperature.info/aquatic-park-water-temperature.html'
                : '',
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Water Quality"
            value={(score?.factors?.waterQuality?.status ?? 'unknown').toUpperCase()}
            thresholds={[
              ...(waterQuality?.enterococcusCount !== undefined ? [{
                label: 'Entero',
                value: `${waterQuality.enterococcusCount.toFixed(0)}/${SAFETY_THRESHOLDS.waterQuality.enterococcus.safe}`,
                status: (waterQuality.enterococcusCount > SAFETY_THRESHOLDS.waterQuality.enterococcus.dangerous ? 'danger'
                  : waterQuality.enterococcusCount > SAFETY_THRESHOLDS.waterQuality.enterococcus.safe ? 'warning' : 'good') as ThresholdSegment['status'],
              }] : []),
              ...(waterQuality?.eColiCount !== undefined ? [{
                label: 'E.coli',
                value: `${waterQuality.eColiCount.toFixed(0)}/${SAFETY_THRESHOLDS.waterQuality.eColi.safe}`,
                status: (waterQuality.eColiCount > SAFETY_THRESHOLDS.waterQuality.eColi.dangerous ? 'danger'
                  : waterQuality.eColiCount > SAFETY_THRESHOLDS.waterQuality.eColi.safe ? 'warning' : 'good') as ThresholdSegment['status'],
              }] : []),
              ...(waterQuality?.coliformCount !== undefined ? [{
                label: 'Coliform',
                value: `${waterQuality.coliformCount >= 1000 ? Math.round(waterQuality.coliformCount / 1000) + 'k' : waterQuality.coliformCount.toFixed(0)}/${SAFETY_THRESHOLDS.waterQuality.coliform.safe / 1000}k`,
                status: (waterQuality.coliformCount > SAFETY_THRESHOLDS.waterQuality.coliform.dangerous ? 'danger'
                  : waterQuality.coliformCount > SAFETY_THRESHOLDS.waterQuality.coliform.safe ? 'warning' : 'good') as ThresholdSegment['status'],
              }] : []),
            ] as ThresholdSegment[]}
            status={waterQualityStatus}
            icon="💧"
            details={[
              `Bacteria: ${score?.factors?.waterQuality?.bacteriaLevel ?? 'unknown'}`,
              waterQuality?.enterococcusCount !== undefined
                ? `Enterococcus: ${waterQuality.enterococcusCount.toFixed(0)} MPN/100ml (limit: ${SAFETY_THRESHOLDS.waterQuality.enterococcus.safe})`
                : '',
              waterQuality?.eColiCount !== undefined
                ? `E.coli: ${waterQuality.eColiCount.toFixed(0)} MPN/100ml (limit: ${SAFETY_THRESHOLDS.waterQuality.eColi.safe})`
                : '',
              waterQuality?.coliformCount !== undefined
                ? `Total Coliform: ${waterQuality.coliformCount.toLocaleString()} MPN/100ml (limit: ${SAFETY_THRESHOLDS.waterQuality.coliform.safe.toLocaleString()})`
                : '',
              score?.factors?.waterQuality?.recentSSO
                ? `SSO ${score?.factors?.waterQuality?.daysSinceSSO ?? '?'} days ago`
                : '',
              // Rainfall impact on water quality
              rainfall?.last72hInches !== undefined && rainfall.last72hInches >= SAFETY_THRESHOLDS.rainfall.moderate
                ? `🌧️ Recent rainfall: ${rainfall.last72hInches.toFixed(1)}" (72h) — runoff may affect water quality`
                : rainfall?.last72hInches !== undefined && rainfall.last72hInches > 0
                ? `🌧️ Recent rainfall: ${rainfall.last72hInches.toFixed(2)}" (72h)`
                : rainfall?.last72hInches !== undefined
                ? '☀️ No recent rainfall — good water clarity expected'
                : '',
              // Water clarity estimate based on rainfall
              rainfall?.last48hInches !== undefined && rainfall.last48hInches >= SAFETY_THRESHOLDS.rainfall.heavy
                ? '👁️ Water clarity: Poor (heavy rain runoff)'
                : rainfall?.last48hInches !== undefined && rainfall.last48hInches >= SAFETY_THRESHOLDS.rainfall.moderate
                ? '👁️ Water clarity: Reduced (rain runoff)'
                : rainfall?.last48hInches !== undefined
                ? '👁️ Water clarity: Clear'
                : '',
              waterQuality?.notes || '', // Shows "Sampled X days ago"
              waterQuality?.source ? `Source: ${waterQuality.source}` : '', // Show which API
              waterQuality?.stationId ? `Station: ${waterQuality.stationId}` : '',
              // Show link to data source based on which API provided the data
              waterQuality?.source?.includes('SF Beach Water Quality')
                ? '🔗 https://data.sfgov.org/Energy-and-Environment/Beach-Water-Quality-Monitoring/v3fv-x3ux'
                : waterQuality?.source?.includes('California Water Quality')
                ? '🔗 https://data.ca.gov/dataset/surface-water-fecal-indicator-bacteria-results/resource/15a63495-8d9f-4a49-b43a-3092ef3106b9'
                : waterQuality?.source?.includes('Water Quality Portal')
                ? '🔗 https://www.waterqualitydata.us/'
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
            thresholds={[
              { label: 'Low', value: `<${SAFETY_THRESHOLDS.damReleases.moderate.toLocaleString()}`, status: 'good' },
              { label: 'Moderate', value: `<${SAFETY_THRESHOLDS.damReleases.high.toLocaleString()}`, status: 'info' },
              { label: 'High', value: `<${SAFETY_THRESHOLDS.damReleases.extreme.toLocaleString()}`, status: 'warning' },
              { label: 'Extreme', value: `>${SAFETY_THRESHOLDS.damReleases.extreme.toLocaleString()}`, status: 'danger' },
            ] as ThresholdSegment[]}
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

              // Data source link
              '🔗 https://cdec.water.ca.gov/',
            ].filter(Boolean)}
          />
        </div>
      </div>
    </div>
  );
}
