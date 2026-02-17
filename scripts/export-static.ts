#!/usr/bin/env tsx
/**
 * Export Static Site
 *
 * Copies the Next.js build output into an `out/` directory suitable for
 * static hosting on GitHub Pages. Replaces the old export-static.sh script.
 *
 * Environment variables:
 *   NEXT_DIR  - Build directory (default: .next)
 *   REPO_NAME - GitHub repo name for basePath prefix (default: swimmingly)
 */

import fs from 'fs';
import path from 'path';

const REPO_NAME = process.env.REPO_NAME || 'swimmingly';
const NEXT_DIR = process.env.NEXT_DIR || '.next';
const PROJECT_DIR = process.cwd();
const OUT_DIR = path.join(PROJECT_DIR, 'out');

function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function copyIfExists(src: string, dest: string) {
  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    return true;
  }
  return false;
}

console.log(`📦 Exporting static files to out/ directory...`);
console.log(`   Using build directory: ${NEXT_DIR}`);

// 1. Clean output
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
}
fs.mkdirSync(path.join(OUT_DIR, '_next', 'static'), { recursive: true });

// 2. Copy HTML pages
const serverAppDir = path.join(PROJECT_DIR, NEXT_DIR, 'server', 'app');
copyIfExists(path.join(serverAppDir, 'index.html'), path.join(OUT_DIR, 'index.html'));
copyIfExists(path.join(serverAppDir, '_not-found.html'), path.join(OUT_DIR, '404.html'));

const serverPagesDir = path.join(PROJECT_DIR, NEXT_DIR, 'server', 'pages');
copyIfExists(path.join(serverPagesDir, '404.html'), path.join(OUT_DIR, '_404.html'));
copyIfExists(path.join(serverPagesDir, '500.html'), path.join(OUT_DIR, '500.html'));

// 3. Copy static assets
const staticDir = path.join(PROJECT_DIR, NEXT_DIR, 'static');
if (fs.existsSync(staticDir)) {
  copyRecursive(staticDir, path.join(OUT_DIR, '_next', 'static'));
}

// 4. Copy public assets (excluding static-data.json which is handled separately)
const publicDir = path.join(PROJECT_DIR, 'public');
if (fs.existsSync(publicDir)) {
  for (const entry of fs.readdirSync(publicDir)) {
    if (entry === 'static-data.json') continue;
    copyIfExists(path.join(publicDir, entry), path.join(OUT_DIR, entry));
  }
}

// 5. Copy static-data.json from isolated location if available, otherwise from public
const isolatedDataPath = path.join(PROJECT_DIR, '.static-build', 'static-data.json');
const publicDataPath = path.join(publicDir, 'static-data.json');

if (fs.existsSync(isolatedDataPath)) {
  console.log('   Using isolated static-data.json');
  fs.copyFileSync(isolatedDataPath, path.join(OUT_DIR, 'static-data.json'));
} else if (fs.existsSync(publicDataPath)) {
  console.log('   Using public/static-data.json');
  fs.copyFileSync(publicDataPath, path.join(OUT_DIR, 'static-data.json'));
}

// 6. Copy favicon
copyIfExists(path.join(PROJECT_DIR, 'src', 'app', 'icon.svg'), path.join(OUT_DIR, 'icon.svg'));

// 7. Disable Jekyll for GitHub Pages
fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');

// 8. Add basePath prefix to asset URLs in HTML files for GitHub Pages
console.log(`🔧 Adding /${REPO_NAME}/ prefix to asset paths...`);
for (const entry of fs.readdirSync(OUT_DIR)) {
  if (!entry.endsWith('.html')) continue;
  const filePath = path.join(OUT_DIR, entry);
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(/"\/_next\//g, `"/${REPO_NAME}/_next/`);
  content = content.replace(/'\/_next\//g, `'/${REPO_NAME}/_next/`);
  // Rewrite icon/favicon paths for GitHub Pages subdirectory
  content = content.replace(/href="\/icon\.svg"/g, `href="/${REPO_NAME}/icon.svg"`);
  fs.writeFileSync(filePath, content, 'utf-8');
}

console.log('✅ Static export complete!');
console.log('📁 Files exported to: out/');
console.log('');
console.log('Test locally:');
console.log('  npx serve out');
