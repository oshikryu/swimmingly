/**
 * Type definitions for environmental conditions and swim scoring
 */

/**
 * Generic cached data structure with expiration metadata
 * Can be used for caching any data type in localStorage
 */
export interface CachedData<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

export interface TideData {
  timestamp: Date;
  heightFeet: number;
  type: 'high' | 'low' | 'normal';
  source?: string;
}

export interface TidePrediction extends TideData {
  nextHigh?: TideData;
  nextLow?: TideData;
  previousHigh?: TideData;
  previousLow?: TideData;
  currentPhase: 'flood' | 'ebb' | 'slack';
  changeRateFeetPerHour: number;
}

export interface CurrentData {
  timestamp: Date;
  speedKnots: number;
  direction: number; // degrees
  source?: string;
}

export interface WeatherData {
  timestamp: Date;
  temperatureF: number;
  windSpeedMph: number;
  windDirection: number; // degrees
  windGustMph?: number;
  conditions: string; // 'clear', 'cloudy', 'rain', etc.
  source?: string;
}

export interface WaveData {
  timestamp: Date;
  waveHeightFeet: number;
  swellPeriodSeconds?: number;
  barometricPressureMb?: number;
  source?: string;
}

export interface MoonPhaseData {
  phase: number;             // 0.0–1.0, fraction through 29.53-day cycle
  phaseName: string;         // 'New Moon' | 'Waxing Crescent' | 'First Quarter' | 'Waxing Gibbous' | 'Full Moon' | 'Waning Gibbous' | 'Last Quarter' | 'Waning Crescent'
  phaseEmoji: string;        // '🌑' | '🌒' | '🌓' | '🌔' | '🌕' | '🌖' | '🌗' | '🌘'
  isSpringTide: boolean;     // within ±2 days of new/full moon
  isNeapTide: boolean;       // within ±2 days of quarter moon
  illuminationPercent: number;
}

export interface WaterQuality {
  timestamp: Date;
  coliformCount?: number; // Total Coliform MPN/100ml
  eColiCount?: number; // E.coli MPN/100ml
  enterococcusCount?: number; // Enterococcus MPN/100ml
  status: 'safe' | 'advisory' | 'warning' | 'closed';
  notes?: string;
  source?: string;
  stationId?: string; // e.g., BAY#211_SL, BAY#210.1_SL
}

export interface SSOEvent {
  id: string;
  reportedAt: Date;
  location: string;
  volumeGallons?: number;
  resolved: boolean;
  resolvedAt?: Date;
  distanceFromParkMiles?: number;
  notes?: string;
  source?: string;
}

export interface WaterTemperature {
  timestamp: Date;
  temperatureF: number;
  source: string;
}

export interface RainfallData {
  timestamp: Date;
  last24hInches: number;
  last48hInches: number;
  last72hInches: number;
  source: string;
}

export interface DamReleaseData {
  timestamp: Date;

  // Current snapshot (for backward compatibility)
  current: {
    totalFlowCFS: number;
    releaseLevel: 'low' | 'moderate' | 'high' | 'extreme';
  };

  // 48-hour historical aggregates
  historical48h: {
    averageFlowCFS: number;
    peakFlowCFS: number;
    peakTimestamp: Date;
    trendDirection: 'increasing' | 'stable' | 'decreasing';
    last24hAverage: number;
    last48hAverage: number;
  };

  dams: Array<{
    name: string;
    stationId: string;
    current: {
      flowCFS: number;
      timestamp?: Date;
      percentOfTotal: number;
    };
    historical48h: {
      averageFlowCFS: number;
      peakFlowCFS: number;
    };
  }>;

  latestDataTimestamp?: Date;
  source?: string;
}

export interface SwimScoreFactors {
  waterQuality: {
    score: number; // 0-100
    status: 'safe' | 'advisory' | 'warning' | 'dangerous';
    bacteriaLevel: string;
    recentSSO: boolean;
    daysSinceSSO?: number;
    issues: string[];
  };
  tideAndCurrent: {
    score: number; // 0-100
    phase: 'slack' | 'flood' | 'ebb';
    currentSpeed: number;
    tideHeight: number;
    favorable: boolean;
    issues: string[];
  };
  waves: {
    score: number; // 0-100
    heightFeet: number;
    status: 'calm' | 'moderate' | 'rough' | 'dangerous';
    issues: string[];
  };
  weather: {
    score: number; // 0-100
    temperature: number;
    windSpeed: number;
    windCondition: 'calm' | 'light' | 'moderate' | 'strong';
    waterTemperatureF?: number;
    issues: string[];
  };
}

export interface SwimScore {
  timestamp: Date;
  overallScore: number; // 0-100
  rating:  'calm' | 'mild' | 'active' | 'exciting' | 'challenging';
  factors: SwimScoreFactors;
  recommendations: string[];
  warnings: string[];
}

export interface CurrentConditions {
  timestamp: Date;
  score: SwimScore;
  tide: TidePrediction;
  current: CurrentData;
  weather: WeatherData;
  waves: WaveData;
  waterQuality: WaterQuality;
  waterTemperature?: WaterTemperature;
  damReleases?: DamReleaseData;
  rainfall?: RainfallData;
  moonPhase?: MoonPhaseData;
  dataFreshness: {
    tide: Date;
    weather: Date;
    waves: Date;
    waterQuality: Date;
    waterTemperature?: Date;
    damReleases?: Date;
    rainfall?: Date;
    moonPhase?: Date;
  };
}

export interface ForecastConditions {
  timestamp: Date;
  score: SwimScore;
  tide: TidePrediction;
  weather: WeatherData;
  waves: WaveData;
}

export interface ForecastPeriod {
  startTime: Date;
  endTime: Date;
  conditions: ForecastConditions[];
  optimalWindows: OptimalSwimWindow[];
}

export interface OptimalSwimWindow {
  startTime: Date;
  endTime: Date;
  averageScore: number;
  peakScore: number;
  reason: string;
  tide: {
    phase: string;
    heightRange: [number, number];
  };
}

export interface HistoricalDataPoint {
  timestamp: Date;
  score: number;
  tide: number;
  windSpeed: number;
  waveHeight: number;
  waterQualityStatus: string;
}

export interface HistoricalPattern {
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  dayOfWeek?: string;
  month?: string;
  averageScore: number;
  sampleSize: number;
  bestConditions: string[];
}

/**
 * User preference types for swim score customization
 */
export interface ScoreWeights {
  waterQuality: number;
  tideAndCurrent: number;
  waves: number;
  weather: number;
}
