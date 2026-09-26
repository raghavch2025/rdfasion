import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage transforms images (WebP, 400/900 px); see lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
    deviceSizes: [400, 900],
    imageSizes: [400],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
