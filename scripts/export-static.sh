#!/bin/bash
# Manual export script for Next.js static files
# This works around Next.js 15's behavior with API routes present

set -e

echo "📦 Exporting static files to out/ directory..."

# Create out directory
rm -rf out
mkdir -p out

# Copy HTML pages
cp .next/server/app/index.html out/
cp .next/server/app/_not-found.html out/404.html
cp .next/server/pages/404.html out/_404.html 2>/dev/null || true
cp .next/server/pages/500.html out/500.html 2>/dev/null || true

# Create _next directory structure
mkdir -p out/_next

# Copy static assets
cp -r .next/static out/_next/
cp -r public/* out/ 2>/dev/null || true

echo "✅ Static export complete!"
echo "📁 Files exported to: out/"
echo ""
echo "To test locally:"
echo "  npx serve out"
echo ""
