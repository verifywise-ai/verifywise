export const STAGE_CONFIGS: Record<string, string[]> = {
  seeds:    ["obligations"],
  render:   ["obligations", "templates"],
  perturb:  ["mutations"],
  validate: ["obligations"],
  infer:    ["models"],
  judge:    ["judge_rubric", "models"],
};
