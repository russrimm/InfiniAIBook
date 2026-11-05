import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LearnCitationModal from "@/components/LearnCitationModal";
import type { Citation } from "@/lib/types";

const citation: Citation = {
  n: 1, sourceId: "learn:azure", sourceTitle: "Microsoft Learn: Azure",
  part: 1, snippet: "Short preview", content: "The complete saved excerpt.",
  url: "https://learn.microsoft.com/en-us/azure/overview",
};

describe("Learn citation viewer", () => {
  it("shows the saved excerpt with a validated official documentation link", () => {
    const html = renderToStaticMarkup(<LearnCitationModal citation={citation} onClose={() => {}} />);
    expect(html).toContain("The complete saved excerpt.");
    expect(html).toContain('href="https://learn.microsoft.com/en-us/azure/overview"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('role="dialog"');
  });

  it.each(["javascript:alert(1)", "https://evil.example/doc", "https://learn.microsoft.com/api/mcp"])(
    "keeps imported citation URL %s from becoming a link", (url) => {
      const html = renderToStaticMarkup(<LearnCitationModal citation={{ ...citation, url }} onClose={() => {}} />);
      expect(html).not.toContain("href=");
      expect(html).toContain('role="alert"');
      expect(html).toContain("The complete saved excerpt.");
    },
  );
});
