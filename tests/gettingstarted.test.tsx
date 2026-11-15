import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GettingStarted from "@/components/GettingStarted";

const noop = () => {};

function render(sourceCount: number, selectedCount: number) {
  return renderToStaticMarkup(
    <GettingStarted
      sourceCount={sourceCount}
      selectedCount={selectedCount}
      onAddSources={noop}
      onChooseSources={noop}
      onUseAll={noop}
      onOpenStudio={noop}
    />
  );
}

/** The text of the rail button that is marked as the current step. */
function currentStep(html: string) {
  const match = html.match(/<button[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/button>/);
  return match ? match[1].replace(/<[^>]+>/g, "") : "";
}

/** The button labelled `name` in the step card, or null. */
function button(html: string, name: RegExp) {
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (name.test(m[2].replace(/<[^>]+>/g, "").trim()) || name.test(m[1])) return m[1];
  }
  return null;
}

describe("GettingStarted stepper", () => {
  it("starts on Add sources in an empty notebook, with Back unavailable", () => {
    const html = render(0, 0);
    expect(html).toContain('aria-label="Getting started"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(currentStep(html)).toContain("Add sources");
    expect(currentStep(html)).toContain("None yet");
    expect(html).toContain('aria-label="Step 1 of 3: Add sources"');
    expect(button(html, /Back$/)).toContain("disabled");
    // The one lit button is the thing to do, not Next.
    expect(button(html, /^Add sources$/)).toContain("btn-primary");
    expect(button(html, /Next: Choose sources/)).not.toContain("btn-primary");
    expect(html).not.toContain("step-check");
  });

  it("moves to Choose sources once a source exists", () => {
    const html = render(3, 0);
    expect(currentStep(html)).toContain("Choose sources");
    expect(currentStep(html)).toContain("0 of 3 in use");
    expect(html).toContain('aria-label="Step 2 of 3: Choose which sources to use"');
    expect(button(html, /^Use all sources$/)).toContain("btn-primary");
    expect(button(html, /Choose in Sources/)).toContain('aria-controls="sources-panel"');
    expect(html.match(/step-check/g)).toHaveLength(1);
  });

  it("offers Open Studio, and no Next, once sources are chosen", () => {
    const html = render(3, 2);
    expect(currentStep(html)).toContain("Open Studio");
    expect(currentStep(html)).toContain("Ready");
    expect(html).toContain('aria-label="Step 3 of 3: Ask or create"');
    expect(button(html, /^Open Studio$/)).toContain("btn-primary");
    expect(button(html, /^Next/)).toBeNull();
    expect(html.match(/step-check/g)).toHaveLength(2);
    // Steps one and two live in the Sources panel; Back to them must keep it open.
    expect(button(html, /Back to Choose sources/)).toContain("data-keeps-sources-open");
  });
});
