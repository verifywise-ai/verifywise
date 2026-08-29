import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import logger from "../../../utils/logger/fileLogger";
import {
  createAgentHierarchyLinkQuery,
  getHierarchyPairsQuery,
  getRiskPromptRowsQuery,
} from "../../../utils/riskLink.utils";
import { buildDirectionSystemPrompt, buildDirectionUserPrompt } from "./prompts";
import { hierarchyOutputSchema } from "./schema";
import { HierarchyEdge, validateTwoLevel } from "../hierarchy";
import { canonicalPair } from "../types";
import { HierarchyGroup } from "./schema";

/**
 * The org's first configured LLM key, as an AI SDK model.
 *
 * `getLLMKeysWithKeyQuery` orders by `created_at DESC`, so this is the same row
 * the controller's `getLLMKeysQuery` presence check sees — the check and the
 * call agree by construction, not by coincidence.
 *
 * A third local copy of the three-line model factory that
 * `advisor/evidenceAnalyzer/analyzer.service.ts:133` and
 * `services/intakeLLM.service.ts:24` already carry. §5.3 of the design explains
 * why C2 duplicates rather than extracts: the three call sites disagree about
 * where the key comes from, and unifying them is a refactor that should not
 * ride along on a feature.
 */
async function getOrgModel(organizationId: number) {
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  const llmKey = keys[0] as any;
  if (!llmKey) return null;

  const keyName = (llmKey.name || "").toLowerCase();
  if (keyName.includes("anthropic") || keyName.includes("claude")) {
    return createAnthropic({
      apiKey: llmKey.key,
      baseURL: llmKey.url || undefined,
    })(llmKey.model || "claude-sonnet-4-20250514");
  }

  const baseURL = llmKey.url || undefined;
  const openai = createOpenAI({ apiKey: llmKey.key, baseURL });
  const modelId = llmKey.model || "gpt-4o-mini";
  // Only native OpenAI implements the Responses API. Any custom baseURL
  // (OpenRouter, vLLM, Together) must use Chat Completions.
  return baseURL ? openai.chat(modelId) : openai(modelId);
}

/**
 * The unordered key two risks share regardless of which is proposed as parent.
 * Rule 4 is deliberately direction-blind, so the key must be too.
 */
export function hierarchyPairKey(a: number, b: number): string {
  const [low, high] = canonicalPair(a, b);
  return `${low}:${high}`;
}

/**
 * Turns the model's proposed groups into the edges that are safe to store.
 *
 * Five rules, applied in order. The first three are about the answer's internal
 * shape; the last two are about the answer against what is already stored.
 *
 * 1. Every id must belong to this component. A hallucinated id would otherwise
 *    write a link between two risks the model was never shown.
 * 2. A parent may not be among its own children.
 * 3. A risk is claimed as a child at most once, and no risk is both a parent
 *    and a child. This is the two-level rule applied within a single answer.
 *    Note what it does NOT forbid: the same parent appearing in two groups.
 *    That is one legal answer split across two objects, and C1 constrains
 *    children to one parent, not parents to one group.
 * 4. A pair that already carries an `inherits_from` row in ANY status drops —
 *    `dismissed` included, and keyed on the unordered pair.
 * 5. Each survivor runs `validateTwoLevel` against the blocking edges plus what
 *    this call has already accepted.
 *
 * Rule 5 is the guarantee. The accumulator makes the batch self-consistent;
 * `blockingEdges` carrying confirmed edges makes it consistent with every human
 * decision; `blockingEdges` also carrying live suggestions makes it consistent
 * with what earlier scans have already put in front of the user. Nothing this
 * function returns can be unconfirmable at the moment it is written.
 *
 * Note that passing suggested edges to `validateTwoLevel` widens it past what
 * its own doc comment describes. That comment is written for the confirm
 * endpoint, where competing suggestions are legal by design. Here they are not:
 * C1 permits one confirmed parent per child, so a second live candidate is a
 * proposal guaranteed to fail on confirm. Widening at this call site is the
 * intended asymmetry, not a misuse.
 *
 * Pure and exported so it can be tested without a paid network call.
 */
export function filterProposedGroups(
  groups: HierarchyGroup[],
  componentRiskIds: number[],
  blockingEdges: HierarchyEdge[],
  pairsWithExistingHierarchy: Set<string>,
): HierarchyEdge[] {
  const inComponent = new Set(componentRiskIds);
  // Two sets, not one. A child may be claimed once; a parent may repeat as a
  // parent but must never cross over to the other set.
  const claimedAsChild = new Set<number>();
  const usedAsParent = new Set<number>();
  const accepted: HierarchyEdge[] = [];

  for (const group of groups) {
    const ids = [group.parent_risk_id, ...group.child_risk_ids];

    // 1
    if (ids.some((id) => !inComponent.has(id))) continue;
    // 2
    if (group.child_risk_ids.includes(group.parent_risk_id)) continue;
    // 3
    if (claimedAsChild.has(group.parent_risk_id)) continue;
    if (group.child_risk_ids.some((id) => claimedAsChild.has(id) || usedAsParent.has(id))) {
      continue;
    }
    // A duplicate id inside one group would break rule 3 on its second
    // occurrence; catching it here keeps the whole group atomic.
    if (new Set(ids).size !== ids.length) continue;

    const groupEdges: HierarchyEdge[] = [];
    for (const childRiskId of group.child_risk_ids) {
      // 4
      if (pairsWithExistingHierarchy.has(hierarchyPairKey(childRiskId, group.parent_risk_id))) {
        continue;
      }
      const edge = { childRiskId, parentRiskId: group.parent_risk_id };
      // 5
      if (validateTwoLevel(edge, [...blockingEdges, ...accepted, ...groupEdges])) continue;
      groupEdges.push(edge);
    }

    if (groupEdges.length === 0) continue;

    accepted.push(...groupEdges);
    for (const edge of groupEdges) {
      claimedAsChild.add(edge.childRiskId);
    }
    usedAsParent.add(group.parent_risk_id);
  }

  return accepted;
}

/**
 * One direction pass over one connected component.
 *
 * Returns how many rows were written. Every failure path returns 0 rather than
 * throwing: a component that cannot be grouped — no key, a model that will not
 * answer, an answer that breaks every rule — is not an error the admin needs to
 * act on, and throwing would make BullMQ retry a call that costs money and will
 * fail the same way three times.
 *
 * The API key is fetched here rather than passed in. A job payload lives in
 * Redis in plain text and is visible to anyone who can read the queue; a key
 * must never be in one.
 */
export async function suggestDirectionForComponent(
  organizationId: number,
  riskIds: number[],
): Promise<number> {
  const model = await getOrgModel(organizationId);
  if (!model) {
    logger.warn(
      `risk link direction: org ${organizationId} has no LLM key configured, skipping`,
    );
    return 0;
  }

  const risks = await getRiskPromptRowsQuery(organizationId, riskIds);
  // Risks can be soft-deleted between the controller's fan-out and this job.
  // Below two survivors there is nothing to group.
  if (risks.length < 2) return 0;
  const liveIds = risks.map((risk) => risk.id);

  const storedPairs = await getHierarchyPairsQuery(organizationId, liveIds);
  const pairsWithExistingHierarchy = new Set(
    storedPairs.map((pair) => hierarchyPairKey(pair.childRiskId, pair.parentRiskId)),
  );
  const blockingEdges = storedPairs
    .filter((pair) => pair.status === "confirmed" || pair.status === "suggested")
    .map((pair) => ({ childRiskId: pair.childRiskId, parentRiskId: pair.parentRiskId }));
  const confirmedEdges = storedPairs
    .filter((pair) => pair.status === "confirmed")
    .map((pair) => ({ childRiskId: pair.childRiskId, parentRiskId: pair.parentRiskId }));

  let groups;
  try {
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: hierarchyOutputSchema,
      system: buildDirectionSystemPrompt(),
      prompt: buildDirectionUserPrompt(risks, confirmedEdges),
      temperature: 0,
      innerMaxRetries: 2,
      maxSelfCorrectionAttempts: 2,
    });
    groups = result.object.groups;
  } catch (error) {
    logger.warn(
      `risk link direction: model call failed for org ${organizationId}, component [${liveIds.join(",")}]: ${(error as Error).message}`,
    );
    return 0;
  }

  const edges = filterProposedGroups(
    groups,
    liveIds,
    blockingEdges,
    pairsWithExistingHierarchy,
  );
  if (edges.length === 0) return 0;

  // Keyed on the pair, not on the child alone. A child can appear in a group
  // the filter rejected and in one it kept; keyed on the child, the rejected
  // group's text could end up on the surviving edge's chip.
  const reasonByEdge = new Map<string, string>();
  for (const group of groups) {
    for (const childRiskId of group.child_risk_ids) {
      reasonByEdge.set(hierarchyPairKey(childRiskId, group.parent_risk_id), group.reason);
    }
  }

  let written = 0;
  for (const edge of edges) {
    const id = await createAgentHierarchyLinkQuery({
      organizationId,
      childRiskId: edge.childRiskId,
      parentRiskId: edge.parentRiskId,
      reason:
        reasonByEdge.get(hierarchyPairKey(edge.childRiskId, edge.parentRiskId)) ??
        "Grouped by the direction agent.",
    });
    if (id !== null) written += 1;
  }

  logger.info(
    `risk link direction: org ${organizationId} wrote ${written} of ${edges.length} proposed edges over ${liveIds.length} risks`,
  );
  return written;
}
