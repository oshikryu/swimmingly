import type { NextConfig } from "next";

const repo = "swimmingly"

const nextConfig: NextConfig = {
  /* config options here */

  // Enable static export when BUILD_MODE=static
  ...(process.env.BUILD_MODE === 'static' && {
    output: 'export',
    // Disable features incompatible with static export
    images: {
      unoptimized: true, // Required for static export
    },
    basePath: `/${repo}`,
    assetPrefix: `/${repo}/`,
  }),
};

export default nextConfig;
