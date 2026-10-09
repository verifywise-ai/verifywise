import type { Question } from "../../../domain/types/euAiActClassification";

interface SectionDefinition {
  title: string;
  questionIds: string[];
  /** Also claims ids not listed anywhere that end with this suffix. */
  idSuffix?: string;
}

/** Sections of the builder's read-only questionnaire view, in display order. */
export const EU_AI_ACT_QUESTION_SECTIONS: SectionDefinition[] = [
  { title: "Scope and role", questionIds: ["scope", "role"] },
  {
    title: "Article 5 · Prohibited practices",
    questionIds: [
      "art5_practices",
      "rbi_law_enforcement",
      "rbi_objective",
      "intimate_content",
      "intimate_content_safeguards",
    ],
  },
  { title: "Annex I · Product safety", questionIds: ["safety_function"] },
  {
    title: "Annex III · High-risk uses",
    questionIds: ["annex_iii_areas", "profiling", "derogation"],
    idSuffix: "_use",
  },
  { title: "Article 50 · Transparency", questionIds: ["transparency"] },
];

/** Catch-all so a newer questionnaire version can never drop questions from the view. */
export const OTHER_QUESTIONS_SECTION_TITLE = "Other questions";

export interface QuestionSection {
  title: string;
  questions: Question[];
}

const LISTED_IDS = new Set(EU_AI_ACT_QUESTION_SECTIONS.flatMap((s) => s.questionIds));

function sectionIndexFor(questionId: string): number {
  const listed = EU_AI_ACT_QUESTION_SECTIONS.findIndex((s) => s.questionIds.includes(questionId));
  if (listed !== -1) return listed;
  if (LISTED_IDS.has(questionId)) return -1;
  return EU_AI_ACT_QUESTION_SECTIONS.findIndex(
    (s) => s.idSuffix !== undefined && questionId.endsWith(s.idSuffix),
  );
}

/**
 * Groups questions into the display sections, keeping questionnaire order
 * within each section and leaving out empty sections.
 */
export function groupEuAiActQuestions(questions: Question[]): QuestionSection[] {
  const buckets: Question[][] = EU_AI_ACT_QUESTION_SECTIONS.map(() => []);
  const other: Question[] = [];
  for (const question of questions) {
    const index = sectionIndexFor(question.id);
    if (index === -1) other.push(question);
    else buckets[index].push(question);
  }
  const sections = EU_AI_ACT_QUESTION_SECTIONS.map((s, i) => ({
    title: s.title,
    questions: buckets[i],
  }));
  if (other.length > 0) {
    sections.push({ title: OTHER_QUESTIONS_SECTION_TITLE, questions: other });
  }
  return sections.filter((s) => s.questions.length > 0);
}

/**
 * Option labels that make a follow-up question appear, when its rule is a
 * single `anyOf` condition. Returns null for any other rule shape, or when a
 * referenced question or option cannot be found.
 */
export function followUpTriggerLabels(
  question: Question,
  questionsById: Map<string, Question>,
): string[] | null {
  const groups = question.showWhen;
  if (!groups || groups.length !== 1 || groups[0].length !== 1) return null;
  const [condition] = groups[0];
  if (!condition.anyOf || condition.anyOf.length === 0 || condition.noneOf?.length) return null;
  const source = questionsById.get(condition.questionId);
  if (!source) return null;
  const labels: string[] = [];
  for (const value of condition.anyOf) {
    const option = source.options.find((o) => o.value === value);
    if (!option) return null;
    labels.push(option.label);
  }
  return labels;
}
