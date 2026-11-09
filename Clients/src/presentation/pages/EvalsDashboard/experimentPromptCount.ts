import type { Experiment } from "../../../infrastructure/api/evaluationLogsService";

// How many prompts an experiment ran, for the experiments list and the overview. For
// single-turn and conversational runs this matches the experiment page, which counts
// the logged prompts; simulated runs write no logs, so the page shows none for them.
// - results.prompts_attempted: every prompt the run tried (saved since this field exists);
// - else the dataset size from the config;
// - else results.total_prompts, which counts only the prompts that were evaluated.
export const experimentPromptCount = (exp: Pick<Experiment, "config" | "results">): number =>
  exp.results?.prompts_attempted ||
  exp.config?.dataset?.count ||
  exp.config?.dataset?.prompts?.length ||
  exp.results?.total_prompts ||
  0;
