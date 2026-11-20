import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nanoid } from "nanoid";
import { BadRequestError } from "./badrequest";
import { dataDir } from "./paths";
import {
  DEFAULT_ZIP_LIMITS,
  ZipError,
  extractZipEntry,
  readZipDirectory,
  safeEntryParts,
  writeZip,
  type ZipEntry,
  type ZipSource,
} from "./zipstream";

export const BACKUP_FORMAT = "infiniaibook-backup";
export const BACKUP_VERSION = 1;
/**
 * Bump when a release changes the database in a way an older release cannot
 * read. Restoring a backup made by a newer schema is refused; older backups
 * are upgraded by the usual additive migrations when the database opens.
 */
export const SCHEMA_VERSION = 1;

export const DB_FILE = "infiniaibook.db";
export const INBOX_DIR = "restore-inbox";
const MANIFEST = "manifest.json";
const DB_ENTRY = `db/${DB_FILE}`;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const STAGING = /^\.restore-([A-Za-z0-9_-]{16,32})$/;
const TOKEN = /^[A-Za-z0-9_-]{16,32}$/;
const STALE_STAGING_MS = 24 * 60 * 60 * 1000;
/** Uploads through the app's proxy are buffered, so larger archives go through the inbox folder. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const STORED_EXTENSIONS = new Set([".mp4", ".mp3", ".m4a", ".webm", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".zip"]);

export type BackupCounts = { notebooks: number; sources: number; artifacts: number; notes: number; messages: number };

export type Manifest = {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  counts: BackupCounts;
  files: { path: string; size: number }[];
};

export type BackupSummary = {
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  counts: BackupCounts;
  fileCount: number;
  totalBytes: number;
  archiveBytes: number;
};

let active: "restore" | null = null;

export function maxRestoreBytes(): number {
  const v = Number(process.env.BACKUP_MAX_RESTORE_BYTES);
  return Number.isFinite(v) && v > 0 ? v : 50 * 1024 ** 3;
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `infiniaibook-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.zip`;
}

/**
 * Top-level names that never travel in a backup: hidden entries (an .env file,
 * restore staging, earlier pre-restore copies), key or secret files, and the
 * folder restore archives are dropped into.
 */
export function isExcludedTopLevel(name: string): boolean {
  return name.startsWith(".") || /^secrets?([.\-_]|$)/i.test(name) || name === INBOX_DIR;
}

const SKIPPED_FILE = /(\.part|\.tmp|\.lock|-wal|-shm|-journal)$/i;

type DataFile = { rel: string; abs: string; size: number; mtime: Date };

/** Every regular file under the data folder that belongs in a backup. The database is snapshotted separately. */
export function collectDataFiles(root: string): DataFile[] {
  const out: DataFile[] = [];
  const walk = (dir: string, rel: string) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (rel === "" && (isExcludedTopLevel(d.name) || d.name === DB_FILE || d.name.startsWith(`${DB_FILE}-`))) continue;
      if (d.name.toLowerCase().startsWith(".env")) continue;
      const abs = path.join(dir, d.name);
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(abs, r);
      else if (d.isFile() && !SKIPPED_FILE.test(d.name)) {
        try {
          const st = fs.statSync(abs);
          out.push({ rel: r, abs, size: st.size, mtime: st.mtime });
        } catch {
          // Removed between listing and reading.
        }
      }
    }
  };
  walk(root, "");
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

function sqlQuote(file: string): string {
  return `'${file.replace(/'/g, "''")}'`;
}

export type Snapshotter = {
  /** Write a consistent copy of the live database to `file`. */
  snapshot: (file: string) => void;
  counts: (file: string) => BackupCounts;
};

function countsOf(file: string): BackupCounts {
  const conn = new DatabaseSync(file, { readOnly: true });
  try {
    const n = (table: string) => (conn.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as unknown as { c: number }).c;
    return { notebooks: n("notebooks"), sources: n("sources"), artifacts: n("artifacts"), notes: n("notes"), messages: n("messages") };
  } finally {
    conn.close();
  }
}

/** Streams the archive. `snapshot` must write a consistent copy of the live database (VACUUM INTO). */
export async function* createBackupStream(
  snapshot: (file: string) => void,
  { root = dataDir(), now = new Date(), zip64At }: { root?: string; now?: Date; zip64At?: number } = {},
): AsyncGenerator<Buffer> {
  if (active) throw new BadRequestError("A restore is in progress. Wait for it to finish, then make the backup.");
  const tmp = path.join(root, `.backup-${nanoid(12)}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const dbCopy = path.join(tmp, DB_FILE);
    snapshot(dbCopy);
    const files = collectDataFiles(root);
    const manifest: Manifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
      createdAt: now.toISOString(),
      counts: countsOf(dbCopy),
      files: files.map((f) => ({ path: `data/${f.rel}`, size: f.size })),
    };
    const dbSize = fs.statSync(dbCopy).size;
    const sources: ZipSource[] = [
      { name: MANIFEST, size: 0, open: () => Buffer.from(JSON.stringify(manifest, null, 2)), mtime: now },
      { name: DB_ENTRY, size: dbSize, open: () => fs.createReadStream(dbCopy), mtime: now },
      ...files.map((f) => ({
        name: `data/${f.rel}`,
        size: f.size,
        mtime: f.mtime,
        store: STORED_EXTENSIONS.has(path.extname(f.rel).toLowerCase()),
        open: () => fs.createReadStream(f.abs),
      })),
    ];
    yield* writeZip(sources, { zip64At });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Entry paths a backup may contain, mapped to where they land inside the data folder. */
function targetOf(entry: ZipEntry): string[] | null {
  if (entry.name === MANIFEST) return null;
  const parts = safeEntryParts(entry.name);
  if (entry.name === DB_ENTRY) return [DB_FILE];
  if (entry.isDirectory && parts.length === 1 && (parts[0] === "data" || parts[0] === "db")) return [];
  if (parts[0] !== "data" || parts.length < 2) {
    throw new ZipError(`The archive contains an unexpected item ("${entry.name.slice(0, 80)}"). It is not an InfiniAIBook backup.`);
  }
  const rest = parts.slice(1);
  if (isExcludedTopLevel(rest[0]) || rest[0] === DB_FILE || rest[0].startsWith(`${DB_FILE}-`)) {
    throw new ZipError(`The archive contains a reserved name ("${rest[0]}"), so it was refused.`);
  }
  return rest;
}

function readManifestFrom(file: string, entry: ZipEntry, scratch: string): Promise<Manifest> {
  if (entry.usize > MAX_MANIFEST_BYTES) throw new ZipError("The backup's manifest is too large.");
  const dest = path.join(scratch, `manifest-${nanoid(6)}.json`);
  return extractZipEntry(file, entry, dest).then(() => {
    try {
      return JSON.parse(fs.readFileSync(dest, "utf8")) as Manifest;
    } catch {
      throw new ZipError("The backup's manifest is not valid.");
    } finally {
      fs.rmSync(dest, { force: true });
    }
  });
}

/**
 * Check an archive's structure and manifest without extracting its files:
 * ZIP directory, unsafe paths, duplicates, symbolic links, encryption, the
 * manifest's format and schema version, and that every listed file is present.
 */
export async function inspectBackup(file: string, scratch: string): Promise<{ summary: BackupSummary; entries: ZipEntry[] }> {
  let entries: ZipEntry[];
  try {
    entries = readZipDirectory(file, DEFAULT_ZIP_LIMITS);
  } catch (e) {
    if (e instanceof ZipError) throw new BadRequestError(e.message);
    throw e;
  }
  try {
    const seen = new Set<string>();
    let total = 0;
    for (const entry of entries) {
      if (entry.unixMode !== null && (entry.unixMode & 0o170000) === 0o120000) {
        throw new ZipError(`"${entry.name.slice(0, 80)}" is a symbolic link, which backups never contain.`);
      }
      const key = entry.name.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) throw new ZipError(`The archive lists "${entry.name.slice(0, 80)}" more than once.`);
      seen.add(key);
      targetOf(entry);
      if (!entry.isDirectory) total += entry.usize;
    }
    const manifestEntry = entries.find((e) => e.name === MANIFEST);
    if (!manifestEntry) throw new ZipError("This ZIP has no manifest.json, so it is not an InfiniAIBook backup.");
    if (!entries.some((e) => e.name === DB_ENTRY)) throw new ZipError("This backup has no database. It is incomplete.");
    const manifest = await readManifestFrom(file, manifestEntry, scratch);
    if (manifest.format !== BACKUP_FORMAT) throw new ZipError("This ZIP is not an InfiniAIBook backup.");
    if (!Number.isInteger(manifest.version) || manifest.version > BACKUP_VERSION) {
      throw new ZipError("This backup was made by a newer version of InfiniAIBook. Update the app, then restore it.");
    }
    if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion > SCHEMA_VERSION) {
      throw new ZipError("This backup's database is newer than this app understands. Update the app, then restore it.");
    }
    if (!Array.isArray(manifest.files)) throw new ZipError("The backup's manifest is not valid.");
    const have = new Map(entries.map((e) => [e.name, e]));
    for (const f of manifest.files) {
      const e = typeof f?.path === "string" ? have.get(f.path) : undefined;
      if (!e) throw new ZipError(`The backup is incomplete: ${String(f?.path).slice(0, 80)} is missing from the archive.`);
    }
    if (total > maxRestoreBytes()) {
      throw new ZipError(`This backup expands to more than the ${(maxRestoreBytes() / 1024 ** 3).toFixed(0)} GB limit. Raise BACKUP_MAX_RESTORE_BYTES to allow it.`);
    }
    const counts = manifest.counts ?? ({} as BackupCounts);
    return {
      entries,
      summary: {
        createdAt: String(manifest.createdAt),
        appVersion: String(manifest.appVersion ?? "unknown"),
        schemaVersion: manifest.schemaVersion,
        counts: {
          notebooks: Number(counts.notebooks) || 0,
          sources: Number(counts.sources) || 0,
          artifacts: Number(counts.artifacts) || 0,
          notes: Number(counts.notes) || 0,
          messages: Number(counts.messages) || 0,
        },
        fileCount: entries.filter((e) => !e.isDirectory && e.name.startsWith("data/")).length,
        totalBytes: total,
        archiveBytes: fs.statSync(file).size,
      },
    };
  } catch (e) {
    if (e instanceof ZipError) throw new BadRequestError(e.message);
    throw e;
  }
}

export function describeSummary(s: BackupSummary): string {
  return `${plural(s.counts.notebooks, "notebook")}, ${plural(s.counts.sources, "source")}, ${plural(s.counts.artifacts, "generated item")} and ${plural(s.fileCount, "media file")}`;
}

// ---------------------------------------------------------------------------
// Staging and restore

export function stagingPath(root: string, token: string): string {
  if (!TOKEN.test(token)) throw new BadRequestError("That restore session is not valid. Choose the backup again.");
  return path.join(root, `.restore-${token}`);
}

/** Remove abandoned staging folders (an upload that was never confirmed). */
export function sweepStaging(root: string, now = Date.now()) {
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (!STAGING.test(name) && !/^\.backup-/.test(name)) continue;
    const dir = path.join(root, name);
    try {
      if (now - fs.statSync(dir).mtimeMs > STALE_STAGING_MS) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Already gone.
    }
  }
}

export type StagedSource = { kind: "upload" } | { kind: "inbox"; name: string };

export function inboxDir(root = dataDir()): string {
  return path.join(root, INBOX_DIR);
}

export function listInbox(root = dataDir()): { name: string; bytes: number; modified: string }[] {
  try {
    return fs
      .readdirSync(inboxDir(root), { withFileTypes: true })
      .filter((d) => d.isFile() && /\.zip$/i.test(d.name))
      .map((d) => {
        const st = fs.statSync(path.join(inboxDir(root), d.name));
        return { name: d.name, bytes: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.modified < b.modified ? 1 : -1));
  } catch {
    return [];
  }
}

export function resolveArchive(root: string, token: string): { staging: string; file: string } {
  const staging = stagingPath(root, token);
  let source: StagedSource;
  try {
    source = JSON.parse(fs.readFileSync(path.join(staging, "source.json"), "utf8")) as StagedSource;
  } catch {
    throw new BadRequestError("That restore session has expired. Choose the backup again.");
  }
  if (source.kind === "inbox") {
    const name = path.basename(String(source.name));
    if (!listInbox(root).some((f) => f.name === name)) {
      throw new BadRequestError(`"${name}" is no longer in the ${INBOX_DIR} folder.`);
    }
    return { staging, file: path.join(inboxDir(root), name) };
  }
  return { staging, file: path.join(staging, "upload.zip") };
}

/** Create a staging folder for an archive and return its token. */
export function newStaging(root: string, source: StagedSource): { token: string; staging: string } {
  sweepStaging(root);
  const token = nanoid(20).replace(/[^A-Za-z0-9_-]/g, "x");
  const staging = stagingPath(root, token);
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, "source.json"), JSON.stringify(source));
  return { token, staging };
}

export function discardStaging(root: string, token: string) {
  fs.rmSync(stagingPath(root, token), { recursive: true, force: true });
}

type Mover = (from: string, to: string) => void;

/**
 * Replace the data folder's contents with `next` (a folder of the same
 * layout). Every top-level entry that is not hidden moves aside to
 * `aside`; then the new entries move in. All moves are same-volume renames. If
 * any step fails, everything moved so far is moved back, so the folder is
 * left as it was found.
 */
export function swapInto(root: string, next: string, aside: string, closeDb: () => void, move: Mover = fs.renameSync) {
  const incoming = fs.readdirSync(next);
  fs.mkdirSync(aside, { recursive: true });
  // Closing a WAL database removes its -wal and -shm files, so list afterwards.
  closeDb();
  const outgoing = fs.readdirSync(root).filter((n) => !isExcludedTopLevel(n));
  const movedOut: string[] = [];
  const movedIn: string[] = [];
  try {
    for (const name of outgoing) {
      move(path.join(root, name), path.join(aside, name));
      movedOut.push(name);
    }
    for (const name of incoming) {
      move(path.join(next, name), path.join(root, name));
      movedIn.push(name);
    }
  } catch (e) {
    const stuck: string[] = [];
    for (const name of movedIn.reverse()) {
      try {
        move(path.join(root, name), path.join(next, name));
      } catch {
        stuck.push(name);
      }
    }
    for (const name of movedOut.reverse()) {
      try {
        move(path.join(aside, name), path.join(root, name));
      } catch {
        stuck.push(name);
      }
    }
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(
      stuck.length
        ? `The restore failed (${reason}) and some items could not be put back. Your previous data is in ${aside}; copy it back into ${root}.`
        : `The restore failed (${reason}). Nothing was changed.`,
    );
  }
}

function verifyDatabase(file: string) {
  let conn: DatabaseSync | null = null;
  try {
    conn = new DatabaseSync(file, { readOnly: true });
    const check = conn.prepare("PRAGMA integrity_check").all() as unknown as { integrity_check: string }[];
    if (check.length !== 1 || check[0].integrity_check !== "ok") throw new Error("integrity check failed");
    const has = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notebooks'").get();
    if (!has) throw new Error("no notebooks table");
  } catch (e) {
    throw new ZipError(`The backup's database is damaged (${e instanceof Error ? e.message : "unreadable"}). Nothing was changed.`);
  } finally {
    conn?.close();
  }
}

export function freeBytes(dir: string): number | null {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export type RestoreResult = { previousFolder: string; summary: BackupSummary };

/**
 * Restore a staged archive: validate it, extract it beside the live data,
 * verify the database, then swap it in with rollback. Nothing in the live
 * data changes until every file has been extracted and verified.
 */
export async function restoreStaged(
  token: string,
  { root = dataDir(), closeDb, now = new Date(), move }: { root?: string; closeDb: () => void; now?: Date; move?: Mover },
): Promise<RestoreResult> {
  if (active) throw new BadRequestError("A restore is already running.");
  active = "restore";
  let staging = "";
  try {
    const resolved = resolveArchive(root, token);
    staging = resolved.staging;
    const file = resolved.file;
    const { summary, entries } = await inspectBackup(file, staging);
    const free = freeBytes(root);
    const need = summary.totalBytes * 1.05 + 64 * 1024 * 1024;
    if (free !== null && free < need) {
      throw new BadRequestError(
        `Not enough free disk space to restore: it needs about ${Math.ceil(need / 1024 ** 2).toLocaleString("en-US")} MB and ${Math.floor(free / 1024 ** 2).toLocaleString("en-US")} MB is free.`,
      );
    }
    const next = path.join(staging, "new");
    fs.rmSync(next, { recursive: true, force: true });
    fs.mkdirSync(next, { recursive: true });
    try {
      for (const entry of entries) {
        if (entry.name === MANIFEST) continue;
        const target = targetOf(entry)!;
        if (target.length === 0) continue;
        const dest = path.join(next, ...target);
        if (entry.isDirectory) {
          fs.mkdirSync(dest, { recursive: true });
          continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        await extractZipEntry(file, entry, dest);
      }
      verifyDatabase(path.join(next, DB_FILE));
      for (const suffix of ["-wal", "-shm"]) fs.rmSync(path.join(next, DB_FILE + suffix), { force: true });
    } catch (e) {
      if (e instanceof ZipError) throw new BadRequestError(e.message);
      throw e;
    }
    const stamp = backupFileName(now).replace(/^infiniaibook-backup-/, "").replace(/\.zip$/, "");
    const previousFolder = path.join(root, `.pre-restore-${stamp}`);
    swapInto(root, next, path.join(staging, "old"), closeDb, move);
    fs.renameSync(path.join(staging, "old"), previousFolder);
    return { previousFolder, summary };
  } finally {
    active = null;
    if (staging) {
      fs.rmSync(path.join(staging, "new"), { recursive: true, force: true });
      // Keep the staging folder only when a failed swap left data in it.
      const aside = path.join(staging, "old");
      const stranded = fs.existsSync(aside) && fs.readdirSync(aside).length > 0;
      if (!stranded) fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}

export function snapshotLiveDatabase(exec: (sql: string) => void): (file: string) => void {
  return (file) => exec(`VACUUM INTO ${sqlQuote(file)}`);
}
