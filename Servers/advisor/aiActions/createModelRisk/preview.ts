import type { AgentCreateModelRiskInput } from "./schema";
import { calculateModelRiskLevel } from "../../../utils/riskLevel.utils";

export function renderCreateModelRiskPreview(input: AgentCreateModelRiskInput): string {
  const qualifierParts: string[] = [];
  // The level the service will store: the formula's when both are given.
  const level = calculateModelRiskLevel(input.likelihood, input.severity) ?? input.risk_level;
  if (level) qualifierParts.push(level);
  if (input.risk_category) qualifierParts.push(input.risk_category);
  const qualifier = qualifierParts.length ? `${qualifierParts.join(" / ")} ` : "";

  const tail: string[] = [];
  if (input.model_id !== undefined) tail.push(`model #${input.model_id}`);
  else tail.push("unattached");
  if (input.status) tail.push(`status: ${input.status}`);
  if (input.target_date) tail.push(`target ${input.target_date}`);

  return `Create ${qualifier}model risk "${input.risk_name}" (${tail.join("; ")})`;
}
