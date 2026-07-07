import { describe, it, expect } from 'vitest';
import { calculateSunriseSunset } from './sunrise-sunset';

// San Francisco / Aquatic Park coordinates
const SF_LAT = 37.8065;
const SF_LON = -122.4216;

describe('calculateSunriseSunset', () => {
  it('returns sunrise before sunset, both on the given UTC day', () => {
    const date = new Date('2026-07-07T18:00:00Z'); // ~11am PDT
    const result = calculateSunriseSunset(date, SF_LAT, SF_LON);

    expect(result.sunrise).toBeInstanceOf(Date);
    expect(result.sunset).toBeInstanceOf(Date);
    expect(result.sunrise!.getTime()).toBeLessThan(result.sunset!.getTime());
    expect(result.daylightHours).toBeGreaterThan(0);
    expect(result.daylightHours).toBeLessThan(24);
  });

  it('reports isDaytime consistently with the sunrise/sunset window', () => {
    const midday = new Date('2026-07-07T20:00:00Z'); // 1pm PDT
    const midnight = new Date('2026-07-07T09:00:00Z'); // 2am PDT
    expect(calculateSunriseSunset(midday, SF_LAT, SF_LON).isDaytime).toBe(true);
    expect(calculateSunriseSunset(midnight, SF_LAT, SF_LON).isDaytime).toBe(false);
  });

  it('gives longer days in summer than winter at northern latitudes', () => {
    const summerSolstice = calculateSunriseSunset(new Date('2026-06-21T12:00:00Z'), SF_LAT, SF_LON);
    const winterSolstice = calculateSunriseSunset(new Date('2026-12-21T12:00:00Z'), SF_LAT, SF_LON);
    expect(summerSolstice.daylightHours).toBeGreaterThan(winterSolstice.daylightHours);
  });

  it('gives roughly equal day/night around the equinox', () => {
    const equinox = calculateSunriseSunset(new Date('2026-03-20T12:00:00Z'), SF_LAT, SF_LON);
    expect(equinox.daylightHours).toBeGreaterThan(11.5);
    expect(equinox.daylightHours).toBeLessThan(12.5);
  });

  it('marks the source as calculated (no API dependency)', () => {
    const result = calculateSunriseSunset(new Date('2026-07-07T18:00:00Z'), SF_LAT, SF_LON);
    expect(result.source).toBe('calculated');
  });
});
