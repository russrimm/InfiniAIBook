/** Source kinds the structure explorer is offered for. Kept free of parsers so client code can import it. */
export const XML_KINDS = new Set(["xml", "gpx", "kml", "svg", "rss", "atom", "xsd", "xhtml"]);
export const TABLE_KINDS = new Set(["csv", "tsv"]);
export const JSON_KINDS = new Set(["json", "har", "geojson", "jsonl"]);

export function isExplorable(kind: string): boolean {
  const k = kind.toLowerCase();
  return XML_KINDS.has(k) || TABLE_KINDS.has(k) || JSON_KINDS.has(k);
}
