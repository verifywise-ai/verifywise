import { HierarchyEdge } from "../hierarchy";
import { RiskPromptRow } from "../../../utils/riskLink.utils";
import { CrossEntityCandidate } from "./candidates";

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
    "- Some clusters also list candidate parents from the vendor and model risk",
    "  tables. They may be parents; they are never children, and they must never",
    "  appear in child_risk_ids.",
    "- A candidate parent may only take the risks listed beside it as children.",
    "  Sharing a project is the whole justification for the link.",
    "- Say which table each parent comes from in parent_entity_type: \"risk\" for",
    "  the risks above, or \"model_risk\" / \"vendor_risk\" for a candidate.",
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
  candidates: CrossEntityCandidate[] = [],
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

  const sections = [
    "These risks are all related to each other:",
    "",
    described.join("\n"),
  ];

  // Omitted entirely rather than rendered as "- none": a C2-only component's
  // prompt must stay exactly what it is today, or this change re-tunes grouping
  // for every existing user.
  if (candidates.length > 0) {
    const listed = candidates.map((candidate) => {
      const reachable = [...candidate.childRiskIds].sort((a, b) => a - b).join(", ");
      return [
        `- ${candidate.parent.entityType} ${candidate.parent.id}: ${candidate.name}`,
        `  shares a project with risks: ${reachable}`,
        `  projects: ${candidate.projects.join(", ")}`,
      ].join("\n");
    });
    sections.push(
      "",
      "These vendor and model risks share a project with the risks above and may",
      "be umbrellas over them:",
      "",
      listed.join("\n"),
    );
  }

  sections.push(
    "",
    "Hierarchy decisions a human has already made about them, which you must not",
    "contradict:",
    "",
    hierarchy,
  );

  return sections.join("\n");
}
