import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import {
  DB_FILE,
  SCHEMA_VERSION,
  collectDataFiles,
  createBackupStream,
  inspectBackup,
  newStaging,
  restoreStaged,
  snapshotLiveDatabase,
  swapInto,
} from "@/lib/backup";
import { readZipDirectory, writeZip, type ZipSource } from "@/lib/zipstream";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

let n = 0;
const fresh = (label: string) => {
  const dir = path.join(base, `${label}-${++n}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** A data folder with a real database (WAL mode, like the app's) and some media. */
function makeData(label: string, notebooks: string[], files: Record<string, string>) {
  const root = fresh(label);
  const conn = new DatabaseSync(path.join(root, DB_FILE));
  conn.exec("PRAGMA journal_mode = WAL");
  conn.exec(`
    CREATE TABLE notebooks (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE sources (id TEXT PRIMARY KEY);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY);
    CREATE TABLE notes (id TEXT PRIMARY KEY);
    CREATE TABLE messages (id TEXT PRIMARY KEY);
  `);
  for (const t of notebooks) conn.prepare("INSERT INTO notebooks VALUES (?, ?)").run(t, t);
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return { root, conn };
}

async function backupTo(root: string, conn: DatabaseSync, name: string): Promise<string> {
  const out = path.join(base, name);
  const chunks: Buffer[] = [];
  for await (const c of createBackupStream(snapshotLiveDatabase((sql) => conn.exec(sql)), { root })) chunks.push(c);
  fs.writeFileSync(out, Buffer.concat(chunks));
  return out;
}

function stage(root: string, archive: string) {
  const { token, staging } = newStaging(root, { kind: "upload" });
  fs.copyFileSync(archive, path.join(staging, "upload.zip"));
  return token;
}

const notebookTitles = (root: string) => {
  const c = new DatabaseSync(path.join(root, DB_FILE), { readOnly: true });
  try {
    return (c.prepare("SELECT title FROM notebooks ORDER BY title").all() as unknown as { title: string }[]).map((r) => r.title);
  } finally {
    c.close();
  }
};

describe("backup contents", () => {
  it("includes the database snapshot and media, but never secrets, staging or temp files", async () => {
    const { root, conn } = makeData("src", ["Alpha", "Beta"], {
      "video/clip.mp4": "mp4 bytes",
      "audio/a.mp3": "mp3 bytes",
      "music/track.mp3": "music",
      ".env": "AZURE_OPENAI_KEY=secret",
      ".env.local": "GEMINI_API_KEY=secret",
      "secrets.json": "{}",
      ".restore-abcdefabcdefabcdef/upload.zip": "staging",
      ".pre-restore-20260101-000000/old.txt": "old",
      "restore-inbox/other.zip": "another backup",
      "video/render.mp4.part": "partial",
      "video/.env": "nested env",
    });
    const rels = collectDataFiles(root).map((f) => f.rel);
    expect(rels).toEqual(["audio/a.mp3", "music/track.mp3", "video/clip.mp4"]);

    const zip = await backupTo(root, conn, "contents.zip");
    const names = readZipDirectory(zip).map((e) => e.name);
    expect(names).toEqual(["manifest.json", `db/${DB_FILE}`, "data/audio/a.mp3", "data/music/track.mp3", "data/video/clip.mp4"]);
    expect(names.join("\n")).not.toMatch(/env|secret|restore/i);

    const { summary } = await inspectBackup(zip, fresh("scratch"));
    expect(summary.counts.notebooks).toBe(2);
    expect(summary.fileCount).toBe(3);
    expect(summary.schemaVersion).toBe(SCHEMA_VERSION);
    conn.close();
  });

  it("snapshots a consistent database even with uncheckpointed WAL writes", async () => {
    const { root, conn } = makeData("wal", ["One"], {});
    conn.prepare("INSERT INTO notebooks VALUES (?, ?)").run("two", "Two");
    const zip = await backupTo(root, conn, "wal.zip");
    const { entries } = await inspectBackup(zip, fresh("scratch"));
    expect(entries.some((e) => e.name === `db/${DB_FILE}`)).toBe(true);
    const target = makeData("wal-target", ["Old"], {});
    target.conn.close();
    await restoreStaged(stage(target.root, zip), { root: target.root, closeDb: () => {} });
    expect(notebookTitles(target.root)).toEqual(["One", "Two"]);
    conn.close();
  });
});

describe("restore", () => {
  it("replaces the data, keeps the previous data aside, and leaves hidden files alone", async () => {
    const a = makeData("a", ["From backup"], { "video/new.mp4": "new", "audio/keep.mp3": "keep" });
    const zip = await backupTo(a.root, a.conn, "a.zip");
    a.conn.close();

    const b = makeData("b", ["Current"], { "video/old.mp4": "old", ".env": "KEEP_ME=1", "restore-inbox/x.zip": "x" });
    b.conn.close();
    let closed = 0;
    const result = await restoreStaged(stage(b.root, zip), { root: b.root, closeDb: () => closed++ });

    expect(closed).toBe(1);
    expect(notebookTitles(b.root)).toEqual(["From backup"]);
    expect(fs.readFileSync(path.join(b.root, "video/new.mp4"), "utf8")).toBe("new");
    expect(fs.existsSync(path.join(b.root, "video/old.mp4"))).toBe(false);
    expect(fs.readFileSync(path.join(b.root, ".env"), "utf8")).toBe("KEEP_ME=1");
    expect(fs.existsSync(path.join(b.root, "restore-inbox/x.zip"))).toBe(true);
    expect(fs.readFileSync(path.join(result.previousFolder, "video/old.mp4"), "utf8")).toBe("old");
    expect(notebookTitles(result.previousFolder)).toEqual(["Current"]);
    expect(fs.readdirSync(b.root).filter((x) => x.startsWith(".restore-"))).toEqual([]);
  });

  it("rolls back completely when a move fails part-way", async () => {
    const a = makeData("ra", ["Backup"], { "video/new.mp4": "new" });
    const zip = await backupTo(a.root, a.conn, "ra.zip");
    a.conn.close();
    const b = makeData("rb", ["Current"], { "video/old.mp4": "old", "audio/a.mp3": "a", "music/m.mp3": "m" });
    b.conn.close();
    const before = fs.readdirSync(b.root).sort();

    let calls = 0;
    const failing = (from: string, to: string) => {
      if (++calls === 5) throw new Error("disk went away");
      fs.renameSync(from, to);
    };
    await expect(
      restoreStaged(stage(b.root, zip), { root: b.root, closeDb: () => {}, move: failing }),
    ).rejects.toThrow(/Nothing was changed/);

    expect(fs.readdirSync(b.root).filter((x) => !x.startsWith(".restore-")).sort()).toEqual(before);
    expect(notebookTitles(b.root)).toEqual(["Current"]);
    expect(fs.readFileSync(path.join(b.root, "video/old.mp4"), "utf8")).toBe("old");
  });

  it("changes nothing when a file inside the archive is corrupted", async () => {
    const a = makeData("ca", ["Backup"], { "video/new.mp4": "x".repeat(200) });
    const zip = await backupTo(a.root, a.conn, "ca.zip");
    a.conn.close();
    const bytes = fs.readFileSync(zip);
    bytes[bytes.indexOf("xxxxxxxx") + 3] ^= 0xff;
    fs.writeFileSync(zip, bytes);

    const b = makeData("cb", ["Current"], { "video/old.mp4": "old" });
    b.conn.close();
    await expect(restoreStaged(stage(b.root, zip), { root: b.root, closeDb: () => {} })).rejects.toThrow(/integrity|corrupted/);
    expect(notebookTitles(b.root)).toEqual(["Current"]);
    expect(fs.existsSync(path.join(b.root, "video/old.mp4"))).toBe(true);
  });

  it("refuses a damaged database before touching the data", async () => {
    const sources: ZipSource[] = [
      manifest({ files: [] }),
      { name: `db/${DB_FILE}`, size: 20, open: () => Buffer.from("this is not a database") },
    ];
    const zip = await rawZip("baddb.zip", sources);
    const b = makeData("db", ["Current"], {});
    b.conn.close();
    await expect(restoreStaged(stage(b.root, zip), { root: b.root, closeDb: () => {} })).rejects.toThrow(/database is damaged/);
    expect(notebookTitles(b.root)).toEqual(["Current"]);
  });
});

function manifest(over: Record<string, unknown> = {}): ZipSource {
  const body = Buffer.from(
    JSON.stringify({
      format: "infiniaibook-backup",
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      appVersion: "test",
      createdAt: new Date().toISOString(),
      counts: {},
      files: [],
      ...over,
    }),
  );
  return { name: "manifest.json", size: body.length, open: () => body };
}

async function rawZip(name: string, sources: ZipSource[]): Promise<string> {
  const out = path.join(base, name);
  const chunks: Buffer[] = [];
  for await (const c of writeZip(sources)) chunks.push(c);
  fs.writeFileSync(out, Buffer.concat(chunks));
  return out;
}

const dbEntry = (): ZipSource => ({ name: `db/${DB_FILE}`, size: 1, open: () => Buffer.from("x") });

describe("archive validation", () => {
  const reject = async (name: string, sources: ZipSource[], message: RegExp) => {
    const zip = await rawZip(name, sources);
    await expect(inspectBackup(zip, fresh("scratch"))).rejects.toThrow(message);
  };

  it("refuses zip-slip paths", async () => {
    for (const evil of ["data/../../evil.txt", "../evil.txt", "/abs/evil.txt", "data/..\\evil.txt", "C:/evil.txt"]) {
      await reject("slip.zip", [manifest(), dbEntry(), { name: evil, size: 1, open: () => Buffer.from("x") }], /unsafe path|unexpected item/);
    }
  });

  it("refuses reserved names that could overwrite staging or secrets", async () => {
    await reject("reserved.zip", [manifest(), dbEntry(), { name: "data/.env", size: 1, open: () => Buffer.from("x") }], /reserved/);
    await reject("reserved2.zip", [manifest(), dbEntry(), { name: "data/.restore-aaaaaaaaaaaaaaaa/x", size: 1, open: () => Buffer.from("x") }], /reserved/);
    await reject("reserved3.zip", [manifest(), dbEntry(), { name: `data/${DB_FILE}-wal`, size: 1, open: () => Buffer.from("x") }], /reserved/);
  });

  it("refuses archives that are not backups, are incomplete, or come from a newer app", async () => {
    await reject("nomanifest.zip", [dbEntry()], /no manifest/);
    await reject("nodb.zip", [manifest()], /no database/);
    await reject("format.zip", [manifest({ format: "something-else" }), dbEntry()], /not an InfiniAIBook backup/);
    await reject("newer.zip", [manifest({ schemaVersion: SCHEMA_VERSION + 1 }), dbEntry()], /newer/);
    await reject("missing.zip", [manifest({ files: [{ path: "data/video/gone.mp4", size: 3 }] }), dbEntry()], /incomplete/);
    await reject("dup.zip", [manifest(), dbEntry(), dbEntry()], /more than once/);
    await reject("other.zip", [manifest(), dbEntry(), { name: "notes.txt", size: 1, open: () => Buffer.from("x") }], /unexpected item/);
  });

  it("refuses symbolic links", async () => {
    const zip = await rawZip("link.zip", [manifest(), dbEntry(), { name: "data/link", size: 1, open: () => Buffer.from("/etc/passwd") }]);
    const bytes = fs.readFileSync(zip);
    let at = -1;
    while ((at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), at + 1)) >= 0) {
      const nameLen = bytes.readUInt16LE(at + 28);
      if (bytes.toString("utf8", at + 46, at + 46 + nameLen) === "data/link") bytes.writeUInt32LE((0o120777 << 16) >>> 0, at + 38);
    }
    fs.writeFileSync(zip, bytes);
    await expect(inspectBackup(zip, fresh("scratch"))).rejects.toThrow(/symbolic link/);
  });

  it("explains a truncated or non-ZIP upload", async () => {
    const junk = path.join(base, "junk.zip");
    fs.writeFileSync(junk, "plain text, not an archive, but long enough to scan");
    await expect(inspectBackup(junk, fresh("scratch"))).rejects.toThrow(/not a complete ZIP|not a ZIP/);
  });
});

describe("swapInto", () => {
  it("reports where the previous data is when even the rollback fails", () => {
    const root = fresh("stuck");
    fs.mkdirSync(path.join(root, "a"));
    fs.mkdirSync(path.join(root, "b"));
    const next = fresh("next");
    fs.mkdirSync(path.join(next, "c"));
    let calls = 0;
    const aside = path.join(fresh("aside"), "old");
    expect(() =>
      swapInto(root, next, aside, () => {}, (from, to) => {
        // The first outgoing move works, then the disk "fails" for good.
        if (++calls > 1) throw new Error("boom");
        fs.renameSync(from, to);
      }),
    ).toThrow(new RegExp(`could not be put back.*${aside.replace(/[\\/.]/g, ".")}`));
    expect(fs.readdirSync(aside)).toEqual(["a"]);
  });
});
