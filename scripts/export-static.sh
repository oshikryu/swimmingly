#!/bin/bash
set -e

REPO_NAME="swimmingly"

echo "📦 Exporting static files to out/ directory..."

# Clean output
rm -rf out

# Create required directories
mkdir -p out/_next/static

# Copy HTML pages
cp .next/server/app/index.html out/
cp .next/server/app/_not-found.html out/404.html

cp .next/server/pages/404.html out/_404.html 2>/dev/null || true
cp .next/server/pages/500.html out/500.html 2>/dev/null || true

cp -r .next/static/* out/_next/static/

# Copy public assets
cp -r public/* out/ 2>/dev/null || true

# Disable Jekyll for GitHub Pages
touch out/.nojekyll

# Add basePath prefix to all asset URLs for GitHub Pages deployment
echo "🔧 Adding /${REPO_NAME}/ prefix to asset paths..."
for file in out/*.html; do
  if [ -f "$file" ]; then
    # Prefix /_next/ paths with /swimmingly
    sed -i '' "s|\"/_next/|\"/${REPO_NAME}/_next/|g" "$file"
    sed -i '' "s|'/_next/|'/${REPO_NAME}/_next/|g" "$file"
  fi
done

echo "✅ Static export complete!"
echo "📁 Files exported to: out/"
echo ""
echo "Test locally:"
echo "  npx serve out"
