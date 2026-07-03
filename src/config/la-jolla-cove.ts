/**
 * La Jolla Cove location configuration and data source identifiers
 */

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
    buoy: 'LJPC1',       // Scripps Pier C-MAN station — nearshore, closer to the actual swim area than 46254
    buoyFallback: '46254', // Scripps Nearshore Waverider Buoy (CDIP/SIO, via NDBC) — offshore backup if LJPC1 is unavailable
    // No dedicated NOAA current-prediction station nearby (open coast, not a strait/bay) —
    // falls back to calculateCurrentFromTide like Aquatic Park does when current data is missing.
  },

  // Beach identifier for water quality APIs
  beachId: 'la-jolla-cove-sd',

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
