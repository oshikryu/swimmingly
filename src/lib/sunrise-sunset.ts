import type { SunriseSunsetData } from '@/types/conditions';

// NOAA Solar Calculator algorithm (https://gml.noaa.gov/grad/solcalc/solareqns.PDF) —
// same "pure math, no API needed" approach as moon-phase.ts. Accurate to within ~1 minute.

function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function rad2deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function dateToJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Returns the UTC minutes-since-midnight for sunrise and sunset at the given
 * lat/lon on the UTC calendar day containing `date`, plus derived daylight info.
 */
export function calculateSunriseSunset(date: Date, lat: number, lon: number): SunriseSunsetData {
  const jd = dateToJulianDay(date);
  const T = (jd - 2451545) / 36525; // Julian century

  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const Mrad = deg2rad(M);
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(deg2rad(omega));

  const e0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliqCorr = e0 + 0.00256 * Math.cos(deg2rad(omega));

  const declRad = Math.asin(Math.sin(deg2rad(obliqCorr)) * Math.sin(deg2rad(appLong)));

  const y = Math.pow(Math.tan(deg2rad(obliqCorr) / 2), 2);
  const eqTimeMin =
    4 *
    rad2deg(
      y * Math.sin(2 * deg2rad(L0)) -
        2 * e * Math.sin(Mrad) +
        4 * e * y * Math.sin(Mrad) * Math.cos(2 * deg2rad(L0)) -
        0.5 * y * y * Math.sin(4 * deg2rad(L0)) -
        1.25 * e * e * Math.sin(2 * Mrad)
    );

  const latRad = deg2rad(lat);
  // 90.833° accounts for atmospheric refraction (34') plus the solar disk's radius (16')
  const haCos =
    Math.cos(deg2rad(90.833)) / (Math.cos(latRad) * Math.cos(declRad)) - Math.tan(latRad) * Math.tan(declRad);

  // Polar day/night: sun never sets or never rises — no valid hour angle
  if (haCos < -1 || haCos > 1) {
    const isDaytime = haCos < -1; // < -1: sun always above horizon
    return {
      sunrise: undefined,
      sunset: undefined,
      daylightHours: isDaytime ? 24 : 0,
      isDaytime,
      source: 'calculated',
    };
  }

  const haSunriseDeg = rad2deg(Math.acos(haCos));

  const solarNoonMin = 720 - 4 * lon - eqTimeMin;
  const sunriseMin = solarNoonMin - 4 * haSunriseDeg;
  const sunsetMin = solarNoonMin + 4 * haSunriseDeg;

  const dayStartMs = Math.floor(date.getTime() / 86400000) * 86400000;
  const sunrise = new Date(dayStartMs + sunriseMin * 60000);
  const sunset = new Date(dayStartMs + sunsetMin * 60000);
  const daylightHours = (sunsetMin - sunriseMin) / 60;
  const isDaytime = date >= sunrise && date <= sunset;

  return {
    sunrise,
    sunset,
    daylightHours,
    isDaytime,
    source: 'calculated',
  };
}
