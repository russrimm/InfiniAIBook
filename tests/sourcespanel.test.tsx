import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import SourcesPanel from "@/components/SourcesPanel";
import type { Source } from "@/lib/types";

const noop = () => {};
const source: Source = {
  id: "field-notes",
  notebookId: "notebook",
  title: "Field notes",
  kind: "text",
  url: null,
  chars: 500,
  summary: "Plants use light to make energy. This synopsis stays readable in full.",
  createdAt: 0,
};

function render(sources = [source], adding = false) {
  return load(renderToStaticMarkup(
    <SourcesPanel
      notebookId="notebook"
      sources={sources}
      selected={new Set([source.id])}
      allSelected
      onToggle={noop}
      onToggleAll={noop}
      onOpen={noop}
      onRemove={noop}
      onChanged={noop}
      onDiscover={noop}
      onLearn={noop}
      onBrowse={noop}
      onLibrary={noop}
      addRef={{ current: null }}
      pinned={false}
      adding={adding}
      onToggleAdding={noop}
      onTogglePin={noop}
      onClose={noop}
    />
  ));
}

describe("SourcesPanel synopses", () => {
  it("shows full stored synopses without a line clamp", () => {
    const $ = render();
    const synopsis = $("#source-list p").filter((_, el) => $(el).text() === source.summary);
    expect(synopsis).toHaveLength(1);
    expect(synopsis.attr("class")).not.toContain("line-clamp");
    expect($("#source-list").attr("aria-label")).toBe("Source synopses");
  });

  it("explicitly identifies a missing synopsis", () => {
    const $ = render([{ ...source, summary: null }]);
    expect($("#source-list").text()).toContain("No synopsis available.");
    expect($("#source-list button").first().text()).toContain(source.title);
  });

  it("folds upload tools in the list view and expands them in the add view", () => {
    expect(render()("#source-add-tools").attr("hidden")).toBeDefined();
    expect(render([source], true)("#source-add-tools").attr("hidden")).toBeUndefined();
  });
});
