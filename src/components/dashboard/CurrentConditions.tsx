'use client';

import { useEffect, useState, useRef } from 'react';
import type { CurrentConditions as CurrentConditionsType, TidePhasePreferences, ScoreWeights } from '@/types/conditions';
import { useTidePreference } from '@/hooks/useTidePreference';
import { useScoreWeights } from '@/hooks/useScoreWeights';
import { useConditionsCache } from '@/hooks/useConditionsCache';
import { AQUATIC_PARK_LAT, AQUATIC_PARK_LON } from '@/config/aquatic-park';
import { calculateSwimScore, mergeThresholds, type ThresholdsOverride } from '@/lib/algorithms/swim-score';
import SwimScore from './SwimScore';
import ConditionsCard, { type ThresholdSegment } from './ConditionsCard';
import {
  mapTideCurrentStatus,
  mapWaveStatus,
  mapWeatherStatus,
  mapWaterQualityStatus,
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
  moonPhase: CurrentConditionsType['moonPhase'];
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

export interface CurrentConditionsLocationConfig {
  /** API path (or static JSON path in static mode is always /swimmingly/static-data.json) */
  apiPath: string;
  /** Distinguishes localStorage keys between locations, e.g. 'lajollacove' */
  cacheKeyPrefix: string;
  /** NOAA tide station ID, used for the outbound tide-predictions link */
  tideStationId: string;
  /** Outbound link for the water temperature source */
  waterTempSourceUrl: string;
  /** San Diego County sdbeachinfo site ID, used for the water quality outbound link (if applicable) */
  sdBeachInfoSiteId?: string;
  /** Swim Guide beach ID, used for the water quality outbound link (if applicable) */
  swimGuideBeachId?: string;
  /** Location coordinates, used to build location-specific outbound links (e.g. wind source) */
  lat: number;
  lon: number;
  /** Per-location safety threshold overrides (e.g. wave heights calibrated to open coast vs. a sheltered bay) */
  thresholdsOverride?: ThresholdsOverride;
}

const AQUATIC_PARK_LOCATION_CONFIG: CurrentConditionsLocationConfig = {
  apiPath: '/api/conditions',
  cacheKeyPrefix: '',
  tideStationId: '9414290',
  waterTempSourceUrl: 'https://seatemperature.info/aquatic-park-water-temperature.html',
  lat: AQUATIC_PARK_LAT,
  lon: AQUATIC_PARK_LON,
};

export default function CurrentConditions({
  location = AQUATIC_PARK_LOCATION_CONFIG,
}: {
  location?: CurrentConditionsLocationConfig;
}) {
  const [conditions, setConditions] = useState<CurrentConditionsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { preference, setPreference, isLoaded } = useTidePreference(location.cacheKeyPrefix);
  const { weights, setWeights, resetWeights, isCustom: isWeightsCustom } = useScoreWeights(location.cacheKeyPrefix);
  const { cachedData, setCachedData, isCacheValid } = useConditionsCache(location.cacheKeyPrefix);
  // Store raw data for client-side recalculation
  const rawDataRef = useRef<RawConditionsData | null>(null);
  // Prevents the cache-init effect from re-firing after the first mount hydration
  const cacheInitialized = useRef(false);

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
      customTidePreferences,
      customWeights,
      rawData.rainfall ?? null,
      rawData.moonPhase ?? null,
      rawData.waterTemperature ?? null,
      location.thresholdsOverride
    );
    return {
      ...rawData,
      timestamp: rawData.timestamp || new Date(),
      score: newScore,
    };
  };

  // Load cached data immediately on mount (runs only once — cacheInitialized prevents
  // subsequent setCachedData calls from overwriting conditions with the cache value)
  useEffect(() => {
    if (!cacheInitialized.current && isCacheValid && cachedData) {
      cacheInitialized.current = true;
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
            return `${location.apiPath}${params.toString() ? `?${params.toString()}` : ''}`;
          })();

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch conditions');
      }
      const data = await response.json();

      // Only update cache and state if we have valid data
      // Don't overwrite good cached data with null/missing data
      if (data && data.tide && data.score) {
        const prevRawData = rawDataRef.current;
        // Preserve cached waterQuality if fresh fetch returned an unavailable fallback
        const freshWaterQuality = data.waterQuality;
        const preservedWaterQuality =
          freshWaterQuality?.source === 'unavailable' && prevRawData?.waterQuality?.source !== 'unavailable'
            ? prevRawData?.waterQuality
            : freshWaterQuality;

        // Always store raw data for client-side recalculation
        rawDataRef.current = {
          tide: data.tide,
          current: data.current,
          weather: data.weather,
          waves: data.waves,
          waterQuality: preservedWaterQuality,
          waterTemperature: data.waterTemperature,
          damReleases: data.damReleases,
          rainfall: data.rainfall,
          moonPhase: data.moonPhase,
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
      setCachedData(recalculated);
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
      setCachedData(recalculated);
      setConditions(recalculated);
    }
  };

  // Handle weight reset
  const handleWeightsReset = () => {
    resetWeights();

    if (rawDataRef.current) {
      const recalculated = recalculateScore(rawDataRef.current, preference);
      setCachedData(recalculated);
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

  const { score, tide, current, weather, waves, waterQuality, rainfall, moonPhase } = conditions;
  const barometricPressureMb = waves?.barometricPressureMb ?? null;
  const thresholds = mergeThresholds(location.thresholdsOverride);

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
              { label: 'Slack', value: `<${thresholds.current.slack}kt`, status: 'good' },
              { label: 'Moderate', value: `<${thresholds.current.moderate}kt`, status: 'info' },
              { label: 'Strong', value: `<${thresholds.current.strong}kt`, status: 'warning' },
              { label: 'Dangerous', value: `>${thresholds.current.veryStrong}kt`, status: 'danger' },
            ] as ThresholdSegment[]}
            status={tideStatus}
            icon="🌊"
            details={[
              `Phase: ${score?.factors?.tideAndCurrent?.phase ?? 'unknown'}`,
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
              // Moon phase
              moonPhase
                ? `${moonPhase.phaseEmoji} ${moonPhase.phaseName} (${moonPhase.illuminationPercent}% illuminated)${moonPhase.isSpringTide ? ' — Spring tide' : moonPhase.isNeapTide ? ' — Neap tide' : ''}`
                : '',
              ...(score?.factors?.tideAndCurrent?.issues?.filter(issue => !issue.toLowerCase().includes('current')) ?? []),
              // Data source link
              `🔗 https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=${location.tideStationId}`,
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Waves"
            value={waveHeight.toFixed(1)}
            unit="ft"
            thresholds={[
              { label: 'Calm', value: `<${thresholds.waves.calm}ft`, status: 'good' },
              { label: 'Safe', value: `<${thresholds.waves.safe}ft`, status: 'info' },
              { label: 'Moderate', value: `<${thresholds.waves.moderate}ft`, status: 'warning' },
              { label: 'Rough', value: `<${thresholds.waves.rough}ft`, status: 'danger' },
            ] as ThresholdSegment[]}
            status={waveStatus}
            icon="🌊"
            details={[
              swellPeriod ? `Period: ${swellPeriod.toFixed(0)}s` : '',
              conditions.waves?.source ? `Source: ${conditions.waves.source}` : '',
              conditions.waves?.timestamp ? `Updated: ${new Date(conditions.waves.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST` : '',
              ...(score?.factors?.waves?.issues ?? []),
              conditions.waves?.source?.toLowerCase().includes('openwaterlog')
                ? '🔗 https://openwaterlog.com/locations/aquatic-park/'
                : conditions.waves?.source?.match(/NOAA-NDBC Buoy\s+(\S+)/)
                ? `🔗 https://www.ndbc.noaa.gov/station_page.php?station=${conditions.waves.source.match(/NOAA-NDBC Buoy\s+(\S+)/)![1]}`
                : '',
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Wind"
            value={windSpeed.toFixed(0)}
            unit="mph"
            thresholds={[
              { label: 'Calm', value: `<${thresholds.wind.calm}mph`, status: 'good' },
              { label: 'Light', value: `<${thresholds.wind.light}mph`, status: 'info' },
              { label: 'Moderate', value: `<${thresholds.wind.moderate}mph`, status: 'warning' },
              { label: 'Strong', value: `<${thresholds.wind.strong}mph`, status: 'danger' },
            ] as ThresholdSegment[]}
            status={weatherStatus}
            icon="💨"
            details={[
              windGust ? `Gusts: ${windGust.toFixed(0)} mph` : '',
              windDirection !== undefined ? `Direction: ${windDirection}° ${degreesToCardinal(windDirection)}` : '',
              `Air Temp: ${temperature.toFixed(0)}°F`,
              barometricPressureMb !== null
                ? `Pressure: ${barometricPressureMb.toFixed(0)} mb${
                    barometricPressureMb >= thresholds.barometricPressure.veryHigh ? ' (High — stable)' :
                    barometricPressureMb >= thresholds.barometricPressure.standard ? ' (Normal)' :
                    barometricPressureMb >= thresholds.barometricPressure.low ? ' (Low — watch conditions)' :
                    ' (Very low — storm risk)'
                  }`
                : '',
              windSourceDisplay ? `Source: ${windSourceDisplay}` : '',
              weather?.timestamp ? `Updated: ${new Date(weather.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST` : '',
              ...(score?.factors?.weather?.issues ?? []),
              isOpenMeteoWind
                ? `🔗 https://open-meteo.com/en/docs?latitude=${location.lat}&longitude=${location.lon}`
                : windSource?.includes('NOAA')
                ? `🔗 https://forecast.weather.gov/MapClick.php?lat=${location.lat}&lon=${location.lon}`
                : '',
            ].filter(Boolean)}
          />

          <ConditionsCard
            title="Water Quality"
            value={(score?.factors?.waterQuality?.status ?? 'unknown').toUpperCase()}
            thresholds={[
              ...(waterQuality?.enterococcusCount !== undefined ? [{
                label: 'Entero',
                value: `${waterQuality.enterococcusCount.toFixed(0)}/${thresholds.waterQuality.enterococcus.safe}`,
                status: (waterQuality.enterococcusCount > thresholds.waterQuality.enterococcus.dangerous ? 'danger'
                  : waterQuality.enterococcusCount > thresholds.waterQuality.enterococcus.safe ? 'warning' : 'good') as ThresholdSegment['status'],
              }] : []),
              ...(waterQuality?.eColiCount !== undefined ? [{
                label: 'E.coli',
                value: `${waterQuality.eColiCount.toFixed(0)}/${thresholds.waterQuality.eColi.safe}`,
                status: (waterQuality.eColiCount > thresholds.waterQuality.eColi.dangerous ? 'danger'
                  : waterQuality.eColiCount > thresholds.waterQuality.eColi.safe ? 'warning' : 'good') as ThresholdSegment['status'],
              }] : []),
              ...(waterQuality?.coliformCount !== undefined ? [{
                label: 'Coliform',
                value: `${waterQuality.coliformCount >= 1000 ? Math.round(waterQuality.coliformCount / 1000) + 'k' : waterQuality.coliformCount.toFixed(0)}/${thresholds.waterQuality.coliform.safe / 1000}k`,
                status: (waterQuality.coliformCount > thresholds.waterQuality.coliform.dangerous ? 'danger'
                  : waterQuality.coliformCount > thresholds.waterQuality.coliform.safe ? 'warning' : 'good') as ThresholdSegment['status'],
              }] : []),
            ] as ThresholdSegment[]}
            status={waterQualityStatus}
            icon="💧"
            details={[
              waterQuality?.enterococcusCount !== undefined
                ? `Enterococcus: ${waterQuality.enterococcusCount.toFixed(0)} MPN/100ml (limit: ${thresholds.waterQuality.enterococcus.safe})`
                : '',
              waterQuality?.eColiCount !== undefined
                ? `E.coli: ${waterQuality.eColiCount.toFixed(0)} MPN/100ml (limit: ${thresholds.waterQuality.eColi.safe})`
                : '',
              waterQuality?.coliformCount !== undefined
                ? `Total Coliform: ${waterQuality.coliformCount.toLocaleString()} MPN/100ml (limit: ${thresholds.waterQuality.coliform.safe.toLocaleString()})`
                : '',
              conditions?.waterTemperature
                ? (() => {
                    const t = conditions.waterTemperature.temperatureF;
                    const wt = thresholds.waterTemp;
                    const label = t < wt.cold ? ' — very cold' : t < wt.cool ? ' — cold' : t < wt.moderate ? ' — cool' : t >= wt.comfortable ? ' — comfortable' : '';
                    return `Water Temp: ${t.toFixed(1)}°F${label}`;
                  })()
                : '',
              score?.factors?.waterQuality?.recentSSO
                ? `SSO ${score?.factors?.waterQuality?.daysSinceSSO ?? '?'} days ago`
                : '',
              rainfall?.last72hInches !== undefined && rainfall.last72hInches >= thresholds.rainfall.moderate
                ? `🌧️ Recent rainfall: ${rainfall.last72hInches.toFixed(1)}" (72h) — runoff may affect water quality`
                : rainfall?.last72hInches !== undefined && rainfall.last72hInches > 0
                ? `🌧️ Recent rainfall: ${rainfall.last72hInches.toFixed(2)}" (72h)`
                : rainfall?.last72hInches !== undefined
                ? '☀️ No recent rainfall — good water clarity expected'
                : '',
              rainfall?.last48hInches !== undefined && rainfall.last48hInches >= thresholds.rainfall.heavy
                ? '👁️ Water clarity: Poor (heavy rain runoff)'
                : rainfall?.last48hInches !== undefined && rainfall.last48hInches >= thresholds.rainfall.moderate
                ? '👁️ Water clarity: Reduced (rain runoff)'
                : rainfall?.last48hInches !== undefined
                ? '👁️ Water clarity: Clear'
                : '',
              waterQuality?.notes || '',
              waterQuality?.source ? `Source: ${waterQuality.source}` : '',
              waterQuality?.stationId ? `Station ID: ${waterQuality.stationId}` : '',
              waterQuality?.timestamp ? `Updated: ${new Date(waterQuality.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })} PST` : '',
              ...(score?.factors?.waterQuality?.issues?.filter(i => !/^(Very cold|Cold|Cool) water/i.test(i)) ?? []),
              waterQuality?.source?.includes('SF Beach Water Quality')
                ? '🔗 https://data.sfgov.org/Energy-and-Environment/Beach-Water-Quality-Monitoring/v3fv-x3ux'
                : waterQuality?.source?.includes('California Water Quality')
                ? '🔗 https://data.ca.gov/dataset/surface-water-fecal-indicator-bacteria-results/resource/15a63495-8d9f-4a49-b43a-3092ef3106b9'
                : waterQuality?.source?.includes('Swim Guide')
                ? `🔗 https://www.theswimguide.org/beach/${location.swimGuideBeachId ?? ''}`
                : waterQuality?.source?.includes('San Diego County')
                ? `🔗 https://cosdapps.sandiegocounty.gov/sdbeachinfo/SamplesReport?SiteId=${location.sdBeachInfoSiteId ?? ''}`
                : waterQuality?.source?.includes('Water Quality Portal')
                ? '🔗 https://www.waterqualitydata.us/'
                : '',
              conditions?.waterTemperature
                ? `🔗 ${location.waterTempSourceUrl}`
                : '',
            ].filter(Boolean)}
          />

        </div>
      </div>
    </div>
  );
}
