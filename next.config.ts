import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Allow all HTTPS hostnames so real article images from any news source load.
      // placehold.co is covered by the wildcard; kept explicit for clarity.
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
