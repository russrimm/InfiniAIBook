import { describe, expect, it } from "vitest";
import { extractFromFile } from "@/lib/ingest";

/** A one-page PDF whose only content is a picture, like a scanned page. */
function imageOnlyPdf(): Uint8Array {
  const hex = "FF000000FF000000FFFFFF00>";
  const content = "q 200 0 0 200 50 500 cm /Im0 Do Q";
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
  pdf +=
    `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("a PDF with no text layer", () => {
  it("says it is a scan and what to do about it, instead of adding an empty source", async () => {
    const file = new File([imageOnlyPdf() as BlobPart], "scan.pdf", { type: "application/pdf" });
    const error = await extractFromFile(file).then(
      () => null,
      (e: Error) => e.message,
    );
    expect(error).toContain('"scan.pdf" has no text layer');
    expect(error).toMatch(/does not run OCR/);
    expect(error).toMatch(/Open with Google Docs/);
    expect(error).toMatch(/photos of the pages as images/);
  });
});
