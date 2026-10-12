import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a plain static site into web/out/ (no server needed to host it).
  output: "export",
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
