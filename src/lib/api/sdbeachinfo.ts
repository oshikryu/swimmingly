/**
 * San Diego County Beach & Water Quality (sdbeachinfo) API Client
 * Fetches Enterococcus ddPCR sample results for a given beach monitoring site.
 *
 * This is San Diego County's actual public beach-monitoring data — the same data
 * shown at https://cosdapps.sandiegocounty.gov/sdbeachinfo/SamplesReport?SiteId=<id> —
 * but it's an OutSystems Reactive app, not a documented REST API: the underlying
 * screenservices endpoint requires a short session-bootstrap sequence (cookies +
 * a CSRF header) before it will return data. The sequence below was reverse-engineered
 * from the site's own network traffic and is NOT an officially supported integration.
 *
 * Fragility / maintenance note: `API_VERSIONS` below are per-screen-action hashes
 * embedded in the county's compiled JS bundle. They're expected to stay valid as long
 * as the county doesn't redeploy this specific OutSystems module. If this client starts
 * failing (check logs for non-200 responses), re-capture the current values by loading
 * the SamplesReport page in a browser with devtools open and inspecting the POST body
 * of the ScreenDataSetGetSamples request. Because of this, this source is used as a
 * best-effort primary with automatic fallback (see route.ts) — it must never throw.
 */

import type { WaterQuality } from '@/types/conditions';

const BASE_URL = 'https://cosdapps.sandiegocounty.gov/sdbeachinfo';

// Static CSRF token used by this OutSystems deployment (confirmed identical across
// independent sessions — appears to be an app-level constant, not a per-visitor nonce).
const CSRF_TOKEN = 'T6C+9iB49TLra4jEsMeSckDMNhQ=';

// Per-screen-action API version hashes (see fragility note above).
const API_VERSIONS = {
  applicationLogo: '5XhSyU8Yirf++x7wXrm69w',
  getSamples: 'L1afk6NDVnwatxTYNUtNLA',
};

// San Diego County's EPA-approved ddPCR Enterococcus advisory threshold
// (Copies/100mL — NOT comparable to the MPN/100mL culture-based thresholds
// used elsewhere in this app). Source: CDPH/EPA approval of SD County DEHQ's
// rapid ddPCR method, May 2022.
const DDPCR_ENTEROCOCCUS_ADVISORY_THRESHOLD = 1413;

interface SDBeachSample {
  parameter: string;
  result: number;
  units: string;
  sampleDate: string;
  stationId: string;
  locationName: string;
}

function mergeCookies(jar: Map<string, string>, setCookieHeaders: string[]): void {
  for (const header of setCookieHeaders) {
    const pair = header.split(';')[0];
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    jar.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Establish an OutSystems session: fetch the current module version, then make a
 * throwaway data-action call to validate the CSRF token and populate session cookies.
 * Returns the cookie jar and current moduleVersion to use for subsequent calls.
 */
async function establishSession(): Promise<{ jar: Map<string, string>; moduleVersion: string } | null> {
  const jar = new Map<string, string>();

  const versionResponse = await fetch(`${BASE_URL}/moduleservices/moduleversioninfo?${Date.now()}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!versionResponse.ok) return null;
  mergeCookies(jar, versionResponse.headers.getSetCookie());

  const versionData = await versionResponse.json();
  const moduleVersion = versionData?.versionToken;
  if (!moduleVersion) return null;

  const bootstrapResponse = await fetch(
    `${BASE_URL}/screenservices/sdbeachinfo/Common/ApplicationLogo/DataActionGetDataForHome`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json',
        'x-csrftoken': CSRF_TOKEN,
        'outsystems-request-token': String(Date.now()),
        'Cookie': cookieHeader(jar),
      },
      body: JSON.stringify({
        versionInfo: { moduleVersion, apiVersion: API_VERSIONS.applicationLogo },
        viewName: 'MainFlow.SamplesReport',
        screenData: { variables: {} },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!bootstrapResponse.ok) return null;
  mergeCookies(jar, bootstrapResponse.headers.getSetCookie());

  return { jar, moduleVersion };
}

/**
 * Fetch the most recent Enterococcus samples for a given sdbeachinfo site ID.
 */
async function fetchSamples(siteId: string, maxRecords: number = 3): Promise<SDBeachSample[] | null> {
  const session = await establishSession();
  if (!session) return null;
  const { jar, moduleVersion } = session;

  const response = await fetch(
    `${BASE_URL}/screenservices/CoSD_Beach_Water_CW/MainFlow/SampleBlock/ScreenDataSetGetSamples`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json',
        'x-csrftoken': CSRF_TOKEN,
        'outsystems-request-token': String(Date.now()),
        'Cookie': cookieHeader(jar),
      },
      body: JSON.stringify({
        versionInfo: { moduleVersion, apiVersion: API_VERSIONS.getSamples },
        viewName: 'MainFlow.SamplesReport',
        screenData: {
          variables: {
            TableSort: 'Sample.SampleDate DESC',
            StartIndex: 0,
            MaxRecords: maxRecords,
            StationIdFilter: siteId,
            SampleDataFrom: '1900-01-01',
            SampleDataTo: '1900-01-01',
            isPublic: true,
            SiteId: siteId,
          },
        },
        inputParameters: { StartIndex: 0, MaxRecords: maxRecords },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!response.ok) return null;

  const data = await response.json();
  const rows = data?.data?.List?.List;
  if (!Array.isArray(rows)) return null;

  return rows
    .map((row): SDBeachSample | null => {
      const result = parseFloat(row?.Sample?.Result);
      if (isNaN(result)) return null;
      return {
        parameter: row?.Parameter?.Label ?? 'Unknown',
        result,
        units: row?.Units?.Label ?? '',
        sampleDate: row?.Sample?.SampleDate,
        stationId: row?.Site?.StationID ?? siteId,
        locationName: row?.Site?.LocationName ?? '',
      };
    })
    .filter((s): s is SDBeachSample => s !== null);
}

/**
 * Fetch the latest San Diego County ddPCR Enterococcus water quality reading for
 * a beach site. Returns null on any failure — callers should fall back to another
 * water quality source (this integration is inherently fragile, see file header).
 *
 * Note: the ddPCR method reports in Copies/100mL, not MPN/100mL — the returned
 * `status` is computed against San Diego County's own EPA-approved threshold
 * (1413 Copies/100mL) rather than the MPN-based SAFETY_THRESHOLDS used elsewhere,
 * and `enterococcusCount` is intentionally left undefined so downstream MPN-based
 * scoring/display logic doesn't misinterpret the different units.
 */
export async function fetchSanDiegoCountyWaterQuality(siteId: string): Promise<WaterQuality | null> {
  try {
    const samples = await fetchSamples(siteId, 3);
    if (!samples || samples.length === 0) return null;

    const latest = samples.find(s => s.parameter === 'Enterococcus') ?? samples[0];
    const exceedsThreshold = latest.result >= DDPCR_ENTEROCOCCUS_ADVISORY_THRESHOLD;

    return {
      timestamp: new Date(`${latest.sampleDate}T00:00:00`),
      status: exceedsThreshold ? 'advisory' : 'safe',
      source: 'San Diego County DEHQ (ddPCR)',
      stationId: latest.stationId,
      notes: `${latest.parameter}: ${latest.result} ${latest.units} (ddPCR)${
        exceedsThreshold ? ` — exceeds county advisory threshold of ${DDPCR_ENTEROCOCCUS_ADVISORY_THRESHOLD} Copies/100mL` : ''
      }`,
    };
  } catch (error) {
    console.error('Error fetching San Diego County water quality:', error);
    return null;
  }
}
