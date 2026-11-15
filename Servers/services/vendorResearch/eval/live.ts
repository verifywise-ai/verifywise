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
 * As in the product, the run looks the vendor up in the public databases it asks itself (Have I
 * Been Pwned and the status page, records/) and in the copies of the lists of the vendor risk
 * database, both behind the records switch (VENDOR_RESEARCH_RECORDS). The sources the database
 * reads through (the NVD, GLEIF, the SEC) are not asked: a read-through stores its answer in the
 * database and spends the turns at those sources that the workers of the product share, so a live
 * run is offered none of them and its coverage names them as not researched.
 *
 * Nothing is written to the vendor, its findings or its runs, and no match of the vendor risk
 * database is kept. With `record` the web, the model and the databases are recorded as they
 * answer (see recorder.ts).
 */
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { createPageReader } from "../../webResearch/readPage";
import { getVendorResearchConfig } from "../config";
import { resolveOrgModel } from "../pipeline";
import { sharedRecordsLookup } from "../records";
import { type RunHooks, createRunSearch } from "../researchAgent";
import { buildTarget } from "../target";
import { createTraceRecorder } from "../trace";
import { type LookupStore, createVrdbLookup, databaseLookupStore } from "../vrdb/lookup";
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
  const config = getVendorResearchConfig();

  // The search of the key writes its calls to the model into this trace, before the run starts it.
  const trace = createTraceRecorder();
  // The run hands its hooks over when it starts (see `bindHooks` below), after the engine is built:
  // until then, and for an engine that is never told, they do nothing.
  let hooks: RunHooks | null = null;
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
      onRetry: () => hooks?.onRetry(),
      onPause: (waitMs) => hooks?.onPause(waitMs),
      onRefused: (refusal) => hooks?.onRefused(refusal),
      onFailed: (failure) => hooks?.onFailed(failure),
    }).engine,
    readPage: createPageReader(),
    generate: generateObjectWithSelfCorrection,
    // The lookup of the process, as the product's; none when the records are switched off.
    records: sharedRecordsLookup(config),
    // The copies are read as the product reads them, and the match of a vendor that is not stored
    // is not kept.
    vrdbStore: {
      ...databaseLookupStore,
      recordMatches: async () => undefined,
    } satisfies LookupStore,
  };
  const recorder = record ? createRecorder({ ...live, vrdbEnabled: config.records }) : null;
  const { records, vrdbStore } = recorder ?? live;

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
  const { engine, readPage, generate } = recorder ?? live;
  const run = await runEvalCase(evalCase, {
    engine,
    readPage,
    generate,
    ...(records === undefined ? {} : { records }),
    // No vendor row and no read-through: see the module comment.
    ...(vrdbStore === undefined
      ? {}
      : {
          vrdb: createVrdbLookup({
            store: vrdbStore,
            organizationId: options.orgId,
            vendorId: 0,
            enabled: config.records,
          }),
        }),
    model: resolved.model,
    modelId: resolved.modelId,
    // The analysis and its verifier use the key the organization chose for them, as in the product.
    ...(resolved.analysis ? { analysis: resolved.analysis } : {}),
    trace,
    // As in the product, a wait of the news engine for a pause of GDELT moves the clock of the
    // routine work, and a refusal is counted and traced.
    bindHooks: (given) => {
      hooks = given;
    },
  });
  return { run, recording: recorder?.recording() ?? null };
}
