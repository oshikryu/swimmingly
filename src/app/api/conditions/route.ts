/**
 * Current Conditions API Route
 * Main endpoint that orchestrates data fetching from all sources and calculates swim score
 */

import { NextResponse } from 'next/server';
import type { CurrentConditions } from '@/types/conditions';
import { fetchCurrentTidePrediction, fetchCurrentWeather, fetchWaveData, fetchCurrents } from '@/lib/api/noaa';
import { fetchWaterQuality } from '@/lib/api/beachwatch';
import { fetchRecentSSOs } from '@/lib/api/sfpuc';
import { calculateSwimScore } from '@/lib/algorithms/swim-score';

export const dynamic = 'force-dynamic'; // Always fetch fresh data
export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  try {
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

    // Check if we have minimum required data
    if (!tideData || !weatherData || !waveData || !waterQualityData) {
      return NextResponse.json(
        {
          error: 'Unable to fetch all required data',
          details: {
            tide: tide.status === 'rejected' ? tide.reason?.message : 'ok',
            weather: weather.status === 'rejected' ? weather.reason?.message : 'ok',
            waves: waves.status === 'rejected' ? waves.reason?.message : 'ok',
            waterQuality: waterQuality.status === 'rejected' ? waterQuality.reason?.message : 'ok',
          },
        },
        { status: 503 }
      );
    }

    // Calculate swim score
    const score = calculateSwimScore(
      tideData,
      currentData,
      weatherData,
      waveData,
      waterQualityData,
      ssoData
    );

    // Construct response
    const conditions: CurrentConditions = {
      timestamp: new Date(),
      score,
      tide: tideData,
      current: currentData || {
        timestamp: new Date(),
        speedKnots: 0,
        direction: 0,
        lat: 37.8065,
        lon: -122.4216,
        source: 'unavailable',
      },
      weather: weatherData,
      waves: waveData,
      waterQuality: waterQualityData,
      recentSSOs: ssoData,
      dataFreshness: {
        tide: tideData.timestamp,
        weather: weatherData.timestamp,
        waves: waveData.timestamp,
        waterQuality: waterQualityData.timestamp,
        sso: ssoData.length > 0 ? ssoData[0].reportedAt : new Date(),
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
