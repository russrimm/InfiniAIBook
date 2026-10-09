import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InfiniAIBook",
    short_name: "InfiniAIBook",
    description: "A grounded research studio: chat with your own sources and generate reports, quizzes, mind maps and videos from them.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4a57e0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
