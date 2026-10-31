import { cleanText } from "../text";

/** "Label: value." with one full stop, or nothing for a field a database leaves empty. */
export const sentence = (label: string, value: string): string => {
  const clean = cleanText(value).replace(/[.\s]+$/, "");
  return clean === "" ? "" : `${label}: ${clean}.`;
};

/** The sentences that are not empty, as one text. */
export const joinSentences = (parts: readonly string[]): string =>
  parts.filter((part) => part !== "").join(" ");
