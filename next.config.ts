import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: basePath/assetPrefix not used here because output:'export' conflicts with API routes.
  // The export-static.sh script handles path prefixing via sed post-processing.
};

export default nextConfig;
