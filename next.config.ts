import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These rely on Node built-ins / dynamic requires and must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "cheerio"],
};

export default nextConfig;
