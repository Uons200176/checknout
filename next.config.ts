import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/checkout/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/payments/:path*", headers: [
        { key: "Cache-Control", value: "no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ] },
    ];
  },
};

export default nextConfig;
