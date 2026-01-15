#!/usr/bin/env tsx
/**
 * Static Site Update Scheduler
 *
 * This script runs alongside the dev server and periodically:
 * 1. Fetches fresh data from the running API
 * 2. Generates static-data.json
 * 3. Builds the static site
 * 4. Pushes to GitHub Pages
 *
 * Usage: npm run dev (starts both dev server and this scheduler)
 */

import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  // Cron schedule: "*/10 * * * *" = every 10 minutes
  schedule: process.env.STATIC_UPDATE_SCHEDULE || '*/10 * * * *',
  apiUrl: process.env.API_URL || 'http://localhost:3000/api/conditions',
  projectDir: process.cwd(),
  githubRepo: process.env.GITHUB_REPO || 'git@github.com:oshikryu/swimmingly.git',
  githubBranch: process.env.GITHUB_BRANCH || 'gh-pages',
  enabled: process.env.ENABLE_STATIC_UPDATES !== 'false', // Enabled by default
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color: string = colors.reset) {
  const timestamp = new Date().toISOString();
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

async function updateStaticSite() {
  const startTime = Date.now();
  log('🌊 Starting static site update...', colors.blue);

  try {
    // Step 1: Check if API is available
    log('Checking API availability...', colors.dim);
    try {
      const response = await fetch(CONFIG.apiUrl);
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      log('✓ API is available', colors.green);
    } catch (error) {
      log('⚠️  API not available - skipping update', colors.yellow);
      log('   Make sure dev server is running', colors.dim);
      return;
    }

    // Step 2: Fetch fresh data
    log('Fetching fresh data...', colors.dim);
    const dataResponse = await fetch(CONFIG.apiUrl);
    const data = await dataResponse.json();

    // Add build metadata
    const staticData = {
      ...data,
      buildTimestamp: new Date().toISOString(),
      buildMode: 'static',
    };

    // Write to public/static-data.json
    const fs = await import('fs/promises');
    const staticDataPath = path.join(CONFIG.projectDir, 'public', 'static-data.json');
    await fs.writeFile(staticDataPath, JSON.stringify(staticData, null, 2), 'utf-8');
    log(`✓ Wrote data to ${staticDataPath}`, colors.green);

    // Step 3: Build static site
    log('Building static site...', colors.dim);
    const { stdout: buildOutput, stderr: buildError } = await execAsync(
      'npm run build:static',
      { cwd: CONFIG.projectDir, maxBuffer: 1024 * 1024 * 10 }
    );

    if (buildError && !buildError.includes('Successfully')) {
      log('⚠️  Build warnings:', colors.yellow);
      console.log(colors.dim + buildError + colors.reset);
    }

    log('✓ Static site built successfully', colors.green);

    // Step 4: Deploy to GitHub Pages
    log('Deploying to GitHub Pages...', colors.dim);
    const buildDir = path.join(CONFIG.projectDir, 'out');

    // Initialize git in out directory
    await execAsync('git init', { cwd: buildDir });
    await execAsync('git add -A', { cwd: buildDir });
    await execAsync(`git commit -m "Deploy static site - ${new Date().toISOString()}"`, { cwd: buildDir });

    // Push to gh-pages
    await execAsync(
      `git push -f ${CONFIG.githubRepo} main:${CONFIG.githubBranch}`,
      { cwd: buildDir }
    );

    log('✓ Deployed to GitHub Pages', colors.green);

    // Cleanup
    await execAsync(`rm -rf ${buildDir}/.git`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✅ Static site update complete in ${duration}s`, colors.bright + colors.green);
    log('', '');

  } catch (error) {
    log('❌ Error updating static site:', colors.red);
    console.error(error);
    log('', '');
  }
}

// Main
async function main() {
  console.log('');
  log('🚀 Static Site Update Scheduler Started', colors.bright + colors.blue);
  log(`   Schedule: ${CONFIG.schedule}`, colors.dim);
  log(`   API: ${CONFIG.apiUrl}`, colors.dim);
  log(`   GitHub: ${CONFIG.githubRepo}`, colors.dim);
  log(`   Branch: ${CONFIG.githubBranch}`, colors.dim);
  console.log('');

  if (!CONFIG.enabled) {
    log('ℹ️  Static updates disabled (ENABLE_STATIC_UPDATES=false)', colors.yellow);
    log('   Set ENABLE_STATIC_UPDATES=true to enable', colors.dim);
    return;
  }

  // Run once immediately if requested
  if (process.env.RUN_IMMEDIATELY === 'true') {
    log('Running initial update...', colors.blue);
    await updateStaticSite();
  }

  // Schedule periodic updates
  log(`Next update scheduled according to: ${CONFIG.schedule}`, colors.dim);
  console.log('');

  cron.schedule(CONFIG.schedule, async () => {
    await updateStaticSite();
  });

  // Keep process alive
  log('Press Ctrl+C to stop', colors.dim);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  log('👋 Shutting down static update scheduler...', colors.yellow);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  log('👋 Shutting down static update scheduler...', colors.yellow);
  process.exit(0);
});

// Start
main().catch((error) => {
  log('❌ Fatal error:', colors.red);
  console.error(error);
  process.exit(1);
});
