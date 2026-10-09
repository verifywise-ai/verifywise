/**
 * Display labels shared by the AI agents list, detail page and drawers.
 */

// Friendly display names for known discovery sources. Falls back to the raw
// source_system key (title-cased) for any source not listed here.
export const SOURCE_LABELS: Record<string, string> = {
  "azure-ai-foundry": "Azure AI Foundry",
};

export function formatSourceLabel(sourceSystem: string): string {
  if (SOURCE_LABELS[sourceSystem]) return SOURCE_LABELS[sourceSystem];
  return sourceSystem
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The subset of a model inventory row needed to label it. */
export interface ModelLabelSource {
  id: number | string;
  provider?: string | null;
  model?: string | null;
  provider_model?: string | null;
  model_name?: string | null;
  name?: string | null;
}

/**
 * Label a model inventory row as "<provider> · <model>". The inventory exposes
 * the model name as `model` (with `provider` and `provider_model`); fall back
 * progressively to whatever is present, then to "Model #<id>".
 */
export function formatModelLabel(model: ModelLabelSource): string {
  const modelName = model.model || model.provider_model || model.model_name || model.name;
  if (!modelName) return `Model #${model.id}`;
  return model.provider ? `${model.provider} · ${modelName}` : modelName;
}
