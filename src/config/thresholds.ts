/**
 * Safety thresholds for swim condition scoring
 * These values determine what constitutes safe, caution, and dangerous conditions
 */

import { STATUS_PALETTE } from '@/lib/status-colors';

export const SAFETY_THRESHOLDS = {
  // Water quality thresholds (MPN/100ml - Most Probable Number per 100 milliliters)
  // EPA standards for marine recreational water quality
  // Status ranges: safe → advisory → warning → closed
  waterQuality: {
    enterococcus: {
      safe: 104,           // ≤ 104: safe | 105-500: advisory
      advisory: 500,       // 501-1000: warning
      dangerous: 1000,     // > 1000: closed (do not swim)
    },
    eColi: {
      safe: 400,           // ≤ 400: safe | 401-800: advisory
      advisory: 800,       // 801-2000: warning
      dangerous: 2000,     // > 2000: closed (do not swim)
    },
    coliform: {
      safe: 10000,         // ≤ 10,000: safe | 10,001-50,000: advisory
      advisory: 50000,     // 50,001-100,000: warning
      dangerous: 100000,   // > 100,000: closed (do not swim)
    },
  },

  // Wave height thresholds (feet)
  // Calibrated for Aquatic Park — a sheltered cove protected by the Municipal Pier
  // wave baffles and Hyde Street Pier. The breakwater reduces open-bay waves by ~60-80%.
  // Typical conditions: 0.5-1.0 ft; storm peak inside cove rarely exceeds 2.5 ft.
  // Sources: OpenWaterLog historic data, USGS SF Bay wave modeling, GGTC swim reports
  waves: {
    calm: 0.5,            // < 0.5 feet = calm (glassy to light ripple)
    safe: 1.0,            // 0.5-1.0 feet = safe (light chop, comfortable for all)
    moderate: 1.5,        // 1.0-1.5 feet = moderate/caution (noticeable chop)
    rough: 2.5,           // 1.5-2.5 feet = rough (not recommended for beginners)
    // > 2.5 feet = dangerous (rare storm conditions inside the cove)
  },

  // Wind speed thresholds (mph)
  // Calibrated for SF Bay — afternoon winds of 15-22 mph are routine and not a real hazard.
  wind: {
    calm: 10,             // < 10 mph = calm
    light: 15,            // 10-15 mph = light (normal morning)
    moderate: 22,         // 15-22 mph = moderate (typical SF afternoon)
    strong: 30,           // 22-30 mph = strong (caution)
    veryStrong: 38,       // > 38 mph = very strong (not recommended)
  },

  // Current speed thresholds (knots)
  current: {
    slack: 0.3,           // < 0.3 knots = slack (best for swimming)
    slow: 0.5,            // 0.3-0.5 knots = slow (good)
    moderate: 1.0,        // 0.5-1.0 knots = moderate (experienced swimmers)
    strong: 1.5,          // 1.0-1.5 knots = strong (difficult)
    veryStrong: 2.0,      // > 2.0 knots = very strong (dangerous)
  },

  // Water temperature thresholds (Fahrenheit)
  waterTemp: {
    cold: 55,             // < 55°F = very cold (fuel up, pre-warm, limit time)
    cool: 60,             // 55-60°F = cold (eat before, keep it short)
    moderate: 65,         // 60-65°F = cool but manageable
    comfortable: 70,      // > 70°F = comfortable
  },

  // Visibility thresholds (miles)
  visibility: {
    poor: 1,              // < 1 mile = poor
    moderate: 3,          // 1-3 miles = moderate
    good: 5,              // 3-5 miles = good
    excellent: 10,        // > 10 miles = excellent
  },

  // SSO (Sanitary Sewer Overflow) time thresholds
  sso: {
    cautionDays: 3,       // Show caution for 3 days after SSO
    warningDays: 7,       // Show warning for 7 days after major SSO
    proximityMiles: 2,    // SSO within 2 miles affects score
  },

  // Tide range thresholds (feet)
  tide: {
    slackWindow: 0.5,     // Tide change < 0.5 ft/hour = slack
    lowCurrent: 1.0,      // Tide change < 1.0 ft/hour = low current
    moderateCurrent: 2.0, // Tide change < 2.0 ft/hour = moderate
    // > 2.0 ft/hour = strong current
  },

  // Rainfall thresholds (inches accumulated over 72 hours)
  // EPA recommends avoiding swimming for 72 hours after significant rainfall
  // due to increased bacteria, turbidity, and debris from runoff
  rainfall: {
    light: 0.1,        // < 0.1" — no concern
    moderate: 0.5,     // 0.1-0.5" — advisory, bacteria levels may rise
    heavy: 1.0,        // 0.5-1.0" — warning, expect poor water quality
    extreme: 2.0,      // > 2.0" — dangerous, do not swim (major runoff)
  },

  // Dam release thresholds (CFS - cubic feet per second)
  // Combined flow from all monitored dams affecting SF Bay
  damReleases: {
    low: 30000,        // < 30k CFS - normal operations
    moderate: 50000,   // 30k-50k CFS - elevated releases, increased currents
    high: 80000,       // 50k-80k CFS - high release period, strong currents
    extreme: 100000,   // > 100k CFS - flood control releases, dangerous conditions
  },

  // Barometric pressure thresholds (millibars)
  barometricPressure: {
    veryHigh: 1025,    // ≥ 1025 mb: very stable high pressure
    high: 1020,        // 1020–1025 mb: high pressure, favorable
    standard: 1013,    // 1013–1020 mb: near-standard atmosphere, neutral
    low: 1005,         // 1005–1013 mb: low pressure, possible deterioration
    veryLow: 1000,     // 1000–1005 mb: very low pressure, storm risk
    // < 1000 mb: storm pressure, dangerous conditions likely
  },
} as const;

/**
 * Score weights for the overall swim score calculation
 * All weights should sum to 100
 */
export const SCORE_WEIGHTS = {
  waterQuality: 25,      // Safety first — bacteria/SSO dominant, water temp/precip smaller modifiers
  tideAndCurrent: 25,    // Affects difficulty and safety (moon phase adds signal)
  waves: 20,             // Affects comfort and safety
  weather: 30,           // Wind, gusts, and gustiness penalty — weighted most heavily; no pressure/precip
} as const;

/**
 * How much sustained wind vs. gust speed contributes to the "effective wind"
 * used for scoring. Weighting gusts higher makes gusty conditions pull the
 * weather score down harder.
 */
export const WIND_GUST_BLEND = {
  sustainedWeight: 0.55,
  gustWeight: 0.45,
} as const;

/**
 * Score anchor points for continuous wind interpolation (used by scoreWeather).
 * lerpScore() interpolates effectiveWind between these anchors and the mph
 * breakpoints in SAFETY_THRESHOLDS.wind, so score responds to every mph
 * instead of jumping at band edges (same pattern as scoreWaves).
 */
export const WIND_SCORE_ANCHORS = {
  atZeroMph: 100,
  atCalmMph: 90,        // score at thresholds.wind.calm (10 mph)
  atLightMph: 75,       // score at thresholds.wind.light (15 mph)
  atModerateMph: 50,    // score at thresholds.wind.moderate (22 mph)
  atStrongMph: 25,       // score at thresholds.wind.strong (30 mph)
  atVeryStrongMph: 10,  // score at thresholds.wind.veryStrong (38 mph)
  floor: 8,              // flat score beyond thresholds.wind.veryStrong
} as const;

/**
 * Gustiness penalty thresholds (mph spread between windGustMph and
 * windSpeedMph). Independent of the sustained/gust blend used for
 * effectiveWind — distinguishes "steady wind" from "gusty/unpredictable
 * wind" at the same blended effective speed.
 */
export const GUST_SPREAD_THRESHOLDS = {
  mild: 5,      // spread <= this: no penalty
  extreme: 20,  // spread >= this: full penalty applied
} as const;

/** Max points subtracted from the weather score for extreme gustiness. */
export const GUST_SPREAD_PENALTY_MAX = 15;

/**
 * Score ceilings applied inside the tideAndCurrent factor as current speed
 * crosses each threshold band (before the separate, unchanged top-level
 * hard safety caps in calculateSwimScore).
 */
export const CURRENT_SPEED_SCORE_CAPS = {
  moderate: 75,    // currentSpeed > thresholds.current.moderate
  strong: 50,      // currentSpeed > thresholds.current.strong
  veryStrong: 30,  // currentSpeed > thresholds.current.veryStrong
} as const;

/**
 * Additive score deltas applied inside the waterQuality factor for each
 * water-temperature band. Kept small relative to the bacteria/SSO penalties
 * above them so temperature stays a modifier, not a dominant signal.
 */
export const WATER_TEMP_SCORE_DELTAS = {
  cold: -8,
  cool: -4,
  moderate: -1,
  comfortable: 3,
} as const;

/**
 * Swim score interpretations
 */
export const SCORE_RANGES = {
  calm: { min: 80, max: 100, label: 'Excellent', color: STATUS_PALETTE.good.hex },
  mild: { min: 60, max: 79, label: 'Good', color: STATUS_PALETTE.info.hex },
  active: { min: 40, max: 59, label: 'Fair', color: STATUS_PALETTE.warning.hex },
  exciting: { min: 20, max: 39, label: 'Poor', color: STATUS_PALETTE.danger.hex },
  challenging: { min: 0, max: 19, label: 'Dangerous', color: STATUS_PALETTE.critical.hex },
} as const;
