/**
 * Validates the other names of a vendor, the text of the optional "Other names" field: names
 * separated by commas, semicolons or line breaks. It holds the limits of the server (see
 * `validateOtherNames` in Servers/utils/validations/vendorValidation.utils.ts), so that a text
 * the form accepts is a text the server accepts: 500 characters in all, as typed and as stored
 * (names joined by a comma and a space), 8 names, each of 2 to 80 characters with a letter or a
 * digit in it. A name that is written twice counts once.
 *
 * A part that holds nothing but legal forms or the article ends the name before it ("Acme
 * Analytics, Inc." is one name), as on the server (`otherNamesIn` in vendorValidation.utils.ts,
 * with the legal forms of `LEGAL_FORMS` in Servers/services/vendorResearch/identity.ts, which this
 * file copies). Both run the cases of
 * Servers/utils/validations/__fixtures__/otherNames.cases.json.
 */

const MAX_CHARS = 500;
const MAX_NAMES = 8;
const MIN_NAME_CHARS = 2;
const MAX_NAME_CHARS = 80;

/**
 * The C0 control characters that are not white space, and DEL, which the server drops from the
 * text before it splits and measures it (`CONTROL_CHARACTERS` in
 * Servers/utils/validations/vendorValidation.utils.ts). Tabs and line breaks are white space and stay.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000E-\u001F\u007F]/g;

/** `text` without its control characters, as the server reads it. */
export const withoutControlCharacters = (text: string): string =>
  text.replace(CONTROL_CHARACTERS, "");

/** A name for comparing: lower case, letters and digits only ("Face-Book" and "facebook" are one). */
const nameKey = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * The words a name is written without in an article: the legal forms of a company, as
 * Servers/services/vendorResearch/identity.ts lists them. Keep the two lists the same.
 */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "ag",
  "sa",
  "bv",
  "nv",
  "plc",
  "pty",
  "pte",
  "oy",
  "ab",
  "as",
  "sas",
  "sarl",
  "srl",
  "spa",
  "kk",
  "lp",
  "llp",
  "pvt",
  "a/s",
  "i/s",
  "k/s",
  "p/s",
  "n/v",
  "s/a",
]);

const bare = (token: string): string => token.toLowerCase().replace(/[.,]/g, "");

/** True for a legal form, in any case and with or without its dots, or the article "The". */
const isLegalFormOrArticle = (word: string): boolean => {
  const letters = bare(word);
  return letters === "the" || LEGAL_FORMS.has(letters);
};

/**
 * The names in a text of other names, in the order written: split at commas, semicolons and line
 * breaks, white space collapsed. A part that holds nothing but legal forms or the article ends the
 * name before it; with no name before it, it is a name (so a brand such as SAS can be written
 * first). The same as `otherNamesIn` on the server.
 */
export function otherNamesIn(text: string): string[] {
  const names: string[] = [];
  for (const part of text.split(/[,;\n\r]+/)) {
    const name = part.replace(/\s+/g, " ").trim();
    if (name === "") continue;
    if (names.length > 0 && name.split(" ").every(isLegalFormOrArticle)) {
      names[names.length - 1] += `, ${name}`;
    } else {
      names.push(name);
    }
  }
  return names;
}

/** The names once each, however they are written; the first way a name was written stays. */
function distinctNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = nameKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The text as the server stores it: the names once each, joined by a comma and a space. The same as
 * `normalizeOtherNames` on the server, except that no names is an empty text here.
 */
export function storedOtherNames(text: string): string {
  return distinctNames(otherNamesIn(withoutControlCharacters(text))).join(", ");
}

const refused = (message: string) => ({ accepted: false, message });

export function checkOtherNames(value: string): { accepted: boolean; message: string } {
  // Measured as the server stores it: without control characters.
  const text = withoutControlCharacters(value).trim();
  if (text.length > MAX_CHARS) {
    return refused(`Other names must be at most ${MAX_CHARS} characters`);
  }
  const names = otherNamesIn(text);
  // The server stores the names joined by a comma and a space, which is longer than a semicolon or
  // a line break, and holds the stored text to the same limit. Checked here too, so that a text
  // this form accepts is stored in a form that it accepts again when the vendor is edited.
  if (distinctNames(names).join(", ").length > MAX_CHARS) {
    return refused(
      `Other names must be at most ${MAX_CHARS} characters with a comma and a space between names`,
    );
  }
  if (names.some((name) => name.length < MIN_NAME_CHARS || name.length > MAX_NAME_CHARS)) {
    return refused(
      `Each of the other names must be between ${MIN_NAME_CHARS} and ${MAX_NAME_CHARS} characters`,
    );
  }
  if (names.some((name) => nameKey(name) === "")) {
    return refused("Each of the other names must contain a letter or a digit");
  }
  if (distinctNames(names).length > MAX_NAMES) {
    return refused(`Other names can list at most ${MAX_NAMES} names`);
  }
  return { accepted: true, message: "" };
}
