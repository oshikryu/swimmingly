#!/usr/bin/env tsx
/**
 * Publish Static Site to GitHub Pages
 *
 * One-shot command that:
 * 1. Fetches fresh data by calling API functions directly (no running server needed)
 * 2. Builds the static site
 * 3. Deploys to GitHub Pages (gh-pages branch)
 *
 * Usage: npm run publish:static
 *
 * Environment variables (optional, set in .env.local):
 *   GITHUB_REPO    - Git remote URL (default: git@github.com:oshikryu/swimmingly.git)
 *   GITHUB_BRANCH  - Deploy branch (default: gh-pages)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

const CONFIG = {
  projectDir: process.cwd(),
  githubRepo: process.env.GITHUB_REPO || 'git@github.com:oshikryu/swimmingly.git',
  githubBranch: process.env.GITHUB_BRANCH || 'gh-pages',
};

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

async function publishStaticSite() {
  const startTime = Date.now();

  console.log('');
  log('🌊 Swimmingly - Publish Static Site to GitHub Pages', colors.bright + colors.blue);
  log(`   Repo: ${CONFIG.githubRepo}`, colors.dim);
  log(`   Branch: ${CONFIG.githubBranch}`, colors.dim);
  console.log('');

  // Step 1: Build the static site (generates data + builds + exports to out/)
  log('Step 1/2: Building static site...', colors.blue);
  try {
    const { stdout, stderr } = await execAsync(
      'npm run build:static',
      { cwd: CONFIG.projectDir, maxBuffer: 1024 * 1024 * 10 }
    );
    if (stdout) console.log(colors.dim + stdout + colors.reset);
    if (stderr && !stderr.includes('Successfully')) {
      log('Build warnings:', colors.yellow);
      console.log(colors.dim + stderr + colors.reset);
    }
    log('Static site built successfully', colors.green);
  } catch (error: unknown) {
    const execError = error as { stderr?: string };
    log('Build failed:', colors.red);
    if (execError.stderr) console.error(execError.stderr);
    process.exit(1);
  }

  // Step 2: Deploy to GitHub Pages
  log('Step 2/2: Deploying to GitHub Pages...', colors.blue);
  const buildDir = path.join(CONFIG.projectDir, 'out');

  try {
    await fs.access(buildDir);
  } catch {
    log(`Build directory does not exist: ${buildDir}`, colors.red);
    log('The build step may have failed to produce output.', colors.dim);
    process.exit(1);
  }

  try {
    // Ensure .nojekyll exists
    await fs.writeFile(path.join(buildDir, '.nojekyll'), '', 'utf-8');

    // Initialize git in out/ and deploy
    await execAsync(`git -C "${buildDir}" init`);
    await execAsync(`git -C "${buildDir}" add -A`);
    await execAsync(`git -C "${buildDir}" commit -m "Deploy static site - ${new Date().toISOString()}"`);
    await execAsync(`git -C "${buildDir}" push -f ${CONFIG.githubRepo} master:${CONFIG.githubBranch}`);

    log('Deployed to GitHub Pages', colors.green);

    // Cleanup .git inside out/
    await execAsync(`rm -rf "${path.join(buildDir, '.git')}"`);
  } catch (error: unknown) {
    const execError = error as { stderr?: string };
    log('Deploy failed:', colors.red);
    if (execError.stderr) console.error(execError.stderr);
    process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  log(`Done in ${duration}s`, colors.bright + colors.green);
  log(`Published to: ${CONFIG.githubRepo} (${CONFIG.githubBranch})`, colors.dim);
  console.log('');
}

publishStaticSite().catch((error) => {
  log('Fatal error:', colors.red);
  console.error(error);
  process.exit(1);
});
