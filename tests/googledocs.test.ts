import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractFromUrl } from "@/lib/ingest";
import { parseGoogleDocLink, privateDocMessage, titleFromDisposition } from "@/lib/googledocs";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safefetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/safefetch")>()),
  safeFetch: mocks.safeFetch,
}));

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

beforeEach(() => mocks.safeFetch.mockReset());

const reply = (body: string, init: ResponseInit = {}, finalUrl = "https://doc-0c.googleusercontent.com/export") => {
  mocks.safeFetch.mockResolvedValue({ res: new Response(body, init), finalUrl });
};

describe("Google document links", () => {
  it("maps documents, sheets (keeping the tab) and slides to their text exports", () => {
    expect(parseGoogleDocLink(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)).toMatchObject({
      kind: "document",
      exportUrl: `https://docs.google.com/document/d/${ID}/export?format=txt`,
    });
    expect(parseGoogleDocLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=1234`)?.exportUrl).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=1234`,
    );
    expect(parseGoogleDocLink(`https://docs.google.com/spreadsheets/d/${ID}/edit`)?.exportUrl).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`,
    );
    expect(parseGoogleDocLink(`https://docs.google.com/presentation/d/${ID}/edit`)?.exportUrl).toBe(
      `https://docs.google.com/presentation/d/${ID}/export/txt`,
    );
  });

  it("leaves everything else alone, including published pages and look-alike hosts", () => {
    for (const url of [
      `https://docs.google.com/document/d/e/2PACX-1vSomething/pub`,
      `http://docs.google.com/document/d/${ID}/edit`,
      `https://docs.google.com.evil.example/document/d/${ID}/edit`,
      `https://evil.example/docs.google.com/document/d/${ID}/edit`,
      `https://drive.google.com/file/d/${ID}/view`,
      "https://docs.google.com/forms/d/abcdefghijk/edit",
      "not a url",
    ]) {
      expect(parseGoogleDocLink(url), url).toBeNull();
    }
  });

  it("reads the document name from the download header", () => {
    expect(titleFromDisposition(`attachment; filename="Plan.txt"; filename*=UTF-8''Q3%20Plan%20%E2%80%93%20draft.txt`)).toBe("Q3 Plan – draft");
    expect(titleFromDisposition('attachment; filename="Budget.csv"')).toBe("Budget");
    expect(titleFromDisposition(null)).toBeNull();
  });
});

describe("importing a Google document by link", () => {
  const url = `https://docs.google.com/document/d/${ID}/edit`;

  it("fetches the export through the guarded fetch and uses the document's name", async () => {
    reply("\uFEFFFirst paragraph.\r\n\r\n\r\n\r\nSecond paragraph.", {
      headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''Field%20notes.txt` },
    });
    const got = await extractFromUrl(url);
    expect(got).toEqual({ title: "Field notes", text: "First paragraph.\n\nSecond paragraph.", kind: "url" });
    expect(mocks.safeFetch.mock.calls[0][0]).toBe(`https://docs.google.com/document/d/${ID}/export?format=txt`);
  });

  it("says how to share a private document, however Google refuses it", async () => {
    for (const make of [
      () => reply("", { status: 404 }),
      () => reply("", { status: 403 }),
      () => reply("<html>Sign in</html>", { headers: { "content-type": "text/html" } }, "https://accounts.google.com/v3/signin"),
      () => reply("<!DOCTYPE html><html>Sign in</html>", { headers: { "content-type": "text/html" } }),
    ]) {
      make();
      await expect(extractFromUrl(url)).rejects.toThrow(/Anyone with the link/);
    }
    expect(privateDocMessage({ noun: "Google Doc" })).toMatch(/never signs in/);
  });

  it("reports an empty document and rate limiting plainly", async () => {
    reply("   \n", { headers: { "content-type": "text/plain" } });
    await expect(extractFromUrl(url)).rejects.toThrow(/is empty/);
    reply("", { status: 429 });
    await expect(extractFromUrl(url)).rejects.toThrow(/rate-limiting/);
  });

  it("imports a Sheet tab as CSV text under a fallback name", async () => {
    reply("name,count\nleaf,4", { headers: { "content-type": "text/csv" } });
    const got = await extractFromUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=7`);
    expect(got).toEqual({ title: "Google Sheet", text: "name,count\nleaf,4", kind: "url" });
  });
});
