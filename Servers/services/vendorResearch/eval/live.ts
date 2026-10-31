/**
 * A live run for the evaluation: one vendor, researched for real with the key of an organization,
 * the live search feed and the live pages, and not stored anywhere. It needs the database (to read
 * the key) and the network; the unit tests never load this module (the command line imports it
 * only when `--live` is given).
 *
 * Nothing is written to the vendor, its findings or its runs. With `record` the web and the model
 * are recorded as they answer (see recorder.ts).
 */
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { createPageReader } from "../../webResearch/readPage";
import { createBingEngine } from "../../webResearch/webSearch";
import { resolveOrgModel } from "../pipeline";
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

  const live = {
    engine: createBingEngine(),
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
  });
  return { run, recording: recorder?.recording() ?? null };
}
