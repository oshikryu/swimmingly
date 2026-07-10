/**
 * Swim Score Algorithm
 * Calculates overall swim safety and comfort score based on multiple environmental factors
 */

import type {
  TidePrediction,
  CurrentData,
  WeatherData,
  WaveData,
  WaterQuality,
  WaterTemperature,
  SSOEvent,
  RainfallData,
  SwimScore,
  SwimScoreFactors,
  ScoreWeights,
  MoonPhaseData,
} from '@/types/conditions';
import {
  SAFETY_THRESHOLDS,
  SCORE_WEIGHTS,
  SCORE_RANGES,
  WIND_GUST_BLEND,
  CURRENT_SPEED_SCORE_CAPS,
  WATER_TEMP_SCORE_DELTAS,
  WIND_SCORE_ANCHORS,
  GUST_SPREAD_THRESHOLDS,
  GUST_SPREAD_PENALTY_MAX,
} from '@/config/thresholds';

type SafetyThresholds = typeof SAFETY_THRESHOLDS;

// SAFETY_THRESHOLDS is `as const`, so its leaf values are number literal types
// (e.g. `0.5`, not `number`) — widen them so overrides can use any numeric value.
type Widen<T> = { [K in keyof T]: T[K] extends number ? number : T[K] extends object ? Widen<T[K]> : T[K] };

/**
 * Per-location threshold overrides — each category can replace any subset of its
 * own values (e.g. `{ waves: { calm: 1.5, safe: 2.5 } }`). Omitted categories/keys
 * fall back to the shared SAFETY_THRESHOLDS defaults.
 */
export type ThresholdsOverride = {
  [K in keyof SafetyThresholds]?: Partial<Widen<SafetyThresholds[K]>>;
};

/**
 * Merge a location's threshold overrides onto the shared defaults. With no
 * overrides, returns SAFETY_THRESHOLDS unchanged (Aquatic Park's existing behavior).
 */
export function mergeThresholds(overrides?: ThresholdsOverride): SafetyThresholds {
  if (!overrides) return SAFETY_THRESHOLDS;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(SAFETY_THRESHOLDS) as (keyof SafetyThresholds)[]) {
    const override = overrides[key];
    result[key] = override ? { ...SAFETY_THRESHOLDS[key], ...override } : SAFETY_THRESHOLDS[key];
  }
  return result as SafetyThresholds;
}

/**
 * Calculate the overall swim score from all environmental factors
 */
export function calculateSwimScore(
  tide: TidePrediction,
  current: CurrentData | null,
  weather: WeatherData,
  waves: WaveData,
  waterQuality: WaterQuality,
  recentSSOs: SSOEvent[],
  customWeights?: ScoreWeights,
  rainfall?: RainfallData | null,
  moonPhase?: MoonPhaseData | null,
  waterTemp?: WaterTemperature | null,
  customThresholds?: ThresholdsOverride
): SwimScore {
  const thresholds = mergeThresholds(customThresholds);

  // Calculate individual factor scores
  const waterQualityFactor = scoreWaterQuality(waterQuality, recentSSOs, rainfall, waterTemp?.temperatureF, thresholds, weather?.conditions);
  const tideCurrentFactor = scoreTideAndCurrent(tide, current, moonPhase, thresholds);
  const waveFactor = scoreWaves(waves, thresholds);
  const weatherFactor = scoreWeather(weather, thresholds);

  // Calculate weighted overall score
  const weights = customWeights || SCORE_WEIGHTS;
  const weightSum = weights.waterQuality + weights.tideAndCurrent + weights.waves + weights.weather;
  let overallScore = Math.round(
    (waterQualityFactor.score * weights.waterQuality +
      tideCurrentFactor.score * weights.tideAndCurrent +
      waveFactor.score * weights.waves +
      weatherFactor.score * weights.weather) /
      weightSum
  );

  // Cap overall score based on critical danger conditions
  // These conditions are dangerous enough to override the weighted average
  const currentSpeed = tideCurrentFactor.currentSpeed;

  // Very strong current (>2.0 knots) caps score at Poor
  if (currentSpeed >= thresholds.current.veryStrong) {
    overallScore = Math.min(overallScore, SCORE_RANGES.exciting.max);
  }
  // Strong current (>1.5 knots) caps score at Fair
  else if (currentSpeed >= thresholds.current.strong) {
    overallScore = Math.min(overallScore, SCORE_RANGES.active.max);
  }

  // Dangerous water quality caps score
  if (waterQualityFactor.status === 'dangerous') {
    overallScore = Math.min(overallScore, SCORE_RANGES.challenging.max);
  } else if (waterQualityFactor.status === 'warning') {
    overallScore = Math.min(overallScore, SCORE_RANGES.exciting.max);
  }

  // Dangerous waves cap score
  if (waveFactor.status === 'dangerous') {
    overallScore = Math.min(overallScore, SCORE_RANGES.challenging.max);
  } else if (waveFactor.status === 'rough') {
    overallScore = Math.min(overallScore, SCORE_RANGES.exciting.max);
  }

  // Determine rating
  const rating = getScoreRating(overallScore);

  // Aggregate all factors
  const factors: SwimScoreFactors = {
    waterQuality: waterQualityFactor,
    tideAndCurrent: tideCurrentFactor,
    waves: waveFactor,
    weather: weatherFactor,
  };

  // Generate recommendations and warnings
  const { recommendations, warnings } = generateAdvice(factors, overallScore, thresholds, waterTemp?.temperatureF);

  return {
    timestamp: new Date(),
    overallScore,
    rating,
    factors,
    recommendations,
    warnings,
  };
}

/**
 * Score water quality (see SCORE_WEIGHTS.waterQuality - highest priority)
 */
function scoreWaterQuality(
  waterQuality: WaterQuality,
  recentSSOs: SSOEvent[],
  rainfall: RainfallData | null | undefined,
  waterTempF: number | undefined,
  thresholds: SafetyThresholds,
  weatherConditions: string | undefined
): SwimScoreFactors['waterQuality'] {
  let score = 100;
  const issues: string[] = [];
  let bacteriaLevel = 'unknown';
  let status: 'safe' | 'advisory' | 'warning' | 'dangerous' = 'safe';

  // Handle null/undefined water quality data
  if (!waterQuality) {
    score = 50;
    status = 'advisory';
    bacteriaLevel = 'unknown';
    issues.push('No water quality data available');
  } else if (waterQuality.enterococcusCount !== undefined) {
    const count = waterQuality.enterococcusCount;
    const enterococcusThresholds = thresholds.waterQuality.enterococcus;

    if (count > enterococcusThresholds.dangerous) {
      score = 0;
      bacteriaLevel = 'dangerous';
      status = 'dangerous';
      issues.push(`Dangerous bacteria levels (${count} MPN/100ml)`);
    } else if (count > enterococcusThresholds.advisory) {
      score = 30;
      bacteriaLevel = 'high';
      status = 'warning';
      issues.push(`High bacteria levels (${count} MPN/100ml)`);
    } else if (count > enterococcusThresholds.safe) {
      score = 70;
      bacteriaLevel = 'moderate';
      status = 'advisory';
      issues.push(`Elevated bacteria levels (${count} MPN/100ml)`);
    } else {
      bacteriaLevel = 'safe';
    }
  }

  // If enterococcus was safe but beachwatch reports a worse status (from e.coli/coliform),
  // escalate to match — avoids showing "safe" when other bacteria indicators are elevated
  if (waterQuality && status === 'safe' && waterQuality.status !== 'safe') {
    if (waterQuality.status === 'closed') {
      score = Math.min(score, 0);
      status = 'dangerous';
      bacteriaLevel = 'dangerous';
      issues.push('Beach closed — bacteria levels unsafe for swimming');
    } else if (waterQuality.status === 'warning') {
      score = Math.min(score, 30);
      status = 'warning';
      bacteriaLevel = bacteriaLevel === 'unknown' ? 'high' : bacteriaLevel;
      issues.push('Elevated bacteria detected (e.coli or coliform)');
    } else if (waterQuality.status === 'advisory') {
      score = Math.min(score, 70);
      status = 'advisory';
      bacteriaLevel = bacteriaLevel === 'unknown' ? 'moderate' : bacteriaLevel;
      issues.push('Advisory in effect — bacteria levels elevated');
    }
  }

  // Check for recent SSOs
  const activeSSOs = (recentSSOs ?? []).filter(sso => !sso?.resolved);
  const recentSSO = (recentSSOs ?? []).find(sso => {
    if (!sso?.reportedAt) return false;
    const daysSince = (Date.now() - sso.reportedAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince < thresholds.sso.cautionDays;
  });

  if (activeSSOs.length > 0) {
    score = Math.min(score, 20);
    status = 'dangerous';
    issues.push(`Active sewer overflow nearby`);
  } else if (recentSSO) {
    const daysSince = Math.floor((Date.now() - recentSSO.reportedAt.getTime()) / (1000 * 60 * 60 * 24));
    score = Math.min(score, 60);
    if (status === 'safe') status = 'advisory';
    issues.push(`Recent sewer overflow ${daysSince} days ago`);
  }

  // Rainfall penalty: recent rain increases bacteria before weekly testing catches it
  // This acts as a real-time proxy for water quality degradation
  // NOTE: Rainfall only reduces the WQ factor score — it does NOT escalate the WQ status.
  // Status changes (warning/dangerous) trigger overall score safety caps, which would be
  // too aggressive for an indirect proxy indicator without confirmed bacteria data.
  if (rainfall) {
    const rain72h = rainfall.last72hInches;
    const rainfallThresholds = thresholds.rainfall;

    if (rain72h >= rainfallThresholds.extreme) {
      score = Math.min(score, 15);
      issues.push(`Heavy rainfall (${rain72h.toFixed(1)}" in 72h) — expect dangerous runoff`);
    } else if (rain72h >= rainfallThresholds.heavy) {
      score = Math.min(score, 35);
      issues.push(`Significant rainfall (${rain72h.toFixed(1)}" in 72h) — elevated bacteria likely`);
    } else if (rain72h >= rainfallThresholds.moderate) {
      score = Math.min(score, 60);
      issues.push(`Moderate rainfall (${rain72h.toFixed(1)}" in 72h) — bacteria levels may be elevated`);
    }
    // light rainfall (<0.1") — no penalty
  }

  // Live precipitation flag: current rain/storm conditions are a faster-moving
  // proxy than the 72h rainfall total above — catches active runoff risk before
  // it shows up in the accumulation. Same rule as rainfall: reduces score only,
  // does not escalate status.
  if (weatherConditions?.includes('rain') || weatherConditions?.includes('storm')) {
    score = Math.min(score, 40);
    issues.push('Active precipitation — bacteria and runoff risk elevated');
  }

  // Water temperature — cold water is a direct safety risk (cold shock, hypothermia)
  if (waterTempF !== undefined) {
    const wt = thresholds.waterTemp;

    if (waterTempF < wt.cold) {
      score = Math.max(0, score + WATER_TEMP_SCORE_DELTAS.cold);
      issues.push(`Very cold water (${waterTempF.toFixed(0)}°F) — fuel up, pre-warm, limit swim time`);
    } else if (waterTempF < wt.cool) {
      score = Math.max(0, score + WATER_TEMP_SCORE_DELTAS.cool);
      issues.push(`Cold water (${waterTempF.toFixed(0)}°F) — eat before going in, keep it short`);
    } else if (waterTempF < wt.moderate) {
      score = Math.max(0, score + WATER_TEMP_SCORE_DELTAS.moderate);
      issues.push(`Cool water (${waterTempF.toFixed(0)}°F)`);
    } else if (waterTempF >= wt.comfortable) {
      score = Math.min(100, score + WATER_TEMP_SCORE_DELTAS.comfortable);
    }
  }

  return {
    score,
    status,
    bacteriaLevel,
    recentSSO: recentSSO !== undefined,
    daysSinceSSO: recentSSO
      ? Math.floor((Date.now() - recentSSO.reportedAt.getTime()) / (1000 * 60 * 60 * 24))
      : undefined,
    issues,
  };
}

/**
 * Score tide and current conditions (see SCORE_WEIGHTS.tideAndCurrent)
 */
function scoreTideAndCurrent(
  tide: TidePrediction,
  current: CurrentData | null,
  moonPhase: MoonPhaseData | null | undefined,
  thresholds: SafetyThresholds
): SwimScoreFactors['tideAndCurrent'] {
  let score = 100;
  const issues: string[] = [];
  const phase = tide?.currentPhase ?? 'slack';
  const currentSpeed = current?.speedKnots ?? 0;
  const tideHeight = tide?.heightFeet ?? 0;
  const changeRate = tide?.changeRateFeetPerHour ?? 0;

  // Handle null/undefined tide data
  if (!tide || tide.heightFeet == null) {
    score = 50;
    issues.push('No tide data available');
  } else {
    // All phases score equally; safety comes from measured current speed and
    // tide-height change rate below, not an assumption that slack is inherently safer.
    const basePhaseScore = 100;

    // Adjust score based on actual tide change rate
    if (Math.abs(changeRate) < thresholds.tide.lowCurrent) {
      // Low current - use full phase preference score
      score = basePhaseScore;
    } else if (Math.abs(changeRate) < thresholds.tide.moderateCurrent) {
      // Moderate current - reduce score
      score = Math.min(basePhaseScore * 0.7, 70);
      issues.push(`Moderate tide movement (${phase})`);
    } else {
      // Strong current - significantly reduce score
      score = Math.min(basePhaseScore * 0.4, 40);
      issues.push(`Strong tide movement (${phase})`);
    }

    // Factor in current speed
    if (currentSpeed > thresholds.current.veryStrong) {
      score = Math.min(score, CURRENT_SPEED_SCORE_CAPS.veryStrong);
      issues.push(`Very strong current (${currentSpeed.toFixed(1)} knots)`);
    } else if (currentSpeed > thresholds.current.strong) {
      score = Math.min(score, CURRENT_SPEED_SCORE_CAPS.strong);
      issues.push(`Strong current (${currentSpeed.toFixed(1)} knots)`);
    } else if (currentSpeed > thresholds.current.moderate) {
      score = Math.min(score, CURRENT_SPEED_SCORE_CAPS.moderate);
      issues.push(`Moderate current (${currentSpeed.toFixed(1)} knots)`);
    }
  }

  // Moon phase modifier — minor advisory signal, actual current data takes precedence
  if (moonPhase) {
    if (moonPhase.isSpringTide) {
      score = Math.max(0, score - 5);
      issues.push(`${moonPhase.phaseEmoji} ${moonPhase.phaseName} — spring tide, stronger tidal flows possible`);
    } else if (moonPhase.isNeapTide) {
      score = Math.min(100, score + 5);
    }
  }

  const favorable = phase === 'slack' || currentSpeed < thresholds.current.slow;

  return {
    score,
    phase,
    currentSpeed,
    tideHeight,
    favorable,
    issues,
  };
}

// Linear interpolation between score anchor points — avoids cliff-edge score jumps
// when wave height crosses a band boundary by a fraction of a foot.
function lerpScore(value: number, x0: number, x1: number, y0: number, y1: number): number {
  return Math.round(y0 + (y1 - y0) * Math.max(0, Math.min(1, (value - x0) / (x1 - x0))));
}

/**
 * Score wave conditions (see SCORE_WEIGHTS.waves)
 */
function scoreWaves(waves: WaveData, thresholds: SafetyThresholds): SwimScoreFactors['waves'] {
  let score = 100;
  const issues: string[] = [];
  let status: 'calm' | 'moderate' | 'rough' | 'dangerous' = 'calm';
  const height = waves?.waveHeightFeet ?? 0;

  // Handle null/undefined wave data
  if (height === 0 && !waves?.waveHeightFeet) {
    score = 50;
    status = 'moderate';
    issues.push('No wave data available');
  } else if (height < thresholds.waves.calm) {
    // 0–0.5 ft: glassy to light ripple, 100→88
    score = lerpScore(height, 0, thresholds.waves.calm, 100, 88);
    status = 'calm';
  } else if (height < thresholds.waves.safe) {
    // 0.5–1.0 ft: light chop, 88→68
    score = lerpScore(height, thresholds.waves.calm, thresholds.waves.safe, 88, 68);
    status = 'calm';
  } else if (height < thresholds.waves.moderate) {
    // 1.0–1.5 ft: noticeable chop, 68→40
    score = lerpScore(height, thresholds.waves.safe, thresholds.waves.moderate, 68, 40);
    status = 'moderate';
    issues.push(`Moderate waves (${height.toFixed(1)} ft)`);
  } else if (height < thresholds.waves.rough) {
    // 1.5–2.5 ft: rough, 40→12
    score = lerpScore(height, thresholds.waves.moderate, thresholds.waves.rough, 40, 12);
    status = 'rough';
    issues.push(`Rough waves (${height.toFixed(1)} ft)`);
  } else {
    score = 10;
    status = 'dangerous';
    issues.push(`Dangerous waves (${height.toFixed(1)} ft)`);
  }

  return {
    score,
    heightFeet: height,
    status,
    issues,
  };
}

/**
 * Score weather conditions (see SCORE_WEIGHTS.weather)
 */
function scoreWeather(weather: WeatherData, thresholds: SafetyThresholds): SwimScoreFactors['weather'] {
  let score = 100;
  const issues: string[] = [];
  let windCondition: 'calm' | 'light' | 'moderate' | 'strong' = 'calm';
  const windSpeed = weather?.windSpeedMph ?? 0;
  const windGust = weather?.windGustMph ?? 0;
  const temperature = weather?.temperatureF ?? 0;
  const w = thresholds.wind;
  const a = WIND_SCORE_ANCHORS;

  // Use effective wind: blend sustained speed with gusts (see WIND_GUST_BLEND)
  // This accounts for gusts making conditions worse than sustained speed alone
  const effectiveWind = windGust > windSpeed
    ? windSpeed * WIND_GUST_BLEND.sustainedWeight + windGust * WIND_GUST_BLEND.gustWeight
    : windSpeed;

  // Handle missing wind data (check source rather than value, since 0 mph is a valid reading)
  if (!weather || weather.source === 'unavailable') {
    score = 50;
    windCondition = 'moderate';
    issues.push('No wind data available');
  } else if (effectiveWind < w.calm) {
    // Continuous score: interpolate between anchor points instead of flat
    // bands, so score responds to every mph rather than jumping at boundaries
    // (same lerpScore pattern as scoreWaves).
    score = lerpScore(effectiveWind, 0, w.calm, a.atZeroMph, a.atCalmMph);
    windCondition = 'calm';
  } else if (effectiveWind < w.light) {
    score = lerpScore(effectiveWind, w.calm, w.light, a.atCalmMph, a.atLightMph);
    windCondition = 'light';
  } else if (effectiveWind < w.moderate) {
    score = lerpScore(effectiveWind, w.light, w.moderate, a.atLightMph, a.atModerateMph);
    windCondition = 'moderate';
  } else if (effectiveWind < w.strong) {
    score = lerpScore(effectiveWind, w.moderate, w.strong, a.atModerateMph, a.atStrongMph);
    windCondition = 'moderate';
    issues.push(`Moderate winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  } else if (effectiveWind < w.veryStrong) {
    score = lerpScore(effectiveWind, w.strong, w.veryStrong, a.atStrongMph, a.atVeryStrongMph);
    windCondition = 'strong';
    issues.push(`Strong winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  } else {
    score = a.floor;
    windCondition = 'strong';
    issues.push(`Very strong winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  }

  // Gustiness penalty — separate, continuous reduction for the raw spread
  // between sustained wind and gust, independent of the effectiveWind blend
  // above. Two profiles with the same blended wind can have very different
  // real gustiness (e.g. 5/25 vs 12/14 mph sustained/gust).
  const gustSpread = windGust - windSpeed;
  if (gustSpread > GUST_SPREAD_THRESHOLDS.mild) {
    const penalty = lerpScore(
      gustSpread,
      GUST_SPREAD_THRESHOLDS.mild,
      GUST_SPREAD_THRESHOLDS.extreme,
      0,
      -GUST_SPREAD_PENALTY_MAX
    );
    score = Math.max(0, score + penalty);
    issues.push(`Gusty winds (${windSpeed.toFixed(0)} mph sustained, ${windGust.toFixed(0)} mph gusts)`);
  }

  return {
    score,
    temperature,
    windSpeed,
    windCondition,
    issues,
  };
}

/**
 * Determine rating from score
 */
function getScoreRating(score: number): 'calm' | 'mild' | 'active' | 'exciting' | 'challenging' {
  if (score >= SCORE_RANGES.calm.min) return 'calm';
  if (score >= SCORE_RANGES.mild.min) return 'mild';
  if (score >= SCORE_RANGES.active.min) return 'active';
  if (score >= SCORE_RANGES.exciting.min) return 'exciting';
  return 'challenging';
}

/** Pick a deterministic-ish item from an array based on the current minute */
function pick<T>(items: T[]): T {
  return items[Math.floor(Date.now() / 60000) % items.length];
}

/**
 * Generate recommendations and warnings based on factors
 */
function generateAdvice(
  factors: SwimScoreFactors,
  overallScore: number,
  thresholds: SafetyThresholds,
  waterTempF: number | undefined
): { recommendations: string[]; warnings: string[] } {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Water quality warnings
  if (factors.waterQuality.status === 'dangerous') {
    warnings.push(pick([
      "Bacteria levels are above safe limits right now — best to skip swimming today",
      "Water quality testing shows unsafe bacteria levels — recommend waiting",
      "Current water quality readings are in the unsafe range",
      "Not a good day to swim based on water quality — check back once levels drop",
    ]));
  } else if (factors.waterQuality.status === 'warning') {
    warnings.push(pick([
      "Water quality is elevated but below the unsafe threshold — use your judgment",
      "Bacteria levels are higher than usual — a reasonable risk for experienced swimmers, worth skipping for sensitive groups",
      "Water quality isn't at its best today — consider a shorter swim",
      "Elevated bacteria readings — worth factoring into your decision",
    ]));
  } else if (factors.waterQuality.recentSSO) {
    warnings.push(pick([
      "A sewage overflow was reported nearby recently — bacteria levels may still be settling",
      "Recent overflow event in the area — water quality may not have fully recovered yet",
      "There was a nearby sewage spill recently — worth checking the latest test results before swimming",
    ]));
  }

  // Tide/current recommendations
  if (factors.tideAndCurrent.phase === 'slack') {
    recommendations.push(pick([
      "It's slack tide — currents are at their weakest, a good time to swim",
      "Slack water right now, so you'll get minimal current resistance",
      "Tide is at slack — conditions for current are about as calm as they get",
      "Currents are minimal during this slack tide window",
    ]));
  } else if (factors.tideAndCurrent.currentSpeed > 1.0) {
    warnings.push(pick([
      "Current is running strong today — plan your route and exit point in advance",
      "Expect a noticeable current — swim with the tide where possible and know your exit",
      "Stronger current than usual — pace yourself and stay aware of your position",
      "Current speed is elevated — experienced swimmers should plan accordingly",
    ]));
  }

  // Wave warnings
  if (factors.waves.status === 'dangerous') {
    warnings.push(pick([
      "Wave conditions in the cove are unsafe right now — recommend staying out of the water",
      "Swell is reaching inside the cove — conditions aren't safe for swimming today",
      "Wave heights are beyond a safe range — best to wait for calmer conditions",
      "Conditions are dangerous enough today that swimming isn't recommended",
    ]));
  } else if (factors.waves.status === 'rough') {
    warnings.push(pick([
      "The cove is choppy today — manageable for confident swimmers, but expect a workout",
      "Rougher conditions than usual — comfortable for experienced swimmers, worth skipping otherwise",
      "Chop is up in the cove — doable, just more tiring than a calm day",
      "Wave conditions are on the rough side — stay aware of your surroundings",
    ]));
  } else if (factors.waves.heightFeet < thresholds.waves.safe) {
    recommendations.push(pick([
      "The cove is calm and flat right now — great conditions for swimming",
      "Waters are calm with minimal chop — a good day to get in",
      "Conditions in the cove are about as smooth as they get",
      "Very little swell today — calm conditions comfortable for all skill levels",
    ]));
  }

  // Rainfall-related warnings
  const rainfallIssue = factors.waterQuality.issues.find(i => i.includes('rainfall'));
  if (rainfallIssue) {
    if (rainfallIssue.includes('dangerous') || rainfallIssue.includes('Heavy')) {
      warnings.push(pick([
        "Heavy rain recently means more runoff than usual is entering the bay — recommend waiting a few days for water quality to recover",
        "Storm runoff typically takes time to clear — best to hold off until levels normalize",
        "After heavy rain, bacteria levels often spike for 48-72 hours — check recent test results before swimming",
        "Significant recent rainfall raises the risk of elevated bacteria — worth waiting it out",
      ]));
    } else if (rainfallIssue.includes('Significant')) {
      warnings.push(pick([
        "Recent rainfall may have increased runoff into the bay — worth keeping in mind",
        "There's been some rain recently, which can elevate bacteria levels temporarily",
        "Runoff from recent rain could mean conditions are slightly worse than the numbers show",
      ]));
    }
  }

  // Water temperature advisories
  if (waterTempF !== undefined) {
    const wt = thresholds.waterTemp;
    const wtF = waterTempF;
    if (wtF < wt.cold) {
      warnings.push(pick([
        `Water is ${wtF.toFixed(0)}°F today — eat beforehand, warm up well, and keep your swim short`,
        `At ${wtF.toFixed(0)}°F, cold water safety matters — fuel up, know your exit time, and don't push past it`,
        `${wtF.toFixed(0)}°F water calls for extra preparation — a solid meal beforehand and a shorter swim than usual`,
        `Cold water today (${wtF.toFixed(0)}°F) — warm up beforehand and set a time limit before you get in`,
      ]));
    } else if (wtF < wt.cool) {
      recommendations.push(pick([
        `Water is ${wtF.toFixed(0)}°F — a warm drink and some food beforehand will help`,
        `At ${wtF.toFixed(0)}°F, the water is on the cooler side — fuel up and keep an eye on your time in`,
        `${wtF.toFixed(0)}°F today — pre-warming and knowing your exit time are good practice`,
      ]));
    }
  }

  // Wind advisories
  if (factors.weather.windCondition === 'strong') {
    warnings.push(pick([
      "Strong wind today — expect whitecaps and a harder swim, especially on the return",
      "Wind speeds are high — conditions will be more physically demanding than usual",
      "Windy conditions mean rougher water — recommended for experienced swimmers only",
      "Gusty winds are creating choppy water — factor in the extra effort needed",
    ]));
  } else if (factors.weather.windCondition === 'moderate') {
    recommendations.push(pick([
      "Moderate wind today adds some chop to the water — nothing that should change your plans",
      "There's a decent breeze, which may add some chop on the return leg",
      "Wind is noticeable but manageable — expect a bit of chop on the way back",
      "Some chop from the wind today — normal conditions for the bay",
    ]));
  } else if (factors.weather.windCondition === 'light') {
    recommendations.push(pick([
      "Light wind and clean conditions today — a good day to swim",
      "Winds are calm, so the water should be settled",
      "Conditions are calm and settled today — easy swimming",
      "Minimal wind and chop expected today",
    ]));
  }

  // Overall advice
  if (overallScore >= 80) {
    recommendations.push(pick([
      "Conditions are excellent across the board today — a great day to swim",
      "Everything is lining up well today — water quality, tide, and waves are all favorable",
      "This is one of the better days to get in — conditions are strong",
      "Strong conditions today — a good one to plan a swim around",
    ]));
  } else if (overallScore >= 60) {
    recommendations.push(pick([
      "Conditions are solid today — nothing significant standing in the way",
      "A good day to swim — the main factors are all in a favorable range",
      "Overall conditions look good — a comfortable day to get in",
      "Good conditions today — enjoyable with a bit of the bay's usual character",
    ]));
  } else if (overallScore >= 40) {
    recommendations.push(pick([
      "Conditions are fair today — swimmable, but a few factors are worth keeping in mind",
      "Not the best day, but manageable for experienced swimmers",
      "A mixed bag today — check the details above before deciding",
      "Swimmable conditions, though you should go in aware of what's listed above",
    ]));
  } else if (overallScore >= 20) {
    warnings.push(pick([
      "Conditions are working against you today — factor that in before deciding to swim",
      "Multiple factors are working against a comfortable swim today",
      "This is a challenging day — weigh the listed factors carefully before deciding",
      "Conditions are difficult today — many swimmers will choose to skip it",
    ]));
  } else {
    warnings.push(pick([
      "Conditions are dangerous today — swimming is not recommended",
      "This is not a safe day to swim — best to wait for conditions to improve",
      "Multiple safety thresholds are exceeded today — recommend staying out of the water",
      "Do not swim today — conditions pose a genuine safety risk",
    ]));
  }

  return { recommendations, warnings };
}
