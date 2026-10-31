/**
 * Runs one evaluation case: the real researcher (the loop, the web session, the guarded rules) and
 * the real analysis over a recording of what the model and the web answered. Nothing here talks to
 * the network, a database or a model unless the caller passes a live engine, reader or generate in
 * `deps`, which is how the command line runs a vendor for real.
 *
 * The stand-in for the pipeline is small on purpose: the pipeline's other work is the database and
 * the wording of a failed run, and what is measured is the quality of the findings.
 */
import type { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import type { EvidenceSource, NewFinding } from "../../../domain.layer/interfaces/i.vendorResearch";
import type { PageReader } from "../../webResearch/readPage";
import type { SearchEngine, SearchKind } from "../../webResearch/webSearch";
import { withAliases } from "../aliases";
import { type Analysed, analyse } from "../analysis";
import type { Credibility } from "../credibility";
import { buildEvidencePack, provenanceOf } from "../evidence";
import { type ResearchResult, createVendorResearcher } from "../researchAgent";
import { buildMateriality } from "../materiality";
import type { ResearchRules } from "../schema";
import { type ResearchTarget, buildTarget } from "../target";
import { type RunTrace, createTraceRecorder } from "../trace";
import { offerRecords } from "../vrdb/lookup";
import type { VrdbLookup, VrdbRow } from "../vrdb/types";
import { createReplayEngine, createReplayPageReader, createScriptedGenerate } from "./replay";
import type { EvalCase, Recording } from "./types";

/**
 * The lookup in the vendor risk database over the copies a case holds: the rows the store's query
 * finds, which leaves out a vulnerability whose CVE any list rejected (findVrdbRecordsByKeysQuery,
 * Ruling 9 of the M2 plan), are offered as a run's lookup offers them (see vrdb/lookup.ts), with the
 * records on, and each read-through source answers as the case recorded. No database and no source
 * is asked; a read-through source the case recorded no answer of is not researched.
 */
const replayVrdb =
  (copies: NonNullable<Recording["vrdb"]>): VrdbLookup =>
  async (input) => {
    const isVulnerability = (row: VrdbRow) => row.recordType === "vulnerability";
    const rejected = new Set(
      copies.rows
        .filter((row) => isVulnerability(row) && row.status === "rejected")
        .map((row) => row.sourceRecordId),
    );
    const rows = copies.rows.filter(
      (row) => !isVulnerability(row) || !rejected.has(row.sourceRecordId),
    );
    const readThrough = new Map(
      (copies.readThrough ?? []).map(({ id, ...answer }) => [id, answer] as const),
    );
    return offerRecords({ ...input, rows, states: copies.states, enabled: true, readThrough })
      .outcome;
  };

export interface CaseRun {
  evalCase: EvalCase;
  target: ResearchTarget;
  found: ResearchResult;
  pack: EvidenceSource[];
  /** Null when the pack was empty: a run without a source asks no model. */
  analysed: Analysed | null;
  kept: NewFinding[];
  /** The credibility of each finding that was kept, in the order of `kept`. */
  credibility: Credibility[];
  trace: RunTrace;
  /** The feed that returned an address, when the engine knows (a replay does). */
  feedOf: (url: string) => SearchKind | undefined;
  /**
   * The text of every page the run read, by the address that was asked for, the reads after the
   * analysis (see verifySnippets.ts) included: what the measures look the quotes up in.
   */
  readTexts: ReadonlyMap<string, string>;
}

export interface CaseDeps {
  engine?: SearchEngine & { feedOf?: (url: string) => SearchKind | undefined };
  readPage?: PageReader;
  generate?: typeof generateObjectWithSelfCorrection;
  /** The model the calls are made with; a replay has none. */
  model?: unknown;
  /** The rules the analysis asks under; those of the pipeline (`confidence`) when absent. */
  rules?: ResearchRules;
}

export async function runEvalCase(evalCase: EvalCase, deps: CaseDeps = {}): Promise<CaseRun> {
  const { identifiers } = evalCase.vendor;
  const target = buildTarget({
    vendor_name: evalCase.vendor.name,
    website: evalCase.vendor.website,
    vendor_provides: evalCase.vendor.provides,
    other_names: evalCase.vendor.otherNames,
    country: identifiers?.country,
    registration_number: identifiers?.registrationNumber,
    lei: identifiers?.lei,
    sec_cik: identifiers?.secCik,
  });
  const materiality = buildMateriality(evalCase.vendor.scorecard ?? {});
  const now = new Date(evalCase.now);
  const { recording } = evalCase;

  const engine = deps.engine ?? createReplayEngine(recording.searches);
  const generate = deps.generate ?? createScriptedGenerate(recording);
  const model = deps.model ?? {};
  // What the run reads is kept, so that the measures can look a quote up in the page it was read from.
  const readTexts = new Map<string, string>();
  const reader = deps.readPage ?? createReplayPageReader(recording.pages);
  const readPage: PageReader = async (url, signal) => {
    const page = await reader(url, signal);
    readTexts.set(url, page.text);
    return page;
  };
  const researcher = createVendorResearcher({
    engine,
    readPage,
    generate,
    gather: evalCase.gather === true,
    perCategory: evalCase.perCategory === true,
    // What the databases answered when the case was recorded: the run asks nobody.
    ...(recording.records === undefined ? {} : { records: async () => recording.records ?? [] }),
    // What the copies of the lists held, offered whatever the rules of the analysis.
    ...(recording.vrdb === undefined ? {} : { vrdb: replayVrdb(recording.vrdb) }),
  });

  const trace = createTraceRecorder();
  trace.startPhase("research");
  const found = await researcher({ target, model, now, trace });
  trace.stopped(found.stoppedBecause);

  const pack = buildEvidencePack(found.entries);
  let analysed: Analysed | null = null;
  if (pack.length > 0) {
    analysed = await analyse({
      // As the pipeline does: the names that the vendor's home page gave join the ones in the record.
      target: withAliases(target, found.siteNames ?? []),
      materiality,
      pack,
      provenance: provenanceOf(found.entries),
      model,
      jsonObjectFallback: found.jsonObjectFallback,
      now,
      generate,
      trace,
      // As the pipeline does: the reader of the research checks the findings that rest on
      // snippets, and the verifier, when the case has it on, checks them all.
      readPage: found.readPage,
      verifier: evalCase.verifier === true,
      rules: deps.rules,
      loadKnown: async () => ({
        existingRisks: evalCase.known?.existingRisks ?? [],
        priorFindings: evalCase.known?.priorFindings ?? [],
      }),
    });
  }

  return {
    evalCase,
    target,
    found,
    pack,
    analysed,
    kept: analysed?.ok ? analysed.kept : [],
    credibility: analysed?.ok ? analysed.credibility : [],
    trace: trace.snapshot(),
    feedOf: (url) => engine.feedOf?.(url),
    readTexts,
  };
}
