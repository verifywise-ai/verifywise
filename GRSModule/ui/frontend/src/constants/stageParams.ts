export interface ParamDef {
  key: string;
  label: string;
  type: "number" | "text" | "boolean" | "select";
  options?: string[];
  default: unknown;
  showWhen?: { key: string; value: unknown };
}

export const STAGE_PARAMS: Record<string, ParamDef[]> = {
  seeds: [],
  render: [
    { key: "seed", label: "Seed", type: "number", default: 42 },
    { key: "per_obligation", label: "Per Obligation", type: "number", default: 2 },
  ],
  perturb: [
    { key: "k_per_base", label: "K per Base", type: "number", default: 3 },
    {
      key: "coverage", label: "Coverage", type: "select",
      options: ["per_family", "random"], default: "per_family",
    },
  ],
  validate: [
    {
      key: "provider", label: "Provider", type: "select",
      options: ["mock", "openrouter"], default: "openrouter",
    },
    {
      key: "validator_model_id", label: "Validator Model ID", type: "text",
      default: "openai/gpt-4o-mini",
      showWhen: { key: "provider", value: "openrouter" },
    },
  ],
  infer: [
    {
      key: "infer_provider", label: "Provider", type: "select",
      options: ["mock", "openrouter"], default: "openrouter",
    },
    { key: "temperature", label: "Temperature", type: "number", default: 0.2 },
    { key: "max_tokens", label: "Max Tokens", type: "number", default: 500 },
    { key: "limit", label: "Limit (optional)", type: "number", default: null },
    { key: "resume", label: "Resume", type: "boolean", default: true },
  ],
  judge: [
    { key: "judge_temperature", label: "Judge Temperature", type: "number", default: 0.0 },
    { key: "limit", label: "Limit (optional)", type: "number", default: null },
    { key: "resume", label: "Resume", type: "boolean", default: true },
  ],
};
