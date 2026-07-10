import { describe, it, expect } from 'vitest';
import { calculateSwimScore, mergeThresholds, type ThresholdsOverride } from './swim-score';
import { SAFETY_THRESHOLDS, SCORE_WEIGHTS } from '@/config/thresholds';
import type {
  TidePrediction,
  CurrentData,
  WeatherData,
  WaveData,
  WaterQuality,
  SSOEvent,
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
  rainfall?: Partial<RainfallData> | null;
  thresholds?: ThresholdsOverride;
} = {}) {
  return calculateSwimScore(
    makeTide(overrides.tide),
    overrides.current === null ? null : makeCurrent(overrides.current),
    makeWeather(overrides.weather),
    makeWaves(overrides.waves),
    makeWaterQuality(overrides.waterQuality),
    overrides.ssos ?? [],
    undefined,
    overrides.rainfall === undefined ? null : (overrides.rainfall === null ? null : makeRainfall(overrides.rainfall)),
    undefined,
    undefined,
    overrides.thresholds,
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
    it('returns near-perfect score with ideal conditions', () => {
      const result = scoreWith();
      expect(result.overallScore).toBe(98); // wave interp (0.3ft) gives 93, wind interp (3mph) gives 97, not 100
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
      // With 1.0" rain: WQ score = 35, but status stays safe so no overall safety cap
      const result = scoreWith({ rainfall: { last72hInches: 1.0 } });
      // (35*27 + 100*27 + 93*20 + 100*26) / 100 = 81.05 → 81
      expect(result.overallScore).toBeGreaterThanOrEqual(70);
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
  // Water quality — live precipitation (score-only, no status change)
  // -------------------------------------------------------------------------
  describe('water quality — live precipitation', () => {
    it('caps WQ score at 40 with rain in current conditions', () => {
      const result = scoreWith({ weather: { conditions: 'light rain' } });
      expect(result.factors.waterQuality.score).toBe(40);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('caps WQ score at 40 with storm in current conditions', () => {
      const result = scoreWith({ weather: { conditions: 'thunderstorm' } });
      expect(result.factors.waterQuality.score).toBe(40);
      expect(result.factors.waterQuality.status).toBe('safe');
    });

    it('does not penalize weather factor for rain/storm conditions', () => {
      const result = scoreWith({ weather: { windSpeedMph: 3, conditions: 'thunderstorm' } });
      expect(result.factors.weather.score).toBe(97); // wind-only interpolation at 3mph, no precip penalty
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

    it('scores 100 for flood/ebb with low change rate (no phase preference)', () => {
      const floodResult = scoreWith({
        tide: { currentPhase: 'flood', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
      });
      expect(floodResult.factors.tideAndCurrent.score).toBe(100);

      const ebbResult = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
      });
      expect(ebbResult.factors.tideAndCurrent.score).toBe(100);
    });

    it('reduces score with moderate tide change rate (1.0–2.0 ft/hr)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'flood', changeRateFeetPerHour: 1.5 },
        current: { speedKnots: 0.2 },
      });
      // base=100, moderate multiplier=0.7 → 70, capped at 70
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(70);
      expect(result.factors.tideAndCurrent.issues.length).toBeGreaterThan(0);
    });

    it('significantly reduces score with strong tide change rate (> 2.0 ft/hr)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 2.5 },
        current: { speedKnots: 0.2 },
      });
      // base=100, strong multiplier=0.4 → 40, capped at 40
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(40);
    });

    it('caps at 75 for moderate current speed (> 1.0 knots)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 1.3 },
      });
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(75);
    });

    it('caps at 50 for strong current speed (> 1.5 knots)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 1.7 },
      });
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(50);
    });

    it('caps at 30 for very strong current speed (> 2.0 knots)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'slack', changeRateFeetPerHour: 0.3 },
        current: { speedKnots: 2.5 },
      });
      expect(result.factors.tideAndCurrent.score).toBeLessThanOrEqual(30);
    });

    it('handles null current data gracefully', () => {
      const result = scoreWith({ current: null });
      expect(result.factors.tideAndCurrent.currentSpeed).toBe(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Wave scoring
  // -------------------------------------------------------------------------
  describe('waves', () => {
    it('scores ~93 for calm waves (< 0.5 ft)', () => {
      // lerp: 0.3 ft → 100 + (88-100)*(0.3/0.5) = 92.8 → 93
      const result = scoreWith({ waves: { waveHeightFeet: 0.3 } });
      expect(result.factors.waves.score).toBe(93);
      expect(result.factors.waves.status).toBe('calm');
    });

    it('scores ~80 for safe waves (0.5–1.0 ft)', () => {
      // lerp: 0.7 ft → 88 + (68-88)*(0.2/0.5) = 80
      const result = scoreWith({ waves: { waveHeightFeet: 0.7 } });
      expect(result.factors.waves.score).toBe(80);
      expect(result.factors.waves.status).toBe('calm');
    });

    it('scores ~57 for moderate waves (1.0–1.5 ft)', () => {
      // lerp: 1.2 ft → 68 + (40-68)*(0.2/0.5) = 56.8 → 57
      const result = scoreWith({ waves: { waveHeightFeet: 1.2 } });
      expect(result.factors.waves.score).toBe(57);
      expect(result.factors.waves.status).toBe('moderate');
    });

    it('scores ~26 for rough waves (1.5–2.5 ft)', () => {
      // lerp: 2.0 ft → 40 + (12-40)*(0.5/1.0) = 26
      const result = scoreWith({ waves: { waveHeightFeet: 2.0 } });
      expect(result.factors.waves.score).toBe(26);
      expect(result.factors.waves.status).toBe('rough');
    });

    it('scores 10 for dangerous waves (> 2.5 ft)', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 3.0 } });
      expect(result.factors.waves.score).toBe(10);
      expect(result.factors.waves.status).toBe('dangerous');
    });

    it('scores 88 at exactly 0.5 ft (start of 0.5–1.0 band)', () => {
      // lerp: 0.5 ft enters the 0.5–1.0 band at its top anchor (88)
      const result = scoreWith({ waves: { waveHeightFeet: 0.5 } });
      expect(result.factors.waves.score).toBe(88);
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
    it('interpolates a near-100 score for calm wind (< 10 mph)', () => {
      // Continuous curve: lerpScore(3, 0, 10, 100, 90) = 97, not a flat 100
      const result = scoreWith({ weather: { windSpeedMph: 3 } });
      expect(result.factors.weather.score).toBe(97);
      expect(result.factors.weather.windCondition).toBe('calm');
    });

    it('interpolates for light wind (10–15 mph)', () => {
      // lerpScore(12, 10, 15, 90, 75) = 84
      const result = scoreWith({ weather: { windSpeedMph: 12 } });
      expect(result.factors.weather.score).toBe(84);
      expect(result.factors.weather.windCondition).toBe('light');
    });

    it('interpolates for moderate wind (15–22 mph)', () => {
      // lerpScore(18, 15, 22, 75, 50) = 64
      const result = scoreWith({ weather: { windSpeedMph: 18 } });
      expect(result.factors.weather.score).toBe(64);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('interpolates for strong wind (22–30 mph)', () => {
      // lerpScore(25, 22, 30, 50, 25) = 41
      const result = scoreWith({ weather: { windSpeedMph: 25 } });
      expect(result.factors.weather.score).toBe(41);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('interpolates for very strong wind (30–38 mph)', () => {
      // lerpScore(33, 30, 38, 25, 10) = 19
      const result = scoreWith({ weather: { windSpeedMph: 33 } });
      expect(result.factors.weather.score).toBe(19);
      expect(result.factors.weather.windCondition).toBe('strong');
    });

    it('floors at 8 for extreme wind (> 38 mph)', () => {
      const result = scoreWith({ weather: { windSpeedMph: 40 } });
      expect(result.factors.weather.score).toBe(8);
      expect(result.factors.weather.windCondition).toBe('strong');
    });

    it('scores 50 when weather source is unavailable', () => {
      const result = scoreWith({ weather: { source: 'unavailable' } });
      expect(result.factors.weather.score).toBe(50);
      expect(result.factors.weather.windCondition).toBe('moderate');
    });

    it('factors in wind gusts to effective wind calculation', () => {
      // 8 mph sustained + 20 mph gusts → effective = 8*0.55 + 20*0.45 = 13.4
      // base = lerpScore(13.4, 10, 15, 90, 75) = 80; gustSpread = 12 > mild(5)
      // → penalty = lerpScore(12, 5, 20, 0, -15) = -7 → 80 - 7 = 73
      const result = scoreWith({ weather: { windSpeedMph: 8, windGustMph: 20 } });
      expect(result.factors.weather.score).toBe(73);
      expect(result.factors.weather.windCondition).toBe('light');
    });

    it('ignores gusts when lower than sustained speed', () => {
      // 7 mph sustained, 5 mph gust → effective = 7 (gust not higher, so no blend)
      // base = lerpScore(7, 0, 10, 100, 90) = 93; gustSpread = 5 - 7 = -2, not > mild → no penalty
      const result = scoreWith({ weather: { windSpeedMph: 7, windGustMph: 5 } });
      expect(result.factors.weather.score).toBe(93);
      expect(result.factors.weather.windCondition).toBe('calm');
    });

    it('gusts push calm into light band when high enough', () => {
      // 8 mph sustained + 22 mph gusts → effective = 8*0.55 + 22*0.45 = 14.3
      // base = lerpScore(14.3, 10, 15, 90, 75) = 77; gustSpread = 14 > mild(5)
      // → penalty = lerpScore(14, 5, 20, 0, -15) = -9 → 77 - 9 = 68
      // Without gusts: 8 mph < 10 → calm band entirely. Gusts matter.
      const result = scoreWith({ weather: { windSpeedMph: 8, windGustMph: 22 } });
      expect(result.factors.weather.score).toBe(68);
      expect(result.factors.weather.windCondition).toBe('light');
    });

    it('applies a separate gustiness penalty independent of the effective-wind blend', () => {
      // Both scenarios blend to the same effectiveWind (11 mph → base score 87),
      // but the second has a 20 mph sustained/gust spread — the "extreme"
      // gustiness threshold — which subtracts the full 15-point penalty on
      // top of the identical blended base score.
      const steady = scoreWith({ weather: { windSpeedMph: 11, windGustMph: 11 } });
      const gusty = scoreWith({ weather: { windSpeedMph: 2, windGustMph: 22 } });
      expect(steady.factors.weather.score).toBe(87);
      expect(gusty.factors.weather.score).toBe(72);
      expect(steady.factors.weather.windCondition).toBe(gusty.factors.weather.windCondition);
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
        weather: { windSpeedMph: 17 }, // lerpScore(17,15,22,75,50)=68
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
    it('correctly applies SCORE_WEIGHTS to each factor', () => {
      // WQ: 70 (enterococcus 200), Tide: 100 (ebb low rate, no phase preference), Waves: 57 (1.2ft lerp), Weather: 84 (12mph→light, lerpScore(12,10,15,90,75))
      const result = scoreWith({
        waterQuality: { enterococcusCount: 200 },
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 0.2 },
        waves: { waveHeightFeet: 1.2 },
        weather: { windSpeedMph: 12 },
      });

      const expected = Math.round(
        (70 * SCORE_WEIGHTS.waterQuality +
          100 * SCORE_WEIGHTS.tideAndCurrent +
          57 * SCORE_WEIGHTS.waves +
          84 * SCORE_WEIGHTS.weather) /
          100
      );
      expect(result.overallScore).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Recommendations and warnings
  // -------------------------------------------------------------------------
  describe('recommendations and warnings', () => {
    it('includes a slack tide recommendation during slack', () => {
      const result = scoreWith({ tide: { currentPhase: 'slack' } });
      expect(result.recommendations.some(r =>
        r.toLowerCase().includes('slack') ||
        r.toLowerCase().includes('tide') ||
        r.toLowerCase().includes('barely') ||
        r.toLowerCase().includes('moving')
      )).toBe(true);
    });

    it('warns about strong currents (non-slack phase)', () => {
      const result = scoreWith({
        tide: { currentPhase: 'ebb', changeRateFeetPerHour: 0.5 },
        current: { speedKnots: 1.3 },
      });
      expect(result.warnings.some(w =>
        w.toLowerCase().includes('current') ||
        w.toLowerCase().includes('hauling') ||
        w.toLowerCase().includes('moving') ||
        w.toLowerCase().includes('earn')
      )).toBe(true);
    });

    it('warns about dangerous water quality', () => {
      const result = scoreWith({ waterQuality: { enterococcusCount: 1500 } });
      expect(result.warnings.some(w =>
        w.toLowerCase().includes('water quality') ||
        w.toLowerCase().includes('bacteria') ||
        w.toLowerCase().includes('swim') ||
        w.toLowerCase().includes('ugly') ||
        w.toLowerCase().includes('worth it') ||
        w.toLowerCase().includes('cleans') ||
        w.toLowerCase().includes('no-go')
      )).toBe(true);
    });

    it('warns about heavy rainfall', () => {
      const result = scoreWith({ rainfall: { last72hInches: 2.5 } });
      expect(result.warnings.some(w =>
        w.toLowerCase().includes('rain') ||
        w.toLowerCase().includes('runoff') ||
        w.toLowerCase().includes('storm') ||
        w.toLowerCase().includes('bacteria') ||
        w.toLowerCase().includes('flushing') ||
        w.toLowerCase().includes('streets') ||
        w.toLowerCase().includes('bay')
      )).toBe(true);
    });

    it('warns about significant rainfall', () => {
      const result = scoreWith({ rainfall: { last72hInches: 1.0 } });
      expect(result.warnings.some(w => w.toLowerCase().includes('rain') || w.toLowerCase().includes('wet weather') || w.toLowerCase().includes('water quality'))).toBe(true);
    });

    it('warns about dangerous waves', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 3.0 } });
      expect(result.warnings.some(w =>
        w.toLowerCase().includes('wave') ||
        w.toLowerCase().includes('dangerous') ||
        w.toLowerCase().includes('cove') ||
        w.toLowerCase().includes('blown') ||
        w.toLowerCase().includes('swell') ||
        w.toLowerCase().includes('pier') ||
        w.toLowerCase().includes('shore')
      )).toBe(true);
    });

    it('warns about rough waves', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 2.0 } });
      expect(result.warnings.some(w =>
        w.toLowerCase().includes('rough') ||
        w.toLowerCase().includes('chop') ||
        w.toLowerCase().includes('swell') ||
        w.toLowerCase().includes('lumpy') ||
        w.toLowerCase().includes('cove') ||
        w.toLowerCase().includes('character')
      )).toBe(true);
    });

    it('warns about strong winds', () => {
      // 32 mph = veryStrong tier → windCondition='strong' → triggers warning
      const result = scoreWith({ weather: { windSpeedMph: 32 } });
      expect(result.warnings.some(w =>
        w.toLowerCase().includes('wind') ||
        w.toLowerCase().includes('howl') ||
        w.toLowerCase().includes('whitecap') ||
        w.toLowerCase().includes('gusty') ||
        w.toLowerCase().includes('earn') ||
        w.toLowerCase().includes('angry') ||
        w.toLowerCase().includes('cranking')
      )).toBe(true);
    });

    it('recommends chop advisory for moderate winds', () => {
      // 18 mph = moderate tier (15–22 mph) → windCondition='moderate' → triggers recommendation
      const result = scoreWith({ weather: { windSpeedMph: 18 } });
      expect(result.recommendations.some(r => r.toLowerCase().includes('chop') || r.toLowerCase().includes('breez') || r.toLowerCase().includes('bay'))).toBe(true);
    });

    it('recommends light breeze note for light winds', () => {
      // 12 mph = light tier (10–15 mph) → windCondition='light' → triggers recommendation
      const result = scoreWith({ weather: { windSpeedMph: 12 } });
      expect(result.recommendations.some(r =>
        r.toLowerCase().includes('breez') ||
        r.toLowerCase().includes('wind') ||
        r.toLowerCase().includes('smooth') ||
        r.toLowerCase().includes('settled') ||
        r.toLowerCase().includes('chop') ||
        r.toLowerCase().includes('nice')
      )).toBe(true);
    });

    it('recommends calm water conditions', () => {
      const result = scoreWith({ waves: { waveHeightFeet: 0.3 } });
      expect(result.recommendations.some(r =>
        r.toLowerCase().includes('calm') ||
        r.toLowerCase().includes('flat') ||
        r.toLowerCase().includes('glassy') ||
        r.toLowerCase().includes('ripple') ||
        r.toLowerCase().includes('pool') ||
        r.toLowerCase().includes('cove')
      )).toBe(true);
    });

    it('includes overall rating advice', () => {
      const excellent = scoreWith();
      // advice strings for score ≥ 80: 'conditions', 'bay', 'everything', 'buddies', 'good'
      expect(excellent.recommendations.some(r =>
        r.toLowerCase().includes('conditions') ||
        r.toLowerCase().includes('bay') ||
        r.toLowerCase().includes('everything') ||
        r.toLowerCase().includes('buddies') ||
        r.toLowerCase().includes('show up') ||
        r.toLowerCase().includes('good')
      )).toBe(true);

      const poor = scoreWith({ current: { speedKnots: 2.5 } });
      // advice strings for score 20–39: 'nice', 'stacked', 'cost', 'skip'
      expect(poor.warnings.some(w =>
        w.toLowerCase().includes('skip') ||
        w.toLowerCase().includes('stacked') ||
        w.toLowerCase().includes('cost') ||
        w.toLowerCase().includes('nice') ||
        w.toLowerCase().includes('factor')
      )).toBe(true);
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
      // Rain 0.8" caps WQ at 60, wind 14mph → lerpScore(14,10,15,90,75)=78, waves 93, tide 100
      // (60*25 + 100*25 + 93*20 + 78*30) / 100 = 82
      expect(result.overallScore).toBe(82);
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
      // WQ=100, Tide=100, Waves=57 (lerp), Weather=97 (3mph, lerpScore(3,0,10,100,90))
      // (100*25 + 100*25 + 57*20 + 97*30) / 100 = 90.5 → 91
      expect(result.overallScore).toBe(91);
      expect(result.rating).toBe('calm');
    });
  });
});

// ===========================================================================
// mergeThresholds / per-location threshold overrides
// ===========================================================================

describe('mergeThresholds', () => {
  it('returns SAFETY_THRESHOLDS unchanged when no override is given', () => {
    expect(mergeThresholds(undefined)).toBe(SAFETY_THRESHOLDS);
  });

  it('merges a partial category override onto the defaults', () => {
    const merged = mergeThresholds({ waves: { calm: 1.5, safe: 2.5, moderate: 3.5, rough: 6.0 } });
    expect(merged.waves).toEqual({ calm: 1.5, safe: 2.5, moderate: 3.5, rough: 6.0 });
  });

  it('leaves categories not present in the override untouched', () => {
    const merged = mergeThresholds({ waves: { calm: 1.5, safe: 2.5, moderate: 3.5, rough: 6.0 } });
    expect(merged.wind).toEqual(SAFETY_THRESHOLDS.wind);
    expect(merged.current).toEqual(SAFETY_THRESHOLDS.current);
    expect(merged.waterQuality).toEqual(SAFETY_THRESHOLDS.waterQuality);
  });

  it('does not mutate the original SAFETY_THRESHOLDS object', () => {
    mergeThresholds({ waves: { calm: 999 } });
    expect(SAFETY_THRESHOLDS.waves.calm).toBe(0.5);
  });

  it('merges multiple overridden categories independently', () => {
    const merged = mergeThresholds({
      waves: { calm: 1.5 },
      wind: { calm: 20 },
    });
    expect(merged.waves.calm).toBe(1.5);
    expect(merged.waves.safe).toBe(SAFETY_THRESHOLDS.waves.safe); // untouched key within an overridden category
    expect(merged.wind.calm).toBe(20);
    expect(merged.current).toEqual(SAFETY_THRESHOLDS.current);
  });
});

describe('calculateSwimScore with a per-location threshold override', () => {
  // Mirrors La Jolla Cove's real override: open-coast groundswell reads much
  // higher on the same instruments than Aquatic Park's sheltered-bay chop for
  // what's actually a normal, comfortable swim day.
  const LA_JOLLA_LIKE_OVERRIDE: ThresholdsOverride = {
    waves: { calm: 1.5, safe: 2.5, moderate: 3.5, rough: 6.0 },
  };

  it('scores the same wave height very differently with vs. without the override', () => {
    const withoutOverride = scoreWith({ waves: { waveHeightFeet: 2.0 } });
    const withOverride = scoreWith({ waves: { waveHeightFeet: 2.0 }, thresholds: LA_JOLLA_LIKE_OVERRIDE });

    expect(withoutOverride.factors.waves.status).toBe('rough');
    expect(withOverride.factors.waves.status).toBe('calm');
    expect(withOverride.factors.waves.score).toBeGreaterThan(withoutOverride.factors.waves.score);
  });

  it('a 2 ft reading is "calm" under the override, matching a real lifeguard "flat" call', () => {
    const result = scoreWith({ waves: { waveHeightFeet: 1.97 }, thresholds: LA_JOLLA_LIKE_OVERRIDE });
    expect(result.factors.waves.status).toBe('calm');
    expect(result.factors.waves.issues).toEqual([]);
  });

  it('a 6.5 ft reading is dangerous under the override, matching swim-club safety guidance', () => {
    const result = scoreWith({ waves: { waveHeightFeet: 6.5 }, thresholds: LA_JOLLA_LIKE_OVERRIDE });
    expect(result.factors.waves.status).toBe('dangerous');
  });

  it('leaves other scored factors (current speed caps) using the shared defaults', () => {
    const result = scoreWith({
      current: { speedKnots: 2.5 },
      thresholds: LA_JOLLA_LIKE_OVERRIDE,
    });
    // current.veryStrong (2.0kt default, untouched by the wave-only override) still caps the score
    expect(result.overallScore).toBeLessThanOrEqual(39);
  });

  it('does not affect a separate calculateSwimScore call with no override (no shared mutable state)', () => {
    scoreWith({ waves: { waveHeightFeet: 6.5 }, thresholds: LA_JOLLA_LIKE_OVERRIDE });
    const defaultResult = scoreWith({ waves: { waveHeightFeet: 2.0 } });
    expect(defaultResult.factors.waves.status).toBe('rough');
  });
});

