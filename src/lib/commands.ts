/**
 * The command palette: one searchable list of things to do in a notebook.
 * The list itself is built where the handlers live (the workspace); this holds
 * the shape, the matching and the key that opens it.
 */

export type CommandGroup = "Actions" | "Studio" | "Sources" | "Shortcuts";

export type Command = {
  id: string;
  group: CommandGroup;
  label: string;
  /** A short explanation shown under the label. */
  detail?: string;
  /** Extra words that should find this command ("export" for Download). */
  keywords?: string;
  /** The key combination the same action already has, shown at the right. */
  keys?: string;
  run: () => void;
};

export const GROUP_ORDER: CommandGroup[] = ["Actions", "Studio", "Sources", "Shortcuts"];

/** Ctrl+K, or Cmd+K on a Mac. Works while typing, because it needs a modifier. */
export function isPaletteShortcut(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; isComposing?: boolean }): boolean {
  return (e.ctrlKey || e.metaKey) === true && !e.shiftKey && !e.altKey && !e.isComposing && e.key.toLowerCase() === "k";
}

/**
 * Commands matching every word typed, best first: a label that starts with the
 * query, then a word that starts with it, then any other match. Ties keep the
 * order they were given (group order, then the order of the list).
 */
export function filterCommands(commands: Command[], query: string, limit = 50): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored: { c: Command; score: number; i: number }[] = [];
  commands.forEach((c, i) => {
    const label = c.label.toLowerCase();
    const hay = `${label} ${c.detail ?? ""} ${c.keywords ?? ""} ${c.group}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return;
    let score = 3;
    if (!words.length) score = 3;
    else if (words.every((w) => label.startsWith(w) || label.includes(` ${w}`))) score = label.startsWith(words[0]) ? 0 : 1;
    else if (words.every((w) => label.includes(w))) score = 2;
    scored.push({ c, score, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).slice(0, limit).map((s) => s.c);
}
