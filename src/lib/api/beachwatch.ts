/**
 * Water Quality API Client
 * Fetches water quality data including bacteria counts from multiple sources
 * Primary: SF Gov Beach Water Quality Monitoring
 * Fallbacks: California Water Quality Data, Water Quality Portal
 */

import axios from 'axios';
import type { WaterQuality } from '@/types/conditions';
import { AQUATIC_PARK_LAT, AQUATIC_PARK_LON } from '@/config/aquatic-park';

// SF Gov Beach Water Quality Monitoring (Primary source) - SODA API
const SF_BEACH_WQ_API = 'https://data.sfgov.org/resource/v3fv-x3ux.json';

// California Surface Water Bacteria Data API (Fallback)
const CA_BEACHES_API_URL = 'https://data.ca.gov/api/3/action/datastore_search';
const CA_MEASUREMENTS_RESOURCE_ID = '15a63495-8d9f-4a49-b43a-3092ef3106b9'; // 2020-present measurements

// Water Quality Portal (WQP) - Federal USGS/EPA API (Fallback)
const WQP_STATION_API = 'https://www.waterqualitydata.us/data/Station/search';
const WQP_RESULT_API = 'https://www.waterqualitydata.us/data/Result/search';

// In-memory cache for station IDs
let cachedWQPStationId: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Helper: Format sample age for UI display
 */
function formatSampleAge(sampleDate: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - sampleDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return sampleDate.toLocaleDateString();
}

/**
 * Helper: Format date for WQP API (MM-DD-YYYY)
 */
function formatDateForWQP(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Helper: Get date N days ago
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Fetch water quality data from SF Gov Beach Water Quality Monitoring (Primary source)
 * Queries locations BAY#211_SL (Aquatic Park) and BAY#210.1_SL (Hyde Street Pier)
 */
async function fetchFromSFGov(): Promise<WaterQuality | null> {
  try {
    const response = await axios.get(SF_BEACH_WQ_API, {
      params: {
        $where: "source like '%210%' OR source like '%211%'",
        $order: 'sample_date DESC',
        $limit: 200,
      },
      timeout: 10000,
    });

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      console.warn('No data from SF Gov Beach Water Quality API for locations 210/211');
      return null;
    }

    console.log(`SF Gov API: Retrieved ${response.data.length} records for locations 210/211 (Hyde St Pier & Aquatic Park)`);

    // Find the most recent Enterococcus measurements from both locations
    const aquaticParkRecord = response.data.find(
      (record: any) =>
        record.source === 'BAY#211_SL' &&
        record.analyte === 'ENTERO' &&
        record.data !== null &&
        record.data !== undefined &&
        !isNaN(parseFloat(record.data))
    );

    const hydePierRecord = response.data.find(
      (record: any) =>
        record.source === 'BAY#210.1_SL' &&
        record.analyte === 'ENTERO' &&
        record.data !== null &&
        record.data !== undefined &&
        !isNaN(parseFloat(record.data))
    );

    if (!aquaticParkRecord && !hydePierRecord) {
      console.warn('No ENTERO (Enterococcus) data found in SF Gov API response for either location');
      return null;
    }

    // Use the most recent data between the two locations
    let selectedRecord = aquaticParkRecord;
    let locationName = 'Aquatic Park';

    if (aquaticParkRecord && hydePierRecord) {
      const aquaticDate = new Date(aquaticParkRecord.sample_date).getTime();
      const hydeDate = new Date(hydePierRecord.sample_date).getTime();

      if (hydeDate > aquaticDate) {
        selectedRecord = hydePierRecord;
        locationName = 'Hyde St Pier';
      }
    } else if (hydePierRecord && !aquaticParkRecord) {
      selectedRecord = hydePierRecord;
      locationName = 'Hyde St Pier';
    }

    if (!selectedRecord) {
      return null;
    }

    const sampleDate = new Date(selectedRecord.sample_date);
    const enterococcus = parseFloat(selectedRecord.data);

    console.log(`SF Gov: Found Enterococcus ${enterococcus} MPN/100ml from ${sampleDate.toLocaleDateString()} (${selectedRecord.source} - ${locationName})`);

    return {
      timestamp: sampleDate,
      enterococcusCount: enterococcus,
      status: assessWaterQualityStatus(enterococcus, undefined),
      source: `SF Beach Water Quality (${locationName})`,
      stationId: selectedRecord.source,
      notes: `Sampled ${formatSampleAge(sampleDate)}`,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('SF Gov API fetch failed:', error.message, error.response?.status);
    } else {
      console.error('SF Gov API fetch failed:', error);
    }
    return null;
  }
}

/**
 * Fetch water quality data from California API (Fallback)
 */
async function fetchFromCaliforniaAPI(): Promise<WaterQuality | null> {
  try {
    const response = await axios.get(CA_BEACHES_API_URL, {
      params: {
        resource_id: CA_MEASUREMENTS_RESOURCE_ID,
        q: 'Aquatic Park',
        sort: 'SampleDate desc',
        limit: 50, // Get enough records to find Enterococcus
      },
      timeout: 10000, // 10s timeout
    });

    if (!response.data?.success || !response.data?.result?.records) {
      return null;
    }

    const records = response.data.result.records;

    // Find the most recent Enterococcus measurement
    const enterococcusRecord = records.find(
      (r: any) => r.Analyte === 'Enterococcus' && r.Result !== null
    );

    // Find the most recent Total Coliform measurement
    const coliformRecord = records.find(
      (r: any) => r.Analyte === 'Coliform, Total' && r.Result !== null
    );

    if (!enterococcusRecord && !coliformRecord) {
      console.warn('No bacteria data found in California API response');
      return null;
    }

    // Use the most recent sample date
    const latestRecord = enterococcusRecord || coliformRecord;
    const sampleDate = new Date(latestRecord.SampleDate);

    const enterococcus = enterococcusRecord ? parseFloat(enterococcusRecord.Result) : undefined;
    const coliform = coliformRecord ? parseFloat(coliformRecord.Result) : undefined;

    return {
      timestamp: sampleDate,
      enterococcusCount: enterococcus,
      coliformCount: coliform,
      status: assessWaterQualityStatus(enterococcus, coliform),
      source: 'California Water Quality Data',
      notes: `Sampled ${formatSampleAge(sampleDate)}`,
    };
  } catch (error) {
    console.error('California API fetch failed:', error);
    return null;
  }
}

/**
 * Discover WQP station ID for Aquatic Park (with caching)
 */
async function discoverWQPStation(): Promise<string | null> {
  // Check cache
  if (cachedWQPStationId && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    return cachedWQPStationId;
  }

  try {
    const response = await axios.get(WQP_STATION_API, {
      params: {
        countrycode: 'US',
        statecode: 'US:06',
        countycode: 'US:06:075', // SF County
        characteristicName: 'Enterococcus',
        mimeType: 'csv',
        zip: 'no',
      },
      timeout: 10000,
    });

    // Parse CSV response to find Aquatic Park station
    const lines = response.data.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('AQUATIC PARK') || line.includes('Aquatic Park')) {
        const parts = line.split(',');
        if (parts.length > 2) {
          cachedWQPStationId = parts[2]; // MonitoringLocationIdentifier column
          cacheTimestamp = Date.now();
          console.log('Discovered WQP station:', cachedWQPStationId);
          return cachedWQPStationId;
        }
      }
    }

    // If not found by name, try nearby coordinates
    const coordResponse = await axios.get(WQP_STATION_API, {
      params: {
        lat: AQUATIC_PARK_LAT.toString(),
        long: AQUATIC_PARK_LON.toString(),
        within: '0.5', // 0.5 miles radius
        characteristicName: 'Enterococcus',
        mimeType: 'csv',
        zip: 'no',
      },
      timeout: 10000,
    });

    const coordLines = coordResponse.data.split('\n');
    if (coordLines.length > 1) {
      const parts = coordLines[1].split(',');
      if (parts.length > 2) {
        cachedWQPStationId = parts[2];
        cacheTimestamp = Date.now();
        console.log('Discovered WQP station by coordinates:', cachedWQPStationId);
        return cachedWQPStationId;
      }
    }

    console.warn('Could not discover WQP station for Aquatic Park');
    return null;
  } catch (error) {
    console.error('WQP station discovery failed:', error);
    return null;
  }
}

/**
 * Fetch water quality data from Water Quality Portal
 */
async function fetchFromWQP(): Promise<WaterQuality | null> {
  try {
    const stationId = await discoverWQPStation();
    if (!stationId) {
      return null;
    }

    const response = await axios.get(WQP_RESULT_API, {
      params: {
        siteid: stationId,
        characteristicName: 'Enterococcus',
        startDateLo: formatDateForWQP(daysAgo(90)), // Last 90 days
        mimeType: 'csv',
        zip: 'no',
      },
      timeout: 10000,
    });

    // Parse CSV response
    const lines = response.data.split('\n');
    if (lines.length < 2) {
      return null; // No data
    }

    // Get the most recent result (first data row after header)
    const headerParts = lines[0].split(',');
    const dataParts = lines[1].split(',');

    // Find column indices
    const dateIndex = headerParts.indexOf('ActivityStartDate');
    const valueIndex = headerParts.indexOf('ResultMeasureValue');

    if (dateIndex === -1 || valueIndex === -1 || !dataParts[valueIndex]) {
      return null;
    }

    const sampleDate = new Date(dataParts[dateIndex]);
    const enterococcus = parseFloat(dataParts[valueIndex]);

    return {
      timestamp: sampleDate,
      enterococcusCount: enterococcus,
      status: assessWaterQualityStatus(enterococcus, undefined),
      source: 'Water Quality Portal (WQP)',
      notes: `Sampled ${formatSampleAge(sampleDate)}`,
    };
  } catch (error) {
    console.error('WQP fetch failed:', error);
    return null;
  }
}

/**
 * Fetch the latest water quality data for Aquatic Park
 * Queries multiple APIs and uses whichever has the most recent data
 * Priority: SF Gov > California API > Water Quality Portal
 */
export async function fetchWaterQuality(): Promise<WaterQuality | null> {
  try {
    // Query all three APIs in parallel for best performance
    const [sfGovData, caData, wqpData] = await Promise.allSettled([
      fetchFromSFGov(),
      fetchFromCaliforniaAPI(),
      fetchFromWQP(),
    ]);

    // Extract successful results
    const sfGovResult = sfGovData.status === 'fulfilled' ? sfGovData.value : null;
    const caResult = caData.status === 'fulfilled' ? caData.value : null;
    const wqpResult = wqpData.status === 'fulfilled' ? wqpData.value : null;

    // If all failed, return null
    if (!sfGovResult && !caResult && !wqpResult) {
      console.warn('All water quality APIs unavailable');
      return null;
    }

    // Collect all successful results with their timestamps
    const results: Array<{ data: WaterQuality; timestamp: number }> = [];

    if (sfGovResult) {
      results.push({
        data: sfGovResult,
        timestamp: new Date(sfGovResult.timestamp).getTime(),
      });
    }
    if (caResult) {
      results.push({
        data: caResult,
        timestamp: new Date(caResult.timestamp).getTime(),
      });
    }
    if (wqpResult) {
      results.push({
        data: wqpResult,
        timestamp: new Date(wqpResult.timestamp).getTime(),
      });
    }

    // Sort by timestamp (most recent first) and return the most recent data
    results.sort((a, b) => b.timestamp - a.timestamp);
    const mostRecent = results[0].data;

    console.log(`Using ${mostRecent.source} - Sample date: ${mostRecent.timestamp}`);
    return mostRecent;
  } catch (error) {
    console.error('Error fetching water quality:', error);
    return null;
  }
}

/**
 * Fetch bacteria count data
 */
export async function fetchBacteriaCount(beachId: string, date?: Date): Promise<{
  enterococcus?: number;
  coliform?: number;
  sampleDate: Date;
} | null> {
  try {
    // Placeholder implementation
    // In production, this would query the beach monitoring database

    console.warn('Beach Watch API: fetchBacteriaCount using placeholder');

    return {
      enterococcus: 50,
      coliform: 100,
      sampleDate: date || new Date(),
    };
  } catch (error) {
    console.error('Error fetching bacteria count:', error);
    return null;
  }
}

/**
 * Get water quality status based on bacteria levels
 */
export function assessWaterQualityStatus(
  enterococcus?: number,
  coliform?: number
): 'safe' | 'advisory' | 'warning' | 'closed' {
  // EPA standards for marine water
  // Enterococcus: >104 MPN/100ml = advisory
  // Enterococcus: >500 MPN/100ml = warning

  if (enterococcus !== undefined) {
    if (enterococcus > 500) return 'closed';
    if (enterococcus > 104) return 'warning';
  }

  if (coliform !== undefined) {
    if (coliform > 1000) return 'warning';
    if (coliform > 200) return 'advisory';
  }

  return 'safe';
}

/**
 * Fetch historical water quality trends
 */
export async function fetchWaterQualityTrends(daysBack: number = 30): Promise<WaterQuality[]> {
  try {
    // Placeholder implementation
    // In production, this would fetch historical data

    console.warn('Beach Watch API: fetchWaterQualityTrends using placeholder');

    const trends: WaterQuality[] = [];
    const now = new Date();

    for (let i = 0; i < daysBack; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      trends.push({
        timestamp: date,
        enterococcusCount: Math.floor(Math.random() * 150), // Random placeholder
        coliformCount: Math.floor(Math.random() * 300),
        status: 'safe',
        source: 'CA-BeachWatch-Placeholder',
      });
    }

    return trends;
  } catch (error) {
    console.error('Error fetching water quality trends:', error);
    return [];
  }
}

/**
 * Alternative: SF Bay Water Quality API
 * San Francisco Bay has its own water quality monitoring through SFEI
 */
export async function fetchSFBayWaterQuality(): Promise<WaterQuality | null> {
  try {
    // San Francisco Estuary Institute (SFEI) provides water quality data
    // This would integrate with their API or data portal

    // Placeholder for now
    console.warn('SF Bay Water Quality API: Using placeholder implementation');

    return {
      timestamp: new Date(),
      enterococcusCount: 45,
      status: 'safe',
      notes: 'Data from SF Bay water quality monitoring - placeholder',
      source: 'SFEI-Placeholder',
    };
  } catch (error) {
    console.error('Error fetching SF Bay water quality:', error);
    return null;
  }
}
