/**
 * Swim Guide API Client
 * Fetches beach water quality status from theswimguide.org (a Swim Drink Fish
 * initiative that aggregates official health-department postings — for La Jolla
 * Cove, San Diego Coastkeeper posts San Diego County DEH results here, often
 * faster than the county's own site surfaces them).
 *
 * There's no documented public API — this parses the server-rendered Nuxt.js
 * page state (`window.__NUXT__`) embedded in the beach page's HTML. That payload
 * is a minified IIFE of the form `(function(a,b,c,...){return {...}}(val1,val2,...))`
 * where the returned object references its data only through the single-letter
 * parameters. We extract the parameter/argument lists and the `currentStatus`
 * object, then substitute each bare identifier with its literal value via string
 * replacement — deliberately NOT executing any of the fetched code (no `eval`/`vm`),
 * since that would mean running untrusted third-party JS. This is a plain data
 * extraction, safe to run server-side, but it depends on Nuxt's SSR payload
 * format staying the same — if Swim Guide changes their frontend framework or
 * minification approach, this will start returning null (fails safe, never throws).
 */

import type { WaterQuality } from '@/types/conditions';

const BASE_URL = 'https://www.theswimguide.org/beach';

/**
 * Split a comma-separated argument list, respecting quoted strings
 * (the IIFE's trailing argument list can contain string literals with commas).
 */
function splitTopLevelArgs(s: string): string[] {
  const args: string[] = [];
  let current = '';
  let inString = false;
  let quoteChar = '';

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      current += c;
      if (c === '\\') {
        current += s[++i];
        continue;
      }
      if (c === quoteChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quoteChar = c;
      current += c;
      continue;
    }
    if (c === ',') {
      args.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current) args.push(current);
  return args;
}

/** Extract a balanced-brace object literal substring starting at `key:{` */
function extractObjectLiteral(source: string, key: string): string | null {
  const marker = `${key}:{`;
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + key.length + 1; // position of the opening '{'
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse the beach page's embedded Nuxt SSR state and return the raw
 * `currentStatus` fields for the beach, or null if the page structure
 * doesn't match what we expect (fails safe).
 */
function parseCurrentStatus(html: string): {
  resultDate: { day: number; month: number; year: number };
  postedDate: { day: number; month: number; year: number; time: string | null };
  waterQuality: { description: string; text: string };
} | null {
  const match = html.match(/window\.__NUXT__=\(function\(([^)]*)\)\{return ([\s\S]*)\}\((.*)\)\);?<\/script>/);
  if (!match) return null;

  const params = match[1].split(',').map(p => p.trim());
  const body = match[2];
  const args = splitTopLevelArgs(match[3]);
  if (params.length !== args.length) return null;

  const varMap = new Map<string, string>();
  params.forEach((p, i) => varMap.set(p, args[i]));

  const rawObject = extractObjectLiteral(body, 'currentStatus');
  if (!rawObject) return null;

  // Substitute bare single-letter identifiers (the only kind Nuxt emits here)
  // with their literal values — pure string substitution, no code execution.
  const substituted = rawObject.replace(/\b[a-z]\b/g, (token) => varMap.get(token) ?? token);

  // Quote bare object keys so the result is valid JSON, then parse
  const asJson = substituted.replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');

  try {
    const parsed = JSON.parse(asJson);
    if (!parsed?.waterQuality || !parsed?.resultDate) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fetch the current water quality status for a Swim Guide beach ID.
 * Returns a qualitative status only (Swim Guide's page doesn't expose the raw
 * bacteria count) — safe unless the posting explicitly mentions a spill/sewage
 * event, in which case it's escalated to 'closed'.
 */
export async function fetchSwimGuideWaterQuality(beachId: string): Promise<WaterQuality | null> {
  try {
    const response = await fetch(`${BASE_URL}/${beachId}`, {
      headers: { 'User-Agent': 'Swimmingly/1.0 (contact@swimmingly.app)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const html = await response.text();
    const parsed = parseCurrentStatus(html);
    if (!parsed) return null;

    const { resultDate, waterQuality } = parsed;
    const isPass = waterQuality.description?.toLowerCase() === 'pass';
    const mentionsSpill = /spill|sewage|overflow/i.test(waterQuality.text ?? '');

    return {
      timestamp: new Date(resultDate.year, resultDate.month - 1, resultDate.day),
      status: isPass ? 'safe' : mentionsSpill ? 'closed' : 'advisory',
      source: 'Swim Guide (San Diego Coastkeeper)',
      notes: waterQuality.text || waterQuality.description,
    };
  } catch (error) {
    console.error('Error fetching Swim Guide water quality:', error);
    return null;
  }
}
