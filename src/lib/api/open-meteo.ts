/**
 * Open-Meteo API Client
 * Provides real-time wind data for Aquatic Park
 *
 * API Docs: https://open-meteo.com/en/docs
 * No API key required - completely free for non-commercial use
 */

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
  temperatureF?: number; // Air temperature in Fahrenheit
  source: string;
}

/**
 * Fetch current wind conditions from Open-Meteo
 *
 * @returns Wind data or null if fetch fails
 */
export async function fetchWindData(): Promise<OpenMeteoWindData | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(AQUATIC_PARK_LAT),
      longitude: String(AQUATIC_PARK_LON),
      current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m',
      wind_speed_unit: 'mph',
      temperature_unit: 'fahrenheit',
      timezone: 'America/Los_Angeles',
    });

    const response = await fetch(`${OPEN_METEO_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error('Open-Meteo API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const current = data?.current;

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
      temperatureF: current.temperature_2m !== undefined && !isNaN(current.temperature_2m)
        ? current.temperature_2m
        : undefined,
      source: 'open-meteo',
    };
  } catch (error) {
    console.error('Error fetching Open-Meteo wind data:', error);
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
    const params = new URLSearchParams({
      latitude: String(AQUATIC_PARK_LAT),
      longitude: String(AQUATIC_PARK_LON),
      hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'mph',
      timezone: 'America/Los_Angeles',
      forecast_days: String(Math.ceil(hours / 24)),
    });

    const response = await fetch(`${OPEN_METEO_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error('Open-Meteo forecast API error:', response.status);
      return null;
    }

    const data = await response.json();
    const hourly = data?.hourly;

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
