/**
 * Default Post-Market Monitoring Questions
 *
 * These are the system default questions that are automatically added when
 * a new PMM configuration is created. They are based on EU AI Act compliance
 * requirements (Article 9 and Article 72).
 */

import {
  IPMMQuestionCreate,
  QuestionType,
} from "../../domain.layer/interfaces/i.postMarketMonitoring";

export interface DefaultQuestion {
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  suggestion_text?: string;
  is_required: boolean;
  allows_flag_for_concern: boolean;
  eu_ai_act_article?: string;
}

/**
 * System default questions for post-market monitoring.
 * These questions align with EU AI Act requirements.
 */
export const DEFAULT_PMM_QUESTIONS: DefaultQuestion[] = [
  {
    question_text: "Have you reviewed all identified risks and their mitigations for this use case?",
    question_type: "yes_no",
    suggestion_text: "Consider reviewing the risk register and ensuring all high-priority risks have adequate mitigation measures in place.",
    is_required: true,
    allows_flag_for_concern: true,
    eu_ai_act_article: "Article 9",
  },
  {
    question_text: "Have you reviewed the connected AI models and their associated risks?",
    question_type: "yes_no",
    suggestion_text: "Review the model inventory to ensure all models are performing as expected and risks are properly documented.",
    is_required: true,
    allows_flag_for_concern: true,
    eu_ai_act_article: "Article 9",
  },
  {
    question_text: "Have you reviewed the connected vendors and their associated risks?",
    question_type: "yes_no",
    suggestion_text: "Check vendor compliance status and ensure all vendor-related risks are being actively managed.",
    is_required: true,
    allows_flag_for_concern: true,
    eu_ai_act_article: "Article 72",
  },
  {
    question_text: "Have there been any incidents, malfunctions, or unexpected behaviors to report?",
    question_type: "yes_no",
    suggestion_text: "Document any incidents in the incident management system and ensure proper escalation procedures are followed.",
    is_required: true,
    allows_flag_for_concern: true,
    eu_ai_act_article: "Article 72",
  },
  {
    question_text: "Have any changes been made to the AI system or its operating environment since the last review?",
    question_type: "yes_no",
    suggestion_text: "Ensure all changes are properly documented and assessed for their impact on risk levels.",
    is_required: true,
    allows_flag_for_concern: true,
    eu_ai_act_article: "Article 9",
  },
  {
    question_text: "Are all required technical documentation and logs up to date?",
    question_type: "yes_no",
    suggestion_text: "Review documentation requirements and ensure all technical records are current and accessible.",
    is_required: true,
    allows_flag_for_concern: true,
    eu_ai_act_article: "Article 9",
  },
  {
    question_text: "Any additional concerns or observations to report?",
    question_type: "multi_line_text",
    suggestion_text: undefined,
    is_required: false,
    allows_flag_for_concern: true,
    eu_ai_act_article: undefined,
  },
];

/**
 * Convert default questions to the format needed for database insertion
 */
export const getDefaultQuestionsForConfig = (
  configId: number
): IPMMQuestionCreate[] => {
  return DEFAULT_PMM_QUESTIONS.map((q, index) => ({
    config_id: configId,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options,
    suggestion_text: q.suggestion_text,
    is_required: q.is_required,
    allows_flag_for_concern: q.allows_flag_for_concern,
    display_order: index + 1,
    eu_ai_act_article: q.eu_ai_act_article,
  }));
};

/**
 * Get default questions as global template (config_id = null)
 * Used for organization-wide default questions
 */
export const getDefaultQuestionsAsTemplate = (): IPMMQuestionCreate[] => {
  return DEFAULT_PMM_QUESTIONS.map((q, index) => ({
    config_id: null,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options,
    suggestion_text: q.suggestion_text,
    is_required: q.is_required,
    allows_flag_for_concern: q.allows_flag_for_concern,
    display_order: index + 1,
    eu_ai_act_article: q.eu_ai_act_article,
  }));
};

/**
 * Seed default questions for a new PMM configuration
 */
export const seedDefaultQuestions = async (
  configId: number,
  organizationId: number,
  addQuestionFn: (question: IPMMQuestionCreate, organizationId: number) => Promise<any>
): Promise<void> => {
  const questions = getDefaultQuestionsForConfig(configId);

  for (const question of questions) {
    await addQuestionFn(question, organizationId);
  }
};

/**
 * Get EU AI Act articles referenced in default questions
 */
export const getReferencedArticles = (): string[] => {
  const articles = new Set<string>();

  DEFAULT_PMM_QUESTIONS.forEach((q) => {
    if (q.eu_ai_act_article) {
      articles.add(q.eu_ai_act_article);
    }
  });

  return Array.from(articles);
};
