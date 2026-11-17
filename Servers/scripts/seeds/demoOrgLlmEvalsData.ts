/**
 * LLM Evals demo data for the demo-org seeder (demoOrg.ts).
 *
 * Kept apart from demoOrg.ts so tests can import it: importing demoOrg.ts runs
 * the seed.
 *
 * Each project's golden set is a JSON file under
 * EvaluationModule/data/datasets/ (`dataset.path`). The file is the single
 * source of truth for the prompts: the seeder reads it, the seeded experiments
 * show exactly its prompts, and their config carries them inline, so Rerun and
 * a fresh run evaluate what the seeded history shows. Only what the seeded
 * "model" answered lives here (`seededOutputs`, one per prompt, in file order).
 *
 * The files live in `demo/`, which the dataset template list does not read, so
 * they never show up as built-in templates.
 */
import { readFileSync, statSync } from "fs";
import path from "path";

export const LLM_EVALS_DATASETS_ROOT = path.resolve(
  __dirname,
  "../../../EvaluationModule/data/datasets",
);

/** Folders the EvalServer lists as built-in templates (controllers/deepeval.py). */
export const LLM_EVALS_TEMPLATE_FOLDERS = ["chatbot", "rag", "agent", "safety"];

/** One single-turn prompt, in the format the evaluator reads. */
export type LlmEvalsGoldenItem = {
  id: string;
  category: string;
  prompt: string;
  expected_output: string;
  difficulty?: string;
  retrieval_context?: string[];
};

export type LlmEvalsProjectConfig = {
  key: string;
  name: string;
  use_case: "chatbot" | "rag";
  dataset: { name: string; path: string };
  /** What the seeded "model" answered, one per golden-set prompt, in file order. */
  seededOutputs: string[];
  model: string;
  metrics: string[];
  trajectory: number[]; // one score per experiment, oldest -> newest
};

export type LlmEvalsGoldenSet = { items: LlmEvalsGoldenItem[]; sizeBytes: number };

/**
 * Read a project's golden set and check it can back the seeded history:
 * single-turn, every prompt answered by `seededOutputs`, and retrieved
 * passages on every RAG prompt (the seeded runs score context metrics).
 */
export function loadGoldenSet(project: LlmEvalsProjectConfig): LlmEvalsGoldenSet {
  const file = path.join(LLM_EVALS_DATASETS_ROOT, project.dataset.path);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `Golden set for "${project.name}" not found at ${file}. Run the seeder from a full repo checkout.`,
    );
  }
  const items = JSON.parse(raw) as Array<LlmEvalsGoldenItem & { turns?: unknown }>;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`Golden set ${project.dataset.path} must be a non-empty array.`);
  }
  items.forEach((item, i) => {
    if (item.turns !== undefined || typeof item.prompt !== "string" || !item.prompt) {
      throw new Error(`Golden set ${project.dataset.path} item ${i} is not a single-turn prompt.`);
    }
    if (project.use_case === "rag" && !item.retrieval_context?.length) {
      throw new Error(`Golden set ${project.dataset.path} item ${i} has no retrieval_context.`);
    }
  });
  if (items.length !== project.seededOutputs.length) {
    throw new Error(
      `Golden set ${project.dataset.path} has ${items.length} prompts but "${project.name}" seeds ${project.seededOutputs.length} outputs.`,
    );
  }
  return { items, sizeBytes: statSync(file).size };
}

/**
 * The experiment config a seeded run stores: the same dataset and metrics shape
 * NewExperimentModal sends, so Rerun works on seeded runs.
 */
export function seededExperimentConfig(
  project: LlmEvalsProjectConfig,
  golden: LlmEvalsGoldenSet,
  datasetId: number,
) {
  return {
    model: { name: project.model, provider: "openrouter", accessMethod: "openrouter" },
    dataset: {
      name: project.dataset.name,
      path: project.dataset.path,
      datasetId,
      prompts: golden.items,
      count: golden.items.length,
    },
    metrics: Object.fromEntries(project.metrics.map((m) => [m, true])),
    judgeLlm: { name: "gpt-4o-mini", provider: "openrouter" },
    evaluationMode: "standard",
  };
}

export const LLM_EVALS_PROJECTS: LlmEvalsProjectConfig[] = [
  {
    key: "support",
    name: "Support chatbot",
    use_case: "chatbot",
    dataset: {
      name: "Support chatbot golden set",
      path: "demo/support_chatbot_golden_set.json",
    },
    seededOutputs: [
      "Go to Settings > Security > Reset Password, then follow the emailed link. It expires in 30 minutes.",
      "Annual plans are refundable within 30 days of purchase, prorated for any months already used.",
      "I can see your last invoice included a mid-cycle seat upgrade. That's the extra line item you're seeing.",
      "Use Settings > Data Export to generate a CSV/JSON archive; it's emailed to you within a few minutes.",
      "Yes, under Billing > Contacts you can update the billing email at any time.",
      "Open Settings > Team and click Invite member. Enter their email, pick a role, and they'll get an invite by email.",
      "Bank transfer is available on annual plans. Select it under Billing > Payment methods; invoices are payable within 30 days.",
      "In Settings > Security, open Two-factor authentication, scan the QR code with your authenticator app and confirm the 6-digit code.",
      "Declines usually come from an expired card, a mismatched billing address or your bank blocking the charge. You can update the card under Billing > Payment methods.",
      "Go to Billing > Plan and choose Cancel subscription. You keep access until the end of your current billing period.",
    ],
    model: "gpt-4o-mini",
    metrics: ["answerRelevancy", "correctness", "toxicity", "bias"],
    trajectory: [0.61, 0.68, 0.74, 0.82, 0.85],
  },
  {
    key: "kb",
    name: "Knowledge base assistant",
    use_case: "rag",
    dataset: {
      name: "Knowledge base assistant golden set",
      path: "demo/knowledge_base_golden_set.json",
    },
    seededOutputs: [
      "Per the retention policy document, support tickets are retained for 24 months, then anonymized.",
      "The checklist covers: kickoff call, SSO setup, data migration, admin training, and a 30-day check-in.",
      "Priority 1 incidents carry a 1-hour response SLA and a 4-hour resolution target.",
      "The API reference's 'Rate limits' section lists 100 requests/minute for standard tier keys.",
      "Security questionnaires are requested via the Trust Center form and are typically returned in 3 business days.",
      "Tier 1 models need a full revalidation every 12 months, plus an out-of-cycle review after any material change.",
      "Exceptions go through the policy exception form and are approved by the Chief Risk Officer, for a maximum of 90 days.",
      "No. Public AI tools may only receive public information. Customer personal data and anything classified confidential must never be pasted in.",
      "Audit logs are retained for seven years, per the data retention policy.",
      "Record it in the incident register within 24 hours. That notifies the model owner and the model risk management team, who triage it.",
    ],
    model: "gpt-4o-mini",
    metrics: ["answerRelevancy", "faithfulness", "contextPrecision", "contextRecall"],
    trajectory: [0.66, 0.72, 0.78, 0.84],
  },
];
