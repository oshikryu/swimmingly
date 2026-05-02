/**
 * Safety thresholds for swim condition scoring
 * These values determine what constitutes safe, caution, and dangerous conditions
 */

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
  wind: {
    calm: 5,              // < 5 mph = calm
    light: 10,            // 5-10 mph = light
    moderate: 15,         // 10-15 mph = moderate
    strong: 20,           // 15-20 mph = strong (caution)
    veryStrong: 25,       // > 25 mph = very strong (not recommended)
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
    cold: 55,             // < 55°F = very cold (wetsuit required)
    cool: 60,             // 55-60°F = cold (wetsuit recommended)
    moderate: 65,         // 60-65°F = moderate
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

    // Tide phase preferences (0-100, where 100 is most favorable)
    // Adjust these based on local conditions and swimmer preferences
    phasePreference: {
      slack: 100,         // Slack tide (no movement)
      flood: 85,          // Incoming/rising tide
      ebb: 85,            // Outgoing/falling tide
    },
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
  waterQuality: 30,      // Highest priority - safety first
  tideAndCurrent: 27,    // Affects difficulty and safety (moon phase adds signal)
  waves: 20,             // Affects comfort and safety
  weather: 23,           // Affects comfort (barometric pressure adds signal)
} as const;

/**
 * Swim score interpretations
 */
export const SCORE_RANGES = {
  calm: { min: 80, max: 100, label: 'Excellent', color: '#22c55e' },
  mild: { min: 60, max: 79, label: 'Good', color: '#3b82f6' },
  active: { min: 40, max: 59, label: 'Fair', color: '#f59e0b' },
  exciting: { min: 20, max: 39, label: 'Poor', color: '#ef4444' },
  challenging: { min: 0, max: 19, label: 'Dangerous', color: '#991b1b' },
} as const;
