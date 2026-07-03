/**
 * La Jolla Cove Current Conditions API Route
 * Mirrors /api/conditions but wired to La Jolla Cove's data sources (see
 * src/config/la-jolla-cove.ts). Dam releases and SF-specific water quality sources
 * don't apply here — see the implementation plan for the full data source mapping.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { CurrentConditions, TidePhaseType, TidePhasePreferences, TidePrediction, CurrentData } from '@/types/conditions';
import { fetchCurrentTidePrediction, fetchWaveData, fetchWaterTemperature } from '@/lib/api/noaa';
import { fetchWaterQualityWQPOnly } from '@/lib/api/beachwatch';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';
import { fetchWindData, fetchRecentRainfall } from '@/lib/api/open-meteo';
import { calculateMoonPhase } from '@/lib/moon-phase';
import { LA_JOLLA_TIDE_STATION_ID, LA_JOLLA_WAVE_BUOY_ID, LA_JOLLA_COVE_LAT, LA_JOLLA_COVE_LON } from '@/config/la-jolla-cove';

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

    // Fetch all data sources in parallel
    // No tidal-current-prediction station near La Jolla Cove (open coast) -> current falls
    // back to calculateCurrentFromTide below. No dam-release source applies to San Diego.
    const [tide, waves, waterQuality, windData, waterTemp, rainfall] = await Promise.allSettled([
      fetchCurrentTidePrediction(LA_JOLLA_TIDE_STATION_ID),
      fetchWaveData(LA_JOLLA_WAVE_BUOY_ID),
      fetchWaterQualityWQPOnly('LA JOLLA COVE', LA_JOLLA_COVE_LAT, LA_JOLLA_COVE_LON, 'US:06:073'),
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
      waterTempData
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
