import { getStructuralNeighboursQuery } from "../../../utils/riskLink.utils";
import { LinkCandidate, LinkSignalProvider, RecomputeContext } from "../types";

/** Numerator of the rarity weight: 2 / log2(1 + degree). Degree 2 gives 1.26. */
const RARITY_NUMERATOR = 2;

/**
 * Tier 1's ceiling. Tier 0 can reach 10, so field overlap still outranks pure
 * structure, while structure alone can still clear the threshold of 3.
 */
export const MAX_STRUCTURAL_POINTS = 4;

/** element_key prefix -> [singular, plural]. Two prefixes may share a label. */
const LABELS: Record<string, [string, string]> = {
  iso42001_subclause: ["ISO 42001 subclause", "ISO 42001 subclauses"],
  iso27001_subclause: ["ISO 27001 subclause", "ISO 27001 subclauses"],
  iso42001_annexcategory: ["ISO 42001 annex category", "ISO 42001 annex categories"],
  iso27001_annexcontrol: ["ISO 27001 annex control", "ISO 27001 annex controls"],
  eu_control: ["EU AI Act control", "EU AI Act controls"],
  eu_subcontrol: ["EU AI Act subcontrol", "EU AI Act subcontrols"],
  eu_answer: ["EU AI Act assessment answer", "EU AI Act assessment answers"],
  nist_subcategory: ["NIST AI RMF subcategory", "NIST AI RMF subcategories"],
  custom_l2: ["custom framework item", "custom framework items"],
  custom_l3: ["custom framework item", "custom framework items"],
};

/**
 * "2 EU AI Act controls, 1 ISO 42001 subclause".
 *
 * Grouped by label rather than by prefix, so custom_l2 and custom_l3 collapse
 * into one count. Titles would mean joining ten struct tables for a string; the
 * type breakdown is the useful part.
 */
const describeElements = (elementKeys: string[]): string => {
  const counts = new Map<string, number>();
  const plurals = new Map<string, string>();

  for (const key of elementKeys) {
    const label = LABELS[key.slice(0, key.indexOf(":"))];
    if (!label) continue; // Unreachable: the query emits only the prefixes above.
    counts.set(label[0], (counts.get(label[0]) ?? 0) + 1);
    plurals.set(label[0], label[1]);
  }

  return [...counts.entries()]
    .sort(([labelA, countA], [labelB, countB]) => countB - countA || labelA.localeCompare(labelB))
    .map(([singular, count]) => `${count} ${count === 1 ? singular : plurals.get(singular)}`)
    .join(", ");
};

/**
 * Tier 1: two risks are related when they hang off the same framework elements,
 * discounted by how many other risks hang off those same elements.
 *
 * A flat weight would be useless — in a single-framework org every pair shares
 * the framework — so a shared element that forty risks touch is worth 0.37 and
 * one that only these two touch is worth 1.26. Roughly three exclusive elements
 * reach the threshold on structure alone.
 *
 * Uncapped by count and unsorted, like tier 0: recompute.ts merges every
 * provider before applying the threshold, the per-risk cap, and the ordering.
 */
export const structuralGraphProvider: LinkSignalProvider = {
  name: "structural_graph",
  tier: 1,
  async score(ctx: RecomputeContext): Promise<LinkCandidate[]> {
    const neighbours = await getStructuralNeighboursQuery(ctx.organizationId, ctx.subject.id);

    const byTarget = new Map<number, { points: number; elementKeys: string[] }>();
    for (const row of neighbours) {
      // The query cannot emit a degree below 2 — the row exists because two
      // distinct risks share the element — but log2(1 + 0) is 0, and Infinity
      // would cap to a maximum-strength link. Skip rather than score a divide.
      if (!Number.isFinite(row.degree) || row.degree < 2) continue;

      const entry = byTarget.get(row.target_risk_id) ?? { points: 0, elementKeys: [] };
      entry.points += RARITY_NUMERATOR / Math.log2(1 + row.degree);
      entry.elementKeys.push(row.element_key);
      byTarget.set(row.target_risk_id, entry);
    }

    return [...byTarget.entries()].map(([targetRiskId, entry]) => {
      // score is NUMERIC and stores exactly what it is sent, so round here or
      // 3.7699999999999996 reaches the UI verbatim.
      const score = Math.round(Math.min(MAX_STRUCTURAL_POINTS, entry.points) * 100) / 100;
      return {
        targetRiskId,
        score,
        reasons: [
          {
            signal: "shared_framework_element",
            weight: score,
            detail: describeElements(entry.elementKeys),
          },
        ],
      };
    });
  },
};
