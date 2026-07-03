import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSanDiegoCountyWaterQuality } from './sdbeachinfo';

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    headers: { getSetCookie: () => [] },
    json: () => Promise.resolve(body),
  };
}

function samplesResponse(rows: Array<{ parameter?: string; result: string; date: string; stationId?: string; units?: string }>) {
  return jsonResponse({
    data: {
      List: {
        List: rows.map((r) => ({
          Parameter: { Label: r.parameter ?? 'Enterococcus' },
          Sample: { SampleDate: r.date, Result: r.result },
          Site: { StationID: r.stationId ?? 'FM-070' },
          Units: { Label: r.units ?? 'Copies/100ml' },
        })),
      },
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('AbortSignal', { timeout: vi.fn().mockReturnValue(undefined) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSanDiegoCountyWaterQuality', () => {
  it('never populates enterococcusCount (ddPCR units would be misread as MPN downstream)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' })) // moduleversioninfo
      .mockResolvedValueOnce(jsonResponse({})) // ApplicationLogo bootstrap
      .mockResolvedValueOnce(samplesResponse([{ result: '1601', date: '2026-06-30' }])); // GetSamples
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result?.enterococcusCount).toBeUndefined();
  });

  it('maps a result at or above the 1413 Copies/100mL threshold to "advisory", not the MPN-scale "dangerous"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(samplesResponse([{ result: '1601', date: '2026-06-30' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result?.status).toBe('advisory');
    expect(result?.notes).toContain('1601');
    expect(result?.notes).toContain('exceeds county advisory threshold');
  });

  it('maps a result below the threshold to "safe"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(samplesResponse([{ result: '496', date: '2026-06-09' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result?.status).toBe('safe');
    expect(result?.notes).not.toContain('exceeds');
  });

  it('treats a result exactly at the threshold as exceeding it (>=, not >)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(samplesResponse([{ result: '1413', date: '2026-06-30' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result?.status).toBe('advisory');
  });

  it('uses the most recent Enterococcus sample when multiple rows are returned', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        samplesResponse([
          { result: '1601', date: '2026-06-30' },
          { result: '1867', date: '2026-06-24' },
        ])
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result?.notes).toContain('1601');
    expect(result?.timestamp.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('returns null (not throw) when session bootstrap fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, false)); // moduleversioninfo fails
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result).toBeNull();
  });

  it('returns null when the CSRF-gated bootstrap call fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}, false)); // ApplicationLogo fails
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result).toBeNull();
  });

  it('returns null when there are no samples for the site', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(samplesResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when fetch itself rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result).toBeNull();
  });

  it('sets source and stationId on the returned WaterQuality', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versionToken: 'abc' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(samplesResponse([{ result: '100', date: '2026-06-30', stationId: 'FM-070' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSanDiegoCountyWaterQuality('105');

    expect(result?.source).toBe('San Diego County DEHQ (ddPCR)');
    expect(result?.stationId).toBe('FM-070');
  });
});
