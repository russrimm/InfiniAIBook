import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";

// Tailwind's PostCSS plugin is not needed to check the markup.
vi.mock("@/app/globals.css", () => ({}));

describe("error screens", () => {
  const boom = Object.assign(new Error("secret stack detail"), { digest: "abc123" });

  it("offers a retry and a way home, announces itself, and shows only the digest", () => {
    const html = renderToStaticMarkup(<ErrorPage error={boom} reset={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).toContain('href="/"');
    expect(html).toContain("abc123");
    expect(html).not.toContain("secret stack detail");
  });

  it("omits the reference when the error has no digest", () => {
    const html = renderToStaticMarkup(<ErrorPage error={new Error("x")} reset={() => {}} />);
    expect(html).not.toContain("Reference:");
  });

  it("supplies its own document for a root-layout failure", () => {
    const html = renderToStaticMarkup(<GlobalError error={boom} reset={() => {}} />);
    expect(html.startsWith("<html")).toBe(true);
    expect(html).toContain('lang="en"');
    expect(html).toContain("<body");
    expect(html).toContain("Try again");
    expect(html).not.toContain("secret stack detail");
  });

  it("explains a missing page with a link home", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("Try again");
  });
});
