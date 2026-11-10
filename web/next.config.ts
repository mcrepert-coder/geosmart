import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    const apiUrl = (
      process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL
    )?.replace(/\/+$/, "");
    if (!apiUrl) return [];
    return [{ source: "/listings-api/:path*", destination: `${apiUrl}/:path*` }];
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
