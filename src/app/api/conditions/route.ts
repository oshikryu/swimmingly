/**
 * Current Conditions API Route
 * Main endpoint that orchestrates data fetching from all sources and calculates swim score
 */

import { NextRequest, NextResponse } from 'next/server';
import type { CurrentConditions, TidePhaseType, TidePhasePreferences, TidePrediction, CurrentData } from '@/types/conditions';
import { fetchCurrentTidePrediction, fetchCurrentWeather, fetchWaveData, fetchCurrents } from '@/lib/api/noaa';
import { fetchWaterQuality } from '@/lib/api/beachwatch';
import { fetchRecentSSOs } from '@/lib/api/sfpuc';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';
import { fetchWindData } from '@/lib/api/open-meteo';

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
    const [tide, current, weather, waves, waterQuality, recentSSOs, windData] = await Promise.allSettled([
      fetchCurrentTidePrediction(),
      fetchCurrents(),
      fetchCurrentWeather(),
      fetchWaveData(),
      fetchWaterQuality(),
      fetchRecentSSOs(7),
      fetchWindData(),
    ]);

    // Extract successful results or use fallbacks
    const tideData = tide.status === 'fulfilled' ? tide.value : null;
    const currentData = current.status === 'fulfilled' ? current.value : null;
    const weatherData = weather.status === 'fulfilled' ? weather.value : null;
    const waveData = waves.status === 'fulfilled' ? waves.value : null;
    const waterQualityData = waterQuality.status === 'fulfilled' ? waterQuality.value : null;
    const ssoData = recentSSOs.status === 'fulfilled' ? recentSSOs.value : [];
    const windDataResult = windData.status === 'fulfilled' ? windData.value : null;

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

    // Log wind data source for debugging
    if (windDataResult) {
      console.log('Using Open-Meteo for wind data');
    } else if (weatherData) {
      console.log('Using NOAA for wind data (Open-Meteo unavailable)');
    } else {
      console.warn('No wind data available from any source');
    }

    const now = new Date();

    // Provide fallbacks for missing data
    // Hybrid approach: prefer Open-Meteo wind data with NOAA temperature/conditions
    const weatherWithFallback = weatherData || {
      timestamp: windDataResult?.timestamp || now,
      temperatureF: windDataResult?.temperatureF ?? 60,
      windSpeedMph: windDataResult?.windSpeedMph || 0,
      windDirection: windDataResult?.windDirection || 0,
      windGustMph: windDataResult?.windGustMph,
      visibilityMiles: 10,
      conditions: 'unavailable',
      source: windDataResult ? 'open-meteo' : 'unavailable',
    };

    // If we have both NOAA weather and Open-Meteo wind, prefer Open-Meteo for wind
    // and use NOAA for temperature if available
    if (weatherData && windDataResult) {
      weatherWithFallback.windSpeedMph = windDataResult.windSpeedMph;
      weatherWithFallback.windDirection = windDataResult.windDirection;
      weatherWithFallback.windGustMph = windDataResult.windGustMph;
      weatherWithFallback.source = 'NOAA-NWS+open-meteo-wind';
    } else if (!weatherData && windDataResult?.temperatureF) {
      // If NOAA weather is unavailable but Open-Meteo has temperature, use it
      weatherWithFallback.temperatureF = windDataResult.temperatureF;
    }

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
      ssoData,
      customTidePreferences
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

/**
 * Calculate estimated current speed from tide change rate
 * Uses tide rate as a proxy when direct current measurements are unavailable
 */
function calculateCurrentFromTide(tide: TidePrediction, timestamp: Date): CurrentData {
  // In sheltered bays like Aquatic Park, current speed correlates with tide change rate
  // A typical multiplier is 0.3-0.5; using 0.4 as a conservative middle estimate
  // Current (knots) ≈ |tide change rate (ft/hr)| × 0.4
  const TIDE_RATE_TO_CURRENT_MULTIPLIER = 0.4;

  const estimatedSpeedKnots = Math.abs(tide.changeRateFeetPerHour) * TIDE_RATE_TO_CURRENT_MULTIPLIER;

  // Direction: flood (incoming) is generally eastward (90°), ebb (outgoing) is westward (270°)
  // For Aquatic Park specifically, the cove opens to the north, so adjust accordingly
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
    lat: 37.8065,
    lon: -122.4216,
    source: 'calculated-from-tide-rate',
  };
}
