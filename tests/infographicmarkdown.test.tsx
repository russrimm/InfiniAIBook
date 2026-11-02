import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Infographic from "@/components/Infographic";
import { STYLE_ORDER, isImageStyle } from "@/lib/infographic";
import {
  cleanInfographic,
  normalizeInfographic,
  stripEmphasis,
} from "@/lib/infographicNormalize";
import { SAMPLE_CITATIONS, sampleInfographic } from "@/lib/infographicSamples";
import type { InfographicContent } from "@/lib/types";

/** Keys that hold identifiers or emoji rather than text a reader sees. */
const NOT_TEXT = new Set(["style", "accent", "icon", "metaphor", "orientation", "detail_level"]);

/** The same content with every text field wrapped the way the model sometimes does. */
function shout(content: InfographicContent): InfographicContent {
  return JSON.parse(JSON.stringify(content), (key, value) =>
    typeof value === "string" && !NOT_TEXT.has(key) && value.trim() ? `**${value}**` : value
  ) as InfographicContent;
}

describe("stripEmphasis", () => {
  it("unwraps bold, italic and code", () => {
    expect(stripEmphasis("**Confirm the lease**")).toBe("Confirm the lease");
    expect(stripEmphasis("Pay **half** now and **half** later")).toBe("Pay half now and half later");
    expect(stripEmphasis("*Why* it matters")).toBe("Why it matters");
    expect(stripEmphasis("Run `npm start` first")).toBe("Run npm start first");
  });

  it("drops a stray bold marker without eating the text", () => {
    expect(stripEmphasis("Dangling ** marker")).not.toContain("**");
    expect(stripEmphasis("Dangling ** marker")).toContain("marker");
  });

  it("leaves real asterisks and underscores alone", () => {
    expect(stripEmphasis("5 * 3 * 2 = 30")).toBe("5 * 3 * 2 = 30");
    expect(stripEmphasis("call __init__ then snake_case_name")).toBe("call __init__ then snake_case_name");
    expect(stripEmphasis("a*b*c")).toBe("a*b*c");
    expect(stripEmphasis("Revenue grew 12%*")).toBe("Revenue grew 12%*");
  });

  it("keeps citation markers, which the layouts turn into pills", () => {
    expect(stripEmphasis("**Secure water** [2][3]")).toBe("Secure water [2][3]");
  });
});

describe("normalizeInfographic", () => {
  it("strips markers from every text field it keeps", () => {
    const c = normalizeInfographic({
      title: "**Garden**",
      subtitle: "*A* pilot",
      stats: [{ value: "**24**", label: "**beds**", caption: "Built [1]" }],
      sections: [{ heading: "**The plan**", icon: "🌱", bullets: ["**One** bed each [1]"] }],
      checklist: [{ title: "**Confirm the lease**", detail: "Do **it** now [1]" }],
      compare: {
        aLabel: "**Hand**",
        bLabel: "**Drip**",
        rows: [{ feature: "**Cost**", a: "**None**", b: "$640" }],
        verdict: "**Drip** wins",
      },
      terms: [{ term: "**Bed**", definition: "A *framed* box" }],
    });
    expect(JSON.stringify(c)).not.toContain("**");
    expect(c.checklist?.[0]).toEqual({ title: "Confirm the lease", detail: "Do it now [1]" });
    expect(c.compare?.rows[0].feature).toBe("Cost");
    expect(c.terms?.[0].definition).toBe("A framed box");
  });
});

describe("cleanInfographic", () => {
  it("cleans stored content but not identifiers or citation evidence", () => {
    const stored = {
      ...shout(sampleInfographic("checklist")),
      style: "checklist",
      accent: "emerald",
      citations: [{ n: 1, sourceId: "s", sourceTitle: "T", part: 0, snippet: "keep **this** as written" }],
    } as unknown as InfographicContent & { citations: unknown[] };
    const clean = cleanInfographic(stored);
    expect(clean.style).toBe("checklist");
    expect(clean.accent).toBe("emerald");
    expect(clean.checklist?.[0].title).not.toContain("**");
    expect(clean.citations[0]).toEqual(stored.citations[0]);
    // The input is not mutated.
    expect(stored.checklist?.[0].title).toContain("**");
  });
});

describe("rendering stored content that still has markers", () => {
  const htmlStyles = STYLE_ORDER.filter((s) => !isImageStyle(s));

  it.each(htmlStyles)("%s shows no literal ** in any layout field", (style) => {
    const sample = sampleInfographic(style);
    const html = renderToStaticMarkup(
      <Infographic content={shout(sample)} citations={SAMPLE_CITATIONS} />
    );
    expect(html, style).not.toContain("**");
    // The text itself is still there, only the markers are gone.
    expect(html, style).toContain(sample.title.replace(/&/g, "&amp;"));
  });
});

describe("process flow with fewer sections than stages", () => {
  it("prints an unmatched stage once instead of repeating it", () => {
    const c: InfographicContent = {
      ...sampleInfographic("process"),
      style: "process",
      flow: ["Build beds", "Plant", "Review harvest"],
      sections: [{ heading: "Build beds", icon: "🔨", bullets: ["Volunteers assemble 24 beds [1]"] }],
    };
    const html = renderToStaticMarkup(<Infographic content={c} citations={SAMPLE_CITATIONS} />);
    expect(html.match(/Review harvest/g)).toHaveLength(1);
  });
});
