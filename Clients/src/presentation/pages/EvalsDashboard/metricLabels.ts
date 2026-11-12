/**
 * @fileoverview One display name per LLM Evals metric, in sentence case. The wizard,
 * the experiment detail page and the performance chart all read names from here so
 * the same metric is never called two different things.
 *
 * @module pages/EvalsDashboard/metricLabels
 */

export const METRIC_LABELS: Record<string, string> = {
  answerRelevancy: "Answer relevancy",
  correctness: "Correctness",
  completeness: "Completeness",
  instructionFollowing: "Instruction following",
  faithfulness: "Faithfulness",
  contextualRelevancy: "Contextual relevancy",
  contextualRecall: "Contextual recall",
  contextualPrecision: "Contextual precision",
  contextRelevancy: "Context relevancy",
  contextPrecision: "Context precision",
  contextRecall: "Context recall",
  hallucination: "Hallucination",
  toolCorrectness: "Tool correctness",
  toolSelection: "Tool selection",
  actionRelevance: "Action relevance",
  planningQuality: "Planning quality",
  planQuality: "Plan quality",
  planAdherence: "Plan adherence",
  argumentCorrectness: "Argument correctness",
  stepEfficiency: "Step efficiency",
  answerCorrectness: "Answer correctness",
  coherence: "Coherence",
  tonality: "Tonality",
  safety: "Safety",
  bias: "Bias",
  toxicity: "Toxicity",
  turnRelevancy: "Turn relevancy",
  knowledgeRetention: "Knowledge retention",
  conversationCoherence: "Conversation coherence",
  conversationHelpfulness: "Conversation helpfulness",
  taskCompletion: "Task completion",
  conversationSafety: "Conversation safety",
  conversationCompleteness: "Conversation completeness",
  conversationRelevancy: "Conversation relevancy",
  roleAdherence: "Role adherence",
  conversationQuality: "Conversation quality",
};

/** Names the evaluator stores on each log, mapped to metric keys. */
export const METRIC_KEY_BY_DISPLAY_NAME: Record<string, string> = {
  // Single-turn metrics
  "Answer Relevancy": "answerRelevancy",
  "Faithfulness": "faithfulness",
  "Contextual Relevancy": "contextualRelevancy",
  "Contextual Recall": "contextualRecall",
  "Contextual Precision": "contextualPrecision",
  "Bias": "bias",
  "Toxicity": "toxicity",
  "Hallucination": "hallucination",
  "Tool Correctness": "toolCorrectness",
  "Answer Correctness": "answerCorrectness",
  "Coherence": "coherence",
  "Tonality": "tonality",
  "Safety": "safety",
  // Names the evaluator stores today (EvaluationModule deepeval_evaluator.py)
  "Relevance": "answerRelevancy",
  "Correctness": "correctness",
  "Completeness": "completeness",
  "Instruction Following": "instructionFollowing",
  // Same keys as results.avg_scores (run_evaluation metric_config_map)
  "Context Relevancy": "contextRelevancy",
  "Context Precision": "contextPrecision",
  "Context Recall": "contextRecall",
  "Tool Selection": "toolSelection",
  "Action Relevance": "actionRelevance",
  "Planning Quality": "planningQuality",
  // Not enabled by run_evaluation, but other evaluator entry points emit it
  "Plan Quality": "planQuality",
  "Plan Adherence": "planAdherence",
  "Argument Correctness": "argumentCorrectness",
  "Step Efficiency": "stepEfficiency",
  // Conversational metrics (multi-turn)
  "Turn Relevancy": "turnRelevancy",
  "Knowledge Retention": "knowledgeRetention",
  "Conversation Coherence": "conversationCoherence",
  "Conversation Helpfulness": "conversationHelpfulness",
  "Task Completion": "taskCompletion",
  "Conversation Safety": "conversationSafety",
  "Conversation Completeness": "conversationCompleteness",
  "Conversation Relevancy": "conversationRelevancy",
  "Role Adherence": "roleAdherence",
  "Conversation Quality": "conversationQuality",
};

/**
 * The display name for a metric key. Unknown keys (custom scorers, new metrics) are
 * turned from camelCase or snake_case into sentence case: "myScorer" → "My scorer".
 */
export function metricLabel(key: string): string {
  const known = METRIC_LABELS[key];
  if (known) return known;
  // Already a name someone wrote ("Brand voice", "LLM judge X"): keep it as written
  if (/\s/.test(key.trim()) && !/_/.test(key)) return key.trim();
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** "G-Eval (Coherence)" → "Coherence"; any other name is returned unchanged. */
export function stripGEvalPrefix(name: string): string {
  return name.replace(/^G-Eval\s*\((.+)\)$/i, "$1");
}
