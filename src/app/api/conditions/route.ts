/**
 * Current Conditions API Route
 * Main endpoint that orchestrates data fetching from all sources and calculates swim score
 */

import { NextRequest, NextResponse } from 'next/server';
import type { CurrentConditions, TidePhaseType, TidePhasePreferences } from '@/types/conditions';
import { fetchCurrentTidePrediction, fetchCurrentWeather, fetchWaveData, fetchCurrents } from '@/lib/api/noaa';
import { fetchWaterQuality } from '@/lib/api/beachwatch';
import { fetchRecentSSOs } from '@/lib/api/sfpuc';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';

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
    const [tide, current, weather, waves, waterQuality, recentSSOs] = await Promise.allSettled([
      fetchCurrentTidePrediction(),
      fetchCurrents(),
      fetchCurrentWeather(),
      fetchWaveData(),
      fetchWaterQuality(),
      fetchRecentSSOs(7),
    ]);

    // Extract successful results or use fallbacks
    const tideData = tide.status === 'fulfilled' ? tide.value : null;
    const currentData = current.status === 'fulfilled' ? current.value : null;
    const weatherData = weather.status === 'fulfilled' ? weather.value : null;
    const waveData = waves.status === 'fulfilled' ? waves.value : null;
    const waterQualityData = waterQuality.status === 'fulfilled' ? waterQuality.value : null;
    const ssoData = recentSSOs.status === 'fulfilled' ? recentSSOs.value : [];

    // Check if we have minimum required data (tide is critical)
    // Other data can be null and scoring algorithm will handle gracefully
    if (!tideData) {
      return NextResponse.json(
        {
          error: 'Unable to fetch critical tide data',
          details: {
            tide: tide.status === 'rejected' ? tide.reason?.message : 'missing',
            weather: weather.status === 'rejected' ? weather.reason?.message : (!weatherData ? 'missing' : 'ok'),
            waves: waves.status === 'rejected' ? waves.reason?.message : (!waveData ? 'missing' : 'ok'),
            waterQuality: waterQuality.status === 'rejected' ? waterQuality.reason?.message : (!waterQualityData ? 'missing' : 'ok'),
          },
        },
        { status: 503 }
      );
    }

    // Log warnings for missing non-critical data
    if (!weatherData) console.warn('Weather data unavailable - using defaults');
    if (!waveData) console.warn('Wave data unavailable - using defaults');
    if (!waterQualityData) console.warn('Water quality data unavailable - using defaults');

    const now = new Date();

    // Provide fallbacks for missing data
    const weatherWithFallback = weatherData || {
      timestamp: now,
      temperatureF: 60,
      windSpeedMph: 0,
      windDirection: 0,
      visibilityMiles: 10,
      conditions: 'unavailable',
      source: 'unavailable',
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

    // Calculate swim score with custom preferences if provided
    const score = calculateSwimScore(
      tideData,
      currentData,
      weatherWithFallback,
      wavesWithFallback,
      waterQualityWithFallback,
      ssoData,
      customTidePreferences
    );

    // Construct response with fallbacks for missing data
    const conditions: CurrentConditions = {
      timestamp: now,
      score,
      tide: tideData,
      current: currentData || {
        timestamp: now,
        speedKnots: 0,
        direction: 0,
        lat: 37.8065,
        lon: -122.4216,
        source: 'unavailable',
      },
      weather: weatherWithFallback,
      waves: wavesWithFallback,
      waterQuality: waterQualityWithFallback,
      recentSSOs: ssoData,
      dataFreshness: {
        tide: tideData.timestamp,
        weather: weatherData?.timestamp || now,
        waves: waveData?.timestamp || now,
        waterQuality: waterQualityData?.timestamp || now,
        sso: ssoData.length > 0 ? ssoData[0].reportedAt : now,
      },
    };

    return NextResponse.json(conditions, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error in conditions API:', error);
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
