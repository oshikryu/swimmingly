import type { SwimmingRoute } from '@/types/routes';

/**
 * Predefined swimming routes at Aquatic Park
 * All coordinates are in [longitude, latitude] format for GeoJSON
 */

export const SWIMMING_ROUTES: SwimmingRoute[] = [
  {
    id: 'beginner-loop',
    name: 'Beginner Loop',
    description: 'Stay close to shore, perfect for getting accustomed to open water swimming',
    distanceMiles: 0.25,
    difficulty: 'easy',
    estimatedTimeMinutes: 15,
    geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4226, 37.8055],  // Start: Near Hyde Street Pier
        [-122.4220, 37.8060],  // Along the beach
        [-122.4210, 37.8065],  // Mid-beach
        [-122.4220, 37.8070],  // Turn around point
        [-122.4226, 37.8065],  // Return leg
        [-122.4226, 37.8055],  // Back to start
      ],
    },
    landmarks: [
      { name: 'Hyde Street Pier', lat: 37.8055, lon: -122.4226 },
      { name: 'Beach Center', lat: 37.8065, lon: -122.4210 },
    ],
  },
  {
    id: 'hyde-to-muni',
    name: 'Hyde Street Pier to Municipal Pier',
    description: 'Classic Aquatic Park swim across the cove',
    distanceMiles: 0.5,
    difficulty: 'moderate',
    estimatedTimeMinutes: 30,
    geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4226, 37.8055],  // Start: Hyde Street Pier
        [-122.4215, 37.8070],  // Mid-cove buoy
        [-122.4190, 37.8080],  // Municipal Pier approach
        [-122.4186, 37.8085],  // Municipal Pier end
        [-122.4190, 37.8080],  // Return: Municipal Pier approach
        [-122.4215, 37.8070],  // Mid-cove buoy
        [-122.4226, 37.8055],  // Back to Hyde Street Pier
      ],
    },
    landmarks: [
      { name: 'Hyde Street Pier', lat: 37.8055, lon: -122.4226 },
      { name: 'Mid-Cove Buoy', lat: 37.8070, lon: -122.4215 },
      { name: 'Municipal Pier', lat: 37.8085, lon: -122.4186 },
    ],
  },
  {
    id: 'full-circuit',
    name: 'Full Bay Circuit',
    description: 'Complete circuit of the Aquatic Park swimming area - for advanced swimmers',
    distanceMiles: 1.0,
    difficulty: 'advanced',
    estimatedTimeMinutes: 60,
    geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4226, 37.8055],  // Start: Hyde Street Pier
        [-122.4235, 37.8060],  // Out beyond pier
        [-122.4240, 37.8070],  // Far west buoy
        [-122.4230, 37.8080],  // Northwest corner
        [-122.4210, 37.8090],  // North boundary
        [-122.4190, 37.8085],  // Municipal Pier
        [-122.4186, 37.8075],  // East boundary
        [-122.4200, 37.8065],  // Southeast corner
        [-122.4215, 37.8055],  // South boundary
        [-122.4226, 37.8055],  // Back to start
      ],
    },
    landmarks: [
      { name: 'Hyde Street Pier', lat: 37.8055, lon: -122.4226 },
      { name: 'Far West Buoy', lat: 37.8070, lon: -122.4240 },
      { name: 'North Boundary', lat: 37.8090, lon: -122.4210 },
      { name: 'Municipal Pier', lat: 37.8085, lon: -122.4186 },
    ],
  },
  {
    id: 'pier-to-buoy',
    name: 'Pier to Buoy Sprint',
    description: 'Quick out-and-back to the central buoy',
    distanceMiles: 0.15,
    difficulty: 'easy',
    estimatedTimeMinutes: 10,
    geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4226, 37.8055],  // Start: Hyde Street Pier
        [-122.4215, 37.8070],  // Central buoy
        [-122.4226, 37.8055],  // Back to start
      ],
    },
    landmarks: [
      { name: 'Hyde Street Pier', lat: 37.8055, lon: -122.4226 },
      { name: 'Central Buoy', lat: 37.8070, lon: -122.4215 },
    ],
  },
  {
    id: 'intermediate-triangle',
    name: 'Intermediate Triangle',
    description: 'Triangular route hitting three key points',
    distanceMiles: 0.6,
    difficulty: 'moderate',
    estimatedTimeMinutes: 35,
    geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4226, 37.8055],  // Start: Hyde Street Pier
        [-122.4240, 37.8070],  // West point
        [-122.4190, 37.8080],  // Municipal Pier
        [-122.4226, 37.8055],  // Back to start
      ],
    },
    landmarks: [
      { name: 'Hyde Street Pier', lat: 37.8055, lon: -122.4226 },
      { name: 'West Point', lat: 37.8070, lon: -122.4240 },
      { name: 'Municipal Pier', lat: 37.8080, lon: -122.4190 },
    ],
  },
];

/**
 * Get a route by ID
 */
export function getRouteById(id: string): SwimmingRoute | undefined {
  return SWIMMING_ROUTES.find(route => route.id === id);
}

/**
 * Get routes filtered by difficulty
 */
export function getRoutesByDifficulty(difficulty: 'easy' | 'moderate' | 'advanced' | 'challenging'): SwimmingRoute[] {
  return SWIMMING_ROUTES.filter(route => route.difficulty === difficulty);
}

/**
 * Get routes within a distance range
 */
export function getRoutesByDistance(minMiles: number, maxMiles: number): SwimmingRoute[] {
  return SWIMMING_ROUTES.filter(
    route => route.distanceMiles >= minMiles && route.distanceMiles <= maxMiles
  );
}
