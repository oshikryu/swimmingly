import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTidePredictions, fetchCurrentTide, fetchCurrents } from './noaa';

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
