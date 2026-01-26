import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: basePath/assetPrefix not used here because output:'export' conflicts with API routes.
  // The export-static.sh script handles path prefixing via sed post-processing.

  // Use isolated build directory when ISOLATED_BUILD=true
  // This prevents static site builds from conflicting with the dev server
  ...(process.env.ISOLATED_BUILD === 'true' && {
    distDir: '.next-static',
  }),
};

export default nextConfig;
