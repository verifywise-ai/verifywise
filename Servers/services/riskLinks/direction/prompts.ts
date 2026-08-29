import { HierarchyEdge } from "../hierarchy";
import { RiskPromptRow } from "../../../utils/riskLink.utils";

/**
 * The two-level rule, stated to the model in the same terms the filter will
 * enforce it. The filter is the guarantee; this is what stops the filter from
 * having to throw most of the answer away.
 */
export function buildDirectionSystemPrompt(): string {
  return [
    "You are an AI governance analyst organising a cluster of related risks.",
    "",
    "Some clusters contain an umbrella risk with narrower instances underneath it.",
    "Others are a set of peers with no umbrella at all. Your job is to say which,",
    "and, where there is an umbrella, which risks sit under it.",
    "",
    "Rules you must obey:",
    "- The hierarchy is exactly two levels deep. A parent has children; a child has none.",
    "- A risk has exactly one parent. Never place the same risk under two parents.",
    "- A risk cannot be both a parent and a child. It appears in at most one group,",
    "  on one side of it.",
    "- Only use the risk ids given to you. Never invent an id.",
    "- If the cluster is a set of peers, return an empty list of groups. That is a",
    "  correct answer, not a failure. Do not manufacture a hierarchy to fill it.",
    "",
    "For each group give a one-sentence reason naming what makes the parent the",
    "umbrella: 15 to 120 characters.",
  ].join("\n");
}

/**
 * The component's risks, then the hierarchy that already exists over them.
 *
 * Only `confirmed` edges appear here. Live `suggested` edges stay out on
 * purpose: they are not decisions, and rule 5 of the filter already drops
 * anything that collides with one. The prompt carries facts; the filter carries
 * policy.
 */
export function buildDirectionUserPrompt(
  risks: RiskPromptRow[],
  confirmedEdges: HierarchyEdge[],
): string {
  const described = risks.map((risk) => {
    const lines = [`- id ${risk.id}: ${risk.risk_name ?? "(unnamed)"}`];
    if (risk.risk_description) lines.push(`  description: ${risk.risk_description}`);
    if (risk.risk_category?.length) lines.push(`  category: ${risk.risk_category.join(", ")}`);
    if (risk.ai_lifecycle_phase) lines.push(`  lifecycle phase: ${risk.ai_lifecycle_phase}`);
    return lines.join("\n");
  });

  const hierarchy = confirmedEdges.length
    ? confirmedEdges
        .map((edge) => `- risk ${edge.childRiskId} is already under risk ${edge.parentRiskId}`)
        .join("\n")
    : "- none";

  return [
    "These risks are all related to each other:",
    "",
    described.join("\n"),
    "",
    "Hierarchy decisions a human has already made about them, which you must not",
    "contradict:",
    "",
    hierarchy,
  ].join("\n");
}
