import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import logger from "../../../utils/logger/fileLogger";
import {
  createAgentHierarchyLinkQuery,
  getHierarchyPairsQuery,
  getRiskPromptRowsQuery,
  HierarchyPairRow,
  HierarchyParent,
} from "../../../utils/riskLink.utils";
import { buildDirectionSystemPrompt, buildDirectionUserPrompt } from "./prompts";
import { hierarchyOutputSchema } from "./schema";

import { candidateKey, CrossEntityCandidate, gatherCrossEntityCandidates } from "./candidates";
import { MAX_CROSS_ENTITY_CANDIDATES } from "./components";

export { candidateKey } from "./candidates";
export type { CrossEntityCandidate } from "./candidates";
import { HierarchyEdge, validateTwoLevel } from "../hierarchy";
import { canonicalPair } from "../types";
import { HierarchyGroup } from "./schema";

/**
 * Turns a structured-output call into a plain JSON-mode call.
 *
 * `generateObject` always sends the schema, and the OpenAI provider turns a
 * non-null schema into `response_format: {type: "json_schema"}`. Most
 * OpenAI-compatible providers behind a custom baseURL do not implement that —
 * DeepSeek answers "This response_format type is unavailable now" and the whole
 * pass fails. Dropping the schema makes the provider send
 * `{type: "json_object"}`, which they do implement.
 *
 * The schema then has to travel in the system prompt, because the SDK injects
 * nothing of its own: without it the model guesses field names and the strict
 * Zod parse rejects every answer.
 */
export const jsonObjectFallback: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => {
    if (params.responseFormat?.type !== "json" || !params.responseFormat.schema) {
      return params;
    }

    const instruction = [
      "Respond with a JSON object matching this schema exactly.",
      "Output only the JSON object, with no prose and no code fences:",
      JSON.stringify(params.responseFormat.schema),
    ].join("\n");

    const prompt = [...params.prompt];
    const index = prompt.findIndex((message) => message.role === "system");
    if (index === -1) {
      prompt.unshift({ role: "system", content: instruction });
    } else {
      const system = prompt[index] as { role: "system"; content: string };
      prompt[index] = { ...system, content: `${system.content}\n\n${instruction}` };
    }

    return { ...params, responseFormat: { type: "json" }, prompt };
  },
};

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
  // (OpenRouter, vLLM, Together) must use Chat Completions, and mostly cannot
  // take a json_schema response format either — hence the fallback.
  return baseURL
    ? wrapLanguageModel({
        model: openai.chat(modelId),
        middleware: jsonObjectFallback,
      })
    : openai(modelId);
}

/**
 * The key rule 4 dedupes on.
 *
 * Between two project risks it is direction-blind, because rule 4 is: a stored
 * `inherits_from` row in either direction means the pair has been proposed
 * already. Across tables it cannot be — `canonicalPair` orders two numbers, and
 * a project risk's id and a vendor risk's id are not from the same space. A
 * cross-entity edge has exactly one legal direction anyway (C4 §3.3), so the
 * child-first key loses nothing.
 */
export function hierarchyPairKey(childRiskId: number, parent: HierarchyParent): string {
  if (parent.entityType === "risk") {
    const [low, high] = canonicalPair(childRiskId, parent.id);
    return `risk:${low}:${high}`;
  }
  return `${parent.entityType}:${childRiskId}:${parent.id}`;
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
 * Cross-entity notes:
 *
 * - Rule 2's duplicate-id check moved from `[parent, ...children]` to
 *   `children` alone. A cross-entity parent's id appearing in `child_risk_ids`
 *   is not a duplicate; it is a different table's row that happens to share a
 *   number.
 * - The old rule-3 clause `usedAsParent.has(id)` for children now compares
 *   `risk:<id>`, so a child is only rejected for being a *project-risk* parent
 *   elsewhere. A child whose number matches a vendor parent's is untouched.
 *
 * Pure and exported so it can be tested without a paid network call.
 */
export function filterProposedGroups(
  groups: HierarchyGroup[],
  componentRiskIds: number[],
  blockingEdges: HierarchyEdge[],
  pairsWithExistingHierarchy: Set<string>,
  candidates: Map<string, CrossEntityCandidate>,
): HierarchyEdge[] {
  const inComponent = new Set(componentRiskIds);
  // Children are always project risks, so this set stays numeric. Parents are
  // not, so theirs is keyed by table — `vendor_risk:7` and `risk:7` are two
  // different rows and must not collide.
  const claimedAsChild = new Set<number>();
  const usedAsParent = new Set<string>();
  const accepted: HierarchyEdge[] = [];

  for (const group of groups) {
    const parent: HierarchyParent = {
      id: group.parent_risk_id,
      entityType: group.parent_entity_type,
    };
    const candidate = parent.entityType === "risk" ? null : candidates.get(candidateKey(parent));

    // 1. A project-risk parent must be in the component; a cross-entity parent
    //    must be one we actually offered. Either way the model cannot name a
    //    row it was never shown.
    if (parent.entityType === "risk" && !inComponent.has(parent.id)) continue;
    if (parent.entityType !== "risk" && !candidate) continue;
    if (group.child_risk_ids.some((id) => !inComponent.has(id))) continue;

    // 2. Only a project-risk parent can appear among its own children; a
    //    cross-entity id in that list is a different row entirely.
    if (parent.entityType === "risk" && group.child_risk_ids.includes(parent.id)) continue;

    // 3
    if (parent.entityType === "risk" && claimedAsChild.has(parent.id)) continue;
    if (group.child_risk_ids.some((id) => claimedAsChild.has(id))) continue;
    if (group.child_risk_ids.some((id) => usedAsParent.has(candidateKey({ id, entityType: "risk" }))))
      continue;
    if (new Set(group.child_risk_ids).size !== group.child_risk_ids.length) continue;

    const groupEdges: HierarchyEdge[] = [];
    for (const childRiskId of group.child_risk_ids) {
      // C6 §4.2. The shared project is the whole justification for a
      // cross-entity link; without it the link says nothing.
      if (candidate && !candidate.childRiskIds.has(childRiskId)) continue;
      // 4
      if (pairsWithExistingHierarchy.has(hierarchyPairKey(childRiskId, parent))) continue;

      const edge: HierarchyEdge =
        parent.entityType === "risk"
          ? { childRiskId, parentRiskId: parent.id }
          : { childRiskId, parentRiskId: parent.id, parentEntityType: parent.entityType };
      // 5
      if (validateTwoLevel(edge, [...blockingEdges, ...accepted, ...groupEdges])) continue;
      groupEdges.push(edge);
    }

    if (groupEdges.length === 0) continue;

    accepted.push(...groupEdges);
    for (const edge of groupEdges) claimedAsChild.add(edge.childRiskId);
    usedAsParent.add(candidateKey(parent));
  }

  return accepted;
}

/**
 * A stored pair as a rule input. `parentEntityType` is dropped for plain risk
 * parents rather than passed as "risk": `HierarchyEdge` documents absent as
 * meaning `risks`, and every C1-C3 caller compares edges by exact shape.
 */
const toHierarchyEdge = (pair: HierarchyPairRow): HierarchyEdge =>
  pair.parentEntityType === "risk"
    ? { childRiskId: pair.childRiskId, parentRiskId: pair.parentRiskId }
    : {
        childRiskId: pair.childRiskId,
        parentRiskId: pair.parentRiskId,
        parentEntityType: pair.parentEntityType,
      };

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
    storedPairs.map((pair) =>
      hierarchyPairKey(pair.childRiskId, {
        id: pair.parentRiskId,
        entityType: pair.parentEntityType,
      }),
    ),
  );
  const blockingEdges = storedPairs
    .filter((pair) => pair.status === "confirmed" || pair.status === "suggested")
    .map((pair) => toHierarchyEdge(pair));
  const confirmedEdges = storedPairs
    .filter((pair) => pair.status === "confirmed")
    .map((pair) => toHierarchyEdge(pair));

  const candidates = await gatherCrossEntityCandidates(organizationId, liveIds);
  if (candidates.size > MAX_CROSS_ENTITY_CANDIDATES) {
    logger.info(
      `risk link direction: org ${organizationId}, component [${liveIds.join(",")}] reaches ` +
        `${candidates.size} cross-entity candidates, over the cap of ` +
        `${MAX_CROSS_ENTITY_CANDIDATES} — grouping project risks only`,
    );
    candidates.clear();
  }

  let groups;
  try {
    const result = await generateObjectWithSelfCorrection({
      model,
      schema: hierarchyOutputSchema,
      system: buildDirectionSystemPrompt(),
      prompt: buildDirectionUserPrompt(risks, confirmedEdges, [...candidates.values()]),
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
    candidates,
  );
  if (edges.length === 0) {
    // "The model found no umbrella" and "the job blew up" both used to leave the
    // same trace: none. Say which one happened.
    logger.info(
      `risk link direction: org ${organizationId}, component [${liveIds.join(",")}] has no hierarchy to store`,
    );
    return 0;
  }

  // Keyed on the pair, not on the child alone. A child can appear in a group
  // the filter rejected and in one it kept; keyed on the child, the rejected
  // group's text could end up on the surviving edge's chip.
  const reasonByEdge = new Map<string, string>();
  for (const group of groups) {
    for (const childRiskId of group.child_risk_ids) {
      reasonByEdge.set(
        hierarchyPairKey(childRiskId, {
          id: group.parent_risk_id,
          entityType: group.parent_entity_type,
        }),
        group.reason,
      );
    }
  }

  let written = 0;
  for (const edge of edges) {
    const id = await createAgentHierarchyLinkQuery({
      organizationId,
      childRiskId: edge.childRiskId,
      parent: {
        id: edge.parentRiskId,
        entityType: edge.parentEntityType ?? "risk",
      },
      reason:
        reasonByEdge.get(
          hierarchyPairKey(edge.childRiskId, {
            id: edge.parentRiskId,
            entityType: edge.parentEntityType ?? "risk",
          }),
        ) ?? "Grouped by the direction agent.",
    });
    if (id !== null) written += 1;
  }

  logger.info(
    `risk link direction: org ${organizationId} wrote ${written} of ${edges.length} proposed edges over ${liveIds.length} risks`,
  );
  return written;
}
