import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWaterQualityWQPOnly } from './beachwatch';

function textResponse(body: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
  };
}

const STATION_HEADER =
  'OrganizationIdentifier,OrganizationFormalName,MonitoringLocationIdentifier,MonitoringLocationName';
const RESULT_HEADER = 'ActivityStartDate,ResultMeasureValue';

beforeEach(() => {
  vi.stubGlobal('AbortSignal', { timeout: vi.fn().mockReturnValue(undefined) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWaterQualityWQPOnly', () => {
  it('searches within the provided county code, not Aquatic Park defaults', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\n21CABCH,Org,21CABCH-713,LA JOLLA COVE UNIQUE 1`))
      .mockResolvedValueOnce(textResponse(`${RESULT_HEADER}\n2026-06-01,50`));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWaterQualityWQPOnly('LA JOLLA COVE UNIQUE 1', 32.85, -117.27, 'US:06:073');

    const calledUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('countycode')).toBe('US:06:073');
  });

  it('finds a station by exact name match and returns its most recent enterococcus result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\n21CABCH,Org,21CABCH-713,LA JOLLA COVE UNIQUE 2`))
      .mockResolvedValueOnce(textResponse(`${RESULT_HEADER}\n2026-06-01,50`));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterQualityWQPOnly('LA JOLLA COVE UNIQUE 2', 32.85, -117.27, 'US:06:073');

    expect(result?.enterococcusCount).toBe(50);
    expect(result?.source).toBe('Water Quality Portal (WQP)');
  });

  it('falls back to a coordinate radius search when no station name matches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\nOrg,Name,UNRELATED-1,Some Other Beach`))
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\nOrg,Name,COORD-MATCH-1,Nearby Station`))
      .mockResolvedValueOnce(textResponse(`${RESULT_HEADER}\n2026-06-01,75`));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterQualityWQPOnly('LA JOLLA COVE UNIQUE 3', 32.85, -117.27, 'US:06:073');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const coordCallUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(coordCallUrl.searchParams.get('lat')).toBe('32.85');
    expect(result?.enterococcusCount).toBe(75);
  });

  it('returns null when no station can be discovered by name or coordinates', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\nOrg,Name,UNRELATED-1,Some Other Beach`))
      .mockResolvedValueOnce(textResponse(STATION_HEADER)); // no data rows
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterQualityWQPOnly('LA JOLLA COVE UNIQUE 4', 32.85, -117.27, 'US:06:073');

    expect(result).toBeNull();
  });

  it('returns null when the station has no results within the lookback window', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\n21CABCH,Org,21CABCH-713,LA JOLLA COVE UNIQUE 5`))
      .mockResolvedValueOnce(textResponse(RESULT_HEADER)); // header only, no rows
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterQualityWQPOnly('LA JOLLA COVE UNIQUE 5', 32.85, -117.27, 'US:06:073');

    expect(result).toBeNull();
  });

  it('returns null (not throw) when station discovery request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse('', false));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWaterQualityWQPOnly('LA JOLLA COVE UNIQUE 6', 32.85, -117.27, 'US:06:073');

    expect(result).toBeNull();
  });

  it('caches the discovered station ID across calls for the same location name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(`${STATION_HEADER}\n21CABCH,Org,21CABCH-713,CACHE TEST BEACH UNIQUE`))
      .mockResolvedValueOnce(textResponse(`${RESULT_HEADER}\n2026-06-01,10`))
      .mockResolvedValueOnce(textResponse(`${RESULT_HEADER}\n2026-06-02,20`));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWaterQualityWQPOnly('CACHE TEST BEACH UNIQUE', 32.85, -117.27, 'US:06:073');
    await fetchWaterQualityWQPOnly('CACHE TEST BEACH UNIQUE', 32.85, -117.27, 'US:06:073');

    // 1 station-discovery call + 2 result calls = 3, not 4 (no repeated discovery)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
