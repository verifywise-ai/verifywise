/**
 * What a scheduled run does with the memory of the sources: it sets apart the sources that an
 * earlier run showed to the model, and names the sources of a run for the memory. Every run reads
 * the memory for its de-duplication too (pipeline.ts), which sets nothing apart. A source that a
 * new risk cut by the caps of a run cites is left out of that run's memory (pipeline.ts), and so is
 * the change of a page where the vendor states its terms: its document is the page, which the run
 * remembers only when the model was shown the page itself. A source is a document, named by
 * `sourceKey` (see services/webResearch/urlCanon.ts), so that the spellings of one address are one
 * source. A change that the model was shown is remembered under a key of its own (`changeKeyOf`),
 * which no document has, so that it sets nothing apart and the de-duplication knows it was shown.
 */
import { sourceKey } from "../webResearch/urlCanon";
import { CHANGE_FRAGMENT } from "./evidence";

/** The keys of the sources, each once, in order. An address that has no key is left out. */
export function keysOfSources(sources: ReadonlyArray<{ url: string }>): string[] {
  const keys = new Set<string>();
  for (const { url } of sources) {
    const key = sourceKey(url);
    if (key !== null) keys.add(key);
  }
  return [...keys];
}

export interface SplitSources<T> {
  /** The entries whose document no earlier run showed to the model, in the order they came in. */
  fresh: T[];
  /** The keys of the documents that were set apart, each once. */
  knownKeys: string[];
  /** How many entries were set apart. */
  skipped: number;
}

/**
 * Sets the entries whose document is in `known` apart from the rest. An entry whose address has no
 * key is never known, so it stays with the rest: the evidence pack drops it when it cannot be used.
 */
export function splitKnownSources<T extends { url: string }>(
  entries: readonly T[],
  known: ReadonlySet<string>,
): SplitSources<T> {
  const fresh: T[] = [];
  const knownKeys = new Set<string>();
  let skipped = 0;
  for (const entry of entries) {
    const key = sourceKey(entry.url);
    if (key !== null && known.has(key)) {
      knownKeys.add(key);
      skipped += 1;
    } else {
      fresh.push(entry);
    }
  }
  return { fresh, knownKeys: [...knownKeys], skipped };
}

/**
 * The key under which the memory holds a change of a page where the vendor states its terms: the
 * key of the page and the fragment of the change (`changeEntryOf` in policySnapshots.ts). A key of
 * a document never has a fragment (`sourceKey`), so no source is ever set apart by it. Null for an
 * address that is not one of a change, or that has no key.
 */
export function changeKeyOf(url: string): string | null {
  const fragment = CHANGE_FRAGMENT.exec(url);
  if (fragment === null) return null;
  const key = sourceKey(url);
  return key === null ? null : `${key}${fragment[0]}`;
}

/** The keys of the changes among the sources (`changeKeyOf`), each once, in order. */
export function changeKeysOf(sources: ReadonlyArray<{ url: string }>): string[] {
  const keys = new Set<string>();
  for (const { url } of sources) {
    const key = changeKeyOf(url);
    if (key !== null) keys.add(key);
  }
  return [...keys];
}

/**
 * Whether a source that a stored finding cites is one that no run remembers having shown (see
 * `dropDuplicates`): the caps of the run that showed it cut a candidate that cited it. A change is
 * looked up by its own key, since its page is remembered only when the model was shown the page.
 */
export function forgottenIn(memory: ReadonlySet<string>): (url: string) => boolean {
  return (url) => {
    const key = changeKeyOf(url) ?? sourceKey(url);
    return key !== null && !memory.has(key);
  };
}
