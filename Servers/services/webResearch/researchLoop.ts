/**
 * The research loop of the web research toolkit. Each turn the model answers with one step as a
 * JSON object (search the web, read a page, or finish), the code runs it through the web session
 * and shows the result back in the next prompt. The loop only collects: what it leaves behind is
 * the session's ledger.
 *
 * The step is asked for through the self-correcting structured call, not through native tool
 * calling, so the loop runs on every model that can answer the app's other structured calls.
 *
 * A model that answers badly can neither crash the loop nor keep it going: a step that breaks its
 * rule, or an answer that holds no step, costs one step and the model is told why, and a step that
 * the rules refuse never reaches the web. The number of steps, the budgets of the session, a limit
 * for each model turn and one for the whole loop bound the run.
 *
 * Everything the history shows (the model's own thoughts and actions, and the results, which third
 * parties wrote) goes through `escapeForPrompt`, so none of it can close a tag of the prompt or open
 * a new one, and the query, URL and focus of a step go through `unescapeFromPrompt`, so that what
 * the model copies from the history means what it meant there. The task and the system prompt are
 * written by the caller and are used as they are.
 */
import { z } from "zod";
import type { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import { cutAtCodePoint } from "../vendorResearch/text";
import { escapeForPrompt, unescapeFromPrompt } from "./promptText";
import { PageView, ReadOutcome, SearchOutcome, WebSession } from "./webSession";

export interface LoopStep<C extends string = string> {
  thought: string;
  action: "search" | "read" | "finish";
  category?: C;
  query?: string;
  kind?: "web" | "news";
  url?: string;
  focus?: string;
}

const MAX_THOUGHT_CHARS = 300;
export const MIN_QUERY_CHARS = 3;
const MAX_QUERY_CHARS = 200;
export const MAX_URL_CHARS = 2048;
const MAX_FOCUS_CHARS = 120;

/**
 * The step the model answers with: flat, so that the JSON mode of every provider accepts it, with
 * only `thought` and `action` required. What a search or a read needs besides is checked by the
 * loop, so that a step that lacks it costs one step instead of a round of self-correction; for the
 * same reason the schema sets no minimum length.
 *
 * A field set to null counts as left out: many models write null for the fields they do not use.
 * The object is not `.strict()`, as the one of the analysis is not (see `vendorResearch/schema.ts`):
 * an unknown property is dropped, because reporting it would write a key that the model chose, and
 * that a page can steer it to, into the system prompt of the self-correction.
 */
export function createLoopStepSchema<C extends string>(
  categories: readonly [C, ...C[]],
): z.ZodType<LoopStep<C>> {
  return z
    .object({
      thought: z.string().max(MAX_THOUGHT_CHARS),
      action: z.enum(["search", "read", "finish"]),
      category: z.enum(categories).nullish(),
      query: z.string().max(MAX_QUERY_CHARS).nullish(),
      kind: z.enum(["web", "news"]).nullish(),
      url: z.string().max(MAX_URL_CHARS).nullish(),
      focus: z.string().max(MAX_FOCUS_CHARS).nullish(),
    })
    .transform(({ thought, action, category, query, kind, url, focus }) => {
      const step: LoopStep<C> = { thought, action };
      if (category != null) step.category = category;
      if (query != null) step.query = query;
      if (kind != null) step.kind = kind;
      if (url != null) step.url = url;
      if (focus != null) step.focus = focus;
      return step;
    });
}

export interface LoopLimits {
  maxSteps: number;
  stepTimeoutMs: number;
  totalTimeoutMs: number;
}

export const LOOP_LIMITS: LoopLimits = {
  maxSteps: 24,
  stepTimeoutMs: 60_000,
  totalTimeoutMs: 300_000,
};

export type StopReason = "finished" | "budget" | "steps" | "time" | "model_error";

export interface LoopInput<C extends string> {
  /** The loop's system prompt, built by the caller. */
  system: string;
  /** What to research (the vendor, the date, the categories), built by the caller. */
  task: string;
  /** Every category, for the schema. */
  categories: readonly [C, ...C[]];
  /** The categories this run may use. */
  researchable: readonly C[];
  limits?: Partial<LoopLimits>;
}

export interface LoopDeps<C extends string> {
  generate: typeof generateObjectWithSelfCorrection;
  model: unknown;
  session: WebSession<C>;
}

export interface LoopResult {
  stoppedBecause: StopReason;
  /** The model turns taken, invalid ones and the one that failed included. */
  steps: number;
  /** The error that ended the loop as `model_error`; null otherwise. */
  modelError: unknown | null;
}

/** How many of the latest results the history shows in full. */
const RESULTS_IN_FULL = 2;
/** The length an older result is cut to, and the mark that shows it was cut. */
const OLDER_RESULT_CHARS = 500;
const CUT_MARK = " […]";
/** Answers that hold no step, in a row, after which the model is taken to be unable to answer. */
const MAX_UNPARSEABLE_IN_A_ROW = 3;
/** The names of the SDK's errors for an answer that holds no object of the schema. */
const UNPARSEABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  "NoObjectGeneratedError",
  "AI_NoObjectGeneratedError",
  "AI_TypeValidationError",
]);

// What the model is told, in the loop's own words: a result never repeats the message of an error.
const INVALID_SEARCH = "Invalid step: a search needs a query and a category.";
const INVALID_READ = "Invalid step: a read needs a url and a category.";
const UNPARSEABLE_ANSWER =
  "Invalid step: answer with one JSON object in the format you were given.";
const NOT_RESEARCHABLE = "That category cannot be researched for this vendor.";
const NO_SOURCES =
  "You have no sources yet. Search or read before you finish, or finish again to stop.";
const NO_RESULTS = "The search returned no results.";
const PART_OF_PAGE = "Only part of the page is shown.";
const COULD_NOT_READ = "The page could not be read: ";

type SearchRefusal = Extract<SearchOutcome, { ok: false }>["reason"];
type ReadRefusal = Exclude<Extract<ReadOutcome, { ok: false }>["reason"], "too_old">;

const SEARCH_REFUSALS: Record<SearchRefusal, string> = {
  budget_exhausted: "No searches are left. Read pages or finish.",
  search_unavailable: "The search is not available right now.",
};

const READ_REFUSALS: Record<ReadRefusal, string> = {
  budget_exhausted: "No page reads are left. Search or finish.",
  not_allowed: "That address is not allowed.",
  not_from_search:
    "That address was not in any search result and is not on the vendor's website. Search first.",
  already_read: "That page was already read.",
  blocked_by_robots: `${COULD_NOT_READ}the site does not allow it.`,
  blocked_by_site: `${COULD_NOT_READ}the site refused the request.`,
  not_found: `${COULD_NOT_READ}it was not found.`,
  unsupported_type: `${COULD_NOT_READ}this kind of file is not supported.`,
  needs_javascript: `${COULD_NOT_READ}it needs JavaScript to show its text.`,
  unreachable: `${COULD_NOT_READ}the site did not answer.`,
};

/** "1 search", "8 searches". */
const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** The day of an ISO 8601 date (YYYY-MM-DD), or the text as it is when it does not start with one. */
const dayOf = (date: string) => (/^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : date);

const dateOrNone = (date: string | null) => (date === null ? "no date" : dayOf(date));

function describeSearch(outcome: SearchOutcome): string {
  if (!outcome.ok) return SEARCH_REFUSALS[outcome.reason];
  const listed =
    outcome.results.length === 0
      ? NO_RESULTS
      : outcome.results
          .map((result, index) => {
            const fields = [result.title, result.url, dateOrNone(result.publishedAt)];
            if (result.source !== null) fields.push(result.source);
            return `${index + 1}. ${fields.join(" - ")}\n${result.snippet}`;
          })
          .join("\n\n");
  if (outcome.omittedOld === 0) return listed;
  const omitted =
    outcome.omittedOld === 1
      ? "1 result older than the lookback window was left out."
      : `${outcome.omittedOld} results older than the lookback window were left out.`;
  return `${listed}\n${omitted}`;
}

function describePage(page: PageView): string {
  const lines = [
    `Title: ${page.title}`,
    `URL: ${page.url}`,
    `Date: ${dateOrNone(page.publishedAt)}`,
    "",
    page.excerpt,
  ];
  if (page.truncated) lines.push("", PART_OF_PAGE);
  if (page.links.length > 0) {
    lines.push("", "Links:", ...page.links.map((link) => `- ${link.text} - ${link.url}`));
  }
  return lines.join("\n");
}

function describeRead(outcome: ReadOutcome): string {
  if (outcome.ok) return describePage(outcome.page);
  if (outcome.reason !== "too_old") return READ_REFUSALS[outcome.reason];
  const published = outcome.publishedAt ? ` (published ${dayOf(outcome.publishedAt)})` : "";
  return `The page is older than the lookback window for this category${published}, so it was left out.`;
}

/**
 * A text field of a step as the model meant it. The history shows &, < and > escaped, so a URL or
 * words copied from it come back as `&amp;`; decoded, a URL with `&` in its query matches the
 * search result it was copied from. A plain `&` is left as it is.
 */
const fromModel = (text: string | undefined) => unescapeFromPrompt(text ?? "").trim();

/** `fromModel`, except that a field the step does not have stays out. */
const fromModelIfGiven = (text: string | undefined) =>
  text === undefined ? undefined : fromModel(text);

/**
 * The step as the history shows its action: its fields without the thought, as JSON. The text
 * fields are the values that `runStep` uses (decoded), so the line is not escaped twice once
 * `renderHistory` escapes it like every other field of the history.
 */
function describeAction(step: LoopStep): string {
  // JSON.stringify leaves out a property whose value is undefined.
  return JSON.stringify({
    ...step,
    thought: undefined,
    query: fromModelIfGiven(step.query),
    url: fromModelIfGiven(step.url),
    focus: fromModelIfGiven(step.focus),
  });
}

/** A step of the history. An answer that held no step has no thought and no action. */
interface HistoryEntry {
  thought: string | null;
  action: string | null;
  result: string;
}

/** An older result: cut to OLDER_RESULT_CHARS characters, and only then escaped. */
function olderResult(text: string): string {
  const cut = cutAtCodePoint(text, OLDER_RESULT_CHARS);
  return cut === text ? escapeForPrompt(text) : escapeForPrompt(cut) + CUT_MARK;
}

function renderHistory(history: HistoryEntry[]): string {
  const steps = history.map((entry, index) => {
    const inFull = index >= history.length - RESULTS_IN_FULL;
    const lines = [`<step n="${index + 1}">`];
    if (entry.thought !== null) lines.push(`<thought>${escapeForPrompt(entry.thought)}</thought>`);
    if (entry.action !== null) lines.push(`<action>${escapeForPrompt(entry.action)}</action>`);
    const result = inFull ? escapeForPrompt(entry.result) : olderResult(entry.result);
    lines.push(`<result>${result}</result>`, "</step>");
    return lines.join("\n");
  });
  return ["<history>", ...steps, "</history>"].join("\n");
}

function buildPrompt(
  task: string,
  history: HistoryEntry[],
  budget: { searchesLeft: number; readsLeft: number },
  stepsLeft: number,
): string {
  const left = [
    counted(budget.searchesLeft, "search", "searches"),
    counted(budget.readsLeft, "page read", "page reads"),
    counted(stepsLeft, "step", "steps"),
  ].join(", ");
  return [
    task,
    "",
    renderHistory(history),
    "",
    `Budget left: ${left}.`,
    "Answer with your next step as one JSON object.",
  ].join("\n");
}

/** True for the SDK's error for an answer that holds no object of the schema. */
function isUnparseable(error: unknown): boolean {
  const name = typeof error === "object" && error !== null ? Reflect.get(error, "name") : null;
  return typeof name === "string" && UNPARSEABLE_ERROR_NAMES.has(name);
}

/**
 * Why the model may not finish yet, or null when it may. Asked once in a run: the reminder is given
 * once, and a later `finish` is final.
 */
function reminderBeforeFinish<C extends string>(
  session: WebSession<C>,
  researchable: readonly C[],
): string | null {
  const { ledger, calls } = session.snapshot();
  if (ledger.length === 0) return NO_SOURCES;
  const uncovered = researchable.filter((category) =>
    calls.every((call) => call.category !== category),
  );
  if (uncovered.length === 0) return null;
  return `You have not covered: ${uncovered.join(", ")}. Continue researching, or finish again to stop.`;
}

/** Runs a search or a read step and says what came of it. A step that breaks its rule is refused. */
async function runStep<C extends string>(
  step: LoopStep<C>,
  session: WebSession<C>,
  researchable: readonly C[],
  signal: AbortSignal,
): Promise<string> {
  if (step.action === "search") {
    const query = fromModel(step.query);
    if (query.length < MIN_QUERY_CHARS || step.category === undefined) return INVALID_SEARCH;
    if (!researchable.includes(step.category)) return NOT_RESEARCHABLE;
    return describeSearch(await session.search(query, step.kind ?? "web", step.category, signal));
  }
  const url = fromModel(step.url);
  if (url === "" || step.category === undefined) return INVALID_READ;
  if (!researchable.includes(step.category)) return NOT_RESEARCHABLE;
  const focus = fromModel(step.focus) || undefined;
  return describeRead(await session.read(url, step.category, focus, signal));
}

/**
 * Runs the loop until the model finishes, both budgets of the session are spent, the steps or the
 * time run out, or the model fails. It rejects only when the session does (a bug of the session,
 * which it passes on); every other ending is a result, and the ledger keeps what was found.
 */
export async function runResearchLoop<C extends string>(
  input: LoopInput<C>,
  deps: LoopDeps<C>,
): Promise<LoopResult> {
  const { session } = deps;
  // Field by field, so that a limit given as undefined keeps its default.
  const limits: LoopLimits = {
    maxSteps: input.limits?.maxSteps ?? LOOP_LIMITS.maxSteps,
    stepTimeoutMs: input.limits?.stepTimeoutMs ?? LOOP_LIMITS.stepTimeoutMs,
    totalTimeoutMs: input.limits?.totalTimeoutMs ?? LOOP_LIMITS.totalTimeoutMs,
  };
  const schema = createLoopStepSchema(input.categories);
  // One clock for the whole loop: every model turn, search and read is cut off when it runs out.
  const total = AbortSignal.timeout(limits.totalTimeoutMs);
  const history: HistoryEntry[] = [];
  let steps = 0;
  let unparseableInARow = 0;
  let reminded = false;

  const end = (stoppedBecause: StopReason, modelError: unknown = null): LoopResult => ({
    stoppedBecause,
    steps,
    modelError,
  });

  for (;;) {
    if (total.aborted) return end("time");
    const budget = session.budget();
    if (budget.searchesLeft <= 0 && budget.readsLeft <= 0) return end("budget");
    if (steps >= limits.maxSteps) return end("steps");

    const prompt = buildPrompt(input.task, history, budget, limits.maxSteps - steps);
    steps += 1;
    let step: LoopStep<C>;
    try {
      const answer = await deps.generate({
        model: deps.model,
        schema,
        system: input.system,
        prompt,
        temperature: 0,
        innerMaxRetries: 2,
        maxSelfCorrectionAttempts: 1,
        extra: {
          abortSignal: AbortSignal.any([AbortSignal.timeout(limits.stepTimeoutMs), total]),
        },
      });
      step = answer.object;
    } catch (error) {
      if (total.aborted) return end("time");
      if (!isUnparseable(error)) return end("model_error", error);
      unparseableInARow += 1;
      if (unparseableInARow >= MAX_UNPARSEABLE_IN_A_ROW) return end("model_error", error);
      history.push({ thought: null, action: null, result: UNPARSEABLE_ANSWER });
      continue;
    }
    unparseableInARow = 0;
    // The time ran out as the answer came in: no search or read is started on a spent clock.
    if (total.aborted) return end("time");

    let result: string;
    if (step.action === "finish") {
      const reminder = reminded ? null : reminderBeforeFinish(session, input.researchable);
      if (reminder === null) return end("finished");
      reminded = true;
      result = reminder;
    } else {
      result = await runStep(step, session, input.researchable, total);
    }
    history.push({ thought: step.thought, action: describeAction(step), result });
  }
}
