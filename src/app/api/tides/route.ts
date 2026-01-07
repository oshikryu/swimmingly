/**
 * Tides API Route
 * Fetches tide predictions for a specified time range
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTidePredictions, fetchCurrentTidePrediction } from '@/lib/api/noaa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '48', 10);

    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const [predictions, current] = await Promise.all([
      fetchTidePredictions(now, future),
      fetchCurrentTidePrediction(),
    ]);

    return NextResponse.json({
      current,
      predictions,
      range: { start: now, end: future },
    });
  } catch (error) {
    console.error('Error in tides API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tide data' },
      { status: 500 }
    );
  }
}
