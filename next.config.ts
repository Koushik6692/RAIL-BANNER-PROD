import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow large WhatsApp / phone videos through /api/local-upload in local dev
  // (default middleware body cap is ~10MB and breaks FormData parsing).
  experimental: {
    middlewareClientMaxBodySize: "512mb",
  },
};

export default nextConfig;
