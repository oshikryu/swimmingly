/**
 * Safety thresholds for swim condition scoring
 * These values determine what constitutes safe, caution, and dangerous conditions
 */

export const SAFETY_THRESHOLDS = {
  // Water quality thresholds (MPN/100ml - Most Probable Number per 100 milliliters)
  waterQuality: {
    enterococcus: {
      safe: 104,           // Below this is considered safe
      advisory: 500,       // Above this is advisory/warning
      dangerous: 1000,     // Above this is dangerous
    },
    coliform: {
      safe: 200,           // Total coliform safe threshold
      advisory: 1000,
      dangerous: 2000,
    },
  },

  // Wave height thresholds (feet)
  waves: {
    calm: 2,              // < 2 feet = calm
    safe: 3,              // 2-3 feet = safe
    moderate: 5,          // 3-5 feet = moderate/caution
    rough: 8,             // 5-8 feet = rough (not recommended)
    // > 8 feet = dangerous
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
  },
} as const;

/**
 * Score weights for the overall swim score calculation
 * All weights should sum to 100
 */
export const SCORE_WEIGHTS = {
  waterQuality: 30,     // Highest priority - safety first
  tideAndCurrent: 25,   // Affects difficulty and safety
  waves: 20,            // Affects comfort and safety
  weather: 15,          // Affects comfort
  visibility: 10,       // Safety factor
} as const;

/**
 * Swim score interpretations
 */
export const SCORE_RANGES = {
  excellent: { min: 80, max: 100, label: 'Excellent', color: '#22c55e' },
  good: { min: 60, max: 79, label: 'Good', color: '#3b82f6' },
  fair: { min: 40, max: 59, label: 'Fair', color: '#f59e0b' },
  poor: { min: 20, max: 39, label: 'Poor', color: '#ef4444' },
  dangerous: { min: 0, max: 19, label: 'Dangerous', color: '#991b1b' },
} as const;
