import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTidePredictions, fetchCurrentTide, fetchCurrents, fetchWaveData, fetchWaterTemperature } from './noaa';

function mockFetch(responseBody: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(responseBody),
  });
}

function mockTextFetch(responseBody: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(responseBody),
  });
}

beforeEach(() => {
  vi.stubGlobal('AbortSignal', { timeout: vi.fn().mockReturnValue(undefined) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NOAA date formatting and timezone handling', () => {
  it('formatNOAADate uses UTC, not local time', async () => {
    // 2026-05-30T03:00:00Z is 2026-05-29 20:00 PDT — a date boundary difference
    const startDate = new Date('2026-05-30T03:00:00Z');
    const endDate = new Date('2026-05-30T04:00:00Z');

    const fetchMock = mockFetch({ predictions: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchTidePredictions(startDate, endDate).catch(() => {});

    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('begin_date')).toBe('20260530 03:00');
    expect(calledUrl.searchParams.get('end_date')).toBe('20260530 04:00');
  });

  it('fetchTidePredictions sends time_zone=gmt', async () => {
    const fetchMock = mockFetch({ predictions: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchTidePredictions(new Date(), new Date()).catch(() => {});

    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('time_zone')).toBe('gmt');
  });

  it('fetchCurrentTide sends time_zone=gmt', async () => {
    const fetchMock = mockFetch({ data: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCurrentTide();

    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('time_zone')).toBe('gmt');
  });

  it('fetchCurrents sends time_zone=gmt', async () => {
    const fetchMock = mockFetch({ current_predictions: { cp: [] } });
    vi.stubGlobal('fetch', fetchMock);

    await fetchCurrents();

    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('time_zone')).toBe('gmt');
  });
});

describe('NOAA timestamp parsing', () => {
  it('fetchTidePredictions parses timestamps as UTC', async () => {
    const fetchMock = mockFetch({
      predictions: [{ t: '2026-05-30 13:10', v: '4.355', type: 'H' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await fetchTidePredictions(new Date(), new Date());

    expect(results[0].timestamp.toISOString()).toBe('2026-05-30T13:10:00.000Z');
  });

  it('fetchCurrentTide parses timestamp as UTC', async () => {
    const fetchMock = mockFetch({
      data: [{ t: '2026-05-30 16:36', v: '3.2', s: '0.050', f: '0,0,0,0', q: 'p' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCurrentTide();

    expect(result?.timestamp.toISOString()).toBe('2026-05-30T16:36:00.000Z');
  });

  it('fetchCurrents parses timestamp as UTC', async () => {
    const fetchMock = mockFetch({
      current_predictions: {
        cp: [{ Time: '2026-05-30 16:00', Velocity_Major: '0.5', meanFloodDir: '90', meanEbbDir: '270' }],
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCurrents();

    expect(result?.timestamp.toISOString()).toBe('2026-05-30T16:00:00.000Z');
  });
});

describe('fetchWaveData year parsing', () => {
  const HEADER = '#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE\n#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft';

  it('parses a 4-digit year correctly (regression: NDBC feeds now send 4-digit years)', async () => {
    const row = '2026 07 03 16 26  MM   MM   MM   0.7    17   5.3 284     MM    MM  21.4    MM   MM   MM    MM';
    const fetchMock = mockTextFetch(`${HEADER}\n${row}`);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaveData('46254');

    // Before the fix, a 4-digit year "2026" was misread as 1900+2026 = year 3926
    expect(result?.timestamp.getUTCFullYear()).toBe(2026);
    expect(result?.timestamp.toISOString()).toBe('2026-07-03T16:26:00.000Z');
  });

  it('still handles a legacy 2-digit year, in case any station reverts', async () => {
    const row = '26 07 03 16 26  MM   MM   MM   0.7    17   5.3 284     MM    MM  21.4    MM   MM   MM    MM';
    const fetchMock = mockTextFetch(`${HEADER}\n${row}`);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaveData('46254');

    expect(result?.timestamp.getUTCFullYear()).toBe(2026);
  });

  it('parses wave height (meters -> feet) and swell period', async () => {
    const row = '2026 07 03 16 26  MM   MM   MM   0.7    17   5.3 284     MM    MM  21.4    MM   MM   MM    MM';
    const fetchMock = mockTextFetch(`${HEADER}\n${row}`);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaveData('46254');

    expect(result?.waveHeightFeet).toBeCloseTo(0.7 * 3.28084, 4);
    expect(result?.swellPeriodSeconds).toBe(17);
    expect(result?.source).toBe('NOAA-NDBC Buoy 46254');
  });

  it('returns null when no row has a valid wave height', async () => {
    const row = '2026 07 03 16 26  MM   MM   MM    MM    17   5.3 284     MM    MM  21.4    MM   MM   MM    MM';
    const fetchMock = mockTextFetch(`${HEADER}\n${row}`);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaveData('46254');

    expect(result).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    const fetchMock = mockTextFetch('', false);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaveData('LJPC1');

    expect(result).toBeNull();
  });
});

describe('fetchWaterTemperature', () => {
  it('parses a CO-OPS water_temperature response', async () => {
    const fetchMock = mockFetch({
      data: [{ t: '2026-07-03 17:06', v: '68.9', s: '0.0', f: '0,0,0' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterTemperature('9410230');

    expect(result?.temperatureF).toBe(68.9);
    expect(result?.timestamp.toISOString()).toBe('2026-07-03T17:06:00.000Z');
    expect(result?.source).toBe('NOAA-CO-OPS Station 9410230');
  });

  it('requests the water_temperature product for the given station', async () => {
    const fetchMock = mockFetch({ data: [{ t: '2026-07-03 17:06', v: '68.9' }] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchWaterTemperature('9410230');

    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('product')).toBe('water_temperature');
    expect(calledUrl.searchParams.get('station')).toBe('9410230');
  });

  it('returns null when the station has no data (e.g. no met sensor)', async () => {
    const fetchMock = mockFetch({ data: [] });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterTemperature('0000000');

    expect(result).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    const fetchMock = mockFetch({}, false);
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterTemperature('9410230');

    expect(result).toBeNull();
  });
});
