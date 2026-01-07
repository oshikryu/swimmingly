/**
 * SF PUC (San Francisco Public Utilities Commission) API Client
 * Fetches Sanitary Sewer Overflow (SSO) data
 */

import axios from 'axios';
import type { SSOEvent } from '@/types/conditions';
import { AQUATIC_PARK_LAT, AQUATIC_PARK_LON } from '@/config/aquatic-park';

const SFPUC_BASE_URL = 'https://data.sfgov.org/resource';
// NOTE: This dataset ID may need verification - check https://data.sfgov.org for current SSO datasets
// Known alternatives: 'ssi8-333r' (Sewer System Overflow), 'pr5w-eger' (Wastewater)
const SSO_DATASET_ID = 'pr5w-eger'; // SF SSO events dataset

/**
 * Fetch recent SSO events within a certain time period
 */
export async function fetchRecentSSOs(daysBack: number = 7): Promise<SSOEvent[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const response = await axios.get(`${SFPUC_BASE_URL}/${SSO_DATASET_ID}.json`, {
      params: {
        $where: `incident_date >= '${startDate.toISOString()}'`,
        $order: 'incident_date DESC',
        $limit: 100,
      },
    });

    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data.map((event: any) => {
      const distance = event.latitude && event.longitude
        ? calculateDistance(
            AQUATIC_PARK_LAT,
            AQUATIC_PARK_LON,
            parseFloat(event.latitude),
            parseFloat(event.longitude)
          )
        : undefined;

      return {
        id: event.incident_id || `sso-${Date.now()}`,
        reportedAt: new Date(event.incident_date),
        location: event.location || 'Unknown location',
        volumeGallons: event.volume ? parseFloat(event.volume) : undefined,
        resolved: event.status?.toLowerCase() === 'closed' || event.status?.toLowerCase() === 'resolved',
        resolvedAt: event.close_date ? new Date(event.close_date) : undefined,
        distanceFromParkMiles: distance,
        notes: event.description || undefined,
        source: 'SFPUC',
      };
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        console.warn('SSO dataset not found - dataset ID may be invalid or API endpoint changed');
        console.warn(`Attempted URL: ${SFPUC_BASE_URL}/${SSO_DATASET_ID}.json`);
        console.warn('Check https://data.sfgov.org for current SSO datasets');
      } else {
        console.error('Error fetching SSO events:', error.message);
      }
    } else {
      console.error('Error fetching SSO events:', error);
    }
    // Return empty array on error to allow app to continue
    return [];
  }
}

/**
 * Check for active SSO events near Aquatic Park
 */
export async function checkActiveSSOs(radiusMiles: number = 2): Promise<SSOEvent[]> {
  try {
    const allRecent = await fetchRecentSSOs(30); // Check last 30 days

    // Filter for active SSOs within radius
    return allRecent.filter(event =>
      !event.resolved &&
      event.distanceFromParkMiles !== undefined &&
      event.distanceFromParkMiles <= radiusMiles
    );
  } catch (error) {
    console.error('Error checking active SSOs:', error);
    return [];
  }
}

/**
 * Get SSO impact assessment for swimming
 */
export async function getSSOImpact(): Promise<{
  hasRecentSSO: boolean;
  activeCount: number;
  mostRecent?: SSOEvent;
  impactLevel: 'none' | 'low' | 'medium' | 'high';
}> {
  try {
    const recentSSOs = await fetchRecentSSOs(7);
    const activeNearby = recentSSOs.filter(
      event => !event.resolved &&
      event.distanceFromParkMiles !== undefined &&
      event.distanceFromParkMiles <= 2
    );

    const mostRecent = recentSSOs.length > 0 ? recentSSOs[0] : undefined;
    const daysSinceMostRecent = mostRecent
      ? (Date.now() - mostRecent.reportedAt.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    let impactLevel: 'none' | 'low' | 'medium' | 'high' = 'none';

    if (activeNearby.length > 0) {
      impactLevel = 'high';
    } else if (daysSinceMostRecent < 3) {
      impactLevel = 'medium';
    } else if (daysSinceMostRecent < 7) {
      impactLevel = 'low';
    }

    return {
      hasRecentSSO: recentSSOs.length > 0,
      activeCount: activeNearby.length,
      mostRecent,
      impactLevel,
    };
  } catch (error) {
    console.error('Error assessing SSO impact:', error);
    return {
      hasRecentSSO: false,
      activeCount: 0,
      impactLevel: 'none',
    };
  }
}

// Utility: Calculate distance between two lat/lon points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
