import { describe, expect, it } from "vitest";
import { caseVocabulary, casedCue, fixCase } from "@/lib/slidecase";
import { imageSize, keywords, parseLearnImages, parseLearnSearch, passageImages, rankLearnImages } from "@/lib/learnimages";
import {
  TRAINING_VISUALS_INSTRUCTION,
  cueNeedsPicture,
  normalizeCue,
  normalizeVisualPlan,
  type TrainingCue,
} from "@/lib/trainingvisuals";
import { composeVocabulary, rasterJobs } from "@/lib/trainingtimeline";
import { DEFAULT_COMPOSITION } from "@/lib/trainingvisuals";

const SCRIPT =
  "Welcome. Today you'll build agents in Copilot Studio and connect them to Azure AI Search. " +
  "Copilot Studio's agents use GitHub actions too. The agent answers from your data, and AI keeps it grounded. " +
  "Studio is where you start.";

describe("slide capitalization", () => {
  const vocab = caseVocabulary([SCRIPT]);

  it("learns names from how the script writes them mid-sentence", () => {
    expect(vocab.get("copilot")).toBe("Copilot");
    expect(vocab.get("azure")).toBe("Azure");
    expect(vocab.get("github")).toBe("GitHub");
    expect(vocab.get("ai")).toBe("AI");
    // Capitalized only at the start of a sentence: not a name.
    expect(vocab.has("welcome")).toBe(false);
    expect(vocab.has("today")).toBe(false);
    // Written lowercase more often than capitalized.
    expect(vocab.has("agents")).toBe(false);
  });

  it("restores names and starts with a capital, never lowering anything", () => {
    expect(fixCase("build agents in copilot studio", vocab)).toBe("Build agents in Copilot Studio");
    expect(fixCase("connect to azure ai search", vocab)).toBe("Connect to Azure AI Search");
    expect(fixCase("copilot's agents", vocab)).toBe("Copilot's agents");
    expect(fixCase("what i learned", vocab)).toBe("What I learned");
    expect(fixCase("68 percent of the budget", vocab)).toBe("68 percent of the budget");
    expect(fixCase("Keep MY Caps", vocab)).toBe("Keep MY Caps");
    expect(fixCase("“quoted start”", vocab)).toBe("“Quoted start”");
  });

  it("capitalizes every text field of a visual but not its anchors", () => {
    const c = casedCue(
      {
        title: "why azure matters",
        bullets: [{ text: "ground in your data", anchor: "the agent answers" }],
        stat: { value: "3x", label: "faster with copilot" },
        quote: { text: "start small", attribution: "the report" },
        question: "where do you start?",
        answer: "in copilot studio",
      },
      vocab
    );
    expect(c.title).toBe("Why Azure matters");
    expect(c.bullets).toEqual([{ text: "Ground in your data", anchor: "the agent answers" }]);
    expect(c.stat).toEqual({ value: "3x", label: "Faster with Copilot" });
    expect(c.quote).toEqual({ text: "Start small", attribution: "The report" });
    expect(c.question).toBe("Where do you start?");
    expect(c.answer).toBe("In Copilot Studio");
  });

  it("fixes the planner's lowercase slide text", () => {
    const [cues] = normalizeVisualPlan(
      {
        sections: [
          {
            section: 1,
            cues: [
              {
                kind: "bullets",
                anchor: "Today you'll build agents",
                title: "agents in copilot studio",
                bullets: [{ text: "connect azure ai search" }],
                imageQuery: "create agent Copilot Studio",
                imageId: "invented12345",
              },
            ],
          },
        ],
      },
      [{ text: SCRIPT }],
      { images: false, infographicIds: [] }
    );
    expect(cues[0].title).toBe("Agents in Copilot Studio");
    expect(cues[0].bullets?.[0].text).toBe("Connect Azure AI Search");
    expect(cues[0].anchor).toBe("Today you'll build agents");
    expect(cues[0].imageQuery).toBe("create agent Copilot Studio");
    // The model cannot point a visual at a stored picture.
    expect(cues[0].imageId).toBeUndefined();
  });

  it("redraws a visual when the script changes how a name is written", () => {
    const input = (text: string) => ({
      title: "Agents",
      objectives: [],
      composition: DEFAULT_COMPOSITION,
      sections: [
        {
          title: "One",
          text,
          cues: [{ id: "c1", kind: "bullets", anchor: "x", layout: "side-left", transition: "fade", title: "using copilot" } as TrainingCue],
        },
      ],
    });
    const a = rasterJobs(input("We use Copilot daily. Copilot helps."));
    const b = rasterJobs(input("We use copilot daily. Then copilot helps."));
    expect(composeVocabulary(input("We use Copilot daily.")).get("copilot")).toBe("Copilot");
    expect(a.find((j) => j.cueId)?.key).not.toBe(b.find((j) => j.cueId)?.key);
  });
});

describe("visual pictures", () => {
  it("asks the planner for screenshot searches, and illustrations only with images on", () => {
    const off = TRAINING_VISUALS_INSTRUCTION({ images: false, infographics: [] });
    expect(off).toMatch(/imageQuery/);
    expect(off).not.toMatch(/"imagePrompt"/);
    expect(off).toMatch(/Never write on-screen text in all\s+lowercase/);
    expect(TRAINING_VISUALS_INSTRUCTION({ images: true, infographics: [] })).toMatch(/"imagePrompt"/);
  });

  it("keeps a found picture's credit only alongside the picture", () => {
    const withPic = normalizeCue({
      kind: "bullets",
      title: "Hi",
      imageId: "abc123",
      imageCredit: "Microsoft Learn",
      imageSource: "https://learn.microsoft.com/media/x.png",
      imageQuery: "copilot studio",
    })!;
    expect(withPic.imageCredit).toBe("Microsoft Learn");
    expect(withPic.imageSource).toMatch(/^https:/);
    const noPic = normalizeCue({ kind: "bullets", title: "Hi", imageCredit: "Microsoft Learn" })!;
    expect(noPic.imageCredit).toBeUndefined();
    const badUrl = normalizeCue({ kind: "bullets", title: "Hi", imageId: "abc123", imageSource: "javascript:alert(1)" })!;
    expect(badUrl.imageSource).toBeUndefined();
  });

  it("knows which visuals still need a picture", () => {
    const base = { id: "a", anchor: "", layout: "side-left", transition: "fade" } as const;
    expect(cueNeedsPicture({ ...base, kind: "bullets", imageQuery: "x" })).toBe(true);
    expect(cueNeedsPicture({ ...base, kind: "stat", imagePrompt: "x" })).toBe(true);
    expect(cueNeedsPicture({ ...base, kind: "bullets", imageQuery: "x", imageId: "abc" })).toBe(false);
    expect(cueNeedsPicture({ ...base, kind: "bullets" })).toBe(false);
    expect(cueNeedsPicture({ ...base, kind: "infographic", imageQuery: "x" })).toBe(false);
  });
});

describe("Microsoft Learn screenshots", () => {
  const PAGE = "https://learn.microsoft.com/en-us/azure/azure-portal/azure-portal-dashboards";
  const HTML = `<html><head><title>Dashboards</title></head><body>
    <header><img src="/media/logos/logo-ms.png" alt="Microsoft logo in the header"></header>
    <main><h1>Create a dashboard in the Azure portal</h1>
      <img src="media/azure-portal-dashboards/portal-menu-dashboard.png" alt="Screenshot of the Azure portal with Dashboard selected.">
      <a href="media/azure-portal-dashboards/tile-gallery.png#lightbox"><img src="media/azure-portal-dashboards/tile-gallery-inline.png" alt="Screenshot of the Tile Gallery."></a>
      <img src="media/azure-portal-dashboards/dashboard-delete-icon.png" alt="delete icon">
      <img src="https://example.com/evil.png" alt="Screenshot of something elsewhere">
      <img src="media/azure-portal-dashboards/flow.svg" alt="Diagram showing the flow of data">
      <img src="media/azure-portal-dashboards/portal-menu-dashboard.png" alt="Screenshot of the Azure portal with Dashboard selected.">
    </main></body></html>`;

  it("keeps content screenshots on Learn, at lightbox size, once each", () => {
    const imgs = parseLearnImages(HTML, PAGE);
    expect(imgs.map((i) => i.src)).toEqual([
      "https://learn.microsoft.com/en-us/azure/azure-portal/media/azure-portal-dashboards/portal-menu-dashboard.png",
      "https://learn.microsoft.com/en-us/azure/azure-portal/media/azure-portal-dashboards/tile-gallery.png",
    ]);
    expect(imgs[0].pageTitle).toBe("Create a dashboard in the Azure portal");
  });

  it("ranks the screenshot whose description matches the search first", () => {
    const imgs = parseLearnImages(HTML, PAGE);
    expect(rankLearnImages(imgs, "add tile gallery dashboard")[0].alt).toMatch(/Tile Gallery/);
    expect(keywords("How to use the Azure portal")).toEqual(["azure", "portal"]);
  });

  it("reads the Learn MCP docs search and the screenshots in its passages", () => {
    const inner = JSON.stringify({
      results: [
        {
          title: "Import data wizard in the Azure portal",
          contentUrl: "https://learn.microsoft.com/azure/search/search-import-data-portal#start",
          content:
            "Go to your search service.\n ![Screenshot of the import wizard options.](https://learn.microsoft.com/azure/search/media/x/import-data-button.png)\n" +
            "![icon](https://learn.microsoft.com/media/y.png) ![Screenshot elsewhere.](https://evil.example/z.png)",
        },
        { title: "Elsewhere", contentUrl: "https://evil.example/page", content: "![Screenshot of a thing here](a.png)" },
      ],
    });
    const sse = `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: "text", text: inner }] } })}\n\n`;
    const passages = parseLearnSearch(sse);
    expect(passages).toHaveLength(1);
    expect(passages[0].url).toBe("https://learn.microsoft.com/azure/search/search-import-data-portal");
    expect(passageImages(passages)).toEqual([
      {
        src: "https://learn.microsoft.com/azure/search/media/x/import-data-button.png",
        alt: "Screenshot of the import wizard options.",
        page: "https://learn.microsoft.com/azure/search/search-import-data-portal",
        pageTitle: "Import data wizard in the Azure portal",
      },
    ]);
    expect(parseLearnSearch("not json")).toEqual([]);
  });

  it("reads picture sizes from PNG and JPEG headers", () => {
    const png = Buffer.alloc(32);
    png.writeUInt32BE(0x89504e47, 0);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(720, 20);
    expect(imageSize(png)).toEqual({ mime: "image/png", width: 1280, height: 720 });
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0x00, 0x00]);
    expect(imageSize(jpg)).toEqual({ mime: "image/jpeg", width: 1280, height: 720 });
    expect(imageSize(Buffer.from("not an image"))).toBeNull();
  });
});
