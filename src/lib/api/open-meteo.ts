/**
 * Open-Meteo API Client
 * Provides real-time wind data for Aquatic Park
 *
 * API Docs: https://open-meteo.com/en/docs
 * No API key required - completely free for non-commercial use
 */

import axios from 'axios';
import { AQUATIC_PARK_LAT, AQUATIC_PARK_LON } from '@/config/aquatic-park';

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Wind data structure returned by Open-Meteo
 */
export interface OpenMeteoWindData {
  timestamp: Date;
  windSpeedMph: number;
  windDirection: number; // degrees 0-360
  windGustMph?: number;
  source: string;
}

/**
 * Fetch current wind conditions from Open-Meteo
 *
 * @returns Wind data or null if fetch fails
 */
export async function fetchWindData(): Promise<OpenMeteoWindData | null> {
  try {
    const response = await axios.get(OPEN_METEO_BASE_URL, {
      params: {
        latitude: AQUATIC_PARK_LAT,
        longitude: AQUATIC_PARK_LON,
        current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        wind_speed_unit: 'mph',
        timezone: 'America/Los_Angeles',
      },
      timeout: 5000, // 5 second timeout
    });

    const current = response.data?.current;

    // Validate required fields
    if (!current ||
        current.wind_speed_10m === undefined ||
        current.wind_direction_10m === undefined) {
      console.warn('Open-Meteo: Missing required wind data fields');
      return null;
    }

    // Check for NaN values
    if (isNaN(current.wind_speed_10m) || isNaN(current.wind_direction_10m)) {
      console.warn('Open-Meteo: Invalid wind data values (NaN)');
      return null;
    }

    return {
      timestamp: new Date(current.time),
      windSpeedMph: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      windGustMph: current.wind_gusts_10m || undefined,
      source: 'open-meteo',
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Open-Meteo API error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
      }
    } else {
      console.error('Error fetching Open-Meteo wind data:', error);
    }
    return null;
  }
}

/**
 * Fetch hourly wind forecast (optional - for future use)
 *
 * @param hours Number of hours to forecast (max 168 = 7 days)
 * @returns Array of hourly wind forecasts or null if fetch fails
 */
export async function fetchWindForecast(hours: number = 48): Promise<OpenMeteoWindData[] | null> {
  try {
    const response = await axios.get(OPEN_METEO_BASE_URL, {
      params: {
        latitude: AQUATIC_PARK_LAT,
        longitude: AQUATIC_PARK_LON,
        hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        wind_speed_unit: 'mph',
        timezone: 'America/Los_Angeles',
        forecast_days: Math.ceil(hours / 24),
      },
      timeout: 5000,
    });

    const hourly = response.data?.hourly;

    if (!hourly || !hourly.time || !hourly.wind_speed_10m) {
      console.warn('Open-Meteo: Missing hourly forecast data');
      return null;
    }

    const forecasts: OpenMeteoWindData[] = [];

    for (let i = 0; i < Math.min(hours, hourly.time.length); i++) {
      forecasts.push({
        timestamp: new Date(hourly.time[i]),
        windSpeedMph: hourly.wind_speed_10m[i],
        windDirection: hourly.wind_direction_10m[i],
        windGustMph: hourly.wind_gusts_10m?.[i],
        source: 'open-meteo-forecast',
      });
    }

    return forecasts;
  } catch (error) {
    console.error('Error fetching Open-Meteo wind forecast:', error);
    return null;
  }
}
