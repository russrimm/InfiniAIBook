import { db } from "./db";

/**
 * Small key/value store for runtime settings that would otherwise require an
 * edit to .env.local and a restart — notably which model to use.
 *
 * Values here take precedence over environment variables, so the environment
 * stays the deployment default and the UI can override it per installation.
 */

let ready = false;

function ensure() {
  if (ready) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  ready = true;
}

export function getSetting(key: string): string | null {
  try {
    ensure();
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as unknown as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    // A settings lookup must never take down a request; callers fall back to
    // the environment.
    return null;
  }
}

export function setSetting(key: string, value: string | null) {
  ensure();
  if (value === null || value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, Date.now());
}

export const SETTING_CHAT_MODEL = "chat_model";
export const SETTING_EMBED_MODEL = "embed_model";
export const SETTING_IMAGE_MODEL = "image_model";
