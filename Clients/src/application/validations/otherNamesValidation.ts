/**
 * Validates the other names of a vendor, the text of the optional "Other names" field: names
 * separated by commas, semicolons or line breaks. It holds the limits of the server (see
 * `validateOtherNames` in Servers/utils/validations/vendorValidation.utils.ts), so that a text
 * the form accepts is a text the server accepts: 500 characters in all, 8 names, each of 2 to 80
 * characters with a letter or a digit in it. A name that is written twice counts once.
 */

const MAX_CHARS = 500;
const MAX_NAMES = 8;
const MIN_NAME_CHARS = 2;
const MAX_NAME_CHARS = 80;

/** A name for comparing: lower case, letters and digits only ("Face-Book" and "facebook" are one). */
const nameKey = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const refused = (message: string) => ({ accepted: false, message });

export function checkOtherNames(value: string): { accepted: boolean; message: string } {
  const text = value.trim();
  if (text.length > MAX_CHARS) {
    return refused(`Other names must be at most ${MAX_CHARS} characters`);
  }
  const names = text
    .split(/[,;\n\r]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");
  if (names.some((name) => name.length < MIN_NAME_CHARS || name.length > MAX_NAME_CHARS)) {
    return refused(
      `Each of the other names must be between ${MIN_NAME_CHARS} and ${MAX_NAME_CHARS} characters`,
    );
  }
  if (names.some((name) => nameKey(name) === "")) {
    return refused("Each of the other names must contain a letter or a digit");
  }
  if (new Set(names.map(nameKey)).size > MAX_NAMES) {
    return refused(`Other names can list at most ${MAX_NAMES} names`);
  }
  return { accepted: true, message: "" };
}
