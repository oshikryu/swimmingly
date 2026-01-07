/**
 * Waves API Route
 * Fetches wave and swell data from NOAA buoy
 */

import { NextResponse } from 'next/server';
import { fetchWaveData } from '@/lib/api/noaa';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // Cache for 10 minutes

export async function GET() {
  try {
    const waveData = await fetchWaveData();

    if (!waveData) {
      return NextResponse.json(
        { error: 'No wave data available' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      current: waveData,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error in waves API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wave data' },
      { status: 500 }
    );
  }
}
