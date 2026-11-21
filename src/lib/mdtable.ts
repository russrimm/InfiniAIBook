/**
 * Text as the content of one markdown table cell.
 *
 * Backslashes are escaped before pipes: the other way round, a literal `\|`
 * in the text would turn into `\\|`, an escaped backslash followed by a bare
 * pipe, which ends the cell. Line breaks would end the row, so they become spaces.
 */
export function tableCell(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\r?\n\s*/g, " ");
}
