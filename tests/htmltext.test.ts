import { describe, expect, it } from "vitest";
import { decodeEntities, stripTags } from "@/lib/htmltext";
import { tableCell } from "@/lib/mdtable";
import { cleanSpoken } from "@/lib/training";
import { AVATAR_PRESETS, DEFAULT_PRESENTER, avatarPicture } from "@/lib/avatars";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

describe("decodeEntities", () => {
  it("decodes in one pass, so an escaped ampersand never cascades", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
    expect(decodeEntities("&amp;#39;")).toBe("&#39;");
    expect(decodeEntities("Use &amp;lt;div&amp;gt; for a box")).toBe("Use &lt;div&gt; for a box");
  });

  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("Fish &amp; chips &lt;3 &gt; &quot;hi&quot; it&#39;s it&#x27;s&nbsp;ok")).toBe(
      "Fish & chips <3 > \"hi\" it's it's ok",
    );
    expect(decodeEntities("&rsquo;&ldquo;&rdquo;&ndash;&mdash;&hellip;&#8217;&#x1F600;")).toBe("'\"\"–—…\u2019\u{1F600}");
  });

  it("leaves unknown, malformed and out-of-range entities alone", () => {
    for (const s of ["&bogus;", "&amp", "&#;", "&#0;", "&#xD800;", "&#99999999;", "AT&T", "a & b"]) {
      expect(decodeEntities(s)).toBe(s);
    }
    expect(decodeEntities("&constructor;&__proto__;")).toBe("&constructor;&__proto__;");
  });
});

describe("stripTags", () => {
  it("removes tags and comments but keeps text that only looks like markup", () => {
    expect(stripTags("a <b>bold</b> <!-- note --> word")).toBe("a bold  word");
    expect(stripTags("1 < 2 and 3 > 2, x<5")).toBe("1 < 2 and 3 > 2, x<5");
  });

  it("repeats until no tag is left, so removal cannot assemble a new one", () => {
    expect(stripTags("<scr<b>ipt>alert(1)</script>")).toBe("alert(1)");
    expect(stripTags("<<b>script>x")).toBe("x");
    expect(stripTags("<<b>b>x</b>")).not.toMatch(/<\/?b>/);
  });
});

describe("cleanSpoken", () => {
  it("drops tags, including ones that removal would otherwise join", () => {
    expect(cleanSpoken("Hello <b>there</b> [1] (laughs) world")).toBe("Hello there world");
    expect(cleanSpoken("Safe <scr<i>ipt>text")).toBe("Safe text");
  });
});

describe("tableCell", () => {
  it("escapes the backslash before the pipe so a literal \\| survives", () => {
    expect(tableCell("a|b")).toBe("a\\|b");
    expect(tableCell("a\\|b")).toBe("a\\\\\\|b");
    expect(tableCell("C:\\temp")).toBe("C:\\\\temp");
  });

  it("keeps a cell on one row", () => {
    expect(tableCell("line one\r\n  line two\nthree")).toBe("line one line two three");
  });
});

describe("avatarPicture", () => {
  it("returns the picture of a known presenter", () => {
    for (const [key, preset] of Object.entries(AVATAR_PRESETS)) {
      expect(avatarPicture(key)).toBe(`/avatars/${key}.${preset.photo ? "jpg" : "png"}`);
    }
  });

  it("falls back to the default presenter for anything else", () => {
    const fallback = avatarPicture(DEFAULT_PRESENTER);
    for (const key of ["", "../../api/x", "x\"onerror=\"y", "__proto__", "constructor"]) {
      expect(avatarPicture(key), key).toBe(fallback);
    }
  });
});

describe("theme bootstrap script", () => {
  it("embeds only escaped literals, so it cannot end its own <script> element", () => {
    expect(THEME_INIT_SCRIPT).not.toMatch(/<\/script|<!--/i);
    expect(THEME_INIT_SCRIPT).not.toMatch(/[\u2028\u2029]/);
  });
});
