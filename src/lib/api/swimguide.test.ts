import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSwimGuideWaterQuality } from './swimguide';

/**
 * Builds a synthetic page matching the real Nuxt SSR payload shape:
 * `window.__NUXT__=(function(a,b,c,...){return {...}}(arg1,arg2,...));</script>`
 * where the returned object references its values only via the single-letter
 * parameters — mirrors what theswimguide.org actually serves.
 */
function nuxtPage(opts: {
  description: string;
  text: string;
  day?: number;
  month?: number;
  year?: number;
}): string {
  const { description, text, day = 2, month = 7, year = 2026 } = opts;
  return `<html><body><script>window.__NUXT__=(function(a,b,c,d,e,f,g,h){return {data:[{id:"1986",beach:{currentStatus:{id:h,historicalRating:e,manualRating:e,resultDate:{day:f,month:g,year:h,time:a},postedDate:{day:f,month:g,year:h,time:"20:52"},result:f,waterQuality:{description:"${description}",type:"CURRENT",text:"${text}"}}}}]}}(null,0,1,"",false,${day},${month},${year}));</script></body></html>`;
}

function mockFetch(body: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSwimGuideWaterQuality', () => {
  it('maps "Pass" to safe', async () => {
    vi.stubGlobal('fetch', mockFetch(nuxtPage({ description: 'Pass', text: 'Meets water quality standards' })));

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result?.status).toBe('safe');
  });

  it('maps a non-"Pass" result to advisory by default', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(nuxtPage({ description: 'Closed', text: 'Failed to meet water quality standards' }))
    );

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result?.status).toBe('advisory');
    expect(result?.notes).toBe('Failed to meet water quality standards');
  });

  it('escalates to closed when the posting mentions a spill/sewage/overflow event', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(nuxtPage({ description: 'Closed', text: 'Beach closed due to sewage spill' }))
    );

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result?.status).toBe('closed');
  });

  it('parses the real resultDate reported by the page (day/month/year, not the posting date)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(nuxtPage({ description: 'Pass', text: 'Meets standards', day: 2, month: 7, year: 2026 }))
    );

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result?.timestamp.getFullYear()).toBe(2026);
    expect(result?.timestamp.getMonth()).toBe(6); // 0-indexed: July
    expect(result?.timestamp.getDate()).toBe(2);
  });

  it('sets source to identify Swim Guide', async () => {
    vi.stubGlobal('fetch', mockFetch(nuxtPage({ description: 'Pass', text: 'Meets standards' })));

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result?.source).toBe('Swim Guide (San Diego Coastkeeper)');
  });

  it('returns null (fails safe) when the page has no __NUXT__ payload at all', async () => {
    vi.stubGlobal('fetch', mockFetch('<html><body>not a nuxt page</body></html>'));

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result).toBeNull();
  });

  it('returns null when the payload is missing currentStatus', async () => {
    const html = `<script>window.__NUXT__=(function(a,b){return {data:[{id:"1986",beach:{name:a}}]}}("La Jolla Cove",1));</script>`;
    vi.stubGlobal('fetch', mockFetch(html));

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch('', false));

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await fetchSwimGuideWaterQuality('1986');

    expect(result).toBeNull();
  });

  it('requests the beach page for the given beach ID', async () => {
    const fetchMock = mockFetch(nuxtPage({ description: 'Pass', text: 'Meets standards' }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchSwimGuideWaterQuality('1986');

    expect(fetchMock.mock.calls[0][0]).toBe('https://www.theswimguide.org/beach/1986');
  });
});
