/**
 * Sea Temperature API Client
 * Scrapes water temperature data from seatemperature.info for Aquatic Park
 */

import type { WaterTemperature } from '@/types/conditions';

const SEATEMPERATURE_URL = 'https://seatemperature.info/aquatic-park-water-temperature.html';

/**
 * Fetch water temperature from seatemperature.info by scraping their HTML page
 * Extracts temperature from JSON-LD schema or falls back to HTML parsing
 */
export async function fetchWaterTemperature(): Promise<WaterTemperature | null> {
  try {
    console.log('Fetching water temperature from seatemperature.info...');

    const response = await fetch(SEATEMPERATURE_URL, {
      headers: {
        'User-Agent': 'Swimmingly/1.0 (contact@swimmingly.app)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('SeaTemperature fetch failed:', response.status, response.statusText);
      return null;
    }

    const html = await response.text();

    // Try to extract from JSON-LD schema first (more reliable)
    // Look for: "Water temperature in Aquatic Park today is XX.X&deg;F"
    // Note: HTML uses &deg; entity, not the degree character
    const schemaMatch = html.match(/Water temperature in Aquatic Park today is ([\d.]+)&deg;F/i);

    if (schemaMatch) {
      const temperatureF = parseFloat(schemaMatch[1]);

      if (!isNaN(temperatureF)) {
        console.log(`SeaTemperature - Water temp: ${temperatureF}°F`);

        return {
          timestamp: new Date(),
          temperatureF,
          source: 'seatemperature.info',
        };
      }
    }

    // Fallback: Try to find temperature in HTML content
    // Look for patterns like "53.8&deg;F" or "53.8°F"
    const htmlTempMatch = html.match(/([\d.]+)(?:&deg;|°)F/);

    if (htmlTempMatch) {
      const temperatureF = parseFloat(htmlTempMatch[1]);

      if (!isNaN(temperatureF)) {
        console.log(`SeaTemperature (HTML fallback) - Water temp: ${temperatureF}°F`);

        return {
          timestamp: new Date(),
          temperatureF,
          source: 'seatemperature.info',
        };
      }
    }

    console.warn('Could not parse water temperature from seatemperature.info');
    return null;
  } catch (error) {
    console.error('Error fetching water temperature from seatemperature.info:', error);
    return null;
  }
}
