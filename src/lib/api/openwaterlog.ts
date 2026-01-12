/**
 * OpenWaterLog API Client
 * Scrapes wave height data from openwaterlog.com
 */

import axios from 'axios';
import type { WaveData } from '@/types/conditions';

const OPENWATERLOG_URL = 'https://openwaterlog.com/locations/aquatic-park/';

interface OpenWaterLogWaveDataPoint {
  iso: string;
  y: number; // wave height in feet
  name: string;
  measure: string;
  sec_val: number; // wave height in meters
  measure_two: string;
}

/**
 * Fetch wave data from OpenWaterLog by scraping their HTML page
 * Returns the most recent wave height data point
 */
export async function fetchOpenWaterLogWaveData(): Promise<WaveData | null> {
  try {
    console.log('Fetching wave data from OpenWaterLog...');

    // Fetch the HTML page
    const response = await axios.get(OPENWATERLOG_URL, {
      headers: {
        'User-Agent': 'Swimmingly/1.0 (contact@swimmingly.app)',
      },
      timeout: 10000, // 10 second timeout
    });

    const html = response.data;

    // Extract the waveData JavaScript variable from the HTML
    // Look for pattern: var waveData = [{...}];
    const waveDataMatch = html.match(/var\s+waveData\s*=\s*(\[[\s\S]*?\]);/);

    if (!waveDataMatch) {
      console.warn('Could not find waveData variable in OpenWaterLog HTML');
      return null;
    }

    // Parse the JSON array
    const waveDataJson = waveDataMatch[1];
    const waveDataPoints: OpenWaterLogWaveDataPoint[] = JSON.parse(waveDataJson);

    if (!waveDataPoints || waveDataPoints.length === 0) {
      console.warn('No wave data points found in OpenWaterLog data');
      return null;
    }

    // Find the most recent data point that's not in the future
    const now = new Date();
    const currentOrPastPoints = waveDataPoints.filter(point => {
      const pointDate = new Date(point.iso);
      return pointDate <= now;
    });

    // If all points are in the future, use the first future point
    const relevantPoint = currentOrPastPoints.length > 0
      ? currentOrPastPoints[currentOrPastPoints.length - 1]
      : waveDataPoints[0];

    if (!relevantPoint) {
      console.warn('No relevant wave data point found');
      return null;
    }

    const timestamp = new Date(relevantPoint.iso);
    const waveHeightFeet = relevantPoint.y;

    console.log(`OpenWaterLog - Using data from ${timestamp.toISOString()}`);
    console.log(`OpenWaterLog - Wave height: ${waveHeightFeet} ft`);

    return {
      timestamp,
      waveHeightFeet,
      source: 'OpenWaterLog',
    };
  } catch (error) {
    console.error('Error fetching wave data from OpenWaterLog:', error);
    if (axios.isAxiosError(error)) {
      console.error('  Status:', error.response?.status);
      console.error('  Message:', error.message);
    }
    return null;
  }
}
