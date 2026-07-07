import { describe, it, expect } from 'vitest';
import {
  mapTideCurrentStatus,
  mapWaveStatus,
  mapWeatherStatus,
  mapWaterQualityStatus,
  mapDamReleasesStatus,
  mapWaterTempStatus,
  mapBarometricPressureStatus,
  mapWindSpeedStatus,
  mapSsoStatus,
  mapBacteriaStatus,
  mapRainfallStatus,
} from './card-status';
import { SAFETY_THRESHOLDS } from '@/config/thresholds';

// ---------------------------------------------------------------------------
// Tide & Current card status
// ---------------------------------------------------------------------------
describe('mapTideCurrentStatus', () => {
  // Thresholds: slack < 0.3, slow < 0.5, moderate >= 1.0, strong >= 1.5, veryStrong >= 2.0

  describe('favorable conditions (slack or slow current)', () => {
    it('returns good for slack current (< 0.3 kt), favorable', () => {
      expect(mapTideCurrentStatus(0.1, true)).toBe('good');
    });

    it('returns good for slow current (0.3–0.5 kt), favorable', () => {
      expect(mapTideCurrentStatus(0.4, true)).toBe('good');
    });

    it('returns good at just below moderate threshold, favorable', () => {
      expect(mapTideCurrentStatus(0.99, true)).toBe('good');
    });
  });

  describe('unfavorable slow conditions', () => {
    it('returns info for slack current, not favorable', () => {
      expect(mapTideCurrentStatus(0.1, false)).toBe('info');
    });

    it('returns info for slow current, not favorable', () => {
      expect(mapTideCurrentStatus(0.7, false)).toBe('info');
    });
  });

  describe('moderate current (1.0–1.5 kt)', () => {
    it('returns info when favorable', () => {
      expect(mapTideCurrentStatus(1.2, true)).toBe('info');
    });

    it('returns warning when not favorable', () => {
      expect(mapTideCurrentStatus(1.2, false)).toBe('warning');
    });

    it('returns info/warning at boundary (exactly 1.0 kt)', () => {
      expect(mapTideCurrentStatus(1.0, true)).toBe('info');
      expect(mapTideCurrentStatus(1.0, false)).toBe('warning');
    });
  });

  describe('strong current (1.5–2.0 kt)', () => {
    it('returns warning regardless of favorability', () => {
      expect(mapTideCurrentStatus(1.7, true)).toBe('warning');
      expect(mapTideCurrentStatus(1.7, false)).toBe('warning');
    });

    it('returns warning at boundary (exactly 1.5 kt)', () => {
      expect(mapTideCurrentStatus(1.5, true)).toBe('warning');
      expect(mapTideCurrentStatus(1.5, false)).toBe('warning');
    });
  });

  describe('very strong current (>= 2.0 kt)', () => {
    it('returns danger regardless of favorability', () => {
      expect(mapTideCurrentStatus(2.5, true)).toBe('danger');
      expect(mapTideCurrentStatus(2.5, false)).toBe('danger');
    });

    it('returns danger at boundary (exactly 2.0 kt)', () => {
      expect(mapTideCurrentStatus(2.0, true)).toBe('danger');
      expect(mapTideCurrentStatus(2.0, false)).toBe('danger');
    });

    it('returns danger for extreme current', () => {
      expect(mapTideCurrentStatus(4.0, true)).toBe('danger');
    });
  });

  describe('ebb tide fix — speed must use absolute value', () => {
    // This verifies the bug fix: negative display speed should never be passed in.
    // The component now passes currentSpeedRaw (always positive) instead of the
    // display value (negative during ebb). These tests document that the mapping
    // function expects a non-negative speed.
    it('correctly maps strong ebb current (1.8 kt raw)', () => {
      expect(mapTideCurrentStatus(1.8, false)).toBe('warning');
    });

    it('correctly maps very strong ebb current (2.5 kt raw)', () => {
      expect(mapTideCurrentStatus(2.5, false)).toBe('danger');
    });
  });

  describe('threshold boundaries match config', () => {
    const { moderate, strong, veryStrong } = SAFETY_THRESHOLDS.current;

    it('transitions from good/info to info/warning at moderate threshold', () => {
      expect(mapTideCurrentStatus(moderate - 0.01, true)).toBe('good');
      expect(mapTideCurrentStatus(moderate, true)).toBe('info');
    });

    it('transitions from info/warning to warning at strong threshold', () => {
      expect(mapTideCurrentStatus(strong - 0.01, false)).toBe('warning');
      expect(mapTideCurrentStatus(strong, false)).toBe('warning');
      // Key difference: favorable moderate is info, favorable strong is warning
      expect(mapTideCurrentStatus(strong - 0.01, true)).toBe('info');
      expect(mapTideCurrentStatus(strong, true)).toBe('warning');
    });

    it('transitions from warning to danger at veryStrong threshold', () => {
      expect(mapTideCurrentStatus(veryStrong - 0.01, true)).toBe('warning');
      expect(mapTideCurrentStatus(veryStrong, true)).toBe('danger');
    });
  });
});

// ---------------------------------------------------------------------------
// Wave card status
// ---------------------------------------------------------------------------
describe('mapWaveStatus', () => {
  it('returns good for calm', () => {
    expect(mapWaveStatus('calm')).toBe('good');
  });

  it('returns warning for moderate', () => {
    expect(mapWaveStatus('moderate')).toBe('warning');
  });

  it('returns danger for rough', () => {
    expect(mapWaveStatus('rough')).toBe('danger');
  });

  it('returns danger for dangerous', () => {
    expect(mapWaveStatus('dangerous')).toBe('danger');
  });

  it('returns info for unknown status', () => {
    expect(mapWaveStatus('unknown')).toBe('info');
    expect(mapWaveStatus('')).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// Weather card status
// ---------------------------------------------------------------------------
describe('mapWeatherStatus', () => {
  it('returns good for calm', () => {
    expect(mapWeatherStatus('calm')).toBe('good');
  });

  it('returns info for light', () => {
    expect(mapWeatherStatus('light')).toBe('info');
  });

  it('returns warning for moderate', () => {
    expect(mapWeatherStatus('moderate')).toBe('warning');
  });

  it('returns danger for strong', () => {
    expect(mapWeatherStatus('strong')).toBe('danger');
  });

  it('returns info for unknown condition', () => {
    expect(mapWeatherStatus('unknown')).toBe('info');
    expect(mapWeatherStatus('')).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// Water Quality card status
// ---------------------------------------------------------------------------
describe('mapWaterQualityStatus', () => {
  it('returns good for safe', () => {
    expect(mapWaterQualityStatus('safe')).toBe('good');
  });

  it('returns warning for advisory', () => {
    expect(mapWaterQualityStatus('advisory')).toBe('warning');
  });

  it('returns danger for warning', () => {
    expect(mapWaterQualityStatus('warning')).toBe('danger');
  });

  it('returns danger for dangerous', () => {
    expect(mapWaterQualityStatus('dangerous')).toBe('danger');
  });

  it('returns info for unknown status', () => {
    expect(mapWaterQualityStatus('unknown')).toBe('info');
    expect(mapWaterQualityStatus('')).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// Dam Releases card status
// ---------------------------------------------------------------------------
describe('mapDamReleasesStatus', () => {
  it('returns good for low', () => {
    expect(mapDamReleasesStatus('low')).toBe('good');
  });

  it('returns info for moderate', () => {
    expect(mapDamReleasesStatus('moderate')).toBe('info');
  });

  it('returns warning for high', () => {
    expect(mapDamReleasesStatus('high')).toBe('warning');
  });

  it('returns danger for extreme', () => {
    expect(mapDamReleasesStatus('extreme')).toBe('danger');
  });

  it('returns info for unknown level', () => {
    expect(mapDamReleasesStatus('unknown')).toBe('info');
    expect(mapDamReleasesStatus('')).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// Water temperature detail-line status
// ---------------------------------------------------------------------------
describe('mapWaterTempStatus', () => {
  const { cold, cool, comfortable } = SAFETY_THRESHOLDS.waterTemp;

  it('returns danger below cold threshold', () => {
    expect(mapWaterTempStatus(cold - 1)).toBe('danger');
  });

  it('returns warning between cold and cool', () => {
    expect(mapWaterTempStatus(cold)).toBe('warning');
    expect(mapWaterTempStatus(cool - 1)).toBe('warning');
  });

  it('returns info between cool and comfortable', () => {
    expect(mapWaterTempStatus(cool)).toBe('info');
    expect(mapWaterTempStatus(comfortable - 1)).toBe('info');
  });

  it('returns good at/above comfortable', () => {
    expect(mapWaterTempStatus(comfortable)).toBe('good');
    expect(mapWaterTempStatus(comfortable + 5)).toBe('good');
  });
});

// ---------------------------------------------------------------------------
// Barometric pressure detail-line status
// ---------------------------------------------------------------------------
describe('mapBarometricPressureStatus', () => {
  const { veryHigh, standard, low } = SAFETY_THRESHOLDS.barometricPressure;

  it('returns good at/above veryHigh', () => {
    expect(mapBarometricPressureStatus(veryHigh)).toBe('good');
  });

  it('returns info between standard and veryHigh', () => {
    expect(mapBarometricPressureStatus(standard)).toBe('info');
    expect(mapBarometricPressureStatus(veryHigh - 1)).toBe('info');
  });

  it('returns warning between low and standard', () => {
    expect(mapBarometricPressureStatus(low)).toBe('warning');
    expect(mapBarometricPressureStatus(standard - 1)).toBe('warning');
  });

  it('returns danger below low', () => {
    expect(mapBarometricPressureStatus(low - 1)).toBe('danger');
  });
});

// ---------------------------------------------------------------------------
// Wind speed / gust detail-line status
// ---------------------------------------------------------------------------
describe('mapWindSpeedStatus', () => {
  const { calm, light, moderate } = SAFETY_THRESHOLDS.wind;

  it('returns good below calm', () => {
    expect(mapWindSpeedStatus(calm - 1)).toBe('good');
  });

  it('returns info between calm and light', () => {
    expect(mapWindSpeedStatus(calm)).toBe('info');
    expect(mapWindSpeedStatus(light - 1)).toBe('info');
  });

  it('returns warning between light and moderate', () => {
    expect(mapWindSpeedStatus(light)).toBe('warning');
    expect(mapWindSpeedStatus(moderate - 1)).toBe('warning');
  });

  it('returns danger at/above moderate', () => {
    expect(mapWindSpeedStatus(moderate)).toBe('danger');
  });
});

// ---------------------------------------------------------------------------
// SSO recency status
// ---------------------------------------------------------------------------
describe('mapSsoStatus', () => {
  const { cautionDays, warningDays } = SAFETY_THRESHOLDS.sso;

  it('returns danger within caution window', () => {
    expect(mapSsoStatus(0)).toBe('danger');
    expect(mapSsoStatus(cautionDays)).toBe('danger');
  });

  it('returns warning between caution and warning windows', () => {
    expect(mapSsoStatus(cautionDays + 1)).toBe('warning');
    expect(mapSsoStatus(warningDays)).toBe('warning');
  });

  it('returns info beyond warning window', () => {
    expect(mapSsoStatus(warningDays + 1)).toBe('info');
  });

  it('returns info when days since SSO is unknown', () => {
    expect(mapSsoStatus(undefined)).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// Shared bacteria-count status (Enterococcus / E.coli / Coliform)
// ---------------------------------------------------------------------------
describe('mapBacteriaStatus', () => {
  it('returns good at/below the safe limit', () => {
    expect(mapBacteriaStatus(100, 104, 1000)).toBe('good');
  });

  it('returns warning above safe but at/below dangerous', () => {
    expect(mapBacteriaStatus(500, 104, 1000)).toBe('warning');
  });

  it('returns danger above the dangerous limit', () => {
    expect(mapBacteriaStatus(1500, 104, 1000)).toBe('danger');
  });
});

// ---------------------------------------------------------------------------
// Rainfall / water clarity status
// ---------------------------------------------------------------------------
describe('mapRainfallStatus', () => {
  const { moderate, heavy } = SAFETY_THRESHOLDS.rainfall;

  it('returns good below moderate', () => {
    expect(mapRainfallStatus(0)).toBe('good');
    expect(mapRainfallStatus(moderate - 0.01)).toBe('good');
  });

  it('returns warning between moderate and heavy', () => {
    expect(mapRainfallStatus(moderate)).toBe('warning');
    expect(mapRainfallStatus(heavy - 0.01)).toBe('warning');
  });

  it('returns danger at/above heavy', () => {
    expect(mapRainfallStatus(heavy)).toBe('danger');
  });
});

// ---------------------------------------------------------------------------
// Cross-card consistency: every card has a path to each status
// ---------------------------------------------------------------------------
describe('all cards can produce every status', () => {
  it('tide/current can produce good, info, warning, danger', () => {
    expect(mapTideCurrentStatus(0.1, true)).toBe('good');
    expect(mapTideCurrentStatus(0.1, false)).toBe('info');
    expect(mapTideCurrentStatus(1.5, true)).toBe('warning');
    expect(mapTideCurrentStatus(2.0, true)).toBe('danger');
  });

  it('waves can produce good, info, warning, danger', () => {
    expect(mapWaveStatus('calm')).toBe('good');
    expect(mapWaveStatus('unknown')).toBe('info');
    expect(mapWaveStatus('moderate')).toBe('warning');
    expect(mapWaveStatus('rough')).toBe('danger');
  });

  it('weather can produce good, info, warning, danger', () => {
    expect(mapWeatherStatus('calm')).toBe('good');
    expect(mapWeatherStatus('light')).toBe('info');
    expect(mapWeatherStatus('moderate')).toBe('warning');
    expect(mapWeatherStatus('strong')).toBe('danger');
  });

  it('water quality can produce good, info, warning, danger', () => {
    expect(mapWaterQualityStatus('safe')).toBe('good');
    expect(mapWaterQualityStatus('unknown')).toBe('info');
    expect(mapWaterQualityStatus('advisory')).toBe('warning');
    expect(mapWaterQualityStatus('dangerous')).toBe('danger');
  });

  it('dam releases can produce good, info, warning, danger', () => {
    expect(mapDamReleasesStatus('low')).toBe('good');
    expect(mapDamReleasesStatus('moderate')).toBe('info');
    expect(mapDamReleasesStatus('high')).toBe('warning');
    expect(mapDamReleasesStatus('extreme')).toBe('danger');
  });
});
