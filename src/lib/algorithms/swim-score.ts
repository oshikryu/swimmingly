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
  } else if (effectiveWind < thresholds.wind.calm) {
    windCondition = 'calm';
  } else if (effectiveWind < thresholds.wind.light) {
    score = 95;
    windCondition = 'light';
  } else if (effectiveWind < thresholds.wind.moderate) {
    score = 82;
    windCondition = 'moderate';
  } else if (effectiveWind < thresholds.wind.strong) {
    score = 62;
    windCondition = 'moderate';
    issues.push(`Moderate winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  } else if (effectiveWind < thresholds.wind.veryStrong) {
    score = 35;
    windCondition = 'strong';
    issues.push(`Strong winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  } else {
    score = 15;
    windCondition = 'strong';
    issues.push(`Very strong winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
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
      "Bacteria numbers are ugly right now — hard pass",
      "The water's got something in it today — not worth it",
      "Water quality alone makes this a no-go",
      "Not today. Come back when the bay cleans itself up",
    ]));
  } else if (factors.waterQuality.status === 'warning') {
    warnings.push(pick([
      "Water quality is elevated — know the risk before you get in",
      "Bacteria are up — you've swum worse, but eyes open",
      "Sketchy water right now — your call",
      "Not the cleanest day — factor it into your decision",
    ]));
  } else if (factors.waterQuality.recentSSO) {
    warnings.push(pick([
      "Overflow event nearby recently — the bay's still processing it",
      "Recent SSO in the area — bacteria could still be running",
      "Sewage spill close by — worth knowing before you commit",
    ]));
  }

  // Tide/current recommendations
  if (factors.tideAndCurrent.phase === 'slack') {
    recommendations.push(pick([
      'Slack tide — this is the window',
      "Water's barely moving — get in there",
      "Tide's at slack — it doesn't get easier than this",
      'Slack water right now — best current of the day',
    ]));
  } else if (factors.tideAndCurrent.currentSpeed > 1.0) {
    warnings.push(pick([
      "Current's running hard — you'll earn every stroke today",
      'The bay is hauling — know your exit before you commit',
      'Strong current today — go in with a plan',
      "It's moving out there — respect it and pick your line",
    ]));
  }

  // Wave warnings
  if (factors.waves.status === 'dangerous') {
    warnings.push(pick([
      "Cove's blown out — even the regulars are watching from shore",
      "Swell has made it inside — this is a genuine no-go",
      "The pier's not doing its job today — stay dry",
      "Wave conditions are at the limit — come back tomorrow",
    ]));
  } else if (factors.waves.status === 'rough') {
    warnings.push(pick([
      "It's lumpy in the cove — fun if you like a fight",
      "The cove's got some character today — you've been warned",
      "Rough chop today — committed swimmers will manage",
      "Swell's up inside — not technical, just tiring",
    ]));
  } else if (factors.waves.heightFeet < thresholds.waves.safe) {
    recommendations.push(pick([
      'Glassy in the cove — days like this are why you do this',
      "Flat and clean — get in before it changes",
      "The cove's reading like a pool right now",
      'Barely a ripple — as good as it gets',
    ]));
  }

  // Rainfall-related warnings
  const rainfallIssue = factors.waterQuality.issues.find(i => i.includes('rainfall'));
  if (rainfallIssue) {
    if (rainfallIssue.includes('dangerous') || rainfallIssue.includes('Heavy')) {
      warnings.push(pick([
        "Hard rain recently — the city's been draining into the bay, give it a few days",
        "Storm runoff is still working through the system — wait it out",
        "The bay's flushing the streets right now — come back in 72 hours",
        "Major runoff event — bacteria are spiked, not worth it today",
      ]));
    } else if (rainfallIssue.includes('Significant')) {
      warnings.push(pick([
        "Recent rain means the water's carrying more than usual",
        "Runoff from that rain is still a factor — worth knowing",
        "Rain runoff is elevating bacteria — conditions may be worse than they look",
      ]));
    }
  }

  // Water temperature advisories
  if (waterTempF !== undefined) {
    const wt = thresholds.waterTemp;
    const wtF = waterTempF;
    if (wtF < wt.cold) {
      warnings.push(pick([
        `${wtF.toFixed(0)}°F — fuel up, pre-warm, and keep it short`,
        `Bay's at ${wtF.toFixed(0)}°F — load calories, get in hard, get out fast`,
        `${wtF.toFixed(0)}°F water today — eat something first and have a plan for your time in`,
        `Cold bay (${wtF.toFixed(0)}°F) — pre-warm well and don't overstay your welcome`,
      ]));
    } else if (wtF < wt.cool) {
      recommendations.push(pick([
        `${wtF.toFixed(0)}°F today — a hot drink and food before you go in makes a difference`,
        `Cold water (${wtF.toFixed(0)}°F) — fuel up and keep an eye on your time`,
        `Bay's at ${wtF.toFixed(0)}°F — pre-warm and go knowing when you'll get out`,
      ]));
    }
  }

  // Wind advisories
  if (factors.weather.windCondition === 'strong') {
    warnings.push(pick([
      "It's howling out there — expect whitecaps and a proper fight",
      "Wind is cranking — you'll be working the whole way back",
      "The bay's running angry today — you'll earn this one",
      "Gusty and choppy — go in knowing it's going to cost you",
    ]));
  } else if (factors.weather.windCondition === 'moderate') {
    recommendations.push(pick([
      "Bay's got some texture today — factor in the chop on the return",
      "Decent breeze up — nothing that changes the plan",
      "Wind's making its presence felt — adds some work but that's the bay",
      "A bit of chop today — the kind that keeps things honest",
    ]));
  } else if (factors.weather.windCondition === 'light') {
    recommendations.push(pick([
      'Light breeze, clean conditions — get out there',
      "Barely any wind — the bay's behaving itself",
      'Nice and settled today — good water',
      'Light chop at most — easy day',
    ]));
  }

  // Overall advice
  if (overallScore >= 80) {
    recommendations.push(pick([
      'Go. Conditions like this are what you show up for',
      "The bay's putting on a show today — don't miss it",
      'Everything lined up — this is as good as it gets',
      'Text your swim buddies — this one is worth it',
      "As good as it gets out there right now",
    ]));
  } else if (overallScore >= 60) {
    recommendations.push(pick([
      'Solid conditions — nothing to think twice about',
      'Good day for it — just go',
      "Bay's cooperating — get in",
      'Clean enough to enjoy, interesting enough to keep you honest',
    ]));
  } else if (overallScore >= 40) {
    recommendations.push(pick([
      "The bay's got some attitude today — you can handle it",
      "Not the prettiest day, but it's swimmable",
      'A few things to work around — nothing that should stop you',
      "Worth it if you go in knowing what's out there",
    ]));
  } else if (overallScore >= 20) {
    warnings.push(pick([
      "The bay's not playing nice today — factor that into your decision",
      'Conditions are stacked against you right now',
      "This one will cost you — make sure you want to pay it",
      "Tough day out there — most would skip, some won't",
    ]));
  } else {
    warnings.push(pick([
      'This is a stay-on-shore day — no debate',
      'The bay wins today — come back tomorrow',
      'Conditions are genuinely dangerous — not worth it',
      'Hard no. Come back when it calms down',
    ]));
  }

  return { recommendations, warnings };
}
