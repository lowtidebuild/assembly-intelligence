/**
 * Tiny HTML entity decoder for MCP text fields.
 *
 * The Assembly MCP API (and others) sometimes returns text with raw
 * HTML entities like `&middot;` or `&#183;`. Store decoded — that's the
 * right level, since we never want to display the entities literally,
 * and we use <pre>/plain text rendering, so there's no XSS angle.
 *
 * We intentionally keep this list small (named entities that actually
 * appear in real 22대 data as of 2026-04) + generic numeric decoder.
 * Expand if new entities show up.
 */

const NAMED_ENTITIES: Record<string, string> = {
  middot: "·",
  bull: "\u2022", // •
  bullet: "\u2022",
  amp: "&",
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // Korean punctuation occasionally seen in Assembly text
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  hellip: "\u2026",
  ndash: "\u2013",
  mdash: "\u2014",
  // Spaces
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  // Copyright / trademark
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  // Currency
  euro: "\u20ac",
  yen: "\u00a5",
  pound: "\u00a3",
  // Misc symbols seen in Assembly text
  shy: "\u00ad", // soft hyphen
  sim: "\u223c", // ∼
  deg: "\u00b0",
  plusmn: "\u00b1",
  times: "\u00d7",
  divide: "\u00f7",
  prime: "\u2032",
  Prime: "\u2033",
};

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

export function decodeHtmlEntities(input: string): string;
export function decodeHtmlEntities(input: null): null;
export function decodeHtmlEntities(input: undefined): undefined;
export function decodeHtmlEntities(
  input: string | null | undefined,
): string | null | undefined;
export function decodeHtmlEntities(
  input: string | null | undefined,
): string | null | undefined {
  if (input == null) return input;
  if (!input.includes("&")) return input;
  return input.replace(ENTITY_RE, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const replacement = NAMED_ENTITIES[body.toLowerCase()];
    return replacement ?? match;
  });
}
