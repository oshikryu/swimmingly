/**
 * Water Quality API Client
 * Fetches water quality data including bacteria counts from multiple sources
 * Primary (Aquatic Park): SF Gov Beach Water Quality Monitoring
 * Fallbacks: California Water Quality Data, Water Quality Portal (WQP)
 * WQP is also used standalone (fetchWaterQualityWQPOnly) for locations without
 * an SF Gov / California-specific dataset, e.g. San Diego County.
 */

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

// In-memory cache duration for station IDs
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Helper: Parse water quality data values that may contain "<" prefix
 * (e.g., "<10" means below detection limit, which is a very low/safe reading)
 * Returns the numeric value, treating "<X" as X (conservative upper bound).
 */
function parseWQValue(value: string): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  // Handle "<10", "< 10", etc. — treat as the detection limit value
  const belowDetection = trimmed.match(/^<\s*(\d+\.?\d*)$/);
  if (belowDetection) {
    return parseFloat(belowDetection[1]);
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

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
    const params = new URLSearchParams({
      $where: "source like '%210%' OR source like '%211%'",
      $order: 'sample_date DESC',
      $limit: '200',
    });

    const response = await fetch(`${SF_BEACH_WQ_API}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('SF Gov API fetch failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('No data from SF Gov Beach Water Quality API for locations 210/211');
      return null;
    }

    console.log(`SF Gov API: Retrieved ${data.length} records for locations 210/211 (Hyde St Pier & Aquatic Park)`);

    // Type for SF Gov API records
    type SFGovRecord = { source: string; analyte: string; data: string | null; sample_date: string };

    // Helper: find most recent valid record for a given analyte across both locations
    const findMostRecentRecord = (analyte: string): { record: SFGovRecord; location: string } | null => {
      const aquaticParkRecord = data.find(
        (r: SFGovRecord) =>
          r.source === 'BAY#211_SL' && r.analyte === analyte && r.data != null && parseWQValue(r.data) !== null
      );
      const hydePierRecord = data.find(
        (r: SFGovRecord) =>
          r.source === 'BAY#210.1_SL' && r.analyte === analyte && r.data != null && parseWQValue(r.data) !== null
      );

      if (!aquaticParkRecord && !hydePierRecord) return null;
      if (aquaticParkRecord && hydePierRecord) {
        return new Date(hydePierRecord.sample_date).getTime() > new Date(aquaticParkRecord.sample_date).getTime()
          ? { record: hydePierRecord, location: 'Hyde St Pier' }
          : { record: aquaticParkRecord, location: 'Aquatic Park' };
      }
      return aquaticParkRecord
        ? { record: aquaticParkRecord, location: 'Aquatic Park' }
        : { record: hydePierRecord!, location: 'Hyde St Pier' };
    };

    // Find most recent records for all three bacterial indicators
    const enteroResult = findMostRecentRecord('ENTERO');
    const eColiResult = findMostRecentRecord('COLI_E');
    const coliformResult = findMostRecentRecord('COLI_TOTAL');

    if (!enteroResult && !eColiResult && !coliformResult) {
      console.warn('No bacterial data found in SF Gov API response for either location');
      return null;
    }

    // Use the Enterococcus record as primary (or fall back to whichever is available)
    const primaryResult = enteroResult || eColiResult || coliformResult;
    if (!primaryResult) return null;

    const sampleDate = new Date(primaryResult.record.sample_date);
    const locationName = primaryResult.location;
    const stationId = primaryResult.record.source;

    const enterococcus = enteroResult ? parseWQValue(enteroResult.record.data!)! : undefined;
    const eColi = eColiResult ? parseWQValue(eColiResult.record.data!)! : undefined;
    const coliform = coliformResult ? parseWQValue(coliformResult.record.data!)! : undefined;

    console.log(`SF Gov: Enterococcus=${enterococcus ?? 'N/A'}, E.coli=${eColi ?? 'N/A'}, Total Coliform=${coliform ?? 'N/A'} MPN/100ml from ${sampleDate.toLocaleDateString()} (${stationId} - ${locationName})`);

    return {
      timestamp: sampleDate,
      enterococcusCount: enterococcus,
      eColiCount: eColi,
      coliformCount: coliform,
      status: assessWaterQualityStatus(enterococcus, eColi, coliform),
      source: `SF Beach Water Quality (${locationName})`,
      stationId,
      notes: `Sampled ${formatSampleAge(sampleDate)}`,
    };
  } catch (error) {
    console.error('SF Gov API fetch failed:', error);
    return null;
  }
}

/**
 * Fetch water quality data from California API (Fallback)
 */
async function fetchFromCaliforniaAPI(): Promise<WaterQuality | null> {
  try {
    const params = new URLSearchParams({
      resource_id: CA_MEASUREMENTS_RESOURCE_ID,
      q: 'Aquatic Park',
      sort: 'SampleDate desc',
      limit: '50',
    });

    const response = await fetch(`${CA_BEACHES_API_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('California API fetch failed:', response.status);
      return null;
    }

    const responseData = await response.json();

    if (!responseData?.success || !responseData?.result?.records) {
      return null;
    }

    const records = responseData.result.records;

    // Find the most recent Enterococcus measurement
    const enterococcusRecord = records.find(
      (r: { Analyte: string; Result: number | null }) => r.Analyte === 'Enterococcus' && r.Result !== null
    );

    // Find the most recent Total Coliform measurement
    const coliformRecord = records.find(
      (r: { Analyte: string; Result: number | null }) => r.Analyte === 'Coliform, Total' && r.Result !== null
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
      status: assessWaterQualityStatus(enterococcus, undefined, coliform),
      source: 'California Water Quality Data',
      notes: `Sampled ${formatSampleAge(sampleDate)}`,
    };
  } catch (error) {
    console.error('California API fetch failed:', error);
    return null;
  }
}

// Per-location in-memory cache for discovered WQP station IDs (keyed by locationName)
const wqpStationCache = new Map<string, { stationId: string; cachedAt: number }>();

/**
 * Discover a WQP station ID near the given location (with caching)
 * Tries an exact name match within the county first, then falls back to a coordinate radius search.
 */
async function discoverWQPStation(
  locationName: string = 'AQUATIC PARK',
  lat: number = AQUATIC_PARK_LAT,
  lon: number = AQUATIC_PARK_LON,
  countyCode: string = 'US:06:075'
): Promise<string | null> {
  // Check cache
  const cached = wqpStationCache.get(locationName);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_DURATION) {
    return cached.stationId;
  }

  try {
    const params = new URLSearchParams({
      countrycode: 'US',
      statecode: 'US:06',
      countycode: countyCode,
      characteristicName: 'Enterococcus',
      mimeType: 'csv',
      zip: 'no',
    });

    const response = await fetch(`${WQP_STATION_API}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('WQP station discovery failed:', response.status);
      return null;
    }

    const text = await response.text();

    // Parse CSV response to find a station matching the location name
    const lines = text.split('\n');
    const upperName = locationName.toUpperCase();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.toUpperCase().includes(upperName)) {
        const parts = line.split(',');
        if (parts.length > 2) {
          const stationId = parts[2]; // MonitoringLocationIdentifier column
          wqpStationCache.set(locationName, { stationId, cachedAt: Date.now() });
          console.log('Discovered WQP station:', stationId);
          return stationId;
        }
      }
    }

    // If not found by name, try nearby coordinates
    const coordParams = new URLSearchParams({
      lat: lat.toString(),
      long: lon.toString(),
      within: '0.5',
      characteristicName: 'Enterococcus',
      mimeType: 'csv',
      zip: 'no',
    });

    const coordResponse = await fetch(`${WQP_STATION_API}?${coordParams}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!coordResponse.ok) {
      console.warn('WQP coordinate search failed:', coordResponse.status);
      return null;
    }

    const coordText = await coordResponse.text();
    const coordLines = coordText.split('\n');
    if (coordLines.length > 1) {
      const parts = coordLines[1].split(',');
      if (parts.length > 2) {
        const stationId = parts[2];
        wqpStationCache.set(locationName, { stationId, cachedAt: Date.now() });
        console.log('Discovered WQP station by coordinates:', stationId);
        return stationId;
      }
    }

    console.warn(`Could not discover WQP station for ${locationName}`);
    return null;
  } catch (error) {
    console.error('WQP station discovery failed:', error);
    return null;
  }
}

/**
 * Fetch water quality data from Water Quality Portal
 */
async function fetchFromWQP(
  locationName: string = 'AQUATIC PARK',
  lat: number = AQUATIC_PARK_LAT,
  lon: number = AQUATIC_PARK_LON,
  countyCode: string = 'US:06:075'
): Promise<WaterQuality | null> {
  try {
    const stationId = await discoverWQPStation(locationName, lat, lon, countyCode);
    if (!stationId) {
      return null;
    }

    const params = new URLSearchParams({
      siteid: stationId,
      characteristicName: 'Enterococcus',
      startDateLo: formatDateForWQP(daysAgo(90)),
      mimeType: 'csv',
      zip: 'no',
    });

    const response = await fetch(`${WQP_RESULT_API}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('WQP fetch failed:', response.status);
      return null;
    }

    const text = await response.text();

    // Parse CSV response
    const lines = text.split('\n');
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
 * Fetch water quality data for a location that only has Water Quality Portal (WQP) coverage
 * (no SF Gov / California-specific dataset equivalent, e.g. San Diego County)
 */
export async function fetchWaterQualityWQPOnly(
  locationName: string,
  lat: number,
  lon: number,
  countyCode: string
): Promise<WaterQuality | null> {
  try {
    return await fetchFromWQP(locationName, lat, lon, countyCode);
  } catch (error) {
    console.error('Error fetching WQP-only water quality:', error);
    return null;
  }
}

/**
 * Fetch bacteria count data
 */
export async function fetchBacteriaCount(_beachId: string, date?: Date): Promise<{
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
 * Uses EPA standards for marine recreational water quality
 *
 * Thresholds (from src/config/thresholds.ts):
 * - Enterococcus: safe < 104, advisory 104-500, warning 500-1000, closed > 1000 MPN/100ml
 * - Total Coliform: safe < 200, advisory 200-1000, warning 1000-2000, closed > 2000 MPN/100ml
 */
export function assessWaterQualityStatus(
  enterococcus?: number,
  eColi?: number,
  coliform?: number
): 'safe' | 'advisory' | 'warning' | 'closed' {
  // Enterococcus thresholds (primary indicator for marine water)
  const ENTERO_SAFE = 104;
  const ENTERO_ADVISORY = 500;
  const ENTERO_DANGEROUS = 1000;

  // E.coli thresholds
  const ECOLI_SAFE = 400;
  const ECOLI_ADVISORY = 800;
  const ECOLI_DANGEROUS = 2000;

  // Total Coliform thresholds
  const COLIFORM_SAFE = 10000;
  const COLIFORM_ADVISORY = 50000;
  const COLIFORM_DANGEROUS = 100000;

  // Return the worst status across all indicators
  let worstStatus: 'safe' | 'advisory' | 'warning' | 'closed' = 'safe';

  const elevate = (status: 'safe' | 'advisory' | 'warning' | 'closed') => {
    const rank = { safe: 0, advisory: 1, warning: 2, closed: 3 };
    if (rank[status] > rank[worstStatus]) worstStatus = status;
  };

  if (enterococcus !== undefined) {
    if (enterococcus > ENTERO_DANGEROUS) elevate('closed');
    else if (enterococcus > ENTERO_ADVISORY) elevate('warning');
    else if (enterococcus > ENTERO_SAFE) elevate('advisory');
  }

  if (eColi !== undefined) {
    if (eColi > ECOLI_DANGEROUS) elevate('closed');
    else if (eColi > ECOLI_ADVISORY) elevate('warning');
    else if (eColi > ECOLI_SAFE) elevate('advisory');
  }

  if (coliform !== undefined) {
    if (coliform > COLIFORM_DANGEROUS) elevate('closed');
    else if (coliform > COLIFORM_ADVISORY) elevate('warning');
    else if (coliform > COLIFORM_SAFE) elevate('advisory');
  }

  return worstStatus;
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
