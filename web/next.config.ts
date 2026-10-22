import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a plain static site into web/out/ (no server needed to host it).
  output: "export",
  experimental: {
    // Only nudge coding agents about security upgrades of Next.js (set in the 16.4.2 upgrade).
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
