/**
 * @fileoverview Pure validation helpers for custom dataset JSON uploads.
 *
 * @module pages/EvalsDashboard/NewExperiment/datasetUpload
 */

export type DatasetValidationResult =
  | { ok: true; validPromptCount: number }
  | { ok: false; title: string; body: string };

/**
 * Count prompts that have actual content — either a non-empty `prompt` field
 * (single-turn) or at least one turn with non-empty `content` (multi-turn).
 */
export function countValidPrompts(parsedData: unknown[]): number {
  return parsedData.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    const obj = item as Record<string, unknown>;
    if (obj.prompt && typeof obj.prompt === "string" && obj.prompt.trim()) return true;
    if (Array.isArray(obj.turns) && obj.turns.length > 0) {
      return obj.turns.some((turn) => {
        if (typeof turn !== "object" || turn === null) return false;
        const t = turn as Record<string, unknown>;
        return t.content && typeof t.content === "string" && t.content.trim();
      });
    }
    return false;
  }).length;
}

/**
 * Parse and validate a dataset JSON file before uploading. Returns either a
 * valid prompt count or an alert-ready error title/body.
 */
export function validateDatasetFileContent(fileContent: string): DatasetValidationResult {
  let parsedData: unknown[];
  try {
    parsedData = JSON.parse(fileContent);
  } catch {
    return {
      ok: false,
      title: "Invalid JSON",
      body: "The file does not contain valid JSON",
    };
  }

  if (!Array.isArray(parsedData) || parsedData.length === 0) {
    return {
      ok: false,
      title: "Empty dataset",
      body: "Cannot use an empty dataset. Please upload a file with at least one prompt.",
    };
  }

  const validPromptCount = countValidPrompts(parsedData);
  if (validPromptCount === 0) {
    return {
      ok: false,
      title: "Empty dataset",
      body: "Cannot use an empty dataset. Please upload a file with prompts that have actual content.",
    };
  }

  return { ok: true, validPromptCount };
}
