/**
 * Weather API Route
 * Fetches current weather and forecast
 */

import { NextResponse } from 'next/server';
import { fetchCurrentWeather, fetchWeatherForecast } from '@/lib/api/noaa';

export const dynamic = 'force-dynamic';
export const revalidate = 900; // Cache for 15 minutes

export async function GET() {
  try {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(),
      fetchWeatherForecast(),
    ]);

    return NextResponse.json({
      current,
      forecast: forecast.slice(0, 72), // Next 72 hours
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error in weather API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
