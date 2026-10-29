/**
 * Rule checks for intake answers: placeholder and too-short answers, possible
 * EU AI Act Article 5 practices and Annex III uses, and GDPR Article 22
 * automated decisions. Pure, no I/O. The client runs a line-for-line copy while
 * the submitter types; the server runs this one again at submit.
 */
import { evaluateForm, sortFields, type LogicField, type LogicSchema } from "../intakeFormLogic";
import type { FormSchema } from "../intakeRiskScoring.service";
import {
  HINT_KIND_ORDER,
  type HintKind,
  type LiveCheckHint,
} from "../../domain.layer/interfaces/i.intakeLiveChecks";
import {
  ANNEX_III_TERMS,
  ARTICLE_5_TERMS,
  GDPR_ART22_TERMS,
  MIN_TEXTAREA_LENGTH,
  NEGATION_WORDS,
  PLACEHOLDER_ANSWERS,
  RULE_COPY,
} from "./ruleTerms";
import { escapeRegExp } from "../../utils/regex.utils";

const CHECKED_TYPES = ["text", "textarea"];

const TERM_PATTERNS = new Map<string, RegExp>();
/** Matches a term at a word start and captures the rest of the word, or the exact word for a "$" term. */
const termPattern = (term: string): RegExp => {
  let pattern = TERM_PATTERNS.get(term);
  if (!pattern) {
    const wholeWord = term.endsWith("$");
    const body = escapeRegExp((wholeWord ? term.slice(0, -1) : term).toLowerCase());
    pattern = new RegExp(`\\b${body}${wholeWord ? "\\b" : "\\w*"}`, "gi");
    TERM_PATTERNS.set(term, pattern);
  }
  return pattern;
};

/** Characters looked back from a match for a negation word; plenty for three words, and it keeps the check linear on long answers. */
const NEGATION_WINDOW = 80;

const isNegated = (answer: string, index: number): boolean => {
  const start = Math.max(0, index - NEGATION_WINDOW);
  let before = answer.slice(start, index);
  // A window that starts inside a word drops that fragment ("no" from "piano").
  if (start > 0 && /[a-z']/i.test(answer[start - 1])) before = before.replace(/^[a-z']+/i, "");
  // The window stops at the end of the previous sentence or clause.
  const sentence = before.slice(
    Math.max(...[".", "!", "?", ";"].map((mark) => before.lastIndexOf(mark))) + 1,
  );
  const words = sentence.toLowerCase().match(/[a-z']+/g) ?? [];
  return words.slice(-3).some((word) => NEGATION_WORDS.includes(word));
};

/** The answer's words for the first match of any term, skipping negated matches when asked. */
const findTerm = (answer: string, terms: string[], checkNegation: boolean): string | null => {
  for (const term of terms) {
    for (const match of answer.matchAll(termPattern(term))) {
      if (!checkNegation || !isNegated(answer, match.index ?? 0)) return match[0];
    }
  }
  return null;
};

/** Every group needs a match; returns the matched words, or null. */
const findAll = (answer: string, groups: string[][], checkNegation: boolean): string | null => {
  const found: string[] = [];
  for (const group of groups) {
    const words = findTerm(answer, group, checkNegation);
    if (words === null) return null;
    found.push(words);
  }
  return found.join(", ");
};

const ruleHint = (
  ruleId: string,
  questionId: string,
  kind: HintKind,
  excerpt?: string,
): LiveCheckHint => {
  const copy = RULE_COPY[ruleId];
  return {
    id: `${ruleId}:${questionId}`,
    kind,
    source: "rule",
    questionId,
    ruleId,
    ...(copy.ref ? { ref: copy.ref } : {}),
    title: copy.title,
    text: copy.text,
    ...(excerpt ? { excerpt } : {}),
  };
};

function checkAnswer(field: LogicField, answer: string): LiveCheckHint[] {
  const hints: LiveCheckHint[] = [];
  const trimmed = answer.trim();

  if (PLACEHOLDER_ANSWERS.includes(trimmed.toLowerCase())) {
    hints.push(ruleHint("placeholder", field.id, "vague"));
  } else if (field.type === "textarea" && trimmed.length < MIN_TEXTAREA_LENGTH) {
    hints.push(ruleHint("too_short", field.id, "vague"));
  }

  for (const [key, groups] of Object.entries(ARTICLE_5_TERMS)) {
    const words = findAll(trimmed, groups, true);
    if (words !== null) hints.push(ruleHint(`art5_${key}`, field.id, "prohibited", words));
  }
  for (const [key, terms] of Object.entries(ANNEX_III_TERMS)) {
    const words = findTerm(trimmed, terms, true);
    if (words !== null) hints.push(ruleHint(`annex3_${key}`, field.id, "regulation", words));
  }
  const automated = findTerm(trimmed, GDPR_ART22_TERMS, false);
  if (automated !== null) hints.push(ruleHint("gdpr_art22", field.id, "regulation", automated));

  return hints;
}

/**
 * Rule hints for the visible text and textarea answers, most serious kind
 * first, then in form order.
 */
export function runRuleChecks(schema: FormSchema, data: Record<string, unknown>): LiveCheckHint[] {
  // Stored schemas carry the order and visibility rules FormSchema leaves out.
  const logicSchema = schema as unknown as LogicSchema;
  const { visibleIds, effectiveAnswers } = evaluateForm(logicSchema, data ?? {});
  const hints: LiveCheckHint[] = [];
  for (const field of sortFields(Array.isArray(logicSchema?.fields) ? logicSchema.fields : [])) {
    const answer = effectiveAnswers[field.id];
    if (!visibleIds.has(field.id) || !CHECKED_TYPES.includes(field.type)) continue;
    if (typeof answer !== "string" || answer.trim() === "") continue;
    hints.push(...checkAnswer(field, answer));
  }
  // Array.prototype.sort is stable, so form order holds within a kind.
  return hints.sort((a, b) => HINT_KIND_ORDER.indexOf(a.kind) - HINT_KIND_ORDER.indexOf(b.kind));
}
