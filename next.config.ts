import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.assembly.go.kr",
      },
    ],
  },
};

export default nextConfig;
