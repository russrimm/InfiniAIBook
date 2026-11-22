import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Bicep templates cannot be deployed from a test, so these read them and
 * keep the security properties from being edited away: secrets stay secure
 * and long, and the Key Vault keeps soft delete and purge protection.
 */

const infra = path.join(process.cwd(), "infra");
const read = (...parts: string[]) => fs.readFileSync(path.join(infra, ...parts), "utf8");

/** The decorators written directly above `param <name>`. */
function decorators(source: string, name: string): string[] {
  const lines = source.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^param ${name}\\b`).test(l));
  expect(at, `param ${name}`).toBeGreaterThanOrEqual(0);
  const found: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i]!.startsWith("@"); i--) found.push(lines[i]!.trim());
  return found;
}

const minLength = (decs: string[]) => Number(decs.map((d) => /^@minLength\((\d+)\)/.exec(d)?.[1]).find(Boolean) ?? 0);

describe("infra/main.bicep", () => {
  const main = read("main.bicep");

  it("keeps the password and session secret secure, with a minimum length", () => {
    const password = decorators(main, "appPassword");
    expect(password).toContain("@secure()");
    expect(minLength(password)).toBeGreaterThanOrEqual(12);

    const session = decorators(main, "sessionSecret");
    expect(session).toContain("@secure()");
    expect(minLength(session)).toBeGreaterThanOrEqual(32);
  });

  it("marks every parameter that looks like a credential as secure", () => {
    for (const file of ["main.bicep", "modules/key-vault.bicep"]) {
      const source = read(...file.split("/"));
      for (const [, name] of source.matchAll(/^param (\w*(?:password|secret|apikey|token)\w*)\s/gim)) {
        expect(decorators(source, name!), `${file}: ${name}`).toContain("@secure()");
      }
    }
  });

  it("hands the Key Vault module the same limits", () => {
    const vault = read("modules", "key-vault.bicep");
    expect(minLength(decorators(vault, "appPassword"))).toBeGreaterThanOrEqual(12);
    expect(minLength(decorators(vault, "sessionSecret"))).toBeGreaterThanOrEqual(32);
  });
});

describe("infra/modules/key-vault.bicep", () => {
  const vault = read("modules", "key-vault.bicep");

  it("keeps soft delete on, purge protection on by default, and the vault private", () => {
    expect(vault).toMatch(/enableSoftDelete:\s*true/);
    expect(vault).toMatch(/enablePurgeProtection:\s*purgeProtection \? true : null/);
    expect(vault).toMatch(/param purgeProtection bool = true/);
    expect(vault).toMatch(/publicNetworkAccess:\s*'Disabled'/);
    expect(vault).toMatch(/enableRbacAuthorization:\s*true/);
    // Azure rejects an explicit false once purge protection is on.
    expect(vault).not.toMatch(/enablePurgeProtection:\s*false/);
  });

  it("is switched on from main.bicep, where it can be turned off for a throwaway environment", () => {
    const main = read("main.bicep");
    expect(main).toMatch(/param keyVaultPurgeProtection bool = true/);
    expect(main).toMatch(/purgeProtection:\s*keyVaultPurgeProtection/);
  });
});
