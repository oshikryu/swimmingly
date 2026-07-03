/**
 * La Jolla Cove Current Conditions API Route
 * Mirrors /api/conditions but wired to La Jolla Cove's data sources (see
 * src/config/la-jolla-cove.ts). Dam releases and SF-specific water quality sources
 * don't apply here — see the implementation plan for the full data source mapping.
 *
 * Waves: buoy 46254 (Scripps Nearshore Waverider Buoy) is primary, falling back to
 * LJPC1 (nearshore C-MAN station at Scripps Pier) if 46254 has no valid reading.
 *
 * Water quality: San Diego County's own ddPCR beach monitoring (sdbeachinfo.ts) is
 * primary — it's fresher (samples within days) than the federal WQP fallback (which
 * can lag months for this area), but it's a reverse-engineered internal API, so it
 * falls back to the WQP integration if it fails.
 *
 * Waves are also scored against La Jolla Cove-specific thresholds (see
 * LA_JOLLA_COVE_THRESHOLDS_OVERRIDE in config/la-jolla-cove.ts) rather than Aquatic
 * Park's sheltered-bay defaults — La Jolla's open-coast swell reads much higher on
 * the same instruments for what's actually a normal, comfortable swim day.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { CurrentConditions, TidePhaseType, TidePhasePreferences, TidePrediction, CurrentData } from '@/types/conditions';
import { fetchCurrentTidePrediction, fetchWaveData, fetchWaterTemperature } from '@/lib/api/noaa';
import { fetchWaterQualityWQPOnly } from '@/lib/api/beachwatch';
import { fetchSanDiegoCountyWaterQuality } from '@/lib/api/sdbeachinfo';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';
import { fetchWindData, fetchRecentRainfall } from '@/lib/api/open-meteo';
import { calculateMoonPhase } from '@/lib/moon-phase';
import { LA_JOLLA_TIDE_STATION_ID, LA_JOLLA_WAVE_BUOY_ID, LA_JOLLA_WAVE_BUOY_FALLBACK_ID, LA_JOLLA_COVE_LAT, LA_JOLLA_COVE_LON, LA_JOLLA_SD_BEACH_INFO_SITE_ID, LA_JOLLA_COVE_THRESHOLDS_OVERRIDE } from '@/config/la-jolla-cove';

export const dynamic = 'force-dynamic'; // Always fetch fresh data
export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    // Extract tide phase preference from query parameters
    const searchParams = request.nextUrl.searchParams;
    const tidePhasePreference = searchParams.get('tidePhasePreference') as TidePhaseType | null;

    // Build custom tide preferences if a valid preference is provided
    let customTidePreferences: TidePhasePreferences | undefined;
    if (tidePhasePreference && isValidTidePhase(tidePhasePreference)) {
      customTidePreferences = {
        slack: tidePhasePreference === 'slack' ? 100 : 85,
        flood: tidePhasePreference === 'flood' ? 100 : 85,
        ebb: tidePhasePreference === 'ebb' ? 100 : 85,
      };
    }

    // Fetch wave data with fallback strategy: buoy 46254 (Scripps Waverider Buoy) first,
    // then LJPC1 (nearshore C-MAN station) if 46254 has no valid reading
    const fetchWaveDataWithFallback = async () => {
      const primary = await fetchWaveData(LA_JOLLA_WAVE_BUOY_ID);
      if (primary) return primary;
      console.log('La Jolla Cove: buoy 46254 unavailable, falling back to LJPC1...');
      return fetchWaveData(LA_JOLLA_WAVE_BUOY_FALLBACK_ID);
    };

    // Fetch water quality with fallback strategy: San Diego County's own ddPCR data first
    // (fresher, but a reverse-engineered internal API), then WQP if it's unavailable
    const fetchWaterQualityWithFallback = async () => {
      const primary = await fetchSanDiegoCountyWaterQuality(LA_JOLLA_SD_BEACH_INFO_SITE_ID);
      if (primary) return primary;
      console.log('La Jolla Cove: SD County water quality unavailable, falling back to WQP...');
      return fetchWaterQualityWQPOnly('LA JOLLA COVE', LA_JOLLA_COVE_LAT, LA_JOLLA_COVE_LON, 'US:06:073');
    };

    // Fetch all data sources in parallel
    // No tidal-current-prediction station near La Jolla Cove (open coast) -> current falls
    // back to calculateCurrentFromTide below. No dam-release source applies to San Diego.
    const [tide, waves, waterQuality, windData, waterTemp, rainfall] = await Promise.allSettled([
      fetchCurrentTidePrediction(LA_JOLLA_TIDE_STATION_ID),
      fetchWaveDataWithFallback(),
      fetchWaterQualityWithFallback(),
      fetchWindData(2, LA_JOLLA_COVE_LAT, LA_JOLLA_COVE_LON),
      fetchWaterTemperature(LA_JOLLA_TIDE_STATION_ID),
      fetchRecentRainfall(2, LA_JOLLA_COVE_LAT, LA_JOLLA_COVE_LON),
    ]);

    // Extract successful results or use fallbacks
    const tideData = tide.status === 'fulfilled' ? tide.value : null;
    const waveData = waves.status === 'fulfilled' ? waves.value : null;
    const waterQualityData = waterQuality.status === 'fulfilled' ? waterQuality.value : null;
    const windDataResult = windData.status === 'fulfilled' ? windData.value : null;
    const waterTempData = waterTemp.status === 'fulfilled' ? waterTemp.value : null;
    const rainfallData = rainfall.status === 'fulfilled' ? rainfall.value : null;

    // Check if we have minimum required data (tide is critical)
    // Other data can be null and scoring algorithm will handle gracefully
    if (!tideData) {
      return NextResponse.json(
        {
          error: 'Unable to fetch critical tide data',
          details: {
            tide: tide.status === 'rejected' ? tide.reason?.message : 'missing',
            waves: waves.status === 'rejected' ? waves.reason?.message : (!waveData ? 'missing' : 'ok'),
            waterQuality: waterQuality.status === 'rejected' ? waterQuality.reason?.message : (!waterQualityData ? 'missing' : 'ok'),
          },
        },
        { status: 503 }
      );
    }

    // Log warnings for missing non-critical data
    if (!waveData) console.warn('La Jolla Cove: wave data unavailable - using defaults');
    if (!waterQualityData) console.warn('La Jolla Cove: water quality data unavailable - using defaults');
    if (!windDataResult) console.warn('La Jolla Cove: wind data unavailable from Open-Meteo');
    if (!rainfallData) console.warn('La Jolla Cove: rainfall data unavailable from Open-Meteo');

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

    // No tidal-current-prediction station near La Jolla Cove -> always estimate from tide rate
    const currentWithFallback = calculateCurrentFromTide(tideData, now);

    // Calculate moon phase (pure math, no API needed)
    const moonPhaseData = calculateMoonPhase(now);

    // Calculate swim score with custom preferences if provided
    const score = calculateSwimScore(
      tideData,
      currentWithFallback,
      weatherWithFallback,
      wavesWithFallback,
      waterQualityWithFallback,
      [],
      customTidePreferences,
      undefined, // customWeights
      rainfallData,
      moonPhaseData,
      waterTempData,
      LA_JOLLA_COVE_THRESHOLDS_OVERRIDE
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
      rainfall: rainfallData || undefined,
      moonPhase: moonPhaseData,
      dataFreshness: {
        tide: tideData.timestamp,
        weather: windDataResult?.timestamp || now,
        waves: waveData?.timestamp || now,
        waterQuality: waterQualityData?.timestamp || now,
        waterTemperature: waterTempData?.timestamp || undefined,
        rainfall: rainfallData?.timestamp || undefined,
        moonPhase: now,
      },
    };

    return NextResponse.json(conditions, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error in La Jolla Cove conditions API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Type guard to validate tide phase values
 */
function isValidTidePhase(value: string): value is TidePhaseType {
  return ['slack', 'flood', 'ebb'].includes(value);
}

/**
 * Calculate estimated current speed from tide change rate
 * Uses tide rate as a proxy when direct current measurements are unavailable
 * (same heuristic used for Aquatic Park in src/app/api/conditions/route.ts)
 */
function calculateCurrentFromTide(tide: TidePrediction, timestamp: Date): CurrentData {
  // Current (knots) ≈ |tide change rate (ft/hr)| × 0.4 — conservative middle estimate
  const TIDE_RATE_TO_CURRENT_MULTIPLIER = 0.4;

  const estimatedSpeedKnots = Math.abs(tide.changeRateFeetPerHour) * TIDE_RATE_TO_CURRENT_MULTIPLIER;

  // Direction: flood (incoming) is generally eastward (90°), ebb (outgoing) is westward (270°)
  let direction = 0;
  if (tide.currentPhase === 'flood') {
    direction = 90;
  } else if (tide.currentPhase === 'ebb') {
    direction = 270;
  }

  return {
    timestamp,
    speedKnots: estimatedSpeedKnots,
    direction,
    source: 'calculated-from-tide-rate',
  };
}
