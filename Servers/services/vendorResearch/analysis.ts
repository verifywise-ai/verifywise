/**
 * The analysis of a run: one structured model call over the evidence pack, then the checks that
 * decide what of the answer is kept. It reads the pack and what the vendor already has, and writes
 * nothing; the pipeline stores the result, and the evaluation (see eval/) runs this same function
 * over recorded sources, so what is measured is what ships.
 *
 * The order is fixed: ask the model, validate its candidates against the pack (quotes, sources,
 * categories), look up what the vendor already has (that read comes after the validation, so a
 * model that failed costs no query), drop the candidates that repeat something (an active risk, an
 * earlier finding, another candidate, or an event another candidate is about already), and cap
 * what is left, in that order. The caps come last: before the de-duplication, the risks that are already
 * known, and so the most severe on a second look, would take the places and then be dropped, and
 * the new ones would be gone.
 *
 * Two more steps work on what the caps left, at the same time. With a page reader, a finding that
 * rests on snippets alone has the page of its best source read, and is marked when the page does
 * not hold the quote (see verifySnippets.ts), which the credibility label takes into account. With
 * the verifier on, one more model call asks of every finding whether its sources are about the
 * vendor, whether its quote says what the claim says and whether the matter is inside the window,
 * and a finding it fails is not kept (see verifier.ts). Both come last and only for the findings
 * that stay.
 *
 * Every finding that stays gets a credibility label, computed by code from the sources it cites,
 * their provenance and what the check of its snippets found (see credibility.ts). The labels come
 * back beside the findings, one for each in their order, and the pipeline stores each with its
 * finding. The model is not asked for a confidence: there is one set of rules, the credibility
 * rules.
 *
 * One more thing is asked before the labels, when the analysis is given the means (`edgarFilerOf`):
 * who filed each EDGAR filing that the findings that stay cite under the CIK stored on the vendor
 * (Q28; see edgarFiler.ts). The address of a filing is in the folder of every party, so only the
 * header of the filing says whether the vendor filed it or somebody filed it about the vendor. The
 * answer goes into the provenance that the labels read: a filing the vendor filed is the vendor's
 * word, and any other, or one whose filer the SEC could not say, is the filer's document and
 * unverified (classify.ts, step 5). At most five filings are asked about in a run, in the order of
 * the pack, a filing once however many of its documents are cited; the rest stay unverified.
 * Without the means nothing is asked.
 *
 * A failure of the model call is a result (`ok: false`), because the pipeline words it for the run.
 * A failure of the look-up is not a model failure and is thrown.
 */
import { wrapLanguageModel } from "ai";
import {
  type TokenUsage,
  type generateObjectWithSelfCorrection,
  jsonObjectFallbackMiddleware,
} from "../../advisor/llmSelfCorrect";
import {
  EvidenceSource,
  NewFinding,
  RESEARCH_CATEGORIES,
} from "../../domain.layer/interfaces/i.vendorResearch";
import type { PageReader } from "../webResearch/readPage";
import { clusterSources, eventIdsByUrl } from "./clusters";
import { type Credibility, credibilityOf } from "./credibility";
import { type DedupeReport, type KnownRisk, type PriorFinding, dropDuplicates } from "./dedupe";
import { accessionOfFiling } from "./edgarFiler";
import type { SourceProvenance } from "./evidence";
import type { Materiality } from "./materiality";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { storedCikOf } from "./records/sec";
import { type AnyResearchOutput, credibilityOutputSchema } from "./schema";
import { type EdgarFiler, isStoredCikFiling } from "./sourceRegistry/classify";
import { ResearchTarget } from "./target";
import type { TraceRecorder } from "./trace";
import { verifierPasses } from "./verifier";
import { applyCaps, newValidationReport, validateFindings } from "./validation";
import { type SnippetCheck, checkSnippetFindings } from "./verifySnippets";

/** One deadline for the model call, retries and self-correction included. */
export const MODEL_TIMEOUT_MS = 120_000;

/** The most filings of a run that the SEC is asked the filer of (Q28); the rest stay unverified. */
export const MAX_EDGAR_FILER_ASKS = 5;
/** One deadline for all the asks of a run, whatever the SEC does. */
export const EDGAR_FILER_TIMEOUT_MS = 30_000;

export interface AnalysisInput {
  target: ResearchTarget;
  /**
   * How much the vendor matters to the company, from its scorecard; null when it has not said. It
   * goes to the model with the evidence and nowhere else: the research loop does not get it.
   */
  materiality?: Materiality | null;
  /** The evidence the model is shown. It is not empty: a run without a source asks no model. */
  pack: EvidenceSource[];
  /**
   * Where the sources of the pack came from, by address (see `provenanceOf`): the database of a
   * record, the canonical address a copy claims. Only the credibility labels read it; none when
   * absent.
   */
  provenance?: ReadonlyMap<string, SourceProvenance>;
  /**
   * Who filed an EDGAR filing, as its header says (Q28; `createEdgarFilerResolver` in
   * edgarFiler.ts): `vendor` when the CIK is a filer in it, `other` when it is not, null when that
   * is not known. It is asked about the sources that the findings that stay cite and that are
   * filings under the CIK stored on the vendor, in the order of the pack, at most
   * MAX_EDGAR_FILER_ASKS in a run; the answers go into the provenance the labels read. It should
   * not throw, and if it does the filer is not known. Without it nothing is asked.
   */
  edgarFilerOf?: (url: string, cik: string, signal: AbortSignal) => Promise<EdgarFiler | null>;
  model: unknown;
  /** The id of the model, for the trace. */
  modelId?: string;
  /**
   * True when the research loop learned that the provider rejects json_schema: the analysis starts
   * in JSON-object mode too, rather than pay one more rejected request and warning to learn it again.
   */
  jsonObjectFallback: boolean;
  /** One clock for the loop and the analysis, so that both hold a source to the same window. */
  now: Date;
  generate: typeof generateObjectWithSelfCorrection;
  /**
   * What the vendor already has, read once the model has answered: the active risks of its
   * register, and its earlier findings of any status.
   */
  loadKnown: () => Promise<{ existingRisks: KnownRisk[]; priorFindings: PriorFinding[] }>;
  trace: TraceRecorder;
  /**
   * The page reader of the research run. With one, a finding that rests on snippets alone is
   * checked against the page of its best source once the findings are chosen. Without one nothing
   * is read and no finding is marked.
   */
  readPage?: PageReader;
  /**
   * True to have the findings that stay checked by one more model call (see verifier.ts). Off by
   * default: a replay of recorded model answers should see only the calls that the case holds.
   */
  verifier?: boolean;
}

export type Analysed =
  | {
      ok: true;
      /** The findings that stay, the most severe first. */
      kept: NewFinding[];
      /** The credibility of each finding that stays, in the order of `kept`. */
      credibility: Credibility[];
      /** The candidates that held up and were dropped as repeats. */
      duplicatesDropped: number;
      /** The answer of the model, for the notes and for the categories it proposed a risk in. */
      output: AnyResearchOutput;
    }
  | { ok: false; error: unknown };

/**
 * The provenance of the run with the filer of each filing the findings cite that the vendor's
 * stored CIK is in the folder of (Q28), asked of `edgarFilerOf`. Those are the sources of the pack
 * that a finding cites, that are not a record (a record is classified by its database), and whose
 * address, the one that answered when the page answered from another, is an EDGAR filing under the
 * stored CIK (classify.ts `isStoredCikFiling`) of which the SEC keeps a header: an address that
 * names no accession, such as the full submission file or the folder of the CIK, is not asked, and
 * takes no place. A filing is asked once, however many of its documents are cited (an 8-K and its
 * exhibit have one header), and the answer labels each of them; the first MAX_EDGAR_FILER_ASKS
 * filings in the order of the pack are asked. They are asked together, and a failure or an answer
 * that is not one leaves the filing as nobody had asked. The map it was given is not changed. Never
 * throws.
 */
async function withFilers(
  findings: readonly NewFinding[],
  input: AnalysisInput,
): Promise<ReadonlyMap<string, SourceProvenance>> {
  const provenance = input.provenance ?? new Map<string, SourceProvenance>();
  const ask = input.edgarFilerOf;
  const cik = storedCikOf(input.target);
  if (ask === undefined || cik === null) return provenance;

  const cited = new Set(findings.flatMap((finding) => finding.sources.map(({ url }) => url)));
  // The filings to ask about, by accession: the address to ask with, and the sources it labels.
  const filings = new Map<string, { address: string; urls: string[] }>();
  for (const { url } of input.pack) {
    if (!cited.has(url)) continue;
    const origin = provenance.get(url);
    const address = origin?.answeredUrl ?? url;
    if (origin?.record !== undefined || !isStoredCikFiling(address, input.target)) continue;
    const accession = accessionOfFiling(address);
    if (accession === null) continue;
    const filing = filings.get(accession);
    if (filing === undefined) {
      if (filings.size < MAX_EDGAR_FILER_ASKS) filings.set(accession, { address, urls: [url] });
    } else if (!filing.urls.includes(url)) {
      filing.urls.push(url);
    }
  }
  if (filings.size === 0) return provenance;

  const signal = AbortSignal.timeout(EDGAR_FILER_TIMEOUT_MS);
  const asked = [...filings.values()];
  const answers = await Promise.all(
    asked.map(async ({ address }): Promise<EdgarFiler | null> => {
      try {
        const answer = await ask(address, cik, signal);
        return answer === "vendor" || answer === "other" ? answer : null;
      } catch {
        return null;
      }
    }),
  );
  const answered = new Map(provenance);
  asked.forEach(({ urls }, index) => {
    const edgarFiler = answers[index];
    if (edgarFiler === null) return;
    for (const url of urls) answered.set(url, { ...provenance.get(url), edgarFiler });
  });
  return answered;
}

export async function analyse(input: AnalysisInput): Promise<Analysed> {
  const { target, pack, now, trace } = input;

  const model = input.jsonObjectFallback
    ? wrapLanguageModel({
        model: input.model as Parameters<typeof wrapLanguageModel>[0]["model"],
        middleware: jsonObjectFallbackMiddleware,
      })
    : input.model;

  // The sources that report one event: shown to the model together, and an event is one finding.
  const events = clusterSources(pack);

  trace.startPhase("analysis");
  const startedAt = Date.now();
  // What the call used, counted as the call reports it, so that a call that ends by throwing still
  // says what it cost.
  const used: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let output: AnyResearchOutput;
  try {
    const result = await input.generate({
      model,
      schema: credibilityOutputSchema,
      system: buildSystemPrompt(now),
      prompt: buildUserPrompt(target, pack, input.materiality ?? null, events),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
      onUsage: (usage) => {
        used.inputTokens += usage.inputTokens;
        used.outputTokens += usage.outputTokens;
        used.totalTokens += usage.totalTokens;
      },
      extra: { abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS) },
    });
    output = result.object;
    trace.modelCall({
      purpose: "analysis",
      model: input.modelId,
      ms: Date.now() - startedAt,
      attempts: result.attempts,
      ...(result.usage ?? used),
      ok: true,
    });
  } catch (error) {
    trace.modelCall({
      purpose: "analysis",
      model: input.modelId,
      ms: Date.now() - startedAt,
      ...used,
      ok: false,
    });
    return { ok: false, error };
  }

  // The categories with a source in the pack: a finding of any other has no evidence of its own.
  const inPack = RESEARCH_CATEGORIES.filter((category) =>
    pack.some((source) => source.category === category),
  );
  trace.startPhase("validation");
  const validation = newValidationReport();
  const candidates = validateFindings(output, pack, target, inPack, validation);
  for (const rejection of validation.candidates) {
    trace.rejected({ stage: "validation", ...rejection });
  }
  for (const [reason, count] of Object.entries(validation.citations)) {
    trace.dropped(`citation.${reason}`, count);
  }

  const { existingRisks, priorFindings } = await input.loadKnown();
  const repeats: DedupeReport = { reasons: {} };
  const { kept: notRepeated, dropped } = dropDuplicates(
    candidates,
    existingRisks,
    priorFindings,
    repeats,
    eventIdsByUrl(events, pack),
  );
  for (const [reason, count] of Object.entries(repeats.reasons)) {
    trace.dropped(`duplicate.${reason}`, count);
  }
  const capped = applyCaps(notRepeated);
  if (capped.length < notRepeated.length) trace.dropped("cap", notRepeated.length - capped.length);

  const labelled = (
    checks: readonly SnippetCheck[],
    provenance: ReadonlyMap<string, SourceProvenance>,
  ): Credibility[] =>
    checks.map(({ finding, verdict }) =>
      credibilityOf({ finding, pack, provenance, verdict, target }),
    );
  const unchecked = (findings: NewFinding[]): SnippetCheck[] =>
    findings.map((finding) => ({ finding, verdict: null }));

  if ((input.readPage === undefined && input.verifier !== true) || capped.length === 0) {
    return {
      ok: true,
      kept: capped,
      credibility: labelled(unchecked(capped), await withFilers(capped, input)),
      duplicatesDropped: dropped,
      output,
    };
  }
  trace.startPhase("verification");
  // At the same time: reading a page takes seconds, and so does the verifier.
  const [checks, passes] = await Promise.all([
    input.readPage === undefined
      ? unchecked(capped)
      : checkSnippetFindings({
          findings: capped,
          pack,
          target,
          readPage: input.readPage,
          trace,
        }),
    input.verifier === true
      ? verifierPasses({
          target,
          findings: capped,
          now,
          model,
          modelId: input.modelId,
          generate: input.generate,
          trace,
          provenance: input.provenance,
        })
      : capped.map(() => true),
  ]);
  trace.endPhase();
  // The verdicts of the verifier filter the checks, so that each label stays with its finding.
  const passed = checks.filter((_check, index) => passes[index]);
  const kept = passed.map(({ finding }) => finding);

  return {
    ok: true,
    kept,
    credibility: labelled(passed, await withFilers(kept, input)),
    duplicatesDropped: dropped,
    output,
  };
}
