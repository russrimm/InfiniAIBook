import JSZip from "jszip";
import { expect, test } from "@playwright/test";

async function epub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Field Guide to Leaves</dc:title><dc:creator>A. Botanist</dc:creator></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,
  );
  zip.file(
    "OEBPS/c1.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Pigments</h1><p>Chlorophyll absorbs blue and red light. ${"Carotenoids absorb blue-green light. ".repeat(10)}</p></body></html>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("an EPUB uploaded in Sources becomes a source named after the book", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "EPUB upload" } });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Add sources" }).click();
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles({
    name: "leaves.epub",
    mimeType: "application/epub+zip",
    buffer: await epub(),
  });
  await expect(page.getByRole("checkbox", { name: /Field Guide to Leaves by A\. Botanist/ })).toBeVisible();
  const saved = (await (await page.request.get(`/api/notebooks/${id}`)).json()) as { sources: { title: string; kind: string }[] };
  expect(saved.sources).toMatchObject([{ title: "Field Guide to Leaves by A. Botanist", kind: "epub" }]);
});

test("a PDF that is only pictures says it is a scan and how to fix it", async ({ page }) => {
  const created = await page.request.post("/api/notebooks", { data: { title: "Scan" } });
  const { id } = (await created.json()) as { id: string };
  const content = "q 200 0 0 200 50 500 cm /Im0 Do Q";
  const hex = "FF000000FF000000FFFFFF00>";
  const parts = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  parts.forEach((p, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${p}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  await page.goto(`/notebook/${id}`);
  await page.getByRole("banner").getByRole("button", { name: "Add sources" }).click();
  await page.locator('input[type="file"][accept*=".epub"]').setInputFiles({
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf, "latin1"),
  });
  await expect(page.getByText(/scan\.pdf" has no text layer/)).toBeVisible();
  await expect(page.getByText(/Open with Google Docs/)).toBeVisible();
});
