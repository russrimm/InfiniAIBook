/**
 * Turning markup fragments into plain text.
 *
 * Both helpers are deliberately simple and conservative. They produce text for
 * display and indexing, never HTML, so nothing here is a sanitizer.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,15}));/g;

function codePointText(code: number): string | null {
  const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return valid ? String.fromCodePoint(code) : null;
}

/**
 * Decode HTML entities in a single left-to-right pass.
 *
 * The text an entity decodes to is never decoded again, so `&amp;lt;` becomes
 * `&lt;` (the characters the author typed) and not `<`. Decoding `&amp;` first
 * and then the rest, as a chain of replacements does, gets that wrong.
 * Unknown or malformed entities are left as they are.
 */
export function decodeEntities(s: string): string {
  return s.replace(ENTITY, (whole, dec?: string, hex?: string, name?: string) => {
    if (name) return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : whole;
    return codePointText(dec ? Number(dec) : parseInt(hex ?? "", 16)) ?? whole;
  });
}

const TAG = /<\/?[a-z][^<>]*>|<!--[\s\S]*?-->/gi;

/**
 * Remove HTML tags until none are left.
 *
 * One pass is not enough: removing the tag inside `<scr<b>ipt>` joins the
 * pieces around it into a new `<script>` tag, so the removal repeats until the
 * text stops changing.
 */
export function stripTags(s: string): string {
  let previous: string;
  do {
    previous = s;
    s = s.replace(TAG, "");
  } while (s !== previous);
  return s;
}
