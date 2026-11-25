/**
 * Test helpers for reading the visible text out of a generated DOCX part.
 */

/**
 * Decodes the five XML entities. `&amp;` goes LAST: decoding it first would
 * turn a literal "&amp;quot;" into "&quot;" and then into a quote, decoding
 * the text twice.
 */
export const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The text runs of a WordprocessingML part, unescaped, one per line. */
export const xmlText = (xml: string): string =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => unescapeXml(m[1])).join("\n");
