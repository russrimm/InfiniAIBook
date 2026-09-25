import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image builds a self-contained server; local installs keep the
  // default output so `npm start` behaves as before.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  // These rely on Node built-ins / dynamic requires and must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "cheerio"],
};

export default nextConfig;
