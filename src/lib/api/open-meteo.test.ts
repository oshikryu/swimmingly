import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWindData, fetchRecentRainfall } from './open-meteo';

function mockFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(responseBody),
  });
}

beforeEach(() => {
  vi.stubGlobal('AbortSignal', { timeout: vi.fn().mockReturnValue(undefined) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Open-Meteo timezone-naive timestamp parsing', () => {
  it('fetchWindData parses a PDT (summer) local time as the correct UTC instant regardless of host timezone', async () => {
    // Open-Meteo returns local wall-clock strings with no offset when timezone=America/Los_Angeles.
    const fetchMock = mockFetch({
      current: {
        time: '2026-07-04T07:30',
        wind_speed_10m: 9.7,
        wind_direction_10m: 255,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWindData();

    // 2026-07-04T07:30 PDT (UTC-7) === 2026-07-04T14:30:00.000Z
    expect(result?.timestamp.toISOString()).toBe('2026-07-04T14:30:00.000Z');
  });

  it('fetchWindData parses a PST (winter) local time with the correct DST-aware offset', async () => {
    const fetchMock = mockFetch({
      current: {
        time: '2026-01-04T07:30',
        wind_speed_10m: 5,
        wind_direction_10m: 180,
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWindData();

    // 2026-01-04T07:30 PST (UTC-8) === 2026-01-04T15:30:00.000Z
    expect(result?.timestamp.toISOString()).toBe('2026-01-04T15:30:00.000Z');
  });

  it('fetchRecentRainfall computes hoursAgo windows using the correctly-zoned instant', async () => {
    vi.useFakeTimers();
    // "Now" is 2026-07-04T14:37:00Z
    vi.setSystemTime(new Date('2026-07-04T14:37:00.000Z'));

    const fetchMock = mockFetch({
      hourly: {
        // Local (naive) PDT time exactly 24 hours before "now" (14:37 - 7h offset - 24h)
        time: ['2026-07-03T07:37'],
        precipitation: [10], // 10mm
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRecentRainfall();

    // If parsed correctly as PDT, this hour is ~24h ago and should land inside all three windows.
    expect(result?.last24hInches).toBeCloseTo(0.39, 2);
    expect(result?.last48hInches).toBeCloseTo(0.39, 2);
    expect(result?.last72hInches).toBeCloseTo(0.39, 2);

    vi.useRealTimers();
  });
});
