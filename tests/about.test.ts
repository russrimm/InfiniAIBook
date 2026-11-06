import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { MIT_LICENSE } from "@/lib/about";
import { STUDIO } from "@/lib/studio";
import { MODES } from "@/lib/discussion";
import { JSON_KINDS, TABLE_KINDS, XML_KINDS } from "@/lib/explorekinds";
import AboutModal from "@/components/AboutModal";

const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();
const $ = load(renderToStaticMarkup(createElement(AboutModal, { onClose: () => {} })));
const help = $('section[aria-labelledby="help-title"]');
const topic = (title: string) =>
  help.find("details").filter((_, el) => $(el).find("summary").text() === title);

describe("about metadata", () => {
  it("keeps the embedded MIT license in sync with LICENSE", () => {
    const license = readFileSync("LICENSE", "utf8");
    expect(normalize(MIT_LICENSE)).toBe(normalize(license));
  });
});

describe("Help and about", () => {
  it("links only the exact requested author name, with the title adjacent", () => {
    const author = $('a[href="mailto:russ@russ.net"]');
    expect(author).toHaveLength(1);
    expect(author.text()).toBe("Russ RImmerman");
    expect(author.parent().text().replace(/\s+/g, " ").trim())
      .toBe("Russ RImmerman, Principal Microsoft Cloud Solution Architect");
    expect($("body").text()).not.toContain("Created by");
    expect($("body").text()).toContain("does not imply Microsoft sponsorship or endorsement");
  });

  it("renders the entire unchanged MIT notice, including permission and AS IS liability terms", () => {
    const license = $('[data-testid="mit-license"]');
    expect(normalize(license.text())).toBe(normalize(readFileSync("LICENSE", "utf8")));
    expect(license.closest("details").attr("open")).toBeDefined();
    expect(license.text()).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(license.text()).toContain("IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE");
    expect(license.text()).toContain("Copyright (c) 2026 Russ Rimmerman");
  });

  it("keeps open-source inspiration and third-party licenses distinct from MIT", () => {
    const notices = $('section[aria-labelledby="open-source-title"]');
    expect(notices.find('a[href="https://github.com/lfnovo/open-notebook"]').text())
      .toBe("open-notebook");
    expect(notices.text()).toContain("MIT License does not replace them");
    expect(notices.text()).toContain("Copyright 2025, GreenSock. All rights reserved.");
    expect(notices.find('a[href="https://gsap.com/standard-license/"]').text())
      .toBe("GSAP standard license");
    expect(notices.text()).toContain("license does not grant rights to them");
  });

  it("groups discoverable topics in the existing labeled dialog", () => {
    const dialog = $('[role="dialog"]');
    expect(dialog.attr("aria-modal")).toBe("true");
    expect(dialog.attr("aria-labelledby")).toBe("about-title");
    expect(dialog.attr("tabindex")).toBe("-1");
    expect(help.find("section")).toHaveLength(5);
    expect(help.find("details")).toHaveLength(28);
    expect(help.find("details[open]")).toHaveLength(1);
    for (const link of $('nav[aria-label="Help topics"] a').toArray()) {
      const target = $(link).attr("href")!;
      expect($(target), target).toHaveLength(1);
    }
    const titles = help.find("summary").map((_, el) => $(el).text()).get();
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(Object.entries(STUDIO))("covers the shipped %s format by its actual label", (_, spec) => {
    expect(help.text()).toContain(spec.label);
  });

  it.each(Object.values(MODES))("covers the $label discussion mode", (mode) => {
    expect(topic("Live discussion").text()).toContain(mode.label);
  });

  it.each([...JSON_KINDS, ...TABLE_KINDS, ...XML_KINDS])(
    "makes the shipped %s structure-explorer kind discoverable", (kind) => {
      expect(topic("Read sources and explore structured data").text().toLowerCase()).toContain(kind);
    },
  );

  it.each([
    ["Create, rename and delete notebooks", ["Notebook title", "Delete notebook", "Undo for 8 seconds"]],
    ["Export and import a notebook", ["Export", "Import a notebook", "new, independent notebook", "not a full server backup"]],
    ["Find panels, getting-started steps and display settings", ["Pin", "Choose sources", "Auto (system)", "Reduced motion"]],
    ["Upload files, add links or paste text", ["Add link", "Paste text", "PDF", "DOCX", "PPTX", "CSV/TSV", "JSON", "HAR", "GPX/KML", "RSS/Atom", "vision model", "transcription model", "Queued"]],
    ["YouTube transcripts and import problems", ["GEMINI_API_KEY", "YOUTUBE_API_KEY", "description only", "Paste text"]],
    ["Search web and Browse web", ["Discover sources", "Add sources", "may block import", "Bing", "Tavily", "Brave", "Google", "reader view", "Add again"]],
    ["Import Microsoft Learn pages", ["full pages", "saved sources", "No additional API key", "linked-source updates"]],
    ["Use live Microsoft Learn in chat", ["off by default", "per notebook", "do not create notebook sources", "exact excerpt", "saved notes", "not Studio", "Import pages explicitly"]],
    ["Reuse, select and update saved sources", ["From other notebooks", "Deselect all", "automatically", "all notebook notes", "Re-index", "Keep current", "Decide later"]],
    ["Read sources and explore structured data", ["Explore structure", "Columns and Rows", "Waterfall", "Server timing", "Redirect chains", "Sanitized HAR", "Diagnose with AI", "redacted digest"]],
    ["Ask, stop and manage chat sessions", ["Stop", "partial answer", "Save to notes", "Chat picker", "Rename this chat", "Delete this chat"]],
    ["Write notes and run transformations", ["Markdown", "Ctrl+S", "Preview", "Add as source", "Transformations", "Apply → note"]],
    ["Search and Ask across notebooks", ["Keyword", "Semantic", "Only this notebook", "does not retrieve live Microsoft Learn"]],
    ["Create, Library and artifact exports", ["Create", "Library", "Options", "Generate", "Focus", "Markdown", "PNG", "PPTX", "CSV", "MP3", "MP4"]],
    ["PowerPoint deck", ["Theme", "Deck length", "speaker notes", "PPTX"]],
    ["Infographic styles and suggestions", ["style gallery", "layout sketches", "Orientation", "Level of detail", "Illustrated"]],
    ["Mind map", ["Length", "collapsed", "Expand all", "Collapse all", "visible map"]],
    ["Quiz and Flashcards", ["Level", "Length", "retry missed", "Space", "Missed it", "Got it", "Shuffle", "Browse all", "Anki/Quizlet"]],
    ["Audio and video: review scripts before rendering", ["editable scripts", "Narrate", "Render video", "Script tab", "Always replace", "Save as notebook default", "Music", "Mark"]],
    ["Audio overview", ["Audio profile", "one to four", "Speaking speed", "Fixed voices", "Jump to topic", "MP3"]],
    ["Whiteboard video and Motion explainer", ["Custom scene count", "Tone", "Audience", "Look", "Colors", "Character", "Motion", "Closing", "Quality", "Reset", "redraws artwork"]],
    ["Training video: presenter, script and live preview", ["all notebook notes", "Presenter voice", "Compare presenters", "Body language", "Preview live (VASA-2)", "not recorded", "Recompose video"]],
    ["Training visuals, design, animation and preview", ["Plan all visuals again", "Plan this section", "Add visual at selected words", "Microsoft Learn", "Retime", "speech synthesis", "Animation", "WebVTT", "Logo"]],
    ["Live discussion", ["Where's that from?", "Hint", "Skip", "Rate my argument", "Save to notes", "realtime voice model", "does not use live Microsoft Learn"]],
    ["Screen helper", ["Share screen & ask", "cannot click or type", "Auto-watch is off by default", "Read steps aloud", "Stop sharing", "Save as note", "Hide secrets"]],
    ["Models, optional services and spend", ["Generation model", "Embedding model", "Image model", "Image reading", "Reset to defaults", "not just this notebook", "re-embedded", "DAILY_BUDGET_USD"]],
    ["Data, password protection and responsible use", ["DATA_DIR", "INFINIAIBOOK_PASSWORD", "Sign out", "SECURITY.md", "AI output can be wrong"]],
  ])("keeps the %s workflow actionable and current", (title, controls) => {
    const content = topic(title);
    expect(content, title).toHaveLength(1);
    for (const control of controls) expect(content.text(), `${title}: ${control}`).toContain(control);
  });

  it("links every topic to an existing documentation page and heading", () => {
    const links = help.find("details a");
    expect(links).toHaveLength(help.find("details").length);
    for (const link of links.toArray()) {
      const url = new URL($(link).attr("href")!);
      expect(url.origin).toBe("https://github.com");
      expect(url.pathname).toMatch(/^\/russrimm\/InfiniAIBook\/blob\/main\/docs\/[^/]+\.md$/);
      expect($(link).attr("rel")).toBe("noopener noreferrer");
      const document = readFileSync(path.join("docs", path.basename(url.pathname)), "utf8");
      if (url.hash) {
        const slugs = [...document.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
          match[1].toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, "").replace(/ /g, "-"),
        );
        expect(slugs, url.href).toContain(url.hash.slice(1));
      }
    }
  });

  it("does not describe the parent's unshipped search provider", () => {
    expect(help.text()).not.toContain("WebIQ");
  });
});
