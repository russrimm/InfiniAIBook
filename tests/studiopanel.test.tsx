import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import StudioPanel from "@/components/StudioPanel";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import OverflowMenu from "@/components/OverflowMenu";
import GettingStarted from "@/components/GettingStarted";
import {
  STUDIO,
  STUDIO_ORDER,
  STUDIO_SECTIONS,
  STUDIO_SPOKEN_GROUPS,
  studioMatches,
} from "@/lib/studio";
import type { ArtifactType } from "@/lib/types";

const noop = () => {};

function renderStudio(hasSources: boolean, selectedIds: string[]) {
  return load(
    renderToStaticMarkup(
      <ConfirmProvider>
        <StudioPanel
          notebookId="notebook"
          hasSources={hasSources}
          selectedIds={selectedIds}
          artifacts={[]}
          onOpen={noop}
          openingId={null}
          onRemove={noop}
          onChanged={noop}
          onDiscuss={noop}
          onShowSources={noop}
        />
      </ConfirmProvider>,
    ),
  );
}

describe("Studio grouping", () => {
  it("places every generator in exactly one group", () => {
    const grouped = [
      ...STUDIO_SPOKEN_GROUPS.flatMap((g) => g.items),
      ...STUDIO_SECTIONS.flatMap((s) => s.types),
    ].filter((id) => id !== "discussion");
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(new Set<string>(grouped)).toEqual(new Set(Object.keys(STUDIO)));
    expect(new Set<ArtifactType>(STUDIO_ORDER).size).toBe(STUDIO_ORDER.length);
  });

  it("matches on label, purpose, keywords and group name, with every word required", () => {
    expect(studioMatches("", "quiz")).toBe(true);
    expect(studioMatches("powerpoint", "slides")).toBe(true);
    expect(studioMatches("anki", "flashcards")).toBe(true);
    expect(studioMatches("watch", "training", "Watch")).toBe(true);
    expect(studioMatches("video narrated", "video")).toBe(true);
    expect(studioMatches("video quiz", "video")).toBe(false);
    expect(studioMatches("zzz", "report")).toBe(false);
  });

  it("renders collapsible categories that each name their formats", () => {
    const $ = renderStudio(true, ["a"]);
    const headings = $("section[data-testid^='studio-group-'] h3 button")
      .map((_, el) => $(el).find("span").eq(1).text())
      .get();
    expect(headings).toEqual(["Listen", "Watch", "Read", "Visualize", "Study"]);
    $("section[data-testid^='studio-group-'] h3 button").each((_, el) => {
      expect($(el).attr("aria-expanded")).toBe("true");
      expect($(`#${$(el).attr("aria-controls")}`)).toHaveLength(1);
    });
    expect($("#studio-filter").attr("type")).toBe("search");
    expect($("label[for='studio-filter']").text()).toContain("Filter");
  });
});

describe("Studio with nothing to generate from", () => {
  it("explains why Generate is off and points every disabled button at the reason", () => {
    const $ = renderStudio(false, []);
    const reason = $("#studio-blocked-reason");
    expect(reason.text()).toContain("no sources yet");
    expect(reason.find("button").text()).toBe("Add sources");

    const generate = $("button[aria-label^='Generate ']");
    expect(generate.length).toBeGreaterThanOrEqual(14);
    generate.each((_, el) => {
      expect($(el).attr("aria-describedby")).toBe("studio-blocked-reason");
    });
    const live = $("button").filter((_, el) => $(el).text().includes("Live discussion"));
    expect(live.attr("aria-describedby")).toBe("studio-blocked-reason");
  });

  it("asks for a ticked source when sources exist but none is chosen", () => {
    const $ = renderStudio(true, []);
    expect($("#studio-blocked-reason").text()).toContain("no source is ticked");
    expect($("#studio-blocked-reason button").text()).toBe("Choose sources");
  });

  it("drops the reason and the description once a source is ticked", () => {
    const $ = renderStudio(true, ["a"]);
    expect($("#studio-blocked-reason")).toHaveLength(0);
    expect($("button[aria-describedby]")).toHaveLength(0);
    // Video clips stay off until a video model is configured, whatever is ticked.
    expect($("button[aria-label^='Generate ']:disabled").not("[aria-label='Generate Video clip']")).toHaveLength(0);
  });
});

describe("OverflowMenu", () => {
  it("renders a named, closed menu button", () => {
    const $ = load(
      renderToStaticMarkup(
        <OverflowMenu items={[{ key: "a", label: "Action", icon: null, onSelect: noop }]} />,
      ),
    );
    const trigger = $("button");
    expect(trigger.attr("aria-label")).toBe("More actions");
    expect(trigger.attr("title")).toBe("More actions");
    expect(trigger.attr("aria-haspopup")).toBe("menu");
    expect(trigger.attr("aria-expanded")).toBe("false");
    expect($("[role='menu']")).toHaveLength(0);
  });
});

describe("Getting started on wide screens", () => {
  it("hides the Open Studio button while Studio is already beside Chat", () => {
    const html = renderToStaticMarkup(
      <GettingStarted
        sourceCount={1}
        selectedCount={1}
        onAddSources={noop}
        onChooseSources={noop}
        onUseAll={noop}
        onOpenStudio={noop}
      />,
    );
    const button = load(html)("button").filter((_, el) => load(html)(el).text().trim() === "Open Studio");
    const action = button.filter((_, el) => (el.attribs.class ?? "").includes("btn-primary"));
    expect(action.attr("class")).toContain("lg:in-data-[right-panel=studio]:hidden!");
  });
});
