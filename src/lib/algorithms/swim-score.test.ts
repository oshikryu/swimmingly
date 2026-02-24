import { describe, it, expect } from 'vitest';
import { calculateSwimScore } from './swim-score';
import type {
  TidePrediction,
  CurrentData,
  WeatherData,
  WaveData,
  WaterQuality,
  SSOEvent,
  DamReleaseData,
  RainfallData,
} from '@/types/conditions';

// ---------------------------------------------------------------------------
// Test fixture factories
// ---------------------------------------------------------------------------

const now = new Date('2026-01-15T12:00:00Z');

function makeTide(overrides: Partial<TidePrediction> = {}): TidePrediction {
  return {
    timestamp: now,
    heightFeet: 3.0,
    type: 'normal',
    source: 'NOAA',
    currentPhase: 'slack',
    changeRateFeetPerHour: 0.3,
    ...overrides,
  };
}

function makeCurrent(overrides: Partial<CurrentData> = {}): CurrentData {
  return {
    timestamp: now,
    speedKnots: 0.2,
    direction: 0,
    lat: 37.8065,
    lon: -122.4216,
    source: 'NOAA',
    ...overrides,
  };
}

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    timestamp: now,
    temperatureF: 62,
    windSpeedMph: 3,
    windDirection: 270,
    visibilityMiles: 10,
    conditions: 'clear',
    source: 'open-meteo',
    ...overrides,
  };
}

function makeWaves(overrides: Partial<WaveData> = {}): WaveData {
  return {
    timestamp: now,
    waveHeightFeet: 0.3,
    source: 'OpenWaterLog',
    ...overrides,
  };
}

function makeWaterQuality(overrides: Partial<WaterQuality> = {}): WaterQuality {
  return {
    timestamp: now,
    enterococcusCount: 10,
    status: 'safe',
    source: 'SF Beach Water Quality',
    ...overrides,
  };
}

function makeDamReleases(overrides: Partial<DamReleaseData> = {}): DamReleaseData {
  return {
    timestamp: now,
    current: { totalFlowCFS: 20000, releaseLevel: 'low' },
    historical48h: {
      averageFlowCFS: 20000,
      peakFlowCFS: 22000,
      peakTimestamp: now,
      trendDirection: 'stable',
      last24hAverage: 20000,
      last48hAverage: 20000,
      dataPointsCount: 48,
    },
    dams: [
      {
        name: 'Shasta Dam',
        stationId: 'SHA',
        current: { flowCFS: 12000, timestamp: now, percentOfTotal: 60 },
        historical48h: { averageFlowCFS: 12000, peakFlowCFS: 13000, dataPoints: 48 },
      },
    ],
    ...overrides,
  };
}

function makeRainfall(overrides: Partial<RainfallData> = {}): RainfallData {
  return {
    timestamp: now,
    last24hInches: 0,
    last48hInches: 0,
    last72hInches: 0,
    source: 'open-meteo',
    ...overrides,
  };
}

function makeSSO(overrides: Partial<SSOEvent> = {}): SSOEvent {
  return {
    id: 'sso-1',
    reportedAt: now,
    location: 'Near Aquatic Park',
    resolved: false,
    ...overrides,
  };
}

/** Helper: calculate score with all-ideal defaults, selectively overriding one input */
function scoreWith(overrides: {
  tide?: Partial<TidePrediction>;
  current?: Partial<CurrentData> | null;
  weather?: Partial<WeatherData>;
  waves?: Partial<WaveData>;
  waterQuality?: Partial<WaterQuality>;
  ssos?: SSOEvent[];
  damReleases?: Partial<DamReleaseData> | null;
  rainfall?: Partial<RainfallData> | null;
  tidePreferences?: { slack: number; flood: number; ebb: number };
} = {}) {
  return calculateSwimScore(
    makeTide(overrides.tide),
    overrides.current === null ? null : makeCurrent(overrides.current),
    makeWeather(overrides.weather),
    makeWaves(overrides.waves),
    makeWaterQuality(overrides.waterQuality),
    overrides.ssos ?? [],
    overrides.damReleases === null ? null : makeDamReleases(overrides.damReleases),
    overrides.tidePreferences,
    undefined,
    overrides.rainfall === undefined ? null : (overrides.rainfall === null ? null : makeRainfall(overrides.rainfall)),
  );
}

// ===========================================================================
// Tests
// ===========================================================================

describe('calculateSwimScore', () => {

  // -------------------------------------------------------------------------
  // Ideal / baseline conditions
  // -------------------------------------------------------------------------
  describe('ideal conditions', () => {
    it('returns calm (100) when all factors are perfect', () => {
      const result = scoreWith();
      expect(result.overallScore).toBe(100);
      expect(result.rating).toBe('calm');
    });

    it('returns score between 0 and 100', () => {
      const result = scoreWith();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // Water quality — bacteria thresholds
  // -------------------------------------------------------------------------
  describe('water quality — bacteria levels', () => {
    it('scores 100 when enterococcus <= 104 (safe)', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 50 } });
      expect(result.factors.waterQuality.score).toBe(100);
      expect(result.factors.waterQuality.status).toBe('safe');
      expect(result.factors.waterQuality.bacteriaLevel).toBe('safe');
    });

    it('scores 70 when enterococcus 105–500 (advisory)', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 200 } });
      expect(result.factors.waterQuality.score).toBe(70);
      expect(result.factors.waterQuality.status).toBe('advisory');
      expect(result.factors.waterQuality.bacteriaLevel).toBe('moderate');
    });

    it('scores 30 when enterococcus 501–1000 (warning)', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 800 } });
      expect(result.factors.waterQuality.score).toBe(30);
      expect(result.factors.waterQuality.status).toBe('warning');
      expect(result.factors.waterQuality.bacteriaLevel).toBe('high');
    });

    it('scores 0 when enterococcus > 1000 (dangerous)', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 1500 } });
      expect(result.factors.waterQuality.score).toBe(0);
      expect(result.factors.waterQuality.status).toBe('dangerous');
      expect(result.factors.waterQuality.bacteriaLevel).toBe('dangerous');
    });

    it('scores at boundary: enterococcus exactly 104 is safe', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 104 } });
      expect(result.factors.waterQuality.score).toBe(100);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('scores at boundary: enterococcus exactly 105 is advisory', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 105 } });
      expect(result.factors.waterQuality.score).toBe(70);
      expect(result.factors.waterQuality.status).toBe('advisory');
    });
  });

  // -------------------------------------------------------------------------
  // Water quality — SSO events
  // -------------------------------------------------------------------------
  describe('water quality — SSO events', () => {
    it('caps WQ score at 20 with active (unresolved) SSO', () => {
      const sso = makeSSO({ resolved: false, reportedAt: now });
      const result = scoreWith({ ssos: [sso] });
      expect(result.factors.waterQuality.score).toBe(20);
      expect(result.factors.waterQuality.status).toBe('dangerous');
    });

    it('caps WQ score at 60 with recent resolved SSO (< 3 days)', () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const sso = makeSSO({ resolved: true, reportedAt: oneDayAgo });
      const result = scoreWith({ ssos: [sso] });
      expect(result.factors.waterQuality.score).toBeLessThanOrEqual(60);
      expect(result.factors.waterQuality.recentSSO).toBe(true);
    });

    it('does not penalize for old resolved SSO (> 3 days)', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const sso = makeSSO({ resolved: true, reportedAt: fiveDaysAgo });
      const result = scoreWith({ ssos: [sso] });
      expect(result.factors.waterQuality.score).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Water quality — rainfall (score-only, no status change)
  // -------------------------------------------------------------------------
  describe('water quality — rainfall', () => {
    it('no penalty for light rainfall (< 0.1")', () => {
      const result = scoreWith({ rainfall: { last72hInches: 0.05 } });
      expect(result.factors.waterQuality.score).toBe(100);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('caps WQ score at 60 for moderate rainfall (0.5")', () => {
      const result = scoreWith({ rainfall: { last72hInches: 0.5 } });
      expect(result.factors.waterQuality.score).toBe(60);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('caps WQ score at 35 for heavy rainfall (1.0")', () => {
      const result = scoreWith({ rainfall: { last72hInches: 1.0 } });
      expect(result.factors.waterQuality.score).toBe(35);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('caps WQ score at 15 for extreme rainfall (2.0")', () => {
      const result = scoreWith({ rainfall: { last72hInches: 2.0 } });
      expect(result.factors.waterQuality.score).toBe(15);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('does NOT change WQ status for any rainfall amount', () => {
      for (const inches of [0.5, 1.0, 2.0, 5.0]) {
        const result = scoreWith({ rainfall: { last72hInches: inches } });
        expect(result.factors.waterQuality.status).toBe('safe');
      }
    });

    it('does not trigger overall safety cap for heavy rainfall alone', () => {
      // With 1.0" rain: WQ score = 35, but status stays safe so no overall cap
      const result = scoreWith({ rainfall: { last72hInches: 1.0 } });
      // Weighted: (35*30 + 100*25 + 100*20 + 100*15 + 100*10) / 100 = 80.5 → 81
      expect(result.overallScore).toBeGreaterThanOrEqual(80);
      expect(result.rating).toBe('calm');
    });

    it('rainfall adds issues but bacteria status takes precedence', () => {
      // Dangerous bacteria + heavy rain: status is from bacteria, not rain
      const result = scoreWith({
        waterQuality: { enterococcusCount: 1500 },
        rainfall: { last72hInches: 1.0 },
      });
      expect(result.factors.waterQuality.status).toBe('dangerous');
      expect(result.factors.waterQuality.score).toBe(0); // bacteria score (0) already < rain cap (35)
    });
  });

  // -------------------------------------------------------------------------
  // Tide & current scoring
  // -------------------------------------------------------------------------
  describe('tide & current', () => {
    it('scores 100 for slack tide with low change rate', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 0.1 },
      });
      expect(result.factors.tideAndCurrent.score).toBe(100);
      expect(result.factors.tideAndCurrent.favorable).toBe(true);
    });

    it('scores 85 for flood/ebb with low change rate (default preferences)', () => {
      const floodResult = scoreWith({
        tide: { currentPhase: 'flood', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
      });
      expect(floodResult.factors.tideAndCurrent.score).toBe(85);

      const ebbResult = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
      });
      expect(ebbResult.factors.tideAndCurrent.score).toBe(85);
    });

    it('reduces score with moderate tide change rate (1.0–2.0 ft/hr)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'flood', changeRateFeetPerHour: 1.5 },
        current: { speedKnots: 0.2 },
      });
      // flood base=85, moderate multiplier=0.7 → 59.5, capped at 70
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(70);
      expect(result.factors.tideAndCurrent.issues.length).toBeGreaterThan(0);
    });

    it('significantly reduces score with strong tide change rate (> 2.0 ft/hr)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 2.5 },
        current: { speedKnots: 0.2 },
      });
      // ebb base=85, strong multiplier=0.4 → 34, capped at 40
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(40);
    });

    it('caps at 65 for moderate current speed (> 1.0 knots)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 1.3 },
      });
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(65);
    });

    it('caps at 40 for strong current speed (> 1.5 knots)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 1.7 },
      });
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(40);
    });

    it('caps at 20 for very strong current speed (> 2.0 knots)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 2.5 },
      });
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(20);
    });

    it('handles null current data gracefully', () => {
      const result = scoreWith({ current: null });
      expect(result.factors.tideAndCurrent.currentSpeed).toBe(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Custom tide preferences
  // -------------------------------------------------------------------------
  describe('custom tide preferences', () => {
    it('boosts preferred phase to 100', () => {
      const result = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
        tidePreferences: { slack: 85, flood: 85, ebb: 100 },
      });
      expect(result.factors.tideAndCurrent.score).toBe(100);
    });

    it('default ebb scores 85, custom ebb-preference scores 100', () => {
      const defaultResult = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
      });
      const customResult = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
        tidePreferences: { slack: 85, flood: 85, ebb: 100 },
      });
      expect(customResult.factors.tideAndCurrent.score).toBeGreaterThan(
        defaultResult.factors.tideAndCurrent.score
      );
    });
  });

  // -------------------------------------------------------------------------
  // Wave scoring
  // -------------------------------------------------------------------------
  describe('waves', () => {
    it('scores 100 for calm waves (< 0.5 ft)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 0.3 } });
      expect(result.factors.waves.score).toBe(100);
      expect(result.factors.waves.status).toBe('calm');
    });

    it('scores 85 for safe waves (0.5–1.0 ft)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 0.7 } });
      expect(result.factors.waves.score).toBe(85);
      expect(result.factors.waves.status).toBe('calm');
    });

    it('scores 60 for moderate waves (1.0–1.5 ft)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 1.2 } });
      expect(result.factors.waves.score).toBe(60);
      expect(result.factors.waves.status).toBe('moderate');
    });

    it('scores 30 for rough waves (1.5–2.5 ft)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 2.0 } });
      expect(result.factors.waves.score).toBe(30);
      expect(result.factors.waves.status).toBe('rough');
    });

    it('scores 10 for dangerous waves (> 2.5 ft)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 3.0 } });
      expect(result.factors.waves.score).toBe(10);
      expect(result.factors.waves.status).toBe('dangerous');
    });

    it('scores at boundary: exactly 0.5 ft is safe (score 85)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 0.5 } });
      expect(result.factors.waves.score).toBe(85);
    });

    it('scores at boundary: exactly 2.5 ft is dangerous (score 10)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 2.5 } });
      expect(result.factors.waves.score).toBe(10);
      expect(result.factors.waves.status).toBe('dangerous');
    });
  });

  // -------------------------------------------------------------------------
  // Weather scoring
  // -------------------------------------------------------------------------
  describe('weather', () => {
    it('scores 100 for calm wind (< 5 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 3 } });
      expect(result.factors.weather.score).toBe(100);
      expect(result.factors.weather.windCondition).toBe('calm');
    });

    it('scores 95 for light wind (5–10 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 7 } });
      expect(result.factors.weather.score).toBe(95);
      expect(result.factors.weather.windCondition).toBe('light');
    });

    it('scores 80 for moderate wind (10–15 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 12 } });
      expect(result.factors.weather.score).toBe(80);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('scores 60 for strong wind (15–20 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 17 } });
      expect(result.factors.weather.score).toBe(60);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('scores 35 for very strong wind (20–25 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 22 } });
      expect(result.factors.weather.score).toBe(35);
      expect(result.factors.weather.windCondition).toBe('strong');
    });

    it('scores 15 for extreme wind (> 25 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 30 } });
      expect(result.factors.weather.score).toBe(15);
      expect(result.factors.weather.windCondition).toBe('strong');
    });

    it('caps score at 40 with rain', () => {
      const result = scoreWith({ weather: { windSpeedMph: 3, conditions: 'light rain' } });
      expect(result.factors.weather.score).toBe(40);
    });

    it('caps score at 40 with storm', () => {
      const result = scoreWith({ weather: { windSpeedMph: 3, conditions: 'thunderstorm' } });
      expect(result.factors.weather.score).toBe(40);
    });

    it('scores 50 when weather source is unavailable', () => {
      const result = scoreWith({ weather: { source: 'unavailable' } });
      expect(result.factors.weather.score).toBe(50);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('factors in wind gusts to effective wind calculation', () => {
      // 8 mph sustained + 20 mph gusts → effective = 8*0.7 + 20*0.3 = 11.6 → moderate (score 80)
      const result = scoreWith({ weather: { windSpeedMph: 8, windGustMph: 20 } });
      expect(result.factors.weather.score).toBe(80);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('ignores gusts when lower than sustained speed', () => {
      // 7 mph sustained, 5 mph gust → effective = 7 (gust not higher, so no blend)
      const result = scoreWith({ weather: { windSpeedMph: 7, windGustMph: 5 } });
      expect(result.factors.weather.score).toBe(95);
      expect(result.factors.weather.windCondition).toBe('light');
    });

    it('downgrades calm wind to light when gusts are significant', () => {
      // 3 mph sustained + 12 mph gusts → effective = 3*0.7 + 12*0.3 = 5.7 → light (score 95)
      const result = scoreWith({ weather: { windSpeedMph: 3, windGustMph: 12 } });
      expect(result.factors.weather.score).toBe(95);
      expect(result.factors.weather.windCondition).toBe('light');
    });
  });

  // -------------------------------------------------------------------------
  // Dam releases scoring
  // -------------------------------------------------------------------------
  describe('dam releases', () => {
    it('scores 100 for low flow (< 30k CFS)', () => {
      const result = scoreWith({ damReleases: { historical48h: hist(20000) } });
      expect(result.factors.damReleases.score).toBe(100);
    });

    it('scores 75 for moderate flow (30k–50k CFS)', () => {
      const result = scoreWith({ damReleases: { historical48h: hist(40000) } });
      expect(result.factors.damReleases.score).toBe(75);
    });

    it('scores 65 for elevated flow (50k–80k CFS)', () => {
      const result = scoreWith({ damReleases: { historical48h: hist(60000) } });
      expect(result.factors.damReleases.score).toBe(65);
    });

    it('scores 30 for high flow (80k–100k CFS)', () => {
      const result = scoreWith({ damReleases: { historical48h: hist(90000) } });
      expect(result.factors.damReleases.score).toBe(30);
    });

    it('scores 10 for extreme flow (> 100k CFS)', () => {
      const result = scoreWith({ damReleases: { historical48h: hist(120000) } });
      expect(result.factors.damReleases.score).toBe(10);
    });

    it('scores 75 when dam data is null (cautious default)', () => {
      const result = scoreWith({ damReleases: null });
      expect(result.factors.damReleases.score).toBe(75);
      expect(result.factors.damReleases.issues).toContain('Dam release data unavailable');
    });

    it('uses peak flow when it exceeds weighted average', () => {
      // Weighted avg = 20000*0.6 + 20000*0.4 = 20000 → low (score 100)
      // Peak component = 50000 * 0.8 = 40000 → moderate (score 75)
      // scoringFlow = max(20000, 40000) = 40000 → score 75
      const result = scoreWith({
        damReleases: {
          historical48h: {
            averageFlowCFS: 20000,
            peakFlowCFS: 50000,
            peakTimestamp: now,
            trendDirection: 'stable' as const,
            last24hAverage: 20000,
            last48hAverage: 20000,
            dataPointsCount: 48,
          },
        },
      });
      expect(result.factors.damReleases.score).toBe(75);
    });
  });

  // -------------------------------------------------------------------------
  // Overall score safety caps
  // -------------------------------------------------------------------------
  describe('overall score safety caps', () => {
    it('caps overall at 19 for dangerous water quality', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 1500 } });
      expect(result.overallScore).toBeLessThanOrEqual(19);
      expect(result.rating).toBe('challenging');
    });

    it('caps overall at 39 for water quality warning', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 800 } });
      expect(result.overallScore).toBeLessThanOrEqual(39);
      expect(result.rating).toBe('exciting');
    });

    it('caps overall at 39 for very strong current (>= 2.0 knots)', () => {
      const result = scoreWith({
        current: { speedKnots: 2.5 },
      });
      expect(result.overallScore).toBeLessThanOrEqual(39);
    });

    it('caps overall at 59 for strong current (>= 1.5 knots)', () => {
      const result = scoreWith({
        current: { speedKnots: 1.6 },
      });
      expect(result.overallScore).toBeLessThanOrEqual(59);
    });

    it('caps overall at 19 for dangerous waves', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 3.0 } });
      expect(result.overallScore).toBeLessThanOrEqual(19);
      expect(result.rating).toBe('challenging');
    });

    it('caps overall at 39 for rough waves', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 2.0 } });
      expect(result.overallScore).toBeLessThanOrEqual(39);
    });

    it('applies the strictest cap when multiple dangers exist', () => {
      const result = scoreWith({
        waterQuality: { enterococcusCount: 1500 }, // dangerous → cap 19
        current: { speedKnots: 2.5 },               // very strong → cap 39
        waves: { waveHeightFeet: 3.0 },              // dangerous → cap 19
      });
      expect(result.overallScore).toBeLessThanOrEqual(19);
      expect(result.rating).toBe('challenging');
    });
  });

  // -------------------------------------------------------------------------
  // Score ranges / rating
  // -------------------------------------------------------------------------
  describe('score rating mapping', () => {
    it('maps 80–100 to calm', () => {
      const result = scoreWith(); // all ideal → 100
      expect(result.rating).toBe('calm');
    });

    it('maps 60–79 to mild', () => {
      // Heavy rain reduces WQ to 35, overall ~81 weighted. Add moderate wind to drop below 80.
      const result = scoreWith({
        rainfall: { last72hInches: 1.0 },
        weather: { windSpeedMph: 17 }, // score 60
      });
      expect(result.overallScore).toBeGreaterThanOrEqual(60);
      expect(result.overallScore).toBeLessThanOrEqual(79);
      expect(result.rating).toBe('mild');
    });

    it('maps 40–59 to active', () => {
      const result = scoreWith({
        current: { speedKnots: 1.6 }, // strong → overall cap 59
      });
      expect(result.overallScore).toBeGreaterThanOrEqual(40);
      expect(result.overallScore).toBeLessThanOrEqual(59);
      expect(result.rating).toBe('active');
    });

    it('maps 20–39 to exciting', () => {
      const result = scoreWith({
        current: { speedKnots: 2.5 }, // very strong → overall cap 39
      });
      expect(result.overallScore).toBeGreaterThanOrEqual(20);
      expect(result.overallScore).toBeLessThanOrEqual(39);
      expect(result.rating).toBe('exciting');
    });

    it('maps 0–19 to challenging', () => {
      const result = scoreWith({
        waterQuality: { enterococcusCount: 1500 },
      });
      expect(result.overallScore).toBeLessThanOrEqual(19);
      expect(result.rating).toBe('challenging');
    });
  });

  // -------------------------------------------------------------------------
  // Weighted formula correctness
  // -------------------------------------------------------------------------
  describe('weighted score formula', () => {
    it('correctly weights: WQ=30%, Tide=25%, Waves=20%, Weather=15%, Dam=10%', () => {
      // Manually set known factor scores via threshold values
      // WQ: 70 (enterococcus 200), Tide: 85 (ebb low rate), Waves: 60 (1.2ft), Weather: 80 (12mph), Dam: 100 (20k)
      const result = scoreWith({
        waterQuality: { enterococcusCount: 200 },
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
        waves: { waveHeightFeet: 1.2 },
        weather: { windSpeedMph: 12 },
      });

      const expected = Math.round(
        (70 * 30 + 85 * 25 + 60 * 20 + 80 * 15 + 100 * 10) / 100
      );
      expect(result.overallScore).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Recommendations and warnings
  // -------------------------------------------------------------------------
  describe('recommendations and warnings', () => {
    it('recommends "Excellent time - slack tide" during slack', () => {
      const result = scoreWith({ tide: { currentPhase: 'slack' } });
      expect(result.recommendations).toContain('Excellent time - slack tide');
    });

    it('warns about strong currents (non-slack phase)', () => {
      // Warning only triggers when phase is not slack (else-if branch)
      const result = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 1.3 },
      });
      expect(result.warnings).toContain('Strong currents - experienced swimmers only');
    });

    it('warns about dangerous water quality', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 1500 } });
      expect(result.warnings).toContain('Do not swim - dangerous water quality');
    });

    it('warns about heavy rainfall', () => {
      const result = scoreWith({ rainfall: { last72hInches: 2.5 } });
      expect(result.warnings).toContain('Heavy recent rainfall — avoid swimming for 72 hours');
    });

    it('warns about significant rainfall', () => {
      const result = scoreWith({ rainfall: { last72hInches: 1.0 } });
      expect(result.warnings).toContain('Recent rainfall may have degraded water quality');
    });

    it('warns about dangerous waves', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 3.0 } });
      expect(result.warnings).toContain('Dangerous wave conditions');
    });

    it('warns about rough waves', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 2.0 } });
      expect(result.warnings).toContain('Rough seas - not recommended');
    });

    it('warns about strong winds with chop idiom', () => {
      const result = scoreWith({ weather: { windSpeedMph: 22 } });
      expect(result.warnings).toContain("It's howling out there — expect whitecaps and a bumpy ride");
    });

    it('recommends chop advisory for moderate winds', () => {
      const result = scoreWith({ weather: { windSpeedMph: 12 } });
      expect(result.recommendations).toContain("Get ready for some chop — the bay's got a bit of attitude today");
    });

    it('recommends light breeze note for light winds', () => {
      const result = scoreWith({ weather: { windSpeedMph: 7 } });
      expect(result.recommendations).toContain('A little breeze on the water — just enough to keep things interesting');
    });

    it('recommends calm water conditions', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 0.3 } });
      expect(result.recommendations).toContain('Calm water conditions');
    });

    it('recommends normal dam operations', () => {
      const result = scoreWith();
      expect(result.recommendations).toContain('Normal dam operations');
    });

    it('includes overall rating advice', () => {
      const excellent = scoreWith();
      expect(excellent.recommendations).toContain('Excellent conditions for swimming');

      const poor = scoreWith({ current: { speedKnots: 2.5 } });
      expect(poor.warnings).toContain('Poor conditions - not recommended');
    });
  });

  // -------------------------------------------------------------------------
  // Combined / real-world scenarios
  // -------------------------------------------------------------------------
  describe('combined scenarios', () => {
    it('rainy day with moderate wind: score reduced but not capped', () => {
      const result = scoreWith({
        rainfall: { last72hInches: 0.8 },
        weather: { windSpeedMph: 14 },
      });
      // Rain 0.8" (>= 0.5 moderate) caps WQ at 60, wind 14mph gives weather 80, rest 100
      // (60*30 + 100*25 + 100*20 + 80*15 + 100*10) / 100 = 85
      expect(result.overallScore).toBe(85);
      expect(result.rating).toBe('calm');
    });

    it('strong ebb current with moderate waves: multiple factors degrade', () => {
      const result = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 1.5 },
        current: { speedKnots: 1.7 },
        waves: { waveHeightFeet: 1.2 },
      });
      // Tide/current: moderate rate reduces ebb (85*0.7=59.5, cap 70), then strong current (>1.5) caps at 40
      // Waves: moderate (60), others ideal (100)
      // Strong current (>= 1.5 knots) caps overall at 59
      expect(result.overallScore).toBeLessThanOrEqual(59);
      expect(result.rating).toBe('active');
    });

    it('worst case: all factors at their worst', () => {
      const result = scoreWith({
        waterQuality: { enterococcusCount: 2000 },
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 3.0 },
        current: { speedKnots: 3.0 },
        waves: { waveHeightFeet: 4.0 },
        weather: { windSpeedMph: 30, conditions: 'storm' },
        damReleases: { historical48h: hist(120000) },
        rainfall: { last72hInches: 5.0 },
        ssos: [makeSSO({ resolved: false })],
      });
      expect(result.overallScore).toBeLessThanOrEqual(19);
      expect(result.rating).toBe('challenging');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('good day with one yellow flag: moderate waves only', () => {
      const result = scoreWith({
        waves: { waveHeightFeet: 1.2 },
      });
      // WQ=100, Tide=100, Waves=60, Weather=100, Dam=100
      // (100*30 + 100*25 + 60*20 + 100*15 + 100*10) / 100 = 92
      expect(result.overallScore).toBe(92);
      expect(result.rating).toBe('calm');
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: create a historical48h object with uniform flow values
// ---------------------------------------------------------------------------
function hist(flowCFS: number) {
  return {
    averageFlowCFS: flowCFS,
    peakFlowCFS: flowCFS,
    peakTimestamp: now,
    trendDirection: 'stable' as const,
    last24hAverage: flowCFS,
    last48hAverage: flowCFS,
    dataPointsCount: 48,
  };
}
