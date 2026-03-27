/**
 * Fetch static data for build-time pre-fetching
 * This replicates the logic from /api/conditions but calls functions directly
 * without HTTP overhead
 */

import type { CurrentConditions, CurrentData, TidePrediction, TidePhaseType, TidePhasePreferences } from '@/types/conditions';
import { fetchCurrentTidePrediction, fetchWaveData, fetchCurrents } from '@/lib/api/noaa';
import { fetchWaterQuality } from '@/lib/api/beachwatch';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';
import { fetchWindData, fetchRecentRainfall } from '@/lib/api/open-meteo';
import { fetchDamReleases } from '@/lib/api/cdec';
import { fetchOpenWaterLogWaveData } from '@/lib/api/openwaterlog';
import { fetchWaterTemperature } from '@/lib/api/seatemperature';

/**
 * Fetch all data sources and calculate swim score
 * Returns serializable JSON (all Dates converted to ISO strings)
 */
export async function fetchStaticData(tidePhasePreference?: TidePhaseType): Promise<CurrentConditions> {
  try {
    console.log('Fetching static data for build...');

    // Build custom tide preferences if specified
    let customTidePreferences: TidePhasePreferences | undefined;
    if (tidePhasePreference && ['slack', 'flood', 'ebb'].includes(tidePhasePreference)) {
      customTidePreferences = {
        slack: tidePhasePreference === 'slack' ? 100 : 85,
        flood: tidePhasePreference === 'flood' ? 100 : 85,
        ebb: tidePhasePreference === 'ebb' ? 100 : 85,
      };
    }

    // Fetch wave data with fallback strategy: OpenWaterLog first, then NOAA buoy
    const fetchWaveDataWithFallback = async () => {
      try {
        console.log('Attempting to fetch wave data from OpenWaterLog...');
        const owlData = await fetchOpenWaterLogWaveData();
        if (owlData) {
          console.log('Successfully fetched wave data from OpenWaterLog');
          return owlData;
        }
        console.log('OpenWaterLog returned null, falling back to NOAA buoy...');
      } catch (error) {
        console.warn('OpenWaterLog fetch failed, falling back to NOAA buoy:', error);
      }

      // Fallback to NOAA buoy
      console.log('Fetching wave data from NOAA buoy...');
      return fetchWaveData();
    };

    // Fetch all data sources in parallel
    const [tide, current, waves, waterQuality, windData, damReleases, waterTemp, rainfall] = await Promise.allSettled([
      fetchCurrentTidePrediction(),
      fetchCurrents(),
      fetchWaveDataWithFallback(),
      fetchWaterQuality(),
      fetchWindData(),
      fetchDamReleases(),
      fetchWaterTemperature(),
      fetchRecentRainfall(),
    ]);

    // Extract successful results or use fallbacks
    const tideData = tide.status === 'fulfilled' ? tide.value : null;
    const currentData = current.status === 'fulfilled' ? current.value : null;
    const waveData = waves.status === 'fulfilled' ? waves.value : null;
    const waterQualityData = waterQuality.status === 'fulfilled' ? waterQuality.value : null;
    const windDataResult = windData.status === 'fulfilled' ? windData.value : null;
    const damReleasesData = damReleases.status === 'fulfilled' ? damReleases.value : null;
    const waterTempData = waterTemp.status === 'fulfilled' ? waterTemp.value : null;
    const rainfallData = rainfall.status === 'fulfilled' ? rainfall.value : null;

    // Check if we have minimum required data (tide is critical)
    if (!tideData) {
      console.error('Failed to fetch critical tide data');
      throw new Error('Unable to fetch critical tide data');
    }

    // Log warnings for missing non-critical data
    if (!waveData) console.warn('Wave data unavailable - using defaults');
    if (!waterQualityData) console.warn('Water quality data unavailable - using defaults');
    if (!windDataResult) console.warn('Wind data unavailable from Open-Meteo');
    if (!rainfallData) console.warn('Rainfall data unavailable from Open-Meteo');

    const now = new Date();

    // Weather data from Open-Meteo (wind, temperature, conditions)
    const weatherWithFallback = {
      timestamp: windDataResult?.timestamp || now,
      temperatureF: windDataResult?.temperatureF ?? 60,
      windSpeedMph: windDataResult?.windSpeedMph ?? 0,
      windDirection: windDataResult?.windDirection ?? 0,
      windGustMph: windDataResult?.windGustMph,
      conditions: windDataResult?.conditions ?? 'unavailable',
      source: windDataResult ? 'open-meteo' : 'unavailable',
    };

    const wavesWithFallback = waveData || {
      timestamp: now,
      waveHeightFeet: 0,
      source: 'unavailable',
    };

    const waterQualityWithFallback = waterQualityData || {
      timestamp: now,
      status: 'safe' as const,
      source: 'unavailable',
    };

    // Calculate current from tide if actual current data is unavailable
    const currentWithFallback = currentData || calculateCurrentFromTide(tideData, now);

    // Calculate swim score with custom preferences if provided
    const score = calculateSwimScore(
      tideData,
      currentWithFallback,
      weatherWithFallback,
      wavesWithFallback,
      waterQualityWithFallback,
      [],
      damReleasesData,
      customTidePreferences,
      undefined, // customWeights
      rainfallData
    );

    // Construct response with fallbacks for missing data
    const conditions: CurrentConditions = {
      timestamp: now,
      score,
      tide: tideData,
      current: currentWithFallback,
      weather: weatherWithFallback,
      waves: wavesWithFallback,
      waterQuality: waterQualityWithFallback,
      waterTemperature: waterTempData || undefined,
      damReleases: damReleasesData || undefined,
      rainfall: rainfallData || undefined,
      dataFreshness: {
        tide: tideData.timestamp,
        weather: windDataResult?.timestamp || now,
        waves: waveData?.timestamp || now,
        waterQuality: waterQualityData?.timestamp || now,
        waterTemperature: waterTempData?.timestamp || undefined,
        damReleases: damReleasesData?.timestamp || undefined,
        rainfall: rainfallData?.timestamp || undefined,
      },
    };

    console.log('Successfully fetched static data');

    // Convert to JSON-serializable format (convert Dates to ISO strings)
    return JSON.parse(JSON.stringify(conditions));
  } catch (error) {
    console.error('Error fetching static data:', error);
    throw error;
  }
}

/**
 * Calculate estimated current speed from tide change rate
 * Uses tide rate as a proxy when direct current measurements are unavailable
 */
function calculateCurrentFromTide(tide: TidePrediction, timestamp: Date): CurrentData {
  const TIDE_RATE_TO_CURRENT_MULTIPLIER = 0.4;
  const estimatedSpeedKnots = Math.abs(tide.changeRateFeetPerHour) * TIDE_RATE_TO_CURRENT_MULTIPLIER;

  let direction = 0;
  if (tide.currentPhase === 'flood') {
    direction = 90; // Incoming tide - eastward
  } else if (tide.currentPhase === 'ebb') {
    direction = 270; // Outgoing tide - westward
  }

  return {
    timestamp,
    speedKnots: estimatedSpeedKnots,
    direction,
    source: 'calculated-from-tide-rate',
  };
}
