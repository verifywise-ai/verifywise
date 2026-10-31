/**
 * What a scheduled run does with the memory of the sources: it sets apart the sources that an
 * earlier run showed to the model, and names the sources of a run for the memory. A source is a
 * document, named by `sourceKey` (see services/webResearch/urlCanon.ts), so that the spellings of
 * one address are one source.
 */
import { sourceKey } from "../webResearch/urlCanon";

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
