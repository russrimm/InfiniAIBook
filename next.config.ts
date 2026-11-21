import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Shown in the About dialog; package.json is the one place the version lives.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

/**
 * Content Security Policy, enforced. Remote images and connections are refused
 * so injected Markdown cannot beacon out. Live discussions still need the
 * realtime host, which the browser reaches by WebRTC after the server
 * exchanges SDP.
 *
 * - img-src / media-src: own routes plus data: and blob: (PNG export, voice
 *   previews). Remote images in your own notes do not load.
 * - frame-src: the in-app browser frames arbitrary http(s) pages. This app's
 *   own origin is refused before the iframe is created.
 * - script-src 'unsafe-inline': Next's inline bootstrap; 'unsafe-eval' only in
 *   development, for React Refresh.
 */
const connectSrc = [
  "'self'",
  "https://*.openai.azure.com",
  "wss://*.openai.azure.com",
  "https://*.cognitiveservices.azure.com",
  "wss://*.cognitiveservices.azure.com",
  // Speech SDK sockets for live avatars (the WebRTC media itself is not governed by CSP).
  "https://*.tts.speech.microsoft.com",
  "wss://*.tts.speech.microsoft.com",
  "https://api.openai.com",
  "wss://api.openai.com",
  ...(dev ? ["ws:", "wss:"] : []),
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-src http: https:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Enforced now: the app never frames itself, so clickjacking protection
  // costs nothing.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Source links open third-party sites; they need not learn notebook URLs.
  { key: "Referrer-Policy", value: "no-referrer" },
  // Browser features this app never uses stay off, for it and for the pages it
  // frames. The microphone (live discussion) and screen capture (Screen helper,
  // training visuals) are the only ones it asks for, and only for itself.
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self), display-capture=(self)",
  },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/**
 * HSTS only where the browser reached the app over HTTPS: behind a
 * TLS-terminating proxy that says so (TRUST_PROXY deployments, such as the
 * Azure Container App). Plain-HTTP localhost never gets it, so it cannot pin
 * a development host to HTTPS. No includeSubDomains or preload.
 */
const hstsHeaders = [{ key: "Strict-Transport-Security", value: "max-age=31536000" }];

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // The Docker image builds a self-contained server; local installs keep the
  // default output so `npm start` behaves as before.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  // These rely on Node built-ins / dynamic requires and must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "cheerio", "undici", "@azure/identity"],
  poweredByHeader: false,
  // Turbopack traces data-directory paths built from process.cwd() as if they
  // reached the whole project, which would copy docs, promo videos and tests
  // into the standalone image. The runtime needs none of them; the Dockerfile
  // copies the renderer scripts itself.
  outputFileTracingExcludes: {
    "*": ["./docs/**", "./promo/**", "./tests/**", "./infra/**", "./e2e/**", "./skills/**", "./.next/cache/**"],
  },
  experimental: {
    // Requests pass through the proxy (src/proxy.ts), which buffers at most 10 MB by default
    // and silently truncates anything larger. Allow the largest body the app
    // accepts — an upload, a music track, or a 200 MB notebook import — plus
    // room for multipart overhead.
    proxyClientMaxBodySize:
      Math.max(Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024), 200 * 1024 * 1024) +
      1024 * 1024,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: hstsHeaders,
      },
    ];
  },
};

export default nextConfig;
