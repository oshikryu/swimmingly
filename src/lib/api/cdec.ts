/**
 * CDEC (California Data Exchange Center) API Client
 * Fetches dam release/outflow data from California's water data network
 * Now with 48-hour historical data for time-lag modeling
 */

import axios from 'axios';
import type { DamReleaseData } from '@/types/conditions';

const CDEC_BASE_URL = 'https://cdec.water.ca.gov/dynamicapp/req/CSVDataServlet';

// Dam configurations with relative impact weights on SF Bay
const MONITORED_DAMS = [
  { name: 'Folsom Dam', stationId: 'FOL', weight: 1.0 },
  { name: 'Oroville Dam', stationId: 'ORO', weight: 1.5 },
  { name: 'Shasta Dam', stationId: 'SHA', weight: 2.0 },  // Highest impact on SF Bay
  { name: 'Pardee Dam', stationId: 'PAR', weight: 0.3 },
  { name: 'Camanche Dam', stationId: 'CMN', weight: 0.3 },
] as const;

const OUTFLOW_SENSOR = '23'; // Reservoir outflow in CFS
const DURATION_CODE = 'H'; // Hourly data

interface FlowDataPoint {
  timestamp: Date;
  flowCFS: number;
}

interface DamFlowHistory {
  name: string;
  stationId: string;
  data: FlowDataPoint[];
}

/**
 * Fetch dam release data with 48-hour historical context
 */
export async function fetchDamReleases(): Promise<DamReleaseData | null> {
  try {
    const now = new Date();
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Fetch 48 hours of data for all dams in parallel
    const damPromises = MONITORED_DAMS.map(dam =>
      fetchDamFlowHistory(dam.stationId, dam.name, hours48Ago, now)
    );

    const results = await Promise.all(damPromises);

    // Calculate aggregates for each dam
    const damData = results.map(damHistory => {
      const current = damHistory.data[damHistory.data.length - 1];
      return {
        name: damHistory.name,
        stationId: damHistory.stationId,
        current: {
          flowCFS: current?.flowCFS || 0,
          timestamp: current?.timestamp,
          percentOfTotal: 0, // Calculate later
        },
        historical48h: calculateDamAggregates(damHistory.data),
      };
    });

    // Calculate current total flow
    const currentTotal = damData.reduce((sum, d) => sum + d.current.flowCFS, 0);

    // Calculate percentages
    damData.forEach(dam => {
      dam.current.percentOfTotal = currentTotal > 0
        ? (dam.current.flowCFS / currentTotal) * 100
        : 0;
    });

    // Calculate combined historical aggregates
    const combinedHistorical = calculateCombinedAggregates(results);

    // Find the most recent data timestamp
    const latestDataTimestamp = damData
      .filter(dam => dam.current.timestamp)
      .map(dam => dam.current.timestamp!)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    // Determine release level
    const releaseLevel = determineReleaseLevel(currentTotal);

    console.log(`Dam releases - Current: ${Math.round(currentTotal).toLocaleString()} CFS, 48h Avg: ${Math.round(combinedHistorical.averageFlowCFS).toLocaleString()} CFS, Peak: ${Math.round(combinedHistorical.peakFlowCFS).toLocaleString()} CFS, Trend: ${combinedHistorical.trendDirection}`);

    return {
      timestamp: now,
      current: {
        totalFlowCFS: currentTotal,
        releaseLevel,
      },
      historical48h: combinedHistorical,
      dams: damData,
      latestDataTimestamp,
      source: 'CDEC',
    };
  } catch (error) {
    console.error('Error fetching dam releases:', error);
    return null;
  }
}

/**
 * Fetch 48 hours of flow history for a single dam
 */
async function fetchDamFlowHistory(
  stationId: string,
  name: string,
  startDate: Date,
  endDate: Date
): Promise<DamFlowHistory> {
  try {
    const url = new URL(CDEC_BASE_URL);
    url.searchParams.append('Stations', stationId);
    url.searchParams.append('SensorNums', OUTFLOW_SENSOR);
    url.searchParams.append('dur_code', DURATION_CODE);
    url.searchParams.append('Start', formatDate(startDate));
    url.searchParams.append('End', formatDate(endDate));

    const response = await axios.get(url.toString(), {
      timeout: 15000, // Increased timeout for larger data
    });

    const data: FlowDataPoint[] = [];
    const lines = response.data.split('\n');

    // Parse all lines (not just most recent)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length >= 7) {
        const flowValue = parseFloat(parts[6].trim());
        const dateTimeStr = parts[4].trim();

        if (!isNaN(flowValue) && flowValue > 0) {
          const timestamp = parseCDECTimestamp(dateTimeStr);
          if (timestamp) {
            data.push({ timestamp, flowCFS: flowValue });
          }
        }
      }
    }

    console.log(`${stationId} - Retrieved ${data.length} hourly data points over 48 hours`);

    return { name, stationId, data };
  } catch (error) {
    console.warn(`Failed to fetch history for ${stationId}:`, error instanceof Error ? error.message : 'Unknown error');
    return { name, stationId, data: [] };
  }
}

/**
 * Calculate aggregate statistics for a single dam's 48-hour data
 */
function calculateDamAggregates(data: FlowDataPoint[]): {
  averageFlowCFS: number;
  peakFlowCFS: number;
  dataPoints: number;
} {
  if (data.length === 0) {
    return {
      averageFlowCFS: 0,
      peakFlowCFS: 0,
      dataPoints: 0,
    };
  }

  const flows = data.map(d => d.flowCFS);
  const sum = flows.reduce((a, b) => a + b, 0);

  return {
    averageFlowCFS: sum / flows.length,
    peakFlowCFS: Math.max(...flows),
    dataPoints: flows.length,
  };
}

/**
 * Calculate combined aggregates across all dams
 */
function calculateCombinedAggregates(damHistories: DamFlowHistory[]): {
  averageFlowCFS: number;
  peakFlowCFS: number;
  peakTimestamp: Date;
  trendDirection: 'increasing' | 'stable' | 'decreasing';
  last24hAverage: number;
  last48hAverage: number;
  dataPointsCount: number;
} {
  const now = new Date();
  const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Group flow data by timestamp (combine all dams' flows at each time point)
  const timePointMap = new Map<number, number>();

  damHistories.forEach(damHistory => {
    damHistory.data.forEach(point => {
      const timeKey = point.timestamp.getTime();
      const existingFlow = timePointMap.get(timeKey) || 0;
      timePointMap.set(timeKey, existingFlow + point.flowCFS);
    });
  });

  // Convert map to sorted array
  const timePoints = Array.from(timePointMap.entries())
    .map(([time, flow]) => ({
      timestamp: new Date(time),
      totalFlow: flow,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (timePoints.length === 0) {
    return {
      averageFlowCFS: 0,
      peakFlowCFS: 0,
      peakTimestamp: now,
      trendDirection: 'stable',
      last24hAverage: 0,
      last48hAverage: 0,
      dataPointsCount: 0,
    };
  }

  // Calculate averages and peak
  const last24hFlows: number[] = [];
  const allFlows: number[] = [];
  let peakFlow = 0;
  let peakTime: Date = timePoints[0].timestamp;

  timePoints.forEach(point => {
    allFlows.push(point.totalFlow);

    if (point.timestamp > hours24Ago) {
      last24hFlows.push(point.totalFlow);
    }

    if (point.totalFlow > peakFlow) {
      peakFlow = point.totalFlow;
      peakTime = point.timestamp;
    }
  });

  const last24hAvg = last24hFlows.length > 0
    ? last24hFlows.reduce((a, b) => a + b, 0) / last24hFlows.length
    : 0;

  const last48hAvg = allFlows.reduce((a, b) => a + b, 0) / allFlows.length;

  // Determine trend by comparing first 12 hours vs last 12 hours
  const numPoints = Math.min(12, Math.floor(allFlows.length / 4));
  const first12hAvg = allFlows.length >= numPoints * 2
    ? allFlows.slice(0, numPoints).reduce((a, b) => a + b, 0) / numPoints
    : last48hAvg;
  const last12hAvg = allFlows.length >= numPoints
    ? allFlows.slice(-numPoints).reduce((a, b) => a + b, 0) / numPoints
    : last48hAvg;

  let trendDirection: 'increasing' | 'stable' | 'decreasing';
  const percentChange = first12hAvg > 0
    ? ((last12hAvg - first12hAvg) / first12hAvg) * 100
    : 0;

  if (percentChange > 15) {
    trendDirection = 'increasing';
  } else if (percentChange < -15) {
    trendDirection = 'decreasing';
  } else {
    trendDirection = 'stable';
  }

  return {
    averageFlowCFS: last48hAvg,
    peakFlowCFS: peakFlow,
    peakTimestamp: peakTime,
    trendDirection,
    last24hAverage: last24hAvg,
    last48hAverage: last48hAvg,
    dataPointsCount: allFlows.length,
  };
}

/**
 * Parse CDEC timestamp format: "20260111 0600" -> Date
 */
function parseCDECTimestamp(dateTimeStr: string): Date | undefined {
  try {
    const parts = dateTimeStr.split(' ');
    if (parts.length !== 2) return undefined;

    const datePart = parts[0];
    const timePart = parts[1];

    const year = parseInt(datePart.substring(0, 4), 10);
    const month = parseInt(datePart.substring(4, 6), 10) - 1;
    const day = parseInt(datePart.substring(6, 8), 10);
    const hour = parseInt(timePart.substring(0, 2), 10);
    const minute = parseInt(timePart.substring(2, 4), 10);

    return new Date(year, month, day, hour, minute);
  } catch (error) {
    return undefined;
  }
}

/**
 * Format date for CDEC API (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Determine release level based on total flow
 */
function determineReleaseLevel(
  totalFlowCFS: number
): 'low' | 'moderate' | 'high' | 'extreme' {
  if (totalFlowCFS > 80000) return 'extreme';
  if (totalFlowCFS > 50000) return 'high';
  if (totalFlowCFS > 30000) return 'moderate';
  return 'low';
}
