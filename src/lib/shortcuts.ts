/** The keyboard shortcuts the notebook offers, shown in the Keyboard shortcuts dialog. */
export const SHORTCUTS: { keys: string[]; does: string; where: string }[] = [
  { keys: ["?"], does: "Show this list", where: "Anywhere in a notebook" },
  { keys: ["/"], does: "Jump to the question box", where: "Anywhere in a notebook" },
  { keys: ["Ctrl", "K"], does: "Open the command palette (Cmd+K on a Mac)", where: "Anywhere in a notebook" },
  { keys: ["↑"], does: "Move to the previous result", where: "Command palette" },
  { keys: ["↓"], does: "Move to the next result", where: "Command palette" },
  { keys: ["Enter"], does: "Run the chosen command", where: "Command palette" },
  { keys: ["Enter"], does: "Go to the next match", where: "Find in this chat" },
  { keys: ["Shift", "Enter"], does: "Go to the previous match", where: "Find in this chat" },
  { keys: ["Esc"], does: "Close Find and return to the question box", where: "Find in this chat" },
  { keys: ["Enter"], does: "Send the question", where: "Question box" },
  { keys: ["Shift", "Enter"], does: "Start a new line", where: "Question box" },
  { keys: ["Esc"], does: "Close the open dialog, or cancel a rename or edit", where: "Dialogs and inline forms" },
  { keys: ["Enter"], does: "Go to the next match", where: "Find in a source" },
  { keys: ["Shift", "Enter"], does: "Go to the previous match", where: "Find in a source" },
  { keys: ["Esc"], does: "Clear the search, then close the reader", where: "Find in a source" },
  { keys: ["↑"], does: "Move to the previous menu item", where: "More actions menu" },
  { keys: ["↓"], does: "Move to the next menu item", where: "More actions menu" },
];

export type Shortcut = "help" | "focus-chat";

/** True while the user is typing, so a plain key is text rather than a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * Which notebook shortcut a key press is, if any. Ignored while typing, while
 * composing text, and with Ctrl, Alt or Meta held, so it never shadows the
 * browser or the operating system.
 */
export function shortcutFor(e: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  target?: EventTarget | null;
}): Shortcut | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat) return null;
  if (isTypingTarget(e.target ?? null)) return null;
  if (e.key === "?") return "help";
  if (e.key === "/") return "focus-chat";
  return null;
}
