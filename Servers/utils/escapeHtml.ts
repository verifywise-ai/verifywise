/**
 * Escapes text for HTML: the five characters that can open or close markup, in the content of an
 * element and in a quoted attribute (& < > " '). Use it on text that someone else wrote (a person,
 * a web page, a model) before it is put into an HTML email or page, so that it shows as typed and
 * cannot add a tag, a link or an image of its own.
 *
 * It is for plain text only. Text that is HTML already is escaped a second time (`&lt;` becomes
 * `&amp;lt;`), and a URL needs its scheme checked as well as its quotes escaped.
 *
 * A value that is not a string is converted to one first, so a caller that was not checked by the
 * compiler gets text such as "undefined" in the email rather than an error.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
