#!/usr/bin/env tsx
/**
 * Generate static data file for build-time pre-fetching
 * This script is run before the static build to fetch fresh data
 * and write it to public/static-data.json (or isolated directory)
 *
 * Environment variables:
 * - STATIC_DATA_DIR: Override output directory (e.g., '.static-build')
 *                    Used for isolated builds that don't conflict with dev server
 */

import { fetchStaticData } from './fetchStaticData';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

async function generateStaticData() {
  try {
    console.log('🌊 Swimmingly - Generating static data...');
    console.log('⏰ Started at:', new Date().toISOString());
    console.log('');

    // Fetch data (default tide preference: slack)
    const data = await fetchStaticData('slack');

    // Add build metadata
    const staticData = {
      ...data,
      buildTimestamp: new Date().toISOString(),
      buildMode: 'static',
    };

    // Write to output directory (default: public, or isolated directory if STATIC_DATA_DIR is set)
    const outputDir = process.env.STATIC_DATA_DIR
      ? join(process.cwd(), process.env.STATIC_DATA_DIR)
      : join(process.cwd(), 'public');

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = join(outputDir, 'static-data.json');

    writeFileSync(outputPath, JSON.stringify(staticData, null, 2), 'utf-8');

    console.log('✅ Static data generated successfully');
    console.log('📝 Written to:', outputPath);
    console.log('📊 Data timestamp:', data.timestamp);
    console.log('⭐ Swim score:', data.score.overallScore);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run: npm run build:static');
    console.log('  2. Test locally: npx serve out');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to generate static data:', error);
    console.error('');
    console.error('This may be due to:');
    console.error('  - Network connectivity issues');
    console.error('  - External API failures');
    console.error('  - Invalid API responses');
    console.error('');
    console.error('Try running again in a few minutes.');
    process.exit(1);
  }
}

// Run the generator
generateStaticData();
