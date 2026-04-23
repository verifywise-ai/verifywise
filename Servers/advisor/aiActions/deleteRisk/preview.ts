/**
 * Render a short human-readable preview of the proposed deletion.
 *
 * Shown to the approver in the Pending Approvals UI. Pure function,
 * no I/O — the current risk snapshot (if any) is passed in by the
 * caller in `file.ts`, so this module has no DB dependency.
 */

import type { AgentDeleteRiskInput } from "./schema";

export type CurrentRiskForDelete = {
  risk_name?: string;
  severity?: string;
  mitigation_status?: string;
};

/**
 * Full preview variant — used from `file.ts` where the current risk
 * has already been loaded.
 */
export function renderDeleteRiskDetailedPreview(
  input: AgentDeleteRiskInput,
  currentRisk: CurrentRiskForDelete | null,
): string {
  if (!currentRisk) {
    return `Delete risk #${input.risk_id} (risk not found — the delete will fail when approved)`;
  }

  const name = currentRisk.risk_name ?? `#${input.risk_id}`;
  const qualifiers: string[] = [];
  if (currentRisk.severity) qualifiers.push(currentRisk.severity);
  if (currentRisk.mitigation_status)
    qualifiers.push(currentRisk.mitigation_status);

  const qualifierText = qualifiers.length
    ? ` (${qualifiers.join("; ")})`
    : "";

  const reasonSuffix = input.reason ? ` — reason: "${input.reason}"` : "";

  return `Delete risk "${name}"${qualifierText}${reasonSuffix}`;
}

/**
 * Fallback preview required by the handler interface. No current-entity
 * context, so just echoes the id and reason.
 */
export function renderDeleteRiskPreview(input: AgentDeleteRiskInput): string {
  const reasonSuffix = input.reason ? ` — reason: "${input.reason}"` : "";
  return `Delete risk #${input.risk_id}${reasonSuffix}`;
}
