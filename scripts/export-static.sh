#!/bin/bash
set -e

REPO_NAME="swimmingly"

# Use isolated build directory to avoid conflicting with dev server
# When ISOLATED_BUILD=true, use .next-static instead of .next
NEXT_DIR="${NEXT_DIR:-.next}"

echo "📦 Exporting static files to out/ directory..."
echo "   Using build directory: ${NEXT_DIR}"

# Clean output
rm -rf out

# Create required directories
mkdir -p out/_next/static

# Copy HTML pages
cp "${NEXT_DIR}/server/app/index.html" out/
cp "${NEXT_DIR}/server/app/_not-found.html" out/404.html

cp "${NEXT_DIR}/server/pages/404.html" out/_404.html 2>/dev/null || true
cp "${NEXT_DIR}/server/pages/500.html" out/500.html 2>/dev/null || true

cp -r "${NEXT_DIR}/static/"* out/_next/static/

# Copy public assets (excluding static-data.json which may be stale)
for item in public/*; do
  if [ -e "$item" ] && [ "$(basename "$item")" != "static-data.json" ]; then
    cp -r "$item" out/ 2>/dev/null || true
  fi
done

# Copy static-data.json from isolated location if available, otherwise from public
if [ -f ".static-build/static-data.json" ]; then
  echo "   Using isolated static-data.json"
  cp ".static-build/static-data.json" out/
elif [ -f "public/static-data.json" ]; then
  echo "   Using public/static-data.json"
  cp "public/static-data.json" out/
fi

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
