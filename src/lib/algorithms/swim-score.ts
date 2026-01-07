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
  SwimScore,
  SwimScoreFactors,
  TidePhasePreferences,
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
  customTidePreferences?: TidePhasePreferences
): SwimScore {
  // Calculate individual factor scores
  const waterQualityFactor = scoreWaterQuality(waterQuality, recentSSOs);
  const tideCurrentFactor = scoreTideAndCurrent(tide, current, customTidePreferences);
  const waveFactor = scoreWaves(waves);
  const weatherFactor = scoreWeather(weather);
  const visibilityFactor = scoreVisibility(weather.visibilityMiles);

  // Calculate weighted overall score
  const overallScore = Math.round(
    (waterQualityFactor.score * SCORE_WEIGHTS.waterQuality +
      tideCurrentFactor.score * SCORE_WEIGHTS.tideAndCurrent +
      waveFactor.score * SCORE_WEIGHTS.waves +
      weatherFactor.score * SCORE_WEIGHTS.weather +
      visibilityFactor.score * SCORE_WEIGHTS.visibility) /
      100
  );

  // Determine rating
  const rating = getScoreRating(overallScore);

  // Aggregate all factors
  const factors: SwimScoreFactors = {
    waterQuality: waterQualityFactor,
    tideAndCurrent: tideCurrentFactor,
    waves: waveFactor,
    weather: weatherFactor,
    visibility: visibilityFactor,
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
  recentSSOs: SSOEvent[]
): SwimScoreFactors['waterQuality'] {
  let score = 100;
  const issues: string[] = [];
  let bacteriaLevel = 'unknown';
  let status: 'safe' | 'advisory' | 'warning' | 'dangerous' = 'safe';

  // Check enterococcus levels
  if (waterQuality.enterococcusCount !== undefined) {
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

  // Check for recent SSOs
  const activeSSOs = recentSSOs.filter(sso => !sso.resolved);
  const recentSSO = recentSSOs.find(sso => {
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
 * Score tide and current conditions (25% weight)
 */
function scoreTideAndCurrent(
  tide: TidePrediction,
  current: CurrentData | null,
  customTidePreferences?: TidePhasePreferences
): SwimScoreFactors['tideAndCurrent'] {
  let score = 100;
  const issues: string[] = [];
  const phase = tide.currentPhase;
  const currentSpeed = current?.speedKnots || 0;

  // Score based on tide phase using custom or default preferences
  const preferences = customTidePreferences || SAFETY_THRESHOLDS.tide.phasePreference;
  const basePhaseScore = preferences[phase];

  // Adjust score based on actual tide change rate
  if (Math.abs(tide.changeRateFeetPerHour) < SAFETY_THRESHOLDS.tide.lowCurrent) {
    // Low current - use full phase preference score
    score = basePhaseScore;
  } else if (Math.abs(tide.changeRateFeetPerHour) < SAFETY_THRESHOLDS.tide.moderateCurrent) {
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

  const favorable = phase === 'slack' || currentSpeed < SAFETY_THRESHOLDS.current.slow;

  return {
    score,
    phase,
    currentSpeed,
    tideHeight: tide.heightFeet,
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
  const height = waves.waveHeightFeet;

  if (height < SAFETY_THRESHOLDS.waves.calm) {
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
 * Score weather conditions (15% weight)
 */
function scoreWeather(weather: WeatherData): SwimScoreFactors['weather'] {
  let score = 100;
  const issues: string[] = [];
  let windCondition: 'calm' | 'light' | 'moderate' | 'strong' = 'calm';
  const windSpeed = weather.windSpeedMph;

  // Score wind
  if (windSpeed < SAFETY_THRESHOLDS.wind.calm) {
    windCondition = 'calm';
  } else if (windSpeed < SAFETY_THRESHOLDS.wind.light) {
    score = 95;
    windCondition = 'light';
  } else if (windSpeed < SAFETY_THRESHOLDS.wind.moderate) {
    score = 80;
    windCondition = 'moderate';
  } else if (windSpeed < SAFETY_THRESHOLDS.wind.strong) {
    score = 60;
    windCondition = 'moderate';
    issues.push(`Moderate winds (${windSpeed.toFixed(0)} mph)`);
  } else if (windSpeed < SAFETY_THRESHOLDS.wind.veryStrong) {
    score = 35;
    windCondition = 'strong';
    issues.push(`Strong winds (${windSpeed.toFixed(0)} mph)`);
  } else {
    score = 15;
    windCondition = 'strong';
    issues.push(`Very strong winds (${windSpeed.toFixed(0)} mph)`);
  }

  // Check for precipitation
  if (weather.conditions.includes('rain') || weather.conditions.includes('storm')) {
    score = Math.min(score, 40);
    issues.push('Precipitation present');
  }

  return {
    score,
    temperature: weather.temperatureF,
    windSpeed,
    windCondition,
    issues,
  };
}

/**
 * Score visibility (10% weight)
 */
function scoreVisibility(visibilityMiles: number): SwimScoreFactors['visibility'] {
  let score = 100;
  const issues: string[] = [];
  let status: 'poor' | 'moderate' | 'good' | 'excellent' = 'excellent';

  if (visibilityMiles < SAFETY_THRESHOLDS.visibility.poor) {
    score = 30;
    status = 'poor';
    issues.push(`Poor visibility (${visibilityMiles.toFixed(1)} mi)`);
  } else if (visibilityMiles < SAFETY_THRESHOLDS.visibility.moderate) {
    score = 60;
    status = 'moderate';
    issues.push(`Moderate visibility (${visibilityMiles.toFixed(1)} mi)`);
  } else if (visibilityMiles < SAFETY_THRESHOLDS.visibility.good) {
    score = 85;
    status = 'good';
  } else {
    score = 100;
    status = 'excellent';
  }

  return {
    score,
    miles: visibilityMiles,
    status,
    issues,
  };
}

/**
 * Determine rating from score
 */
function getScoreRating(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'dangerous' {
  if (score >= SCORE_RANGES.excellent.min) return 'excellent';
  if (score >= SCORE_RANGES.good.min) return 'good';
  if (score >= SCORE_RANGES.fair.min) return 'fair';
  if (score >= SCORE_RANGES.poor.min) return 'poor';
  return 'dangerous';
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
    warnings.push('Do not swim - dangerous water quality');
  } else if (factors.waterQuality.status === 'warning') {
    warnings.push('Water quality warning in effect');
  } else if (factors.waterQuality.recentSSO) {
    warnings.push('Recent sewer overflow - use caution');
  }

  // Tide/current recommendations
  if (factors.tideAndCurrent.phase === 'slack') {
    recommendations.push('Excellent time - slack tide');
  } else if (factors.tideAndCurrent.currentSpeed > 1.0) {
    warnings.push('Strong currents - experienced swimmers only');
  }

  // Wave warnings
  if (factors.waves.status === 'dangerous') {
    warnings.push('Dangerous wave conditions');
  } else if (factors.waves.status === 'rough') {
    warnings.push('Rough seas - not recommended');
  } else if (factors.waves.heightFeet < 2) {
    recommendations.push('Calm water conditions');
  }

  // Weather advisories
  if (factors.weather.windCondition === 'strong') {
    warnings.push('Strong winds present');
  }

  if (factors.visibility.status === 'poor') {
    warnings.push('Poor visibility - stay close to shore');
  }

  // Overall advice
  if (overallScore >= 80) {
    recommendations.push('Excellent conditions for swimming');
  } else if (overallScore >= 60) {
    recommendations.push('Good conditions for swimming');
  } else if (overallScore >= 40) {
    recommendations.push('Fair conditions - experienced swimmers recommended');
  } else if (overallScore >= 20) {
    warnings.push('Poor conditions - not recommended');
  } else {
    warnings.push('Dangerous conditions - do not swim');
  }

  return { recommendations, warnings };
}
