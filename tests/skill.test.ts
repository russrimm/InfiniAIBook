import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The published agent skill (skills/infiniaibook) has to stay installable and
// has to keep describing routes that exist, or it quietly teaches agents calls
// that fail.
const root = path.resolve(__dirname, "..");
const skillDir = path.join(root, "skills", "infiniaibook");
const read = (...p: string[]) => fs.readFileSync(path.join(skillDir, ...p), "utf8");

function frontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) throw new Error("SKILL.md has no frontmatter");
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function routeFiles(dir: string, base = ""): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${base}/${entry.name}`;
    if (entry.isDirectory()) found.push(...routeFiles(path.join(dir, entry.name), rel));
    else if (entry.name === "route.ts") found.push(base || "/");
  }
  return found;
}

const segments = (p: string) =>
  p
    .split("/")
    .filter(Boolean)
    .map((s) => (/^\[.+\]$/.test(s) ? "*" : s));

const routes = routeFiles(path.join(root, "src", "app", "api"), "/api").map(segments);

function routeExists(apiPath: string): boolean {
  const want = segments(apiPath.replace(/\?.*$/, "")).map((s) => (/^\{.+\}$/.test(s) ? "*" : s));
  return routes.some(
    (r) => r.length === want.length && r.every((s, i) => s === "*" || want[i] === "*" || s === want[i])
  );
}

describe("skills/infiniaibook", () => {
  const skill = read("SKILL.md");
  const fm = frontmatter(skill);

  it("has valid Agent Skills frontmatter", () => {
    expect(fm.name).toBe("infiniaibook");
    expect(fm.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(fm.name.length).toBeLessThanOrEqual(64);
    expect(fm.description.length).toBeGreaterThan(0);
    expect(fm.description.length).toBeLessThanOrEqual(1024);
    expect((fm.compatibility ?? "").length).toBeLessThanOrEqual(500);
    // A colon followed by a space would end a plain YAML scalar early.
    expect(fm.description).not.toMatch(/: /);
    expect(fm.compatibility ?? "").not.toMatch(/: /);
  });

  it("keeps SKILL.md short and its references present", () => {
    expect(skill.split(/\r?\n/).length).toBeLessThanOrEqual(500);
    for (const link of skill.matchAll(/`(references\/[a-z-]+\.md)`/g)) {
      expect(fs.existsSync(path.join(skillDir, link[1])), link[1]).toBe(true);
    }
  });

  it("matches the Node version the app requires", () => {
    const engines = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).engines.node;
    const min = /(\d+\.\d+)/.exec(engines)?.[1];
    expect(min).toBeTruthy();
    expect(fm.compatibility).toContain(min);
    expect(read("references", "setup.md")).toContain(min!);
  });

  it("only mentions API routes that exist", () => {
    const text = ["SKILL.md", "references/api.md", "references/setup.md", "references/troubleshooting.md"]
      .map((f) => read(...f.split("/")))
      .join("\n");
    const mentioned = new Set<string>();
    for (const m of text.matchAll(/(?:\$B)?(\/api\/[A-Za-z0-9_{}\-/]+)/g)) {
      mentioned.add(m[1].replace(/\/+$/, ""));
    }
    expect(mentioned.size).toBeGreaterThan(20);
    const missing = [...mentioned].filter((p) => !routeExists(p));
    expect(missing).toEqual([]);
  });

  it("names every artifact type the generate route accepts", () => {
    const types = fs.readFileSync(path.join(root, "src", "lib", "types.ts"), "utf8");
    const union = /export type ArtifactType =([\s\S]*?);/.exec(types)![1];
    const all = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const api = read("references", "api.md");
    // The long-form media types have their own routes; the rest go to /api/generate.
    for (const t of all.filter((x) => !["video", "motion", "training", "podcast"].includes(x))) {
      expect(api, t).toContain(`\`${t}\``);
    }
  });
});
