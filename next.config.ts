import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]
  },
  // Content Tracker was renamed to Media Tracker — keep old bookmarks/links working.
  async redirects() {
    return [
      { source: "/admin/content-tracker", destination: "/admin/media-tracker", permanent: true },
      { source: "/member/content-tracker", destination: "/member/media-tracker", permanent: true },
    ]
  },
};

export default nextConfig;
