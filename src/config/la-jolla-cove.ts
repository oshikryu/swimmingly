/**
 * La Jolla Cove location configuration and data source identifiers
 */

import type { ThresholdsOverride } from '@/lib/algorithms/swim-score';

/**
 * Wave thresholds recalibrated for La Jolla Cove's open-coast swell, vs. Aquatic
 * Park's sheltered-bay chop (SAFETY_THRESHOLDS.waves in src/config/thresholds.ts).
 *
 * Backed by two sources:
 * - 45-day live buoy history (LJPC1 + 46254): median wave height 2.0-2.3 ft, p10
 *   (calmest 10% of readings) still 1.64 ft — under Aquatic Park's thresholds,
 *   La Jolla Cove would read "rough" on almost every single day, including calm ones.
 * - La Jolla Cove Swim Club's published safety guidance (lajollacoveswimclub.com):
 *   3-4 ft = "potentially dangerous, especially for beginners", 6-8 ft = "dangerous
 *   even for good swimmers", 10+ ft = "extremely dangerous even for experts".
 * - A lifeguard station report of 2 ft / 12s period was logged as "flat" (OpenWaterLog).
 *
 * La Jolla Cove's long-period ocean groundswell (12-17s) also reads very
 * differently to swimmers than the same height of Aquatic Park's short-period
 * wind-driven bay chop, independent of the cove's own physical shelter from
 * Point La Jolla — both push the "typical/comfortable" range meaningfully higher.
 */
export const LA_JOLLA_COVE_THRESHOLDS_OVERRIDE: ThresholdsOverride = {
  waves: {
    calm: 1.5,      // < 1.5 ft = calm
    safe: 2.5,      // 1.5-2.5 ft = safe (typical/median conditions, ~2.0-2.3 ft)
    moderate: 3.5,  // 2.5-3.5 ft = moderate (approaching swim club's "caution" mark)
    rough: 6.0,     // 3.5-6.0 ft = rough (swim club's "dangerous even for good swimmers" starts at 6-8 ft)
    // > 6.0 ft = dangerous
  },
};

export const LA_JOLLA_COVE = {
  // Geographic center of La Jolla Cove
  center: {
    lat: 32.8508,
    lon: -117.2713,
  },

  // Geographic boundaries for the swimming area
  bounds: {
    north: 32.8538,
    south: 32.8478,
    east: -117.2683,
    west: -117.2743,
  },

  // NOAA station identifiers
  noaaStations: {
    tide: '9410230',     // La Jolla, CA NOAA Tide Station (Scripps Pier) — also provides water temp, air temp, and wind
    buoy: '46254',       // Scripps Nearshore Waverider Buoy (CDIP/SIO, via NDBC)
    buoyFallback: 'LJPC1', // Scripps Pier C-MAN station — nearshore backup if 46254 is unavailable
    // No dedicated NOAA current-prediction station nearby (open coast, not a strait/bay) —
    // falls back to calculateCurrentFromTide like Aquatic Park does when current data is missing.
  },

  // Beach identifier for water quality APIs
  beachId: 'la-jolla-cove-sd',

  // San Diego County Beach & Water Quality (sdbeachinfo) site ID for La Jolla Cove
  // (station FM-070) — found via https://cosdapps.sandiegocounty.gov/sdbeachinfo/SamplesReport?SiteId=105
  sdBeachInfoSiteId: '105',

  // Human-readable location info
  location: {
    name: 'La Jolla Cove',
    city: 'San Diego',
    state: 'CA',
    fullName: 'La Jolla Cove, San Diego',
  },
} as const;

// Export individual constants for convenience
export const LA_JOLLA_COVE_LAT = LA_JOLLA_COVE.center.lat;
export const LA_JOLLA_COVE_LON = LA_JOLLA_COVE.center.lon;
export const LA_JOLLA_TIDE_STATION_ID = LA_JOLLA_COVE.noaaStations.tide;
export const LA_JOLLA_WAVE_BUOY_ID = LA_JOLLA_COVE.noaaStations.buoy;
export const LA_JOLLA_WAVE_BUOY_FALLBACK_ID = LA_JOLLA_COVE.noaaStations.buoyFallback;
export const LA_JOLLA_SD_BEACH_INFO_SITE_ID = LA_JOLLA_COVE.sdBeachInfoSiteId;
