/**
 * A live run for the evaluation: one vendor, researched for real with the key of an organization,
 * the live search and the live pages, and not stored anywhere. It needs the database (to read the
 * key) and the network; the unit tests never load this module (the command line imports it only
 * when `--live` is given).
 *
 * The run searches as the product does for that key: with the web search of the key's provider
 * (billed to the key) when it has one, and with the news of the GDELT Project, which needs no key,
 * for every other key and when the organization has no word of its search (see searchEngineOf.ts).
 * The engine is built for the vendor's name alone: the other names that its home page would add
 * in a real run are not known yet. The calls that the search of the key makes to its model are
 * told to the trace of the run, so that `--trace` shows them with the rest.
 *
 * Nothing is written to the vendor, its findings or its runs. With `record` the web and the model
 * are recorded as they answer (see recorder.ts).
 */
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { createPageReader } from "../../webResearch/readPage";
import { resolveOrgModel } from "../pipeline";
import { createRunSearch } from "../researchAgent";
import { buildTarget } from "../target";
import { createTraceRecorder } from "../trace";
import type { LiveOptions } from "./cli";
import { createRecorder } from "./recorder";
import { type CaseRun, runEvalCase } from "./runCase";
import type { EvalCase, Recording } from "./types";

export async function runLive(
  options: LiveOptions,
  record: boolean,
): Promise<{ run: CaseRun; recording: Recording | null }> {
  const resolved = await resolveOrgModel(options.orgId);
  if (!resolved) throw new Error("The organization has no LLM key");

  // The search of the key writes its calls to the model into this trace, before the run starts it.
  const trace = createTraceRecorder();
  const live = {
    // The engine of the key of the organization; GDELT when it says none.
    engine: createRunSearch({
      search: resolved.search,
      model: resolved.model,
      modelId: resolved.modelId,
      target: buildTarget({
        vendor_name: options.vendor,
        website: options.website,
        vendor_provides: options.provides,
      }),
      trace,
    }).engine,
    readPage: createPageReader(),
    generate: generateObjectWithSelfCorrection,
  };
  const recorder = record ? createRecorder(live) : null;

  const evalCase: EvalCase = {
    id: "live",
    title: options.vendor,
    reproduces: "A live run.",
    vendor: {
      name: options.vendor,
      website: options.website,
      provides: options.provides,
      ...(options.scorecard ? { scorecard: options.scorecard } : {}),
    },
    now: new Date().toISOString(),
    // A live run is made as the product makes it: the routine work done by code first, and then
    // one loop for each category, and the findings that stay are checked by the verifier.
    gather: true,
    perCategory: true,
    verifier: true,
    recording: {
      steps: [],
      searches: [],
      pages: [],
      analysis: { findings: [], category_notes: [] },
    },
    expected: { findings: [] },
    targets: {},
    gaps: {},
  };
  const run = await runEvalCase(evalCase, {
    ...(recorder ?? live),
    model: resolved.model,
    trace,
  });
  return { run, recording: recorder?.recording() ?? null };
}
