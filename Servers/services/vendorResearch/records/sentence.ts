import { cleanText } from "../text";

const isFullStopOrBlank = (char: string): boolean => char === "." || /\s/.test(char);

/**
 * The text without the full stops and white space at its end. It looks at the end only, one
 * character at a time, so the time is linear in the length of what it cuts. A pattern anchored at
 * the end (`/[.\s]+$/`) tries every start in turn: a run of full stops or blanks in the middle of
 * a long text, as a hostile list can hold in any of its fields, would then cost the square of its
 * length.
 */
function withoutTrailingStops(text: string): string {
  let end = text.length;
  while (end > 0 && isFullStopOrBlank(text[end - 1])) end -= 1;
  return end === text.length ? text : text.slice(0, end);
}

/** "Label: value." with one full stop, or nothing for a field a database leaves empty. */
export const sentence = (label: string, value: string): string => {
  const clean = withoutTrailingStops(cleanText(value));
  return clean === "" ? "" : `${label}: ${clean}.`;
};

/** The sentences that are not empty, as one text. */
export const joinSentences = (parts: readonly string[]): string =>
  parts.filter((part) => part !== "").join(" ");
