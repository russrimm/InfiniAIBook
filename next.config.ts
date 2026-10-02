import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy, shipped as Report-Only first: violations are logged
 * in the browser console without blocking anything, so a missed directive
 * cannot break a feature before it has been seen. Promote it to
 * `Content-Security-Policy` once a round of use shows no reports.
 *
 * - img-src / media-src: own routes plus data: and blob: (PNG export, voice
 *   previews). No remote images, so injected Markdown cannot beacon out.
 * - frame-src: the in-app browser frames arbitrary http(s) pages.
 * - script-src 'unsafe-inline': Next's inline bootstrap; 'unsafe-eval' only in
 *   development, for React Refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-src http: https:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  // Enforced now: the app never frames itself, so clickjacking protection
  // costs nothing.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Source links open third-party sites; they need not learn notebook URLs.
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  // The Docker image builds a self-contained server; local installs keep the
  // default output so `npm start` behaves as before.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  // These rely on Node built-ins / dynamic requires and must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "cheerio", "undici"],
  poweredByHeader: false,
  webpack(config, { isServer, webpack }) {
    // pptxgenjs builds decks in the browser. Its ES build still names Node's
    // fs and https (for server use) with the node: scheme, which webpack
    // rejects before it reads the package's "browser" field mapping them to
    // nothing. Dropping the scheme lets that mapping apply.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(fs|https)$/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, https: false };
    }
    return config;
  },
  experimental: {
    // Requests pass through middleware, which buffers at most 10 MB by default
    // and silently truncates anything larger. Allow the largest upload the app
    // accepts (sources and music tracks), plus room for multipart overhead.
    middlewareClientMaxBodySize:
      Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024) + 1024 * 1024,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
