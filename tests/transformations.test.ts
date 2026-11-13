import { describe, expect, it } from "vitest";
import {
  BUILTIN_TRANSFORMATIONS,
  TransformationInputError,
  createTransformation,
  deleteTransformation,
  getTransformation,
  listTransformations,
  updateTransformation,
} from "@/lib/transformations";

describe("built-in transformations", () => {
  it("have unique builtin: ids and non-empty prompts", () => {
    const ids = BUILTIN_TRANSFORMATIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of BUILTIN_TRANSFORMATIONS) {
      expect(t.id.startsWith("builtin:")).toBe(true);
      expect(t.builtin).toBe(true);
      expect(t.prompt.trim()).not.toBe("");
    }
  });

  it("can be read but not edited or deleted", () => {
    const id = BUILTIN_TRANSFORMATIONS[0].id;
    expect(getTransformation(id)?.builtin).toBe(true);
    expect(() => updateTransformation(id, { name: "x" })).toThrow(TransformationInputError);
    expect(() => deleteTransformation(id)).toThrow(TransformationInputError);
  });
});

describe("custom transformations", () => {
  it("creates, lists, updates and deletes one", () => {
    const t = createTransformation({ name: "  Haiku ", description: " short ", prompt: " Write a haiku. " });
    expect(t).toMatchObject({ name: "Haiku", description: "short", prompt: "Write a haiku.", builtin: false });

    const all = listTransformations();
    expect(all.slice(0, BUILTIN_TRANSFORMATIONS.length)).toEqual(BUILTIN_TRANSFORMATIONS);
    expect(all.some((x) => x.id === t.id)).toBe(true);

    const updated = updateTransformation(t.id, { name: "Haiku v2" });
    expect(updated).toMatchObject({ name: "Haiku v2", description: "short", prompt: "Write a haiku." });

    deleteTransformation(t.id);
    expect(getTransformation(t.id)).toBeNull();
  });

  it("requires a name and a prompt", () => {
    expect(() => createTransformation({ name: "x" })).toThrow("Name and prompt are required.");
    expect(() => createTransformation({ prompt: "x" })).toThrow(TransformationInputError);
    expect(() => createTransformation({ name: "   ", prompt: "x" })).toThrow(TransformationInputError);
  });

  it("truncates over-long fields", () => {
    const t = createTransformation({
      name: "n".repeat(200),
      description: "d".repeat(500),
      prompt: "p".repeat(9000),
    });
    expect(t.name).toHaveLength(80);
    expect(t.description).toHaveLength(300);
    expect(t.prompt).toHaveLength(8000);
  });

  it("keeps existing values when an update leaves a field blank", () => {
    const t = createTransformation({ name: "Keep", description: "desc", prompt: "do it" });
    const updated = updateTransformation(t.id, { name: " ", prompt: "" });
    expect(updated).toMatchObject({ name: "Keep", description: "desc", prompt: "do it" });
  });

  it("returns null when updating an unknown id", () => {
    expect(updateTransformation("missing", { name: "x" })).toBeNull();
  });
});
