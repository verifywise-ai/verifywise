import type { AgentCreateModelRiskInput } from "./schema";

export function renderCreateModelRiskPreview(input: AgentCreateModelRiskInput): string {
  const qualifierParts: string[] = [];
  if (input.risk_level) qualifierParts.push(input.risk_level);
  if (input.risk_category) qualifierParts.push(input.risk_category);
  const qualifier = qualifierParts.length ? `${qualifierParts.join(" / ")} ` : "";

  const tail: string[] = [];
  if (input.model_id !== undefined) tail.push(`model #${input.model_id}`);
  else tail.push("unattached");
  if (input.status) tail.push(`status: ${input.status}`);
  if (input.target_date) tail.push(`target ${input.target_date}`);

  return `Create ${qualifier}model risk "${input.risk_name}" (${tail.join("; ")})`;
}
