/**
 * Records a live run into a `Recording` (see types.ts) by standing between the researcher and the
 * web and the model. What the search engine answered, what each page read gave or why it failed,
 * the steps the model took and its analysis are kept as the run goes, so that the same run can be
 * replayed later with no network and no model, and added to the cases once a person has written
 * what it should have found.
 *
 * It changes nothing about the run: every call is passed on, and a failure is passed on as it is.
 */
import type { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { PageReadError, type PageReader } from "../../webResearch/readPage";
import type { SearchEngine } from "../../webResearch/webSearch";
import { type Hints, hintsSchema } from "../hints";
import { type Verdicts, verifierSchema } from "../verifier";
import { loopScopeOf } from "../prompts";
import { researchOutputSchema } from "../schema";
import type { Recording } from "./types";

export interface Recorder {
  engine: SearchEngine;
  readPage: PageReader;
  generate: typeof generateObjectWithSelfCorrection;
  recording(): Recording;
}

export function createRecorder(real: {
  engine: SearchEngine;
  readPage: PageReader;
  generate: typeof generateObjectWithSelfCorrection;
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
    if (params.schema === researchOutputSchema) {
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

  return {
    engine: {
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
