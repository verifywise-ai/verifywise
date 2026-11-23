/**
 * The research loop of the web research toolkit. Each turn the model answers with one step as a
 * JSON object: a thought and up to four actions (search the web, read a page, or finish). The code
 * runs the actions through the web session, in order, and shows each action with its result back in
 * the next prompt. Reads that follow one another go to the web together; a search, or a read after
 * a search, waits for the action before it. A step is one model turn, however many actions it holds,
 * so asking for several at once is how the loop saves turns. The loop only collects: what it leaves
 * behind is the session's ledger.
 *
 * The step is asked for through the self-correcting structured call, not through native tool
 * calling, so the loop runs on every model that can answer the app's other structured calls.
 *
 * A model that answers badly can neither crash the loop nor keep it going: an action that breaks
 * its rule, a step with no action or an answer that holds no step costs one step and the model is
 * told why, and an action that the rules refuse never reaches the web. A step runs its first four
 * actions and tells the model how many it left out; a `finish` ends the research once the actions
 * before it have run, and the actions after it are not run. The number of steps, the budgets of the
 * session, a limit for each model turn and one for the whole loop bound the run.
 *
 * Everything the history shows (the model's own thoughts and actions, and the results, which third
 * parties wrote) goes through `escapeForPrompt`, so none of it can close a tag of the prompt or open
 * a new one, and the query, URL and focus of an action go through `unescapeFromPrompt`, so that what
 * the model copies from the history means what it meant there. The task and the system prompt are
 * written by the caller and are used as they are. The briefing, which the caller fills with what
 * the code found out before the first step and which can hold a page's words, is escaped too.
 */
import { z } from "zod";
import type { generateObjectWithSelfCorrection } from "../../advisor/llmSelfCorrect";
import { cutAtCodePoint } from "../vendorResearch/text";
import { MAX_EXTRA_PARTS, MAX_PAGE_PARTS } from "./pageText";
import { escapeForPrompt, unescapeFromPrompt } from "./promptText";
import {
  KIND_REFUSALS,
  OmittedReason,
  PageView,
  ReadOutcome,
  SearchOutcome,
  WebSession,
} from "./webSession";

/** One thing the model asks for in a step. */
export interface LoopAction<C extends string = string> {
  action: "search" | "read" | "finish";
  category?: C;
  query?: string;
  kind?: "web" | "news";
  url?: string;
  focus?: string;
  /** For a read: the part of a long page that was read before (see pageParts), from 1. */
  part?: number;
}

/** What the model answers in a turn: why, and what to do. */
export interface LoopStep<C extends string = string> {
  thought: string;
  actions: LoopAction<C>[];
}

const MAX_THOUGHT_CHARS = 300;
export const MIN_QUERY_CHARS = 3;
const MAX_QUERY_CHARS = 200;
export const MAX_URL_CHARS = 2048;
const MAX_FOCUS_CHARS = 120;
/** The actions of a step that the loop runs; the prompt tells the model this number. */
export const MAX_ACTIONS_PER_STEP = 4;
/**
 * The actions an answer may hold and still be a step: more than the loop runs, so that a model that
 * asks for too many is told (and loses one step) instead of costing a round of self-correction.
 */
export const MAX_ACTIONS_IN_ANSWER = 16;

/**
 * An answer that is one action in the step itself (`{thought, action, query, ...}`, the form
 * before steps held a list) as a step of that one action, so that a model that answers the old way
 * still works. Anything else is left for the schema to judge.
 */
function withActionList(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return answer;
  if ("actions" in answer || !("action" in answer)) return answer;
  const { thought, ...action } = answer as Record<string, unknown>;
  return { thought, actions: [action] };
}

/**
 * The step the model answers with, as flat as a list of actions can be, so that the JSON mode of
 * every provider accepts it: a thought and a list of actions, each with only `action` required.
 * What a search or a read needs besides is checked by the loop, so that an action that lacks it
 * costs one step instead of a round of self-correction; for the same reason the schema sets no
 * minimum length, not even for the list.
 *
 * A field set to null counts as left out: many models write null for the fields they do not use.
 * The objects are not `.strict()`, as the one of the analysis is not (see `vendorResearch/schema.ts`):
 * an unknown property is dropped, because reporting it would write a key that the model chose, and
 * that a page can steer it to, into the system prompt of the self-correction.
 */
export function createLoopStepSchema<C extends string>(
  categories: readonly [C, ...C[]],
): z.ZodType<LoopStep<C>> {
  const action = z
    .object({
      action: z.enum(["search", "read", "finish"]),
      category: z.enum(categories).nullish(),
      query: z.string().max(MAX_QUERY_CHARS).nullish(),
      kind: z.enum(["web", "news"]).nullish(),
      url: z.string().max(MAX_URL_CHARS).nullish(),
      focus: z.string().max(MAX_FOCUS_CHARS).nullish(),
      part: z.number().int().min(1).max(MAX_PAGE_PARTS).nullish(),
    })
    .transform((fields) => {
      const { category, query, kind, url, focus, part } = fields;
      const kept: LoopAction<C> = { action: fields.action };
      if (category != null) kept.category = category;
      if (query != null) kept.query = query;
      if (kind != null) kept.kind = kind;
      if (url != null) kept.url = url;
      if (focus != null) kept.focus = focus;
      if (part != null) kept.part = part;
      return kept;
    });
  return z.preprocess(
    withActionList,
    z.object({
      thought: z.string().max(MAX_THOUGHT_CHARS),
      actions: z.array(action).max(MAX_ACTIONS_IN_ANSWER),
    }),
  );
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
  /**
   * What the code found out before the first step, as plain text (see vendorResearch/preflight.ts).
   * It can hold words that a page wrote, so unlike the task it is escaped like a result; it is
   * shown whole in every turn, between the task and the history.
   */
  briefing?: string;
  /** Every category, for the schema. */
  categories: readonly [C, ...C[]];
  /** The categories this run may use. */
  researchable: readonly C[];
  /**
   * Whether a `finish` after calls of the loop's own categories that found no source is final.
   * Off by default: the model is reminded once to look further. A caller that has already
   * searched, and told the model so in the briefing, turns it on.
   */
  allowEmptyFinish?: boolean;
  limits?: Partial<LoopLimits>;
}

/**
 * One action of a model turn and what came of it, as the observer is told: a step with three
 * actions is three turns of the observer, in the order of the step, one for each. `outcome` is `ok`,
 * `empty` (a search with no result left), `refused` (the rules turned the action away before the
 * web) or `failed` (the web did not answer, or the model failed); `reason` is one word from a
 * closed set.
 */
export interface LoopTurn<C extends string = string> {
  /** The model turn, from 1; the same for all the actions of one step. */
  n: number;
  /**
   * What the model said about the step, told with the first action of the step only; null for the
   * others, and for an answer that held no step.
   */
  thought: string | null;
  tool: "search" | "read" | "finish" | "invalid" | "model_error";
  category?: C;
  kind?: "web" | "news";
  query?: string;
  /** The query the engine was given, when it is not the one in `query`. */
  usedQuery?: string;
  url?: string;
  /** For a read of a part of a long page: the part that was asked for. */
  part?: number;
  outcome: "ok" | "empty" | "refused" | "failed";
  reason?: string;
  /** Results a search kept, or 1 for a page that was read. */
  results?: number;
  /** What was left out of a search's results, by reason; absent when nothing was. */
  omitted?: Partial<Record<OmittedReason, number>>;
  /** How long the search or read took (a read that ran with others, from the start of them); 0 for a turn that did none. */
  ms: number;
}

/** Told about the loop without being part of it: an observer that throws changes nothing. */
export interface LoopObserver<C extends string = string> {
  turn?: (turn: LoopTurn<C>) => void;
}

export interface LoopDeps<C extends string> {
  generate: typeof generateObjectWithSelfCorrection;
  model: unknown;
  session: WebSession<C>;
  observer?: LoopObserver<C>;
}

export interface LoopResult {
  stoppedBecause: StopReason;
  /** The model turns taken, invalid ones and the one that failed included. */
  steps: number;
  /** The error that ended the loop as `model_error`; null otherwise. */
  modelError: unknown | null;
}

/** How many of the latest steps the history shows in full, with all their results. */
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
const NO_ACTION = "Invalid step: a step needs at least one action.";
const tooManyActions = (left: number) =>
  `Only the first ${MAX_ACTIONS_PER_STEP} actions of a step are run; ${counted(left, "action was", "actions were")} left out.`;
const NOT_RESEARCHABLE = "That category cannot be researched for this vendor.";
const NO_SOURCES =
  "You have no sources yet. Search or read before you finish, or finish again to stop.";
const NO_RESULTS = "The search returned no results.";
const PART_OF_PAGE = "Only part of the page is shown.";
const moreParts = (parts: number) =>
  `${PART_OF_PAGE} It has ${parts} parts: read the address again with "part" (1 to ${parts}) to see another one.`;
const noSuchPart = (parts: number) =>
  `The page has ${parts} parts. Ask for a part from 1 to ${parts}.`;
const COULD_NOT_READ = "The page could not be read: ";

type SearchRefusal = Exclude<Extract<SearchOutcome, { ok: false }>["reason"], "kind_unavailable">;
type ReadRefusal = Exclude<Extract<ReadOutcome, { ok: false }>["reason"], "too_old">;

const SEARCH_REFUSALS: Record<SearchRefusal, string> = {
  budget_exhausted: "No searches are left. Read pages or finish.",
  // No other feed is named: an engine may have one kind only, and the prompt of the run says which.
  repeated_query: "That search repeats an earlier one. Use other words, or read a page.",
  search_unavailable: "The search is not available right now.",
};

const READ_REFUSALS: Record<Exclude<ReadRefusal, "same_text" | "no_such_part">, string> = {
  budget_exhausted: "No page reads are left. Search or finish.",
  not_allowed: "That address is not allowed.",
  bad_address:
    "That address ends in a quotation mark or a bracket, so nobody can open it. Copy the address without it.",
  not_from_search:
    "That address was not in any search result and is not on the vendor's website. Search first.",
  already_read: "That page was already read.",
  already_failed: "That page could not be read before, so it is not tried again.",
  parts_limit: `${MAX_EXTRA_PARTS} more parts of that page are already kept as sources. Use what you have, or read another page.`,
  site_closed:
    "That site could not be read when the research started, so its pages are not tried again. Search for the vendor instead.",
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
  if (!outcome.ok) {
    return outcome.reason === "kind_unavailable"
      ? KIND_REFUSALS[outcome.kind]
      : SEARCH_REFUSALS[outcome.reason];
  }
  const searched = outcome.query === undefined ? null : `Searched for: ${outcome.query}`;
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
  const notes = [
    omittedNote(
      outcome.omitted.old,
      "result older than the lookback window was",
      "results older than the lookback window were",
    ),
    omittedNote(
      outcome.omitted.off_topic,
      "result did not mention the vendor and was",
      "results did not mention the vendor and were",
    ),
    omittedNote(
      outcome.omitted.duplicate,
      "result repeated one you already have and was",
      "results repeated ones you already have and were",
    ),
  ].filter((note) => note !== null);
  return [searched, listed, ...notes].filter((part) => part !== null).join("\n");
}

/** "1 result was left out." in the words of the reason; null when none was. */
function omittedNote(count: number | undefined, one: string, many: string): string | null {
  if (count === undefined || count <= 0) return null;
  return count === 1 ? `1 ${one} left out.` : `${count} ${many} left out.`;
}

function describePage(page: PageView): string {
  const lines = [
    `Title: ${page.title}`,
    `URL: ${page.url}`,
    `Date: ${dateOrNone(page.publishedAt)}`,
  ];
  if (page.part !== undefined && page.parts !== undefined) {
    lines.push(`Part ${page.part} of ${page.parts}`);
  }
  lines.push("", page.excerpt);
  // A part that was asked for is told apart by its heading; the first view of a long page says how
  // many parts there are.
  if (page.truncated && page.part === undefined) {
    lines.push("", page.parts === undefined ? PART_OF_PAGE : moreParts(page.parts));
  }
  if (page.links.length > 0) {
    lines.push("", "Links:", ...page.links.map((link) => `- ${link.text} - ${link.url}`));
  }
  return lines.join("\n");
}

function describeRead(outcome: ReadOutcome): string {
  if (outcome.ok) return describePage(outcome.page);
  if (outcome.reason === "same_text") {
    return outcome.sameAs
      ? `The page has the same text as ${outcome.sameAs}, which you already have, so it was left out.`
      : "The page has the same text as one you already have, so it was left out.";
  }
  if (outcome.reason === "no_such_part") return noSuchPart(outcome.parts ?? 0);
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
 * The action as the history shows it: its fields as JSON. The text fields are the values that the
 * loop uses (decoded), so the line is not escaped twice once `renderHistory` escapes it like every
 * other field of the history.
 */
function describeAction(action: LoopAction): string {
  // JSON.stringify leaves out a property whose value is undefined.
  return JSON.stringify({
    ...action,
    query: fromModelIfGiven(action.query),
    url: fromModelIfGiven(action.url),
    focus: fromModelIfGiven(action.focus),
  });
}

/** An action of the history with what came of it. A note that is no action has none. */
interface HistoryCall {
  action: string | null;
  result: string;
}

/** A step of the history. An answer that held no step has no thought and no action. */
interface HistoryEntry {
  thought: string | null;
  calls: HistoryCall[];
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
    for (const call of entry.calls) {
      if (call.action !== null) lines.push(`<action>${escapeForPrompt(call.action)}</action>`);
      const result = inFull ? escapeForPrompt(call.result) : olderResult(call.result);
      lines.push(`<result>${result}</result>`);
    }
    lines.push("</step>");
    return lines.join("\n");
  });
  return ["<history>", ...steps, "</history>"].join("\n");
}

function buildPrompt(
  task: string,
  briefing: string | undefined,
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
    ...(briefing ? ["<briefing>", escapeForPrompt(briefing), "</briefing>", ""] : []),
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
 * once, and a later `finish` is final. Only the sources and the calls of the categories of this
 * loop count, since other loops may be at work on the same session. With `allowEmptyFinish`, calls
 * of its own that found no source are an answer: the model was told what they searched.
 */
function reminderBeforeFinish<C extends string>(
  session: WebSession<C>,
  researchable: readonly C[],
  allowEmptyFinish: boolean,
): string | null {
  const { ledger, calls } = session.snapshot();
  const isOwn = (category: C) => researchable.includes(category);
  if (!ledger.some((entry) => isOwn(entry.category))) {
    if (!allowEmptyFinish || !calls.some((call) => isOwn(call.category))) return NO_SOURCES;
  }
  const uncovered = researchable.filter((category) =>
    calls.every((call) => call.category !== category),
  );
  if (uncovered.length === 0) return null;
  return `You have not covered: ${uncovered.join(", ")}. Continue researching, or finish again to stop.`;
}

/** What a step came to, for the observer: the part of a turn that the step itself knows. */
type StepTrace<C extends string> = Pick<LoopTurn<C>, "tool" | "outcome"> &
  Partial<
    Pick<
      LoopTurn<C>,
      | "category"
      | "kind"
      | "query"
      | "usedQuery"
      | "url"
      | "part"
      | "reason"
      | "results"
      | "omitted"
    >
  >;

export function traceOfSearch(
  outcome: SearchOutcome,
): Pick<LoopTurn, "outcome" | "reason" | "results" | "omitted" | "usedQuery"> {
  if (!outcome.ok) {
    return {
      outcome: outcome.reason === "search_unavailable" ? "failed" : "refused",
      reason: outcome.reason,
    };
  }
  return {
    outcome: outcome.results.length === 0 ? "empty" : "ok",
    results: outcome.results.length,
    ...(Object.keys(outcome.omitted).length > 0 ? { omitted: outcome.omitted } : {}),
    ...(outcome.query === undefined ? {} : { usedQuery: outcome.query }),
  };
}

/**
 * The reasons for which a read never reached the web, or left the page out after it did (it was
 * older than the lookback, or its text was one already read).
 */
const REFUSED_READS: ReadonlySet<string> = new Set([
  "budget_exhausted",
  "not_allowed",
  "bad_address",
  "not_from_search",
  "already_read",
  "same_text",
  "already_failed",
  "site_closed",
  "too_old",
  "no_such_part",
  "parts_limit",
]);

export function traceOfRead(
  outcome: ReadOutcome,
): Pick<LoopTurn, "outcome" | "reason" | "results"> {
  if (outcome.ok) return { outcome: "ok", results: 1 };
  return {
    outcome: REFUSED_READS.has(outcome.reason) ? "refused" : "failed",
    reason: outcome.reason,
  };
}

/** What the rules say about an action before it goes anywhere. */
type Checked<C extends string> =
  | { kind: "invalid"; text: string; trace: StepTrace<C> }
  | { kind: "search"; category: C; query: string; feed: "web" | "news" }
  | { kind: "read"; category: C; url: string; focus: string | undefined; part: number | undefined };

type CheckedRead<C extends string> = Extract<Checked<C>, { kind: "read" }>;

/** Checks a search or a read against its own rules; an action that breaks one is refused. */
function checkAction<C extends string>(
  action: LoopAction<C>,
  researchable: readonly C[],
  defaultKind: "web" | "news",
): Checked<C> {
  const invalid = (
    text: string,
    reason: string,
    fields: Partial<StepTrace<C>> = {},
  ): Checked<C> => ({
    kind: "invalid",
    text,
    trace: { tool: "invalid", outcome: "refused", reason, ...fields },
  });
  if (action.action === "search") {
    const query = fromModel(action.query);
    const feed = action.kind ?? defaultKind;
    const fields = { category: action.category, kind: feed, query };
    if (query.length < MIN_QUERY_CHARS || action.category === undefined) {
      return invalid(INVALID_SEARCH, "invalid_search", fields);
    }
    if (!researchable.includes(action.category)) {
      return invalid(NOT_RESEARCHABLE, "not_researchable", fields);
    }
    return { kind: "search", category: action.category, query, feed };
  }
  const url = fromModel(action.url);
  const fields = { category: action.category, url };
  if (url === "" || action.category === undefined) {
    return invalid(INVALID_READ, "invalid_read", fields);
  }
  if (!researchable.includes(action.category)) {
    return invalid(NOT_RESEARCHABLE, "not_researchable", fields);
  }
  return {
    kind: "read",
    category: action.category,
    url,
    focus: fromModel(action.focus) || undefined,
    part: action.part,
  };
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
  // The observer is told about the turn that is under way (`steps`), and cannot hurt the loop.
  const notify = (turn: Omit<LoopTurn<C>, "n">) => {
    try {
      deps.observer?.turn?.({ n: steps, ...turn });
    } catch {
      // An observer is not part of the research.
    }
  };

  for (;;) {
    if (total.aborted) return end("time");
    const budget = session.budget();
    if (budget.searchesLeft <= 0 && budget.readsLeft <= 0) return end("budget");
    if (steps >= limits.maxSteps) return end("steps");

    const prompt = buildPrompt(
      input.task,
      input.briefing,
      history,
      budget,
      limits.maxSteps - steps,
    );
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
      const failed = {
        thought: null,
        tool: "model_error" as const,
        outcome: "failed" as const,
        ms: 0,
      };
      if (total.aborted) {
        notify({ ...failed, reason: "time" });
        return end("time");
      }
      if (!isUnparseable(error)) {
        notify({ ...failed, reason: "model_error" });
        return end("model_error", error);
      }
      unparseableInARow += 1;
      if (unparseableInARow >= MAX_UNPARSEABLE_IN_A_ROW) {
        notify({ ...failed, reason: "unparseable_answer" });
        return end("model_error", error);
      }
      notify({
        thought: null,
        tool: "invalid",
        outcome: "refused",
        reason: "unparseable_answer",
        ms: 0,
      });
      history.push({ thought: null, calls: [{ action: null, result: UNPARSEABLE_ANSWER }] });
      continue;
    }
    unparseableInARow = 0;
    // The time ran out as the answer came in: no search or read is started on a spent clock.
    if (total.aborted) {
      notify({ thought: step.thought, tool: "invalid", outcome: "refused", reason: "time", ms: 0 });
      return end("time");
    }

    // The thought is told with the first turn of the step only.
    let thought: string | null = step.thought;
    const tell = (turn: Omit<LoopTurn<C>, "n" | "thought">) => {
      notify({ thought, ...turn });
      thought = null;
    };
    const planned = step.actions.slice(0, MAX_ACTIONS_PER_STEP);
    if (planned.length === 0) {
      tell({ tool: "invalid", outcome: "refused", reason: "no_action", ms: 0 });
      history.push({ thought: step.thought, calls: [{ action: null, result: NO_ACTION }] });
      continue;
    }

    const calls: HistoryCall[] = [];
    let finish: LoopAction<C> | null = null;
    for (let index = 0; index < planned.length;) {
      // No action is started on a spent clock.
      if (total.aborted) return end("time");
      const action = planned[index];
      if (action.action === "finish") {
        finish = action;
        break;
      }
      const checked = checkAction(action, input.researchable, session.defaultKind());
      if (checked.kind === "invalid") {
        calls.push({ action: describeAction(action), result: checked.text });
        tell({ ...checked.trace, ms: 0 });
        index += 1;
      } else if (checked.kind === "search") {
        const startedAt = performance.now();
        const outcome = await session.search(checked.query, checked.feed, checked.category, total);
        calls.push({ action: describeAction(action), result: describeSearch(outcome) });
        tell({
          tool: "search",
          category: checked.category,
          kind: checked.feed,
          query: checked.query,
          ...traceOfSearch(outcome),
          ms: Math.round(performance.now() - startedAt),
        });
        index += 1;
      } else {
        // The reads that follow one another go to the web together.
        const group: Array<{ asked: LoopAction<C>; read: CheckedRead<C> }> = [
          { asked: action, read: checked },
        ];
        for (let next = index + 1; next < planned.length && planned[next].action === "read";) {
          const following = checkAction(planned[next], input.researchable, session.defaultKind());
          if (following.kind !== "read") break;
          group.push({ asked: planned[next], read: following });
          next += 1;
        }
        const answers = await session.readMany(
          group.map(({ read }) => ({
            url: read.url,
            category: read.category,
            focus: read.focus,
            part: read.part,
          })),
          total,
        );
        group.forEach(({ asked, read }, position) => {
          const { outcome, ms } = answers[position];
          calls.push({ action: describeAction(asked), result: describeRead(outcome) });
          tell({
            tool: "read",
            category: read.category,
            url: read.url,
            ...(read.part === undefined ? {} : { part: read.part }),
            ...traceOfRead(outcome),
            ms,
          });
        });
        index += group.length;
      }
    }

    if (finish !== null) {
      const reminder = reminded
        ? null
        : reminderBeforeFinish(session, input.researchable, input.allowEmptyFinish === true);
      if (reminder === null) {
        tell({ tool: "finish", outcome: "ok", ms: 0 });
        return end("finished");
      }
      reminded = true;
      calls.push({ action: describeAction(finish), result: reminder });
      tell({ tool: "finish", outcome: "refused", reason: "reminder", ms: 0 });
    } else if (step.actions.length > planned.length) {
      calls.push({ action: null, result: tooManyActions(step.actions.length - planned.length) });
      tell({ tool: "invalid", outcome: "refused", reason: "too_many_actions", ms: 0 });
    }
    history.push({ thought: step.thought, calls });
  }
}
