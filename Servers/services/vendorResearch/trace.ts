/**
 * The trace of a research run: what the agent did and what became of it, kept so that a person can
 * tell why a run found what it found. A run records steps (every search, read and refusal), model
 * calls with their tokens, the candidates that validation, de-duplication or the caps turned away,
 * what was left out and why, and how long each phase took.
 *
 * A recorder is built for one run and handed to the parts of the pipeline that have something to
 * say. Everything it holds is bounded: the lists have a length limit, every text a character limit,
 * and the snapshot stays under MAX_TRACE_BYTES, so storing it cannot fail a run for size. Text that
 * a third party or the model wrote (a query, an address, a thought) is cleaned like the evidence is
 * (see cleanText), because Postgres refuses a NUL and a lone surrogate in JSONB.
 *
 * The trace is stored with the run and served to administrators only: it holds queries and
 * addresses, which the run summary the other roles see does not.
 */
import type { SourceCategory } from "../../domain.layer/interfaces/i.vendorResearch";
import { cleanText, cutAtCodePoint } from "./text";

export const TRACE_VERSION = 1;
/** The serialized snapshot never exceeds this many bytes. */
export const MAX_TRACE_BYTES = 200_000;
export const MAX_STEPS = 150;
export const MAX_MODEL_CALLS = 80;
export const MAX_REJECTED = 100;
/** The unreviewed hosts the trace lists; the rest are dropped and the trace says it is truncated. */
export const MAX_UNREVIEWED_HOSTS = 50;
const MAX_PHASES = 20;
const MAX_DROP_REASONS = 40;

const MAX_QUERY_CHARS = 200;
const MAX_URL_CHARS = 300;
const MAX_THOUGHT_CHARS = 200;
const MAX_TEXT_CHARS = 160;
const MAX_LABEL_CHARS = 60;
/** The longest name a host can have. */
const MAX_HOST_CHARS = 253;

/** One thing the agent did: a search, a read, or a turn that did none. */
export interface TraceStep {
  /** The order in which the steps were recorded, from 1. */
  n: number;
  /**
   * The model turn of the research loop that asked for it, from 1: the actions of one step of the
   * loop share it. Absent for what the code did without the model (the check of the website and
   * the routine work, see `by`).
   */
  turn?: number;
  /**
   * `code` when the code made the call itself, as the routine work before the first step (see
   * gather.ts); `verification` for a page read after the analysis, to check a finding that rests
   * on snippets (see verifySnippets.ts); absent for what the model asked for and for the check of
   * the website.
   */
  by?: "code" | "verification";
  /**
   * The category of the loop that took the step, when the research ran as one loop for each
   * category (see researchAgent.ts): their turns are numbered each from 1, so this tells them
   * apart. Absent for a single loop and for the code.
   */
  loop?: string;
  tool: "search" | "read" | "finish" | "invalid" | "model_error" | "gather" | "preflight";
  category?: string;
  kind?: "web" | "news";
  /** What the model asked to search for. */
  query?: string;
  /** What the engine was given, when that is not `query`. */
  usedQuery?: string;
  url?: string;
  /** For a read of a part of a long page: which part the model asked for. */
  part?: number;
  thought?: string;
  /** `ok`, `empty`, `refused` (the rules turned it away before the web) or `failed`. */
  outcome: string;
  /** Why it was refused or failed, from a closed set of words. */
  reason?: string;
  /** Results (or, for a read, 1) that were kept. */
  results?: number;
  /** What was left out of the results, by reason. */
  omitted?: Record<string, number>;
  ms?: number;
}

export interface TraceModelCall {
  /** What the call was for: `loop`, `analysis`, `verifier`, `hints`. */
  purpose: string;
  /** The id of the model that was called, when the caller knows it. */
  model?: string;
  /** The category of the loop that made the call, when the research ran as one loop for each. */
  loop?: string;
  ms: number;
  attempts?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** False when the call ended by throwing. */
  ok?: boolean;
}

/** A candidate (or a part of one) that a check turned away. */
export interface TraceRejection {
  stage: string;
  reason: string;
  category?: string;
  /** The start of the text the check looked at, to recognise it. */
  text?: string;
}

export interface RunTrace {
  version: typeof TRACE_VERSION;
  steps: TraceStep[];
  modelCalls: TraceModelCall[];
  rejected: TraceRejection[];
  /**
   * What was left out, counted by `kind.reason`: `source.` (a result or page that never reached
   * the evidence; `source.blocked` for a host the registry blocks, under the credibility rules),
   * `page.` (a page where the vendor states its terms that made no change source:
   * `first_visit`, `unchanged` or `minor`), `citation.` (a quote the validation removed),
   * `duplicate.` (a candidate the de-duplication dropped) and `cap`.
   */
  dropped: Record<string, number>;
  phases: Array<{ name: string; ms: number }>;
  totals: { modelCalls: number; inputTokens: number; outputTokens: number; totalTokens: number };
  stoppedBecause?: string;
  /**
   * The sources that the stored findings cite, each address once, counted by registry category,
   * and the hosts among them that the registry has not reviewed, each once. Only a run under the
   * credibility rules records it.
   */
  cited?: { categories: Record<SourceCategory, number>; unreviewedHosts: string[] };
  /** True when a list reached its limit and later entries were not kept. */
  truncated: boolean;
}

export interface TraceRecorder {
  step(entry: Omit<TraceStep, "n">): void;
  modelCall(entry: TraceModelCall): void;
  rejected(entry: TraceRejection): void;
  dropped(reason: string, count?: number): void;
  /** Starts a phase; the one that is open ends. */
  startPhase(name: string): void;
  endPhase(): void;
  stopped(reason: string): void;
  /** What the stored findings cite (see `RunTrace.cited`); a later call replaces it. */
  cited(categories: Record<SourceCategory, number>, unreviewedHosts: readonly string[]): void;
  snapshot(): RunTrace;
}

const text = (value: string, max: number): string => cutAtCodePoint(cleanText(value), max);
const optionalText = (value: string | undefined, max: number): string | undefined =>
  value === undefined ? undefined : text(value, max);
const count = (value: number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;

/** The entry without the fields that are undefined, so the stored JSON stays small. */
function compact<T extends object>(entry: T): T {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) as T;
}

export function createTraceRecorder(options: { now?: () => number } = {}): TraceRecorder {
  const now = options.now ?? (() => Date.now());
  const steps: TraceStep[] = [];
  const modelCalls: TraceModelCall[] = [];
  const rejected: TraceRejection[] = [];
  const dropped: Record<string, number> = {};
  const phases: Array<{ name: string; ms: number }> = [];
  let open: { name: string; startedAt: number } | null = null;
  let stoppedBecause: string | undefined;
  let cited: RunTrace["cited"];
  let truncated = false;
  let stepCount = 0;

  const closePhase = () => {
    if (open === null || phases.length >= MAX_PHASES) {
      open = null;
      return;
    }
    phases.push({ name: open.name, ms: Math.max(0, now() - open.startedAt) });
    open = null;
  };

  return {
    step(entry) {
      stepCount += 1;
      if (steps.length >= MAX_STEPS) {
        truncated = true;
        return;
      }
      steps.push(
        compact({
          n: stepCount,
          turn: count(entry.turn),
          by: entry.by === "code" || entry.by === "verification" ? entry.by : undefined,
          loop: optionalText(entry.loop, MAX_LABEL_CHARS),
          tool: entry.tool,
          category: optionalText(entry.category, MAX_LABEL_CHARS),
          kind: entry.kind,
          query: optionalText(entry.query, MAX_QUERY_CHARS),
          usedQuery: optionalText(entry.usedQuery, MAX_QUERY_CHARS),
          url: optionalText(entry.url, MAX_URL_CHARS),
          part: count(entry.part),
          thought: optionalText(entry.thought, MAX_THOUGHT_CHARS),
          outcome: text(entry.outcome, MAX_LABEL_CHARS),
          reason: optionalText(entry.reason, MAX_LABEL_CHARS),
          results: count(entry.results),
          omitted:
            entry.omitted === undefined
              ? undefined
              : Object.fromEntries(
                  Object.entries(entry.omitted)
                    .slice(0, 8)
                    .map(([key, value]) => [text(key, MAX_LABEL_CHARS), count(value) ?? 0]),
                ),
          ms: count(entry.ms),
        }),
      );
    },

    modelCall(entry) {
      if (modelCalls.length >= MAX_MODEL_CALLS) {
        truncated = true;
        return;
      }
      modelCalls.push(
        compact({
          purpose: text(entry.purpose, MAX_LABEL_CHARS),
          model: optionalText(entry.model, MAX_LABEL_CHARS),
          loop: optionalText(entry.loop, MAX_LABEL_CHARS),
          ms: count(entry.ms) ?? 0,
          attempts: count(entry.attempts),
          inputTokens: count(entry.inputTokens),
          outputTokens: count(entry.outputTokens),
          totalTokens: count(entry.totalTokens),
          ok: entry.ok,
        }),
      );
    },

    rejected(entry) {
      if (rejected.length >= MAX_REJECTED) {
        truncated = true;
        return;
      }
      rejected.push(
        compact({
          stage: text(entry.stage, MAX_LABEL_CHARS),
          reason: text(entry.reason, MAX_LABEL_CHARS),
          category: optionalText(entry.category, MAX_LABEL_CHARS),
          text: optionalText(entry.text, MAX_TEXT_CHARS),
        }),
      );
    },

    dropped(reason, amount = 1) {
      const key = text(reason, MAX_LABEL_CHARS);
      if (!(key in dropped) && Object.keys(dropped).length >= MAX_DROP_REASONS) {
        truncated = true;
        return;
      }
      dropped[key] = (dropped[key] ?? 0) + Math.max(0, Math.round(amount));
    },

    startPhase(name) {
      closePhase();
      open = { name: text(name, MAX_LABEL_CHARS), startedAt: now() };
    },

    endPhase: closePhase,

    stopped(reason) {
      stoppedBecause = text(reason, MAX_LABEL_CHARS);
    },

    cited(categories, unreviewedHosts) {
      const hosts = [...new Set(unreviewedHosts.map((host) => text(host, MAX_HOST_CHARS)))];
      if (hosts.length > MAX_UNREVIEWED_HOSTS) truncated = true;
      cited = {
        categories: Object.fromEntries(
          Object.entries(categories).map(([category, value]) => [category, count(value) ?? 0]),
        ) as Record<SourceCategory, number>,
        unreviewedHosts: hosts.slice(0, MAX_UNREVIEWED_HOSTS),
      };
    },

    snapshot() {
      const openPhase =
        open === null ? [] : [{ name: open.name, ms: Math.max(0, now() - open.startedAt) }];
      const totals = modelCalls.reduce(
        (sum, call) => ({
          modelCalls: sum.modelCalls + 1,
          inputTokens: sum.inputTokens + (call.inputTokens ?? 0),
          outputTokens: sum.outputTokens + (call.outputTokens ?? 0),
          totalTokens: sum.totalTokens + (call.totalTokens ?? 0),
        }),
        { modelCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      );
      const snapshot: RunTrace = {
        version: TRACE_VERSION,
        steps: steps.map((step) => ({ ...step })),
        modelCalls: modelCalls.map((call) => ({ ...call })),
        rejected: rejected.map((entry) => ({ ...entry })),
        dropped: { ...dropped },
        phases: [...phases, ...openPhase],
        totals,
        truncated,
      };
      if (stoppedBecause !== undefined) snapshot.stoppedBecause = stoppedBecause;
      if (cited !== undefined) {
        snapshot.cited = {
          categories: { ...cited.categories },
          unreviewedHosts: [...cited.unreviewedHosts],
        };
      }
      return fitInBytes(snapshot);
    },
  };
}

/**
 * The snapshot, or a smaller one when it is over MAX_TRACE_BYTES. The lists have limits, so this
 * happens only with texts at their limits everywhere; the thoughts go first, then the rejections,
 * then the oldest steps.
 */
function fitInBytes(snapshot: RunTrace): RunTrace {
  const size = (trace: RunTrace) => Buffer.byteLength(JSON.stringify(trace));
  if (size(snapshot) <= MAX_TRACE_BYTES) return snapshot;
  const smaller: RunTrace = { ...snapshot, truncated: true };
  smaller.steps = smaller.steps.map(({ thought: _thought, ...step }) => step);
  while (size(smaller) > MAX_TRACE_BYTES && smaller.rejected.length > 0) smaller.rejected.pop();
  while (size(smaller) > MAX_TRACE_BYTES && smaller.steps.length > 0) smaller.steps.shift();
  return smaller;
}
