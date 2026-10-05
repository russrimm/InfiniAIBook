/** Largest upload or request body accepted when adding sources. Default 50 MB. */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);

/** Most files imported from one uploaded ZIP archive. */
export const MAX_ARCHIVE_FILES = Number(process.env.MAX_ARCHIVE_FILES || 100);

/** Total size an uploaded ZIP may expand to, nested archives included. Default 500 MB. */
export const MAX_ARCHIVE_EXPANDED_BYTES = Number(
  process.env.MAX_ARCHIVE_EXPANDED_BYTES || 500 * 1024 * 1024
);

/** How many levels of ZIP-inside-ZIP are opened. */
export const MAX_ARCHIVE_DEPTH = 3;

/** Longest source title kept. */
export const MAX_TITLE_CHARS = 300;

export const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
