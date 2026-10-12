/**
 * Escaping for text that goes into a prompt. Third parties wrote the pages and the search results
 * that a model reads, so none of that text may close a tag of the prompt or open a new one: it goes
 * through `escapeForPrompt`, and a value inside double quotes through `escapeAttribute`.
 */

/** Replaces `&`, `<` and `>` with `&amp;`, `&lt;` and `&gt;`. The ampersand goes first. */
export function escapeForPrompt(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Reverses `escapeForPrompt`, and only that: it decodes the three entities and no others. The
 * ampersand goes last, so that "&amp;lt;" gives "&lt;" and not "<". The model sees escaped
 * snippets, so the quotes it returns have to be decoded before they are compared with the
 * original text.
 */
export function unescapeFromPrompt(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** For a value inside double quotes, where a double quote has to be escaped as well. */
export function escapeAttribute(value: string): string {
  return escapeForPrompt(value).replace(/"/g, "&quot;");
}
