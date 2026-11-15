/**
 * Records a live run into a `Recording` (see types.ts) by standing between the researcher and the
 * web, the model and the databases. What the search engine answered, what each page read gave or
 * why it failed, the steps the model took and its analysis, what the public databases answered and
 * what the copies of the vendor risk database held are kept as the run goes, so that the same run
 * can be replayed later with no network, no database and no model, and added to the cases once a
 * person has written what it should have found.
 *
 * It changes nothing about the run: every call is passed on, and a failure is passed on as it is.
 */
import type { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { PageReadError, type PageReader } from "../../webResearch/readPage";
import type { SearchEngine } from "../../webResearch/webSearch";
import { type Hints, hintsSchema } from "../hints";
import { type Verdicts, verifierSchema } from "../verifier";
import { loopScopeOf } from "../prompts";
import type { RecordsLookup } from "../records/types";
import type { LookupStore } from "../vrdb/lookup";
import { credibilityOutputSchema } from "../schema";
import type { Recording } from "./types";

export interface Recorder {
  engine: SearchEngine;
  readPage: PageReader;
  generate: typeof generateObjectWithSelfCorrection;
  /** The lookup in the public databases, when the run has one: its outcomes are recorded. */
  records?: RecordsLookup;
  /**
   * The store of the lookup in the vendor risk database, when the run has one: the records it
   * found and where the copies of the lists stand are recorded.
   */
  vrdbStore?: LookupStore;
  recording(): Recording;
}

export function createRecorder(real: {
  engine: SearchEngine;
  readPage: PageReader;
  generate: typeof generateObjectWithSelfCorrection;
  records?: RecordsLookup;
  vrdbStore?: LookupStore;
  /**
   * Whether the lookup in the vendor risk database is on for the run (the records switch). Left
   * out it is on. Off, nothing is read from the store, so the recording says the lists were off.
   */
  vrdbEnabled?: boolean;
}): Recorder {
  const recording: Recording = {
    steps: [],
    searches: [],
    pages: [],
    analysis: { findings: [], category_notes: [] },
  };

  const generate = (async (params: { schema: unknown; prompt: string }, ...rest: unknown[]) => {
    const answer = await (real.generate as (...args: unknown[]) => Promise<{ object: unknown }>)(
      params,
      ...rest,
    );
    if (params.schema === credibilityOutputSchema) {
      recording.analysis = answer.object as Recording["analysis"];
    } else if (params.schema === hintsSchema) {
      recording.hints = answer.object as Hints;
    } else if (params.schema === verifierSchema) {
      recording.verifier = answer.object as Verdicts;
    } else {
      const step = answer.object as Recording["steps"][number];
      // A loop of one category has a list of its own, since the loops run at once.
      const scope = loopScopeOf(params.prompt);
      if (scope === null) recording.steps.push(step);
      else ((recording.loops ??= {})[scope] ??= []).push(step);
    }
    return answer;
  }) as unknown as typeof generateObjectWithSelfCorrection;

  const { records, vrdbStore } = real;
  // A run whose records were off read no copy, and a replay with no copies at all would have no
  // coverage; the mark makes the replay give every list as off, as the live run did.
  if (vrdbStore !== undefined && real.vrdbEnabled === false) {
    recording.vrdb = { rows: [], states: [], enabled: false };
  }
  const copies = () => (recording.vrdb ??= { rows: [], states: [] });
  /**
   * A read of the store that fails leaves empty copies in the recording: the lookup then offers
   * nothing and gives every list it researches as failed (vrdb/lookup.ts), and a replay of copies
   * with no state gives the same. Copies that were half read would offer what the run did not, and
   * no copies at all would replay with no coverage.
   */
  let storeFailed = false;
  const keptOrForgotten = async <T>(read: () => Promise<T>, keep: (value: T) => void) => {
    try {
      const value = await read();
      // The two reads run at once: one that ends after the other failed is not kept either.
      if (!storeFailed) keep(value);
      return value;
    } catch (error) {
      storeFailed = true;
      recording.vrdb = { rows: [], states: [] };
      throw error;
    }
  };

  return {
    ...(records === undefined
      ? {}
      : {
          records: async (input) => {
            const outcomes = await records(input);
            recording.records = outcomes.map((outcome) => ({ ...outcome }));
            return outcomes;
          },
        }),
    ...(vrdbStore === undefined
      ? {}
      : {
          vrdbStore: {
            sourceStates: (ids) =>
              keptOrForgotten(
                () => vrdbStore.sourceStates(ids),
                (states) => {
                  copies().states = [...states];
                },
              ),
            findRecords: (keys, sources) =>
              keptOrForgotten(
                () => vrdbStore.findRecords(keys, sources),
                (rows) => {
                  copies().rows = [...rows];
                },
              ),
            // Passed on as it is: the live run gives a store that keeps no match (live.ts).
            recordMatches: (...args) => vrdbStore.recordMatches(...args),
          },
        }),
    engine: {
      // What the engine is, read from it each time: an engine that falls back to another one (the
      // search of a key that is not allowed to search) changes its kinds, and the session reads them.
      get id() {
        return real.engine.id;
      },
      get kinds() {
        return real.engine.kinds;
      },
      get newsWindowMonths() {
        return real.engine.newsWindowMonths;
      },
      async search(query, kind, signal) {
        const results = await real.engine.search(query, kind, signal);
        recording.searches.push({ kind, query, results: results.map((result) => ({ ...result })) });
        return results;
      },
    },
    async readPage(url, signal) {
      try {
        const page = await real.readPage(url, signal);
        recording.pages.push({ url, page });
        return page;
      } catch (error) {
        if (error instanceof PageReadError) recording.pages.push({ url, failure: error.reason });
        throw error;
      }
    },
    generate,
    recording: () => recording,
  };
}
