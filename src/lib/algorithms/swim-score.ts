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
  SSOEvent,
  RainfallData,
  SwimScore,
  SwimScoreFactors,
  TidePhasePreferences,
  ScoreWeights,
  MoonPhaseData,
} from '@/types/conditions';
import { SAFETY_THRESHOLDS, SCORE_WEIGHTS, SCORE_RANGES } from '@/config/thresholds';

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
  customTidePreferences?: TidePhasePreferences,
  customWeights?: ScoreWeights,
  rainfall?: RainfallData | null,
  moonPhase?: MoonPhaseData | null
): SwimScore {
  // Calculate individual factor scores
  const waterQualityFactor = scoreWaterQuality(waterQuality, recentSSOs, rainfall);
  const tideCurrentFactor = scoreTideAndCurrent(tide, current, customTidePreferences, moonPhase);
  const waveFactor = scoreWaves(waves);
  const weatherFactor = scoreWeather(weather, waves?.barometricPressureMb);

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

  // Very strong current (>2.0 knots) caps score at 39 (Poor)
  if (currentSpeed >= SAFETY_THRESHOLDS.current.veryStrong) {
    overallScore = Math.min(overallScore, 39);
  }
  // Strong current (>1.5 knots) caps score at 59 (Fair)
  else if (currentSpeed >= SAFETY_THRESHOLDS.current.strong) {
    overallScore = Math.min(overallScore, 59);
  }

  // Dangerous water quality caps score
  if (waterQualityFactor.status === 'dangerous') {
    overallScore = Math.min(overallScore, 19);
  } else if (waterQualityFactor.status === 'warning') {
    overallScore = Math.min(overallScore, 39);
  }

  // Dangerous waves cap score
  if (waveFactor.status === 'dangerous') {
    overallScore = Math.min(overallScore, 19);
  } else if (waveFactor.status === 'rough') {
    overallScore = Math.min(overallScore, 39);
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
  const { recommendations, warnings } = generateAdvice(factors, overallScore);

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
 * Score water quality (30% weight - highest priority)
 */
function scoreWaterQuality(
  waterQuality: WaterQuality,
  recentSSOs: SSOEvent[],
  rainfall?: RainfallData | null
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
    const thresholds = SAFETY_THRESHOLDS.waterQuality.enterococcus;

    if (count > thresholds.dangerous) {
      score = 0;
      bacteriaLevel = 'dangerous';
      status = 'dangerous';
      issues.push(`Dangerous bacteria levels (${count} MPN/100ml)`);
    } else if (count > thresholds.advisory) {
      score = 30;
      bacteriaLevel = 'high';
      status = 'warning';
      issues.push(`High bacteria levels (${count} MPN/100ml)`);
    } else if (count > thresholds.safe) {
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
    return daysSince < SAFETY_THRESHOLDS.sso.cautionDays;
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
    const thresholds = SAFETY_THRESHOLDS.rainfall;

    if (rain72h >= thresholds.extreme) {
      score = Math.min(score, 15);
      issues.push(`Heavy rainfall (${rain72h.toFixed(1)}" in 72h) — expect dangerous runoff`);
    } else if (rain72h >= thresholds.heavy) {
      score = Math.min(score, 35);
      issues.push(`Significant rainfall (${rain72h.toFixed(1)}" in 72h) — elevated bacteria likely`);
    } else if (rain72h >= thresholds.moderate) {
      score = Math.min(score, 60);
      issues.push(`Moderate rainfall (${rain72h.toFixed(1)}" in 72h) — bacteria levels may be elevated`);
    }
    // light rainfall (<0.1") — no penalty
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
 * Score tide and current conditions (27% weight)
 */
function scoreTideAndCurrent(
  tide: TidePrediction,
  current: CurrentData | null,
  customTidePreferences?: TidePhasePreferences,
  moonPhase?: MoonPhaseData | null
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
    // Score based on tide phase using custom or default preferences
    const preferences = customTidePreferences || SAFETY_THRESHOLDS.tide.phasePreference;
    const basePhaseScore = preferences[phase];

    // Adjust score based on actual tide change rate
    if (Math.abs(changeRate) < SAFETY_THRESHOLDS.tide.lowCurrent) {
      // Low current - use full phase preference score
      score = basePhaseScore;
    } else if (Math.abs(changeRate) < SAFETY_THRESHOLDS.tide.moderateCurrent) {
      // Moderate current - reduce score
      score = Math.min(basePhaseScore * 0.7, 70);
      issues.push(`Moderate tide movement (${phase})`);
    } else {
      // Strong current - significantly reduce score
      score = Math.min(basePhaseScore * 0.4, 40);
      issues.push(`Strong tide movement (${phase})`);
    }

    // Factor in current speed
    if (currentSpeed > SAFETY_THRESHOLDS.current.veryStrong) {
      score = Math.min(score, 20);
      issues.push(`Very strong current (${currentSpeed.toFixed(1)} knots)`);
    } else if (currentSpeed > SAFETY_THRESHOLDS.current.strong) {
      score = Math.min(score, 40);
      issues.push(`Strong current (${currentSpeed.toFixed(1)} knots)`);
    } else if (currentSpeed > SAFETY_THRESHOLDS.current.moderate) {
      score = Math.min(score, 65);
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

  const favorable = phase === 'slack' || currentSpeed < SAFETY_THRESHOLDS.current.slow;

  return {
    score,
    phase,
    currentSpeed,
    tideHeight,
    favorable,
    issues,
  };
}

/**
 * Score wave conditions (20% weight)
 */
function scoreWaves(waves: WaveData): SwimScoreFactors['waves'] {
  let score = 100;
  const issues: string[] = [];
  let status: 'calm' | 'moderate' | 'rough' | 'dangerous' = 'calm';
  const height = waves?.waveHeightFeet ?? 0;

  // Handle null/undefined wave data
  if (height === 0 && !waves?.waveHeightFeet) {
    score = 50;
    status = 'moderate';
    issues.push('No wave data available');
  } else if (height < SAFETY_THRESHOLDS.waves.calm) {
    score = 100;
    status = 'calm';
  } else if (height < SAFETY_THRESHOLDS.waves.safe) {
    score = 85;
    status = 'calm';
  } else if (height < SAFETY_THRESHOLDS.waves.moderate) {
    score = 60;
    status = 'moderate';
    issues.push(`Moderate waves (${height.toFixed(1)} ft)`);
  } else if (height < SAFETY_THRESHOLDS.waves.rough) {
    score = 30;
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
 * Score weather conditions (23% weight)
 */
function scoreWeather(weather: WeatherData, barometricPressureMb?: number): SwimScoreFactors['weather'] {
  let score = 100;
  const issues: string[] = [];
  let windCondition: 'calm' | 'light' | 'moderate' | 'strong' = 'calm';
  const windSpeed = weather?.windSpeedMph ?? 0;
  const windGust = weather?.windGustMph ?? 0;
  const temperature = weather?.temperatureF ?? 0;

  // Use effective wind: blend sustained speed with gusts (70/30 weighting)
  // This accounts for gusts making conditions worse than sustained speed alone
  const effectiveWind = windGust > windSpeed
    ? windSpeed * 0.7 + windGust * 0.3
    : windSpeed;

  // Handle missing wind data (check source rather than value, since 0 mph is a valid reading)
  if (!weather || weather.source === 'unavailable') {
    score = 50;
    windCondition = 'moderate';
    issues.push('No wind data available');
  } else if (effectiveWind < SAFETY_THRESHOLDS.wind.calm) {
    windCondition = 'calm';
  } else if (effectiveWind < SAFETY_THRESHOLDS.wind.light) {
    score = 95;
    windCondition = 'light';
  } else if (effectiveWind < SAFETY_THRESHOLDS.wind.moderate) {
    score = 80;
    windCondition = 'moderate';
  } else if (effectiveWind < SAFETY_THRESHOLDS.wind.strong) {
    score = 60;
    windCondition = 'moderate';
    issues.push(`Moderate winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  } else if (effectiveWind < SAFETY_THRESHOLDS.wind.veryStrong) {
    score = 35;
    windCondition = 'strong';
    issues.push(`Strong winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  } else {
    score = 15;
    windCondition = 'strong';
    issues.push(`Very strong winds (${windSpeed.toFixed(0)} mph, gusts ${windGust.toFixed(0)} mph)`);
  }

  // Check for precipitation
  if (weather?.conditions?.includes('rain') || weather?.conditions?.includes('storm')) {
    score = Math.min(score, 40);
    issues.push('Precipitation present');
  }

  // Barometric pressure modifier
  if (barometricPressureMb !== undefined) {
    const thresholds = SAFETY_THRESHOLDS.barometricPressure;
    let pressureAdjustment = 0;

    if (barometricPressureMb >= thresholds.veryHigh) {
      pressureAdjustment = 8;
    } else if (barometricPressureMb >= thresholds.high) {
      pressureAdjustment = 5;
    } else if (barometricPressureMb >= thresholds.standard) {
      pressureAdjustment = 0; // neutral
    } else if (barometricPressureMb >= thresholds.low) {
      pressureAdjustment = -5;
      issues.push(`Low pressure (${barometricPressureMb.toFixed(0)} mb) — possible deteriorating conditions`);
    } else if (barometricPressureMb >= thresholds.veryLow) {
      pressureAdjustment = -10;
      issues.push(`Very low pressure (${barometricPressureMb.toFixed(0)} mb) — storm risk`);
    } else {
      pressureAdjustment = -15;
      issues.push(`Storm pressure (${barometricPressureMb.toFixed(0)} mb) — dangerous conditions likely`);
    }

    score = Math.max(0, Math.min(100, score + pressureAdjustment));
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
  overallScore: number
): { recommendations: string[]; warnings: string[] } {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  // Water quality warnings
  if (factors.waterQuality.status === 'dangerous') {
    warnings.push(pick([
      'Do not swim — water quality is dangerous right now',
      'Stay out of the water — bacteria levels are off the charts',
      'Water quality is unsafe — hold off until conditions improve',
      'Dangerous bacteria levels detected — skip the swim today',
    ]));
  } else if (factors.waterQuality.status === 'warning') {
    warnings.push(pick([
      'Water quality warning in effect — swim at your own risk',
      'Elevated bacteria levels — consider waiting for a cleaner day',
      'Water quality is questionable — not ideal for swimming',
      'Advisory-level bacteria — experienced swimmers only',
    ]));
  } else if (factors.waterQuality.recentSSO) {
    warnings.push(pick([
      'Recent sewer overflow nearby — use caution',
      'SSO event reported recently — bacteria may still be elevated',
      'Sewer overflow in the last few days — keep an eye on conditions',
    ]));
  }

  // Tide/current recommendations
  if (factors.tideAndCurrent.phase === 'slack') {
    recommendations.push(pick([
      'Slack tide — the bay is as mellow as it gets',
      'Perfect timing — slack tide means minimal current',
      'Slack water right now — ideal window for a relaxed swim',
      'The tide is taking a breather — great time to get in',
    ]));
  } else if (factors.tideAndCurrent.currentSpeed > 1.0) {
    warnings.push(pick([
      'Strong currents — experienced swimmers only',
      'The bay is moving fast — know your limits out there',
      'Significant current today — stay close to shore if unsure',
      'Current is running hard — not a day for casual swimming',
    ]));
  }

  // Wave warnings
  if (factors.waves.status === 'dangerous') {
    warnings.push(pick([
      'Dangerous wave conditions — stay out of the water',
      'Waves are too rough to swim safely today',
      'The cove is churned up — dangerous conditions',
      'Big swell inside the cove — do not swim',
    ]));
  } else if (factors.waves.status === 'rough') {
    warnings.push(pick([
      'Rough seas — not recommended for most swimmers',
      "It's choppy out there — not a great day for a casual swim",
      'Swell is up — only for strong, experienced swimmers',
      'Rough chop in the cove — save it for a calmer day',
    ]));
  } else if (factors.waves.heightFeet < SAFETY_THRESHOLDS.waves.safe) {
    recommendations.push(pick([
      'Glassy water — the cove is looking beautiful',
      'Barely a ripple out there — great conditions',
      'The bay is flat and inviting today',
      'Calm water in the cove — enjoy the glide',
    ]));
  }

  // Rainfall-related warnings
  const rainfallIssue = factors.waterQuality.issues.find(i => i.includes('rainfall'));
  if (rainfallIssue) {
    if (rainfallIssue.includes('dangerous') || rainfallIssue.includes('Heavy')) {
      warnings.push(pick([
        'Heavy recent rainfall — avoid swimming for 72 hours',
        'Major runoff event — bacteria levels are likely spiked',
        "It rained hard recently — the bay's still flushing it out",
        'Post-storm runoff detected — wait at least 3 days before swimming',
      ]));
    } else if (rainfallIssue.includes('Significant')) {
      warnings.push(pick([
        'Recent rainfall may have degraded water quality',
        'Rain runoff can raise bacteria — keep an eye on test results',
        'Wet weather recently — water quality may be affected',
      ]));
    }
  }

  // Wind advisories
  if (factors.weather.windCondition === 'strong') {
    warnings.push(pick([
      "It's howling out there — expect whitecaps and a bumpy ride",
      'Strong winds are whipping up the bay — rough going today',
      "Wind is cranking — you'll be fighting it the whole way",
      'Gusty and choppy — seasoned bay swimmers only',
    ]));
  } else if (factors.weather.windCondition === 'moderate') {
    recommendations.push(pick([
      "Get ready for some chop — the bay's got a bit of attitude today",
      'Moderate wind means some surface chop — nothing unmanageable',
      "There's a decent breeze up — the bay will keep you on your toes",
      'A bit breezy today — factor in some chop on the return leg',
    ]));
  } else if (factors.weather.windCondition === 'light') {
    recommendations.push(pick([
      'A little breeze on the water — just enough to keep things interesting',
      'Light winds today — a pleasant day to be out on the bay',
      'Gentle breeze, nice conditions — get out there',
      'Barely any wind — smooth and easy swimming ahead',
    ]));
  }

  // Overall advice
  if (overallScore >= 80) {
    recommendations.push(pick([
      'Excellent conditions — get in there',
      "Conditions don't get much better than this",
      'Top-tier day for a swim at Aquatic Park',
      'Green light — the bay is calling',
      'Everything is lined up perfectly today',
    ]));
  } else if (overallScore >= 60) {
    recommendations.push(pick([
      'Good conditions for a swim',
      'Solid day out there — worth getting wet',
      'Nothing major to worry about — enjoy it',
      'Good enough for most swimmers — go for it',
    ]));
  } else if (overallScore >= 40) {
    recommendations.push(pick([
      'Fair conditions — experienced swimmers recommended',
      'Manageable, but know what you are getting into',
      'Not ideal, but doable for seasoned bay swimmers',
      'Some factors to watch — stay alert out there',
    ]));
  } else if (overallScore >= 20) {
    warnings.push(pick([
      'Poor conditions — not recommended today',
      'The bay is not in a good mood right now',
      'Multiple factors working against you — consider skipping it',
      'Conditions are rough — most swimmers should sit this one out',
    ]));
  } else {
    warnings.push(pick([
      'Dangerous conditions — do not swim',
      'Stay out of the water — conditions are hazardous',
      'This is a stay-on-shore day — no exceptions',
      'Do not enter the water today — serious risk',
    ]));
  }

  return { recommendations, warnings };
}
