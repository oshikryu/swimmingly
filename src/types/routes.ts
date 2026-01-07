/**
 * Type definitions for swimming routes and route-related data
 */

export interface Landmark {
  name: string;
  lat: number;
  lon: number;
  description?: string;
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [longitude, latitude]
}

export type RouteDifficulty = 'easy' | 'moderate' | 'advanced' | 'challenging';

export interface SwimmingRoute {
  id: string;
  name: string;
  description: string;
  distanceMiles: number;
  difficulty: RouteDifficulty;
  estimatedTimeMinutes: number;
  geojson: GeoJSONLineString;
  landmarks: Landmark[];
}

export interface RouteWithConditions extends SwimmingRoute {
  currentDifficulty: RouteDifficulty;
  difficultyScore: number;
  estimatedCurrentTime: number;
  warnings: string[];
}
