import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIT_LICENSE } from "@/lib/about";

const normalize = (value: string) => value.replace(/\r\n/g, "\n").trim();

describe("about metadata", () => {
  it("keeps the embedded MIT license in sync with LICENSE", () => {
    const license = readFileSync("LICENSE", "utf8");
    expect(normalize(MIT_LICENSE)).toBe(normalize(license));
  });
});
