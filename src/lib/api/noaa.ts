/**
 * NOAA API Client
 * Integrates with NOAA's Tides & Currents API, National Weather Service, and NDBC (Buoy) APIs
 */

import { TIDE_STATION_ID, WAVE_BUOY_ID, AQUATIC_PARK_LAT, AQUATIC_PARK_LON, CURRENT_STATION_ID } from '@/config/aquatic-park';
import type { TideData, TidePrediction, WeatherData, WaveData, CurrentData } from '@/types/conditions';

const NOAA_TIDES_BASE_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const NOAA_WEATHER_BASE_URL = 'https://api.weather.gov';
const NDBC_BASE_URL = 'https://www.ndbc.noaa.gov/data/realtime2';

const NWS_HEADERS = {
  'User-Agent': '(Swimmingly, contact@swimmingly.app)',
};

/**
 * Fetch tide predictions for a given time range
 */
export async function fetchTidePredictions(
  startDate: Date,
  endDate: Date,
  stationId: string = TIDE_STATION_ID
): Promise<TideData[]> {
  try {
    const startStr = formatNOAADate(startDate);
    const endStr = formatNOAADate(endDate);

    const params = new URLSearchParams({
      product: 'predictions',
      application: 'Swimmingly',
      begin_date: startStr,
      end_date: endStr,
      datum: 'MLLW',
      station: stationId,
      time_zone: 'lst_ldt',
      units: 'english',
      interval: 'hilo',
      format: 'json',
    });

    const response = await fetch(`${NOAA_TIDES_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`NOAA tide predictions HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data?.predictions) {
      throw new Error('No tide predictions data received from NOAA');
    }

    return data.predictions.map((pred: { t: string; v: string; type?: string }) => ({
      timestamp: new Date(pred.t),
      heightFeet: parseFloat(pred.v),
      type: pred.type === 'H' ? 'high' : pred.type === 'L' ? 'low' : 'normal',
      source: 'NOAA',
    }));
  } catch (error) {
    console.error('Error fetching tide predictions:', error);
    throw new Error(`Failed to fetch tide predictions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch current tide data (6-minute interval observations)
 */
export async function fetchCurrentTide(stationId: string = TIDE_STATION_ID): Promise<TideData | null> {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const params = new URLSearchParams({
      product: 'water_level',
      application: 'Swimmingly',
      begin_date: formatNOAADate(oneHourAgo),
      end_date: formatNOAADate(now),
      datum: 'MLLW',
      station: stationId,
      time_zone: 'lst_ldt',
      units: 'english',
      format: 'json',
    });

    const response = await fetch(`${NOAA_TIDES_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('NOAA current tide HTTP error:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data?.data || data.data.length === 0) {
      return null;
    }

    // Get the most recent observation
    const latest = data.data[data.data.length - 1];

    return {
      timestamp: new Date(latest.t),
      heightFeet: parseFloat(latest.v),
      type: 'normal',
      source: 'NOAA',
    };
  } catch (error) {
    console.error('Error fetching current tide:', error);
    return null;
  }
}

/**
 * Fetch current data (water flow/currents)
 */
export async function fetchCurrents(
  stationId: string = CURRENT_STATION_ID
): Promise<CurrentData | null> {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const params = new URLSearchParams({
      product: 'currents_predictions',
      application: 'Swimmingly',
      begin_date: formatNOAADate(oneHourAgo),
      end_date: formatNOAADate(now),
      station: stationId,
      time_zone: 'lst_ldt',
      units: 'english',
      format: 'json',
    });

    const response = await fetch(`${NOAA_TIDES_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('NOAA currents HTTP error:', response.status);
      return null;
    }

    const data = await response.json();
    const predictions = data?.current_predictions?.cp;
    if (!predictions || predictions.length === 0) {
      return null;
    }

    const latest = predictions[predictions.length - 1];

    const velocity = parseFloat(latest.Velocity_Major);
    const speedKnots = Math.abs(velocity);

    const direction =
      velocity >= 0
        ? parseInt(latest.meanFloodDir, 10)
        : parseInt(latest.meanEbbDir, 10);

    return {
      timestamp: new Date(latest.Time),
      speedKnots,
      direction,
      source: 'NOAA',
    };
  } catch (error) {
    console.error('Error fetching currents:', error);
    return null;
  }
}

/**
 * Fetch weather forecast from NOAA National Weather Service
 */
export async function fetchWeatherForecast(): Promise<WeatherData[]> {
  try {
    // First, get the grid endpoint for our location
    const pointResponse = await fetch(
      `${NOAA_WEATHER_BASE_URL}/points/${AQUATIC_PARK_LAT},${AQUATIC_PARK_LON}`,
      {
        headers: NWS_HEADERS,
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!pointResponse.ok) {
      throw new Error(`NWS points HTTP ${pointResponse.status}`);
    }

    const pointData = await pointResponse.json();
    const forecastHourlyUrl = pointData.properties.forecastHourly;

    // Fetch hourly forecast
    const forecastResponse = await fetch(forecastHourlyUrl, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!forecastResponse.ok) {
      throw new Error(`NWS forecast HTTP ${forecastResponse.status}`);
    }

    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties.periods;

    return periods.slice(0, 72).map((period: { startTime: string; temperature: number; windSpeed: string; windDirection: string; windGust?: string; shortForecast: string }) => ({
      timestamp: new Date(period.startTime),
      temperatureF: period.temperature,
      windSpeedMph: parseWindSpeed(period.windSpeed),
      windDirection: parseWindDirection(period.windDirection),
      windGustMph: period.windGust ? parseWindSpeed(period.windGust) : undefined,
      conditions: period.shortForecast.toLowerCase(),
      source: 'NOAA-NWS',
    }));
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    throw new Error(`Failed to fetch weather forecast: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch current weather observations
 */
export async function fetchCurrentWeather(): Promise<WeatherData | null> {
  try {
    // Get observations from the nearest station
    const pointResponse = await fetch(
      `${NOAA_WEATHER_BASE_URL}/points/${AQUATIC_PARK_LAT},${AQUATIC_PARK_LON}`,
      {
        headers: NWS_HEADERS,
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!pointResponse.ok) {
      throw new Error(`NWS points HTTP ${pointResponse.status}`);
    }

    const pointData = await pointResponse.json();
    const observationStationsUrl = pointData.properties.observationStations;

    const stationsResponse = await fetch(observationStationsUrl, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!stationsResponse.ok) {
      throw new Error(`NWS stations HTTP ${stationsResponse.status}`);
    }

    const stationsData = await stationsResponse.json();
    const nearestStation = stationsData.features[0]?.id;
    if (!nearestStation) {
      throw new Error('No nearby observation station found');
    }

    const obsResponse = await fetch(`${nearestStation}/observations/latest`, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!obsResponse.ok) {
      throw new Error(`NWS observations HTTP ${obsResponse.status}`);
    }

    const obsData = await obsResponse.json();
    const obs = obsData.properties;

    // Ensure we have critical weather data
    const temperature = obs.temperature?.value;
    const windSpeed = obs.windSpeed?.value;

    if (temperature === null || temperature === undefined ||
        windSpeed === null || windSpeed === undefined) {
      console.warn('Missing critical weather data from NOAA');
      console.warn(`Temperature: ${temperature}, Wind Speed: ${windSpeed}`);
      console.warn(`Station: ${nearestStation}`);
      console.warn('This is expected if the observation station has not reported recently');
      return null;
    }

    return {
      timestamp: new Date(obs.timestamp),
      temperatureF: celsiusToFahrenheit(temperature),
      windSpeedMph: metersPerSecondToMph(windSpeed),
      windDirection: obs.windDirection?.value || 0,
      windGustMph: obs.windGust?.value ? metersPerSecondToMph(obs.windGust.value) : undefined,
      conditions: obs.textDescription?.toLowerCase() || 'unknown',
      source: 'NOAA-NWS',
    };
  } catch (error) {
    console.error('Error fetching current weather:', error);
    return null;
  }
}

/**
 * Fetch wave/swell data from NOAA NDBC buoy
 */
export async function fetchWaveData(buoyId: string = WAVE_BUOY_ID): Promise<WaveData | null> {
  try {
    // NDBC provides real-time data in text format
    const response = await fetch(`${NDBC_BASE_URL}/${buoyId}.txt`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`NDBC buoy ${buoyId} HTTP error:`, response.status);
      return null;
    }

    const text = await response.text();
    const lines = text.split('\n');
    if (lines.length < 3) {
      throw new Error('Insufficient data from buoy');
    }

    // NDBC standard format: YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS TIDE
    // Parse values, handling "MM" (missing data) from NOAA
    const parseValue = (value: string): number | undefined => {
      if (!value || value === 'MM') return undefined;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
    };

    // Parse all data lines (skip first 2 header lines) and find the most recent with valid wave height
    interface ValidDataEntry {
      timestamp: Date;
      line: string[];
    }
    let latestValidData: ValidDataEntry | null = null;

    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const dataLine = line.split(/\s+/);
      if (dataLine.length < 13) continue; // Need at least 13 fields (through PRES at index 12)

      // Parse timestamp: YY MM DD hh mm
      const year = parseInt(dataLine[0], 10);
      const month = parseInt(dataLine[1], 10);
      const day = parseInt(dataLine[2], 10);
      const hour = parseInt(dataLine[3], 10);
      const minute = parseInt(dataLine[4], 10);

      // Validate timestamp fields
      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
        continue;
      }

      // NDBC uses 2-digit year (23 = 2023)
      const fullYear = year < 50 ? 2000 + year : 1900 + year;
      const timestamp = new Date(Date.UTC(fullYear, month - 1, day, hour, minute));

      // Check if this line has valid wave height
      const waveHeightMeters = parseValue(dataLine[8]);
      if (waveHeightMeters !== undefined) {
        // Use the first valid entry (most recent)
        latestValidData = { timestamp, line: dataLine };
        break; // Found the most recent valid data
      }
    }

    if (!latestValidData) {
      console.warn(`No valid wave height data from buoy ${buoyId}`);
      return null;
    }

    const { timestamp, line: dataLine } = latestValidData;
    const waveHeightMeters = parseValue(dataLine[8])!; // We know it's valid
    const dominantPeriod = parseValue(dataLine[9]); // DPD in seconds
    const barometricPressureMb = parseValue(dataLine[12]); // PRES in millibars

    console.log(`Buoy ${buoyId} - Using data from ${timestamp.toISOString()}`);
    console.log(`Buoy ${buoyId} raw data - WVHT: ${dataLine[8]}, DPD: ${dataLine[9]}, PRES: ${dataLine[12]}`);
    console.log(`Parsed wave data - height: ${waveHeightMeters}m, period: ${dominantPeriod}s, pressure: ${barometricPressureMb}mb`);

    return {
      timestamp,
      waveHeightFeet: waveHeightMeters * 3.28084, // Convert meters to feet
      swellPeriodSeconds: dominantPeriod,
      barometricPressureMb,
      source: `NOAA-NDBC Buoy ${buoyId}`,
    };
  } catch (error) {
    console.error('Error fetching wave data:', error);
    return null;
  }
}

/**
 * Calculate tide prediction with phase information
 */
export async function fetchCurrentTidePrediction(): Promise<TidePrediction | null> {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [currentTide, predictions] = await Promise.all([
      fetchCurrentTide(),
      fetchTidePredictions(yesterday, tomorrow),
    ]);

    if (!currentTide || !predictions || predictions.length === 0) {
      return null;
    }

    // Find next high and low tides (future only)
    const futureTides = predictions.filter(p => p.timestamp > now);
    const nextHigh = futureTides.find(p => p.type === 'high');
    const nextLow = futureTides.find(p => p.type === 'low');

    // Find previous high and low tides (past only, most recent first)
    const pastTides = predictions.filter(p => p.timestamp <= now).reverse();
    const previousHigh = pastTides.find(p => p.type === 'high');
    const previousLow = pastTides.find(p => p.type === 'low');

    // Determine current phase
    let currentPhase: 'flood' | 'ebb' | 'slack' = 'slack';
    let changeRate = 0;

    if (nextHigh && nextLow) {
      const timeToHigh = nextHigh.timestamp.getTime() - now.getTime();
      const timeToLow = nextLow.timestamp.getTime() - now.getTime();

      if (timeToHigh < timeToLow) {
        currentPhase = 'flood'; // Rising tide
        changeRate = (nextHigh.heightFeet - currentTide.heightFeet) / (timeToHigh / (1000 * 60 * 60));
      } else {
        currentPhase = 'ebb'; // Falling tide
        changeRate = (currentTide.heightFeet - nextLow.heightFeet) / (timeToLow / (1000 * 60 * 60));
      }

      // If change rate is very low, consider it slack
      if (Math.abs(changeRate) < 0.5) {
        currentPhase = 'slack';
      }
    }

    return {
      ...currentTide,
      nextHigh,
      nextLow,
      previousHigh,
      previousLow,
      currentPhase,
      changeRateFeetPerHour: changeRate,
    };
  } catch (error) {
    console.error('Error calculating tide prediction:', error);
    return null;
  }
}

// Utility functions

function formatNOAADate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day} ${hour}:${minute}`;
}

function parseWindSpeed(windSpeedStr: string): number {
  // Wind speed format: "10 mph" or "10 to 15 mph"
  const match = windSpeedStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseWindDirection(dirStr: string): number {
  const directions: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return directions[dirStr] || 0;
}

function celsiusToFahrenheit(celsius: number | null): number {
  if (celsius === null) return 0;
  return (celsius * 9/5) + 32;
}

function metersPerSecondToMph(mps: number | null): number {
  if (mps === null) return 0;
  return mps * 2.23694;
}
