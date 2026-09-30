import type { Citation, Slide, SlideLayout, SlidesContent, SlideTheme, StudyLength } from "./types";

type SlideThemeSpec = {
  label: string;
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
};

type Loose = Record<string, unknown>;

export const SLIDE_THEMES: Record<SlideTheme, SlideThemeSpec> = {
  midnight: {
    label: "Midnight",
    colors: {
      background: "#0B1020",
      surface: "#111827",
      text: "#F8FAFC",
      muted: "#B6C2D1",
      accent: "#8B5CF6",
    },
    fonts: { heading: "Aptos Display", body: "Aptos" },
  },
  light: {
    label: "Light",
    colors: {
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#111827",
      muted: "#526070",
      accent: "#2563EB",
    },
    fonts: { heading: "Aptos Display", body: "Aptos" },
  },
  ocean: {
    label: "Ocean",
    colors: {
      background: "#062A3A",
      surface: "#0B3D4F",
      text: "#ECFEFF",
      muted: "#A7D8E6",
      accent: "#22D3EE",
    },
    fonts: { heading: "Aptos Display", body: "Aptos" },
  },
  sunset: {
    label: "Sunset",
    colors: {
      background: "#2A1021",
      surface: "#3A172C",
      text: "#FFF7ED",
      muted: "#F8CFAF",
      accent: "#FB923C",
    },
    fonts: { heading: "Aptos Display", body: "Aptos" },
  },
};

export const DEFAULT_SLIDE_THEME: SlideTheme = "midnight";

export const SLIDE_COUNT: Record<StudyLength, string> = {
  short: "6-8",
  standard: "10-12",
  long: "15-18",
};

const LAYOUTS = new Set<SlideLayout>(["title", "agenda", "section", "bullets", "closing", "sources"]);
const CITATION_MARKERS = /\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function cleanText(value: unknown, limit = 180): string {
  const text = str(value)
    .replace(CITATION_MARKERS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1).trimEnd();
  const atWord = clipped.replace(/\s+\S*$/, "");
  return `${(atWord.length >= 40 ? atWord : clipped).trimEnd()}…`;
}

function cleanNotes(value: unknown): string | undefined {
  const text = str(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function cleanBullet(value: unknown): string {
  return cleanText(value, 140);
}

function normalizeLayout(value: unknown): SlideLayout {
  const layout = str(value) as SlideLayout;
  return LAYOUTS.has(layout) ? layout : "bullets";
}

function normalizeTheme(theme: unknown): SlideTheme {
  return Object.prototype.hasOwnProperty.call(SLIDE_THEMES, str(theme))
    ? (str(theme) as SlideTheme)
    : DEFAULT_SLIDE_THEME;
}

function normalizeOneSlide(value: unknown): Slide | null {
  const o = (value ?? {}) as Loose;
  const title = cleanText(o.title, 100);
  const subtitle = cleanText(o.subtitle, 140);
  const bullets = arr(o.bullets)
    .map(cleanBullet)
    .filter(Boolean)
    .slice(0, 6);
  if (!title && bullets.length === 0) return null;
  return {
    layout: normalizeLayout(o.layout),
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(bullets.length ? { bullets } : {}),
    ...(cleanNotes(o.notes) ? { notes: cleanNotes(o.notes) } : {}),
  };
}

function agendaFrom(slides: Slide[]): string[] {
  return slides
    .filter((s) => !["title", "agenda", "sources"].includes(s.layout))
    .map((s) => s.title)
    .filter(Boolean)
    .slice(0, 6);
}

function sourceTitles(citations: Citation[] | undefined): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const c of citations ?? []) {
    const title = cleanText(c.sourceTitle, 140);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

export function normalizeSlides(
  raw: unknown,
  theme: unknown = DEFAULT_SLIDE_THEME,
  citations?: Citation[]
): SlidesContent | null {
  const o = (raw ?? {}) as Loose;
  const usable = arr(o.slides).map(normalizeOneSlide).filter((s): s is Slide => Boolean(s));
  if (usable.length < 3) return null;

  const title = cleanText(o.title, 120) || usable[0]?.title || "Slide deck";
  const subtitle = cleanText(o.subtitle, 160);
  const slides = [...usable];

  if (slides[0].layout !== "title") {
    slides.unshift({ layout: "title", title, ...(subtitle ? { subtitle } : {}) });
  } else {
    slides[0] = {
      ...slides[0],
      layout: "title",
      title: slides[0].title || title,
      subtitle: slides[0].subtitle || subtitle || undefined,
    };
  }

  const agendaIndex = slides.findIndex((s) => s.layout === "agenda");
  const agendaBullets = agendaFrom(slides);
  if (agendaIndex >= 0) {
    const [agenda] = slides.splice(agendaIndex, 1);
    slides.splice(1, 0, {
      ...agenda,
      layout: "agenda",
      title: agenda.title || "Agenda",
      bullets: (agenda.bullets?.length ? agenda.bullets : agendaBullets).slice(0, 6),
    });
  } else {
    slides.splice(1, 0, {
      layout: "agenda",
      title: "Agenda",
      bullets: agendaBullets,
    });
  }

  const sources = sourceTitles(citations);
  if (sources.length) {
    slides.push({
      layout: "sources",
      title: "Sources",
      bullets: sources.slice(0, 6),
      notes: "Source titles are included for reference; citation markers remain in the speaker notes.",
    });
  }

  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    theme: normalizeTheme(theme),
    slides,
  };
}

export function slidesToMarkdown(content: SlidesContent): string {
  const lines = [`# ${content.title}`];
  if (content.subtitle) lines.push("", content.subtitle);
  for (const slide of content.slides) {
    lines.push("", `## ${slide.title}`);
    if (slide.subtitle) lines.push("", slide.subtitle);
    if (slide.bullets?.length) lines.push("", ...slide.bullets.map((b) => `- ${b}`));
    if (slide.notes) lines.push("", `> Speaker notes: ${slide.notes}`);
  }
  return `${lines.join("\n")}\n`;
}

const pptxColor = (color: string) => color.replace(/^#/, "");

export async function buildPptx(content: SlidesContent): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "InfiniAIBook";
  pptx.subject = content.title;
  pptx.title = content.title;
  pptx.company = "InfiniAIBook";
  pptx.theme = {
    headFontFace: SLIDE_THEMES[content.theme].fonts.heading,
    bodyFontFace: SLIDE_THEMES[content.theme].fonts.body,
  };

  const theme = SLIDE_THEMES[content.theme];
  const c = theme.colors;
  const W = 13.333;
  const H = 7.5;

  for (const [slideIndex, item] of content.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: pptxColor(c.background) };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.35,
      y: 0.35,
      w: W - 0.7,
      h: H - 0.7,
      fill: { color: pptxColor(c.surface), transparency: item.layout === "title" ? 12 : 0 },
      line: { color: pptxColor(c.accent), transparency: 55 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.35,
      y: 0.35,
      w: 0.12,
      h: H - 0.7,
      fill: { color: pptxColor(c.accent) },
      line: { color: pptxColor(c.accent) },
    });

    if (item.layout === "title") {
      slide.addText(item.title, {
        x: 1.0,
        y: 2.0,
        w: 10.8,
        h: 1.2,
        fontFace: theme.fonts.heading,
        fontSize: 46,
        bold: true,
        color: pptxColor(c.text),
        margin: 0,
        breakLine: false,
        fit: "shrink",
      });
      if (item.subtitle) {
        slide.addText(item.subtitle, {
          x: 1.05,
          y: 3.35,
          w: 10.4,
          h: 0.65,
          fontFace: theme.fonts.body,
          fontSize: 21,
          color: pptxColor(c.muted),
          fit: "shrink",
        });
      }
    } else if (item.layout === "section") {
      slide.addText(item.title, {
        x: 1.0,
        y: 2.25,
        w: 10.7,
        h: 1.0,
        fontFace: theme.fonts.heading,
        fontSize: 38,
        bold: true,
        color: pptxColor(c.text),
        fit: "shrink",
      });
      if (item.subtitle) {
        slide.addText(item.subtitle, {
          x: 1.05,
          y: 3.35,
          w: 10.0,
          h: 0.7,
          fontSize: 20,
          color: pptxColor(c.muted),
          fit: "shrink",
        });
      }
    } else {
      slide.addText(item.title, {
        x: 0.95,
        y: 0.78,
        w: 10.8,
        h: 0.55,
        fontFace: theme.fonts.heading,
        fontSize: 28,
        bold: true,
        color: pptxColor(c.text),
        fit: "shrink",
      });
      if (item.subtitle) {
        slide.addText(item.subtitle, {
          x: 0.98,
          y: 1.34,
          w: 10.5,
          h: 0.42,
          fontSize: 14,
          color: pptxColor(c.muted),
          fit: "shrink",
        });
      }
      const bullets = item.bullets ?? [];
      if (bullets.length) {
        slide.addText(bullets.map((b) => `• ${b}`).join("\n"), {
          x: 1.15,
          y: item.subtitle ? 2.0 : 1.8,
          w: 10.5,
          h: 4.7,
          fontFace: theme.fonts.body,
          fontSize: item.layout === "sources" ? 17 : 22,
          color: pptxColor(c.text),
          breakLine: false,
          fit: "shrink",
          valign: "middle",
          paraSpaceAfter: 10,
        });
      }
    }

    slide.addText(`${slideIndex + 1}`, {
      x: 11.9,
      y: 6.75,
      w: 0.55,
      h: 0.25,
      fontSize: 9,
      color: pptxColor(c.muted),
      align: "right",
    });
    if (item.notes) slide.addNotes(item.notes);
  }

  return (await pptx.write({ outputType: "blob" })) as Blob;
}
