/**
 * Aquatic Park location configuration and data source identifiers
 */

export const AQUATIC_PARK = {
  // Geographic center of Aquatic Park
  center: {
    lat: 37.8065,
    lon: -122.4216,
  },

  // Geographic boundaries for the swimming area
  bounds: {
    north: 37.8095,
    south: 37.8035,
    east: -122.4186,
    west: -122.4246,
  },

  // NOAA station identifiers
  noaaStations: {
    tide: '9414290', // San Francisco NOAA Tide Station
    buoy: '46237',   // San Francisco Buoy (wave/swell data)
    current: 'SFB1203' // Point Blunt SE corner of angel island
  },

  // Beach identifier for water quality APIs
  beachId: 'aquatic-park-sf',

  // Human-readable location info
  location: {
    name: 'Aquatic Park',
    city: 'San Francisco',
    state: 'CA',
    fullName: 'Aquatic Park, San Francisco Bay',
  },
} as const;

// Export individual constants for convenience
export const AQUATIC_PARK_LAT = AQUATIC_PARK.center.lat;
export const AQUATIC_PARK_LON = AQUATIC_PARK.center.lon;
export const TIDE_STATION_ID = AQUATIC_PARK.noaaStations.tide;
export const WAVE_BUOY_ID = AQUATIC_PARK.noaaStations.buoy;
export const CURRENT_STATION_ID = AQUATIC_PARK.noaaStations.current;
