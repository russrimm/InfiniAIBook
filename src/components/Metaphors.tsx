"use client";

/**
 * Visual metaphors for the illustrated infographic style.
 *
 * Hand-drawn SVG rather than generated artwork: it stays crisp at any size,
 * never misspells a label, adds nothing to page weight, and can be tinted to
 * match the surrounding section. Shapes follow one language — navy outlines,
 * rounded geometry, flat fills with a single soft accent.
 */

import { METAPHOR_KEYS, type MetaphorKey } from "@/lib/metaphors";

export { METAPHOR_KEYS, METAPHOR_HINTS } from "@/lib/metaphors";
export type { MetaphorKey } from "@/lib/metaphors";

const NAVY = "#13294b";

type Props = { metaphor: string; accent: string; soft: string; size?: number };

/**
 * Renders one metaphor. `accent` is the section's colour and `soft` a pale
 * companion, so a concept visually belongs to its region.
 */
export default function Metaphor({ metaphor, accent, soft, size = 64 }: Props) {
  const key = (METAPHOR_KEYS as string[]).includes(metaphor)
    ? (metaphor as MetaphorKey)
    : "lightbulb";

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: NAVY,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (key) {
    case "scale":
      return (
        <svg {...common}>
          <path d="M24 8v30M14 38h20" />
          <path d="M8 16h32M24 8l-16 8M24 8l16 8" />
          <path d="M3 16l5 10 5-10z" fill={soft} />
          <path d="M35 16l5 10 5-10z" fill={accent} />
        </svg>
      );
    case "gauge":
      return (
        <svg {...common}>
          <path d="M6 34a18 18 0 0 1 36 0" fill={soft} />
          <path d="M6 34a18 18 0 0 1 36 0" />
          <path d="M24 34L34 20" stroke={accent} strokeWidth="3" />
          <circle cx="24" cy="34" r="3.5" fill={accent} />
          <path d="M10 30l3 1M24 16v3M38 30l-3 1" />
        </svg>
      );
    case "pipe":
      return (
        <svg {...common}>
          <path d="M6 18h12a6 6 0 0 1 6 6v0a6 6 0 0 0 6 6h12" strokeWidth="5" stroke={soft} />
          <path d="M6 18h12a6 6 0 0 1 6 6v0a6 6 0 0 0 6 6h12" />
          <circle cx="14" cy="18" r="2.6" fill={accent} stroke="none" />
          <circle cx="24" cy="24" r="2.6" fill={accent} stroke="none" />
          <circle cx="36" cy="30" r="2.6" fill={accent} stroke="none" />
        </svg>
      );
    case "cables":
      return (
        <svg {...common}>
          <rect x="4" y="19" width="11" height="10" rx="3" fill={soft} />
          <path d="M15 24h7M22 24c6 0 6-12 12-12M22 24c6 0 6 12 12 12M22 24h12" />
          <circle cx="37" cy="12" r="4" fill={accent} />
          <circle cx="37" cy="24" r="4" fill={soft} />
          <circle cx="37" cy="36" r="4" fill={accent} />
        </svg>
      );
    case "coins":
      return (
        <svg {...common}>
          <ellipse cx="24" cy="13" rx="13" ry="5" fill={accent} />
          <path d="M11 13v8c0 2.8 5.8 5 13 5s13-2.2 13-5v-8" fill={soft} />
          <path d="M11 13v8c0 2.8 5.8 5 13 5s13-2.2 13-5v-8" />
          <path d="M11 21v8c0 2.8 5.8 5 13 5s13-2.2 13-5v-8" fill={soft} />
          <path d="M11 21v8c0 2.8 5.8 5 13 5s13-2.2 13-5v-8" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...common}>
          <rect x="10" y="5" width="28" height="38" rx="4" fill={soft} />
          <rect x="15" y="11" width="18" height="7" rx="2" fill="#fff" />
          <circle cx="17" cy="25" r="2.2" fill={accent} stroke="none" />
          <circle cx="24" cy="25" r="2.2" fill={NAVY} stroke="none" />
          <circle cx="31" cy="25" r="2.2" fill={NAVY} stroke="none" />
          <circle cx="17" cy="33" r="2.2" fill={NAVY} stroke="none" />
          <circle cx="24" cy="33" r="2.2" fill={NAVY} stroke="none" />
          <circle cx="31" cy="33" r="2.2" fill={accent} stroke="none" />
        </svg>
      );
    case "gears":
      return (
        <svg {...common}>
          <circle cx="19" cy="19" r="8" fill={soft} />
          <circle cx="19" cy="19" r="3" />
          <path d="M19 7v4M19 27v4M7 19h4M27 19h4M11 11l3 3M27 27l-3-3M27 11l-3 3M11 27l3-3" />
          <circle cx="34" cy="33" r="6" fill={accent} />
          <circle cx="34" cy="33" r="2.2" fill="#fff" stroke="none" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M24 5l15 6v11c0 10-6.5 17-15 21-8.5-4-15-11-15-21V11z" fill={soft} />
          <path d="M24 5l15 6v11c0 10-6.5 17-15 21-8.5-4-15-11-15-21V11z" />
          <path d="M17 24l5 5 10-11" stroke={accent} strokeWidth="3.2" />
        </svg>
      );
    case "funnel":
      return (
        <svg {...common}>
          <path d="M5 8h38L28 26v14l-8-5V26z" fill={soft} />
          <path d="M5 8h38L28 26v14l-8-5V26z" />
          <circle cx="12" cy="14" r="2" fill={accent} stroke="none" />
          <circle cx="24" cy="14" r="2" fill={accent} stroke="none" />
          <circle cx="36" cy="14" r="2" fill={accent} stroke="none" />
        </svg>
      );
    case "roadmap":
      return (
        <svg {...common}>
          <path d="M6 38c8 0 4-12 12-12s6 12 14 12 10-8 10-8" strokeWidth="5" stroke={soft} />
          <path d="M6 38c8 0 4-12 12-12s6 12 14 12 10-8 10-8" strokeDasharray="4 4" />
          <circle cx="6" cy="38" r="3.5" fill={accent} />
          <path d="M38 22a4 4 0 1 1 4 4c0 2-4 5-4 5s-4-3-4-5a4 4 0 0 1 4-4z" fill={accent} />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="17" fill={soft} />
          <circle cx="24" cy="24" r="17" />
          <path d="M24 13v11l8 5" stroke={accent} strokeWidth="3" />
        </svg>
      );
    case "growth":
      return (
        <svg {...common}>
          <path d="M6 40h36" />
          <rect x="10" y="28" width="7" height="12" rx="2" fill={soft} />
          <rect x="21" y="20" width="7" height="20" rx="2" fill={soft} />
          <rect x="32" y="10" width="7" height="30" rx="2" fill={accent} />
          <path d="M10 24l11-8 7 5 11-12" stroke={accent} strokeWidth="2.6" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M24 6l19 33H5z" fill={soft} />
          <path d="M24 6l19 33H5z" />
          <path d="M24 18v10" stroke={accent} strokeWidth="3.4" />
          <circle cx="24" cy="33" r="2.1" fill={accent} stroke="none" />
        </svg>
      );
    case "lightbulb":
      return (
        <svg {...common}>
          <path d="M24 5a13 13 0 0 1 8 23.3V33H16v-4.7A13 13 0 0 1 24 5z" fill={soft} />
          <path d="M24 5a13 13 0 0 1 8 23.3V33H16v-4.7A13 13 0 0 1 24 5z" />
          <path d="M17 37h14M19 42h10" stroke={accent} strokeWidth="2.8" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M24 6l18 9-18 9-18-9z" fill={accent} />
          <path d="M6 24l18 9 18-9" fill={soft} />
          <path d="M6 24l18 9 18-9" />
          <path d="M6 32l18 9 18-9" />
        </svg>
      );
    case "network":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="6" fill={accent} />
          <circle cx="8" cy="11" r="4" fill={soft} />
          <circle cx="40" cy="11" r="4" fill={soft} />
          <circle cx="8" cy="37" r="4" fill={soft} />
          <circle cx="40" cy="37" r="4" fill={soft} />
          <path d="M12 13l7 7M36 13l-7 7M12 35l7-7M36 35l-7-7" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M11 5h17l9 9v29H11z" fill={soft} />
          <path d="M11 5h17l9 9v29H11z" />
          <path d="M28 5v9h9" />
          <path d="M17 24h14M17 31h14M17 38h8" stroke={accent} strokeWidth="2.4" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="17" fill={soft} />
          <circle cx="24" cy="24" r="17" />
          <circle cx="24" cy="24" r="10" />
          <circle cx="24" cy="24" r="3.4" fill={accent} stroke="none" />
          <path d="M24 7V2M24 46v-5M7 24H2M46 24h-5" stroke={accent} strokeWidth="2.4" />
        </svg>
      );
  }
}
