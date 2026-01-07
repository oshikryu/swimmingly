/**
 * NOAA API Client
 * Integrates with NOAA's Tides & Currents API, National Weather Service, and NDBC (Buoy) APIs
 */

import axios from 'axios';
import { TIDE_STATION_ID, WAVE_BUOY_ID, AQUATIC_PARK_LAT, AQUATIC_PARK_LON } from '@/config/aquatic-park';
import type { TideData, TidePrediction, WeatherData, WaveData, CurrentData } from '@/types/conditions';

const NOAA_TIDES_BASE_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const NOAA_WEATHER_BASE_URL = 'https://api.weather.gov';
const NDBC_BASE_URL = 'https://www.ndbc.noaa.gov/data/realtime2';

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

    const response = await axios.get(NOAA_TIDES_BASE_URL, {
      params: {
        product: 'predictions',
        application: 'Swimmingly',
        begin_date: startStr,
        end_date: endStr,
        datum: 'MLLW', // Mean Lower Low Water
        station: stationId,
        time_zone: 'lst_ldt', // Local Standard Time / Local Daylight Time
        units: 'english',
        interval: 'hilo', // High and low tides only
        format: 'json',
      },
    });

    if (!response.data?.predictions) {
      throw new Error('No tide predictions data received from NOAA');
    }

    return response.data.predictions.map((pred: any) => ({
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

    const response = await axios.get(NOAA_TIDES_BASE_URL, {
      params: {
        product: 'water_level',
        application: 'Swimmingly',
        begin_date: formatNOAADate(oneHourAgo),
        end_date: formatNOAADate(now),
        datum: 'MLLW',
        station: stationId,
        time_zone: 'lst_ldt',
        units: 'english',
        format: 'json',
      },
    });

    if (!response.data?.data || response.data.data.length === 0) {
      return null;
    }

    // Get the most recent observation
    const latest = response.data.data[response.data.data.length - 1];

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
export async function fetchCurrents(stationId: string = TIDE_STATION_ID): Promise<CurrentData | null> {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const response = await axios.get(NOAA_TIDES_BASE_URL, {
      params: {
        product: 'currents',
        application: 'Swimmingly',
        begin_date: formatNOAADate(oneHourAgo),
        end_date: formatNOAADate(now),
        station: stationId,
        time_zone: 'lst_ldt',
        units: 'english',
        format: 'json',
      },
    });

    if (!response.data?.data || response.data.data.length === 0) {
      return null;
    }

    const latest = response.data.data[response.data.data.length - 1];

    return {
      timestamp: new Date(latest.t),
      speedKnots: parseFloat(latest.s),
      direction: parseInt(latest.d, 10),
      lat: AQUATIC_PARK_LAT,
      lon: AQUATIC_PARK_LON,
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
    const pointResponse = await axios.get(
      `${NOAA_WEATHER_BASE_URL}/points/${AQUATIC_PARK_LAT},${AQUATIC_PARK_LON}`,
      {
        headers: {
          'User-Agent': '(Swimmingly, contact@swimmingly.app)',
        },
      }
    );

    const forecastHourlyUrl = pointResponse.data.properties.forecastHourly;

    // Fetch hourly forecast
    const forecastResponse = await axios.get(forecastHourlyUrl, {
      headers: {
        'User-Agent': '(Swimmingly, contact@swimmingly.app)',
      },
    });

    const periods = forecastResponse.data.properties.periods;

    return periods.slice(0, 72).map((period: any) => ({
      timestamp: new Date(period.startTime),
      temperatureF: period.temperature,
      windSpeedMph: parseWindSpeed(period.windSpeed),
      windDirection: parseWindDirection(period.windDirection),
      windGustMph: period.windGust ? parseWindSpeed(period.windGust) : undefined,
      visibilityMiles: 10, // Default, NWS doesn't always provide visibility
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
    const pointResponse = await axios.get(
      `${NOAA_WEATHER_BASE_URL}/points/${AQUATIC_PARK_LAT},${AQUATIC_PARK_LON}`,
      {
        headers: {
          'User-Agent': '(Swimmingly, contact@swimmingly.app)',
        },
      }
    );

    const observationStationsUrl = pointResponse.data.properties.observationStations;
    const stationsResponse = await axios.get(observationStationsUrl, {
      headers: {
        'User-Agent': '(Swimmingly, contact@swimmingly.app)',
      },
    });

    const nearestStation = stationsResponse.data.features[0]?.id;
    if (!nearestStation) {
      throw new Error('No nearby observation station found');
    }

    const obsResponse = await axios.get(`${nearestStation}/observations/latest`, {
      headers: {
        'User-Agent': '(Swimmingly, contact@swimmingly.app)',
      },
    });

    const obs = obsResponse.data.properties;

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
      visibilityMiles: metersToMiles(obs.visibility?.value || 16000),
      conditions: obs.textDescription?.toLowerCase() || 'unknown',
      pressure: obs.barometricPressure?.value,
      humidity: obs.relativeHumidity?.value,
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
    const response = await axios.get(`${NDBC_BASE_URL}/${buoyId}.txt`, {
      responseType: 'text',
    });

    const lines = response.data.split('\n');
    if (lines.length < 3) {
      throw new Error('Insufficient data from buoy');
    }

    // Skip header lines and get the most recent data (line 2)
    const dataLine = lines[2].trim().split(/\s+/);

    // NDBC standard format: YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS TIDE
    // Parse values, handling "MM" (missing data) from NOAA
    const parseValue = (value: string): number | undefined => {
      if (!value || value === 'MM') return undefined;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
    };

    const waveHeightMeters = parseValue(dataLine[8]); // WVHT in meters
    const dominantPeriod = parseValue(dataLine[9]); // DPD in seconds
    const meanWaveDirection = parseValue(dataLine[11]); // MWD in degrees

    console.log(`Buoy ${buoyId} raw data - WVHT: ${dataLine[8]}, DPD: ${dataLine[9]}, MWD: ${dataLine[11]}`);
    console.log(`Parsed wave data - height: ${waveHeightMeters}m, period: ${dominantPeriod}s, direction: ${meanWaveDirection}°`);

    // Only return data if we have at least wave height
    if (waveHeightMeters === undefined) {
      console.warn(`No valid wave height data from buoy ${buoyId}`);
      return null;
    }

    return {
      timestamp: new Date(), // Buoy data is usually within the last hour
      waveHeightFeet: waveHeightMeters * 3.28084, // Convert meters to feet
      swellPeriodSeconds: dominantPeriod,
      swellDirection: meanWaveDirection,
      dominantPeriod: dominantPeriod,
      source: 'NOAA-NDBC',
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
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [currentTide, predictions] = await Promise.all([
      fetchCurrentTide(),
      fetchTidePredictions(now, tomorrow),
    ]);

    if (!currentTide || !predictions || predictions.length === 0) {
      return null;
    }

    // Find next high and low tides
    const futureTides = predictions.filter(p => p.timestamp > now);
    const nextHigh = futureTides.find(p => p.type === 'high');
    const nextLow = futureTides.find(p => p.type === 'low');

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

function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}
