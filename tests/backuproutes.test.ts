import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DELETE as discard, POST as apply } from "@/app/api/backup/restore/[token]/route";
import { GET as inbox, POST as stage } from "@/app/api/backup/restore/route";
import { GET as download } from "@/app/api/backup/route";
import { db } from "@/lib/db";
import { dataDir } from "@/lib/paths";
import { readZipDirectory } from "@/lib/zipstream";

const titles = () => (db.prepare("SELECT title FROM notebooks ORDER BY title").all() as unknown as { title: string }[]).map((r) => r.title);

async function downloadZip(): Promise<{ file: string; bytes: Buffer }> {
  const res = await download();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/zip");
  expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="infiniaibook-backup-\d{8}-\d{6}\.zip"$/);
  const bytes = Buffer.from(await res.arrayBuffer());
  const file = path.join(os.tmpdir(), `dl-${Date.now()}.zip`);
  fs.writeFileSync(file, bytes);
  return { file, bytes };
}

const post = (url: string, body: BodyInit, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${url}`, { method: "POST", body, headers });

describe("backup and restore routes", () => {
  it("backs up a running app and restores it, only after explicit confirmation", async () => {
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?, ?, ?, ?)").run("nb-kept", "Kept notebook", "📓", 1);
    fs.mkdirSync(path.join(dataDir(), "music"), { recursive: true });
    fs.writeFileSync(path.join(dataDir(), "music", "t.mp3"), "tune");
    fs.writeFileSync(path.join(dataDir(), ".env"), "SECRET=1");

    const { file, bytes } = await downloadZip();
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const names = readZipDirectory(file).map((e) => e.name);
    expect(names).toContain("manifest.json");
    expect(names).toContain("data/music/t.mp3");
    expect(names.some((n) => n.includes(".env"))).toBe(false);

    // Change things after the backup was taken.
    db.prepare("DELETE FROM notebooks WHERE id = ?").run("nb-kept");
    db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?, ?, ?, ?)").run("nb-new", "Made later", "📓", 2);
    fs.rmSync(path.join(dataDir(), "music"), { recursive: true });
    expect(titles()).toEqual(["Made later"]);

    const staged = await stage(post("/api/backup/restore", new Uint8Array(bytes), { "content-type": "application/zip", "content-length": String(bytes.length) }));
    expect(staged.status).toBe(200);
    const { token, summary } = (await staged.json()) as { token: string; summary: { counts: { notebooks: number } } };
    expect(summary.counts.notebooks).toBe(1);
    expect(titles()).toEqual(["Made later"]); // nothing replaced yet

    const ctx = { params: Promise.resolve({ token }) };
    const refused = await apply(post(`/api/backup/restore/${token}`, JSON.stringify({}), { "content-type": "application/json" }), ctx);
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/confirm/i);
    expect(titles()).toEqual(["Made later"]);

    const done = await apply(post(`/api/backup/restore/${token}`, JSON.stringify({ confirm: "replace" }), { "content-type": "application/json" }), ctx);
    expect(done.status, JSON.stringify(await done.clone().json())).toBe(200);
    const result = (await done.json()) as { restored: boolean; previousFolder: string };
    expect(result.restored).toBe(true);
    expect(titles()).toEqual(["Kept notebook"]); // the shared connection reopened on the restored file
    expect(fs.readFileSync(path.join(dataDir(), "music", "t.mp3"), "utf8")).toBe("tune");
    expect(fs.readFileSync(path.join(dataDir(), ".env"), "utf8")).toBe("SECRET=1");
    expect(titlesIn(result.previousFolder)).toEqual(["Made later"]);
  });

  it("refuses a body that is not a backup, and a made-up restore token", async () => {
    const res = await stage(post("/api/backup/restore", "not a zip at all, just words", { "content-type": "application/zip" }));
    expect(res.status).toBe(400);
    const gone = await discard(new Request("http://localhost:3000/api/backup/restore/x"), { params: Promise.resolve({ token: "../../etc" }) });
    expect(gone.status).toBe(400);
    const missing = await apply(
      post("/api/backup/restore/aaaaaaaaaaaaaaaaaaaa", JSON.stringify({ confirm: "replace" }), { "content-type": "application/json" }),
      { params: Promise.resolve({ token: "aaaaaaaaaaaaaaaaaaaa" }) },
    );
    expect(missing.status).toBe(400);
  });

  it("lists archives in the restore-inbox folder and rejects names outside it", async () => {
    const dir = path.join(dataDir(), "restore-inbox");
    fs.mkdirSync(dir, { recursive: true });
    const { bytes } = await downloadZip();
    fs.writeFileSync(path.join(dir, "big.zip"), bytes);
    const list = (await (await inbox()).json()) as { inbox: { name: string }[] };
    expect(list.inbox.map((f) => f.name)).toEqual(["big.zip"]);

    const ok = await stage(post("/api/backup/restore", JSON.stringify({ inbox: "big.zip" }), { "content-type": "application/json" }));
    expect(ok.status).toBe(200);
    const { token } = (await ok.json()) as { token: string };
    expect((await discard(new Request("http://x"), { params: Promise.resolve({ token }) })).status).toBe(200);

    const bad = await stage(post("/api/backup/restore", JSON.stringify({ inbox: "../infiniaibook.db" }), { "content-type": "application/json" }));
    expect(bad.status).toBe(400);
  });
});

function titlesIn(folder: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const c = new DatabaseSync(path.join(folder, "infiniaibook.db"), { readOnly: true });
  try {
    return (c.prepare("SELECT title FROM notebooks ORDER BY title").all() as unknown as { title: string }[]).map((r) => r.title);
  } finally {
    c.close();
  }
}
