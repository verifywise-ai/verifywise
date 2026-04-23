/**
 * Render a short human-readable preview of the proposed risk — shown to
 * the approver in the Pending Approvals UI so they can decide without
 * digging into the raw JSON payload.
 *
 * Pure function, no I/O. Safe to call both at file-time (when we stash
 * the string in `entity_data.preview`) and at display-time.
 */

import type { AgentCreateRiskInput } from "./schema";

export function renderCreateRiskPreview(input: AgentCreateRiskInput): string {
  const qualifierParts: string[] = [];
  if (input.severity) qualifierParts.push(input.severity);
  if (input.likelihood) qualifierParts.push(input.likelihood.toLowerCase());
  const qualifier = qualifierParts.length ? `${qualifierParts.join("/")} ` : "";

  const tail: string[] = [];
  tail.push(`current level: ${input.current_risk_level}`);
  tail.push(`mitigation: ${input.mitigation_status}`);
  tail.push(`deadline ${input.deadline}`);
  if (input.project_ids && input.project_ids.length > 0) {
    tail.push(
      `project${input.project_ids.length > 1 ? "s" : ""} ${input.project_ids.join(", ")}`,
    );
  }

  return `Create a ${qualifier}risk "${input.risk_name}" (${tail.join("; ")})`;
}
