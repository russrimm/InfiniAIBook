/** Largest upload or request body accepted when adding sources. Default 50 MB. */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);

/** Longest source title kept. */
export const MAX_TITLE_CHARS = 300;

export const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
