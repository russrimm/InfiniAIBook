import JSZip from "jszip";
import { MAX_ARCHIVE_EXPANDED_BYTES, MAX_OFFICE_ENTRIES, MAX_UPLOAD_BYTES, mb } from "./limits";
import { ArchiveLimitError, assertZipEntryCount, measureEntryCapped } from "./zipread";

/**
 * Check a Word file before mammoth opens it. A .docx is a ZIP, and mammoth
 * inflates whatever the file says it holds, so a small crafted file could fill
 * memory. Every part is inflated once here under the same per-file and total
 * caps as uploaded archives, and nothing is kept.
 *
 * Throws ArchiveLimitError (its message starts with "it"). A file that is not
 * a readable ZIP is left for the caller's own diagnosis.
 */
export async function assertOfficeWithinLimits(buf: Buffer): Promise<void> {
  assertZipEntryCount(buf, MAX_OFFICE_ENTRIES);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return;
  }
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const room = MAX_ARCHIVE_EXPANDED_BYTES - total;
    if (room <= 0) throw new ArchiveLimitError(`it expands to more than ${mb(MAX_ARCHIVE_EXPANDED_BYTES)}`);
    total += await measureEntryCapped(entry, Math.min(MAX_UPLOAD_BYTES, room));
  }
}
