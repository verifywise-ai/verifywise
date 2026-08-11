/**
 * @fileoverview Pure helpers for deriving default experiment and dataset names.
 *
 * @module pages/EvalsDashboard/NewExperiment/experimentNameHelpers
 */

/**
 * Strip noise from a model identifier so it reads cleanly as part of an
 * experiment name:
 *   "openai/gpt-4o-mini"            -> "gpt-4o-mini"
 *   "mistralai/mistral-medium-3-5"  -> "mistral-medium-3-5"
 *   "claude-3-5-sonnet-20241022"    -> "claude-3-5-sonnet"
 */
export const shortenForExperimentName = (s?: string | null): string => {
  if (!s) return "";
  const dateless = s.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  const slashIdx = dateless.lastIndexOf("/");
  return slashIdx >= 0 ? dateless.slice(slashIdx + 1) : dateless;
};

/**
 * Build the default name for a new experiment as `<model> × <dataset>`.
 * If that exact name is already used in this project, append #2, #3, ...
 * until we hit one that's free.
 */
export const generateDefaultExperimentName = (
  modelName: string,
  datasetName: string,
  existing: readonly string[],
): string => {
  const m = shortenForExperimentName(modelName) || "model";
  const d = (datasetName || "dataset").trim() || "dataset";
  const base = `${m} × ${d}`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} #${n}`)) n++;
  return `${base} #${n}`;
};

/**
 * Derive a human-friendly dataset name from a preset filename like
 * "chatbot/chatbot_coding_helper.json" -> "Chatbot Coding Helper".
 */
export const datasetNameFromPresetPath = (path?: string | null): string => {
  if (!path) return "";
  const fileName =
    path
      .split("/")
      .pop()
      ?.replace(/\.json$/i, "") || "";
  return fileName
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};
