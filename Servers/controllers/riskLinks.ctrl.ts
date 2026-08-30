import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import {
  enqueueRiskLinkDirection,
  enqueueRiskLinkRecompute,
} from "../services/automations/automationProducer";
import { getLLMKeysQuery } from "../utils/llmKey.utils";
import {
  connectedComponents,
  MAX_COMPONENT_SIZE,
} from "../services/riskLinks/direction/components";
import {
  createUserRiskLinkQuery,
  getActiveRiskIdsQuery,
  getConfirmedHierarchyEdgesQuery,
  getLiveRiskIdsQuery,
  getRelatedPairsQuery,
  getRiskLinkByIdQuery,
  getRiskLinksForRiskQuery,
  HierarchyParent,
  RiskLinkWithRelated,
  updateRiskLinkStatusQuery,
} from "../utils/riskLink.utils";
import { HierarchyViolation, validateTwoLevel } from "../services/riskLinks/hierarchy";
import {
  DismissReasonRejection,
  validateDismissReason,
} from "../services/riskLinks/dismissReason";
import {
  canonicalPair,
  RISK_LINK_STATUSES,
  RiskLinkRelationType,
  RiskLinkStatus,
} from "../services/riskLinks/types";

const FILE_NAME = "riskLinks.ctrl.ts";

/** What the list endpoint shows by default: open suggestions plus accepted links. */
const DEFAULT_STATUSES: RiskLinkStatus[] = ["suggested", "confirmed"];

/**
 * R6. `dismissed -> suggested` is the explicit undo and clears the decision
 * fields. `confirmed -> suggested` is not a thing: un-confirming means
 * dismissing.
 */
const ALLOWED_TRANSITIONS: Record<RiskLinkStatus, RiskLinkStatus[]> = {
  suggested: ["confirmed", "dismissed"],
  confirmed: ["dismissed"],
  dismissed: ["confirmed", "suggested"],
};

const isRiskLinkStatus = (value: unknown): value is RiskLinkStatus =>
  typeof value === "string" && (RISK_LINK_STATUSES as string[]).includes(value);

const RELATION_TYPES: RiskLinkRelationType[] = ["related_to", "inherits_from"];

const isRelationType = (value: unknown): value is RiskLinkRelationType =>
  typeof value === "string" && (RELATION_TYPES as string[]).includes(value);

const hierarchyParentFromLink = (link: {
  target_risk_id: number | null;
  target_model_risk_id: number | null;
  target_vendor_risk_id: number | null;
}): HierarchyParent => {
  if (link.target_model_risk_id != null) {
    return { id: link.target_model_risk_id, entityType: "model_risk" };
  }
  if (link.target_vendor_risk_id != null) {
    return { id: link.target_vendor_risk_id, entityType: "vendor_risk" };
  }
  if (link.target_risk_id != null) {
    return { id: link.target_risk_id, entityType: "risk" };
  }
  throw new Error("Risk link has no parent target");
};

/**
 * Rewrite a stored edge from the caller's point of view. The store is canonical
 * (smaller id first); the caller only cares which risk is the *other* one.
 */
const toResponse = (link: RiskLinkWithRelated, riskId: number) => ({
  id: link.id,
  status: link.status,
  source: link.source,
  relationType: link.relation_type,
  score: link.score,
  reasons: link.reasons,
  direction:
    link.relation_type === "inherits_from"
      ? link.source_risk_id === riskId
        ? "outgoing"
        : "incoming"
      : "undirected",
  decidedAt: link.decided_at,
  lastComputedAt: link.last_computed_at,
  // Null on every row the default view returns. Rendering it in the dismissed
  // view is what keeps dismiss_reason from becoming a write-only column, and
  // makes a stale reason on a confirmed row visible instead of silent.
  dismissReason: link.dismiss_reason,
  dismissNote: link.dismiss_note,
  relatedRisk: {
    id: link.related_id,
    entityType: link.related_entity_type,
    name: link.related_risk_name,
    riskLevel: link.related_risk_level,
    ownerId: link.related_risk_owner,
  },
});

const HIERARCHY_MESSAGES: Record<HierarchyViolation, string> = {
  child_already_has_parent: "This risk already has a parent. Remove it first.",
  parent_is_a_child: "That risk is already a child of another risk, so it cannot be a parent.",
  child_has_children: "This risk has child risks, so it cannot become a child.",
};

const DISMISS_REASON_MESSAGES: Record<DismissReasonRejection, string> = {
  note_without_reason: "A note needs a dismissal reason",
  note_not_text: "The note must be text",
  not_a_dismissal: "A dismissal reason only applies when dismissing a link",
  not_a_suggestion: "A dismissal reason only applies to a suggested link",
  unknown_reason: "Invalid dismissal reason",
  wrong_relation_type: "That dismissal reason does not apply to this kind of link",
  note_required: "A note is required when the dismissal reason is Other",
  note_too_long: "The note must be 500 characters or fewer",
};

const SINGLE_PARENT_INDEX = "risk_links_single_parent_idx";

type PgError = { code?: string; constraint?: string };

/**
 * `createUserRiskLinkQuery`'s ON CONFLICT names the PAIR constraint, so a
 * single-parent violation raises instead of returning null — and the PATCH path
 * has no ON CONFLICT at all. The index is on `source_risk_id`, and source is the
 * child, so this violation means exactly one thing: that child already has a
 * confirmed parent. Losing the race is a 409, not a 500.
 *
 * Matching the constraint name rather than a bare 23505 keeps the check honest
 * if a third unique constraint is ever added to the table.
 */
const isSingleParentViolation = (error: unknown): boolean => {
  const pg =
    (error as { parent?: PgError; original?: PgError })?.parent ??
    (error as { original?: PgError })?.original;
  return pg?.code === "23505" && pg?.constraint === SINGLE_PARENT_INDEX;
};

export async function getRiskLinks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getRiskLinks",
    functionName: "getRiskLinks",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const riskId = parseInt(String(req.params.riskId), 10);
    if (isNaN(riskId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid risk ID"));
    }

    const requested = req.query.status;
    if (requested !== undefined && !isRiskLinkStatus(requested)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid status filter"));
    }
    const statuses = requested ? [requested] : DEFAULT_STATUSES;

    const links = await getRiskLinksForRiskQuery(req.organizationId!, riskId, statuses);

    logSuccess({
      eventType: "Read",
      description: `fetched ${links.length} links for risk ${riskId}`,
      functionName: "getRiskLinks",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](links.map((link) => toResponse(link, riskId))));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch risk links",
      functionName: "getRiskLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Asks the direction agent to propose parent/child groupings across the org.
 *
 * The unit of work is a connected component of the `related_to` graph, not a
 * risk: a grouping decision needs every risk it could involve in front of it at
 * once. See §3 of the C2 design.
 *
 * There is no filter here for components of fewer than two risks, and there
 * cannot usefully be one: `connectedComponents` only emits ids that appeared in
 * a pair, and the `risk_links` CHECK forbids `source_risk_id = target_risk_id`,
 * so every component already has at least two members.
 */
export async function suggestRiskHierarchy(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting suggestRiskHierarchy",
    functionName: "suggestRiskHierarchy",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // Checked here rather than left to each job. Without a key every job would
    // log a warning and write nothing, and the admin would see "grouping 4
    // clusters" followed by silence. `getLLMKeysQuery` is the redacted variant —
    // no secret needs to reach the controller to answer "is one configured".
    const keys = await getLLMKeysQuery(req.organizationId!);
    if (keys.length === 0) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            "No LLM key is configured for this organization. Add one under Settings before suggesting a hierarchy.",
          ),
        );
    }

    const components = connectedComponents(await getRelatedPairsQuery(req.organizationId!));
    const groupable = components.filter((ids) => ids.length <= MAX_COMPONENT_SIZE);
    const skipped = components.length - groupable.length;

    await Promise.all(
      groupable.map((ids) => enqueueRiskLinkDirection(req.organizationId!, ids)),
    );

    logSuccess({
      eventType: "Create",
      description: `enqueued ${groupable.length} risk link direction jobs, skipped ${skipped} oversized components`,
      functionName: "suggestRiskHierarchy",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res
      .status(202)
      .json(STATUS_CODE[202]({ enqueued: groupable.length, skipped }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to enqueue risk link direction jobs",
      functionName: "suggestRiskHierarchy",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateRiskLinkStatus(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting updateRiskLinkStatus",
    functionName: "updateRiskLinkStatus",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid link ID"));
    }

    const next = req.body?.status;
    if (!isRiskLinkStatus(next)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid status"));
    }

    const link = await getRiskLinkByIdQuery(id, req.organizationId!);
    if (!link) {
      return res.status(404).json(STATUS_CODE[404]("Risk link not found"));
    }

    if (!ALLOWED_TRANSITIONS[link.status].includes(next)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](`Cannot change status from ${link.status} to ${next}`));
    }

    // Pure, and ahead of the hierarchy round trip. `dismissal.reason` and
    // `dismissal.note` are both null for every transition that cannot legally
    // carry a reason, which is what clears the columns on the way out of
    // `dismissed` without a branch.
    const dismissal = validateDismissReason(req.body?.dismissReason, req.body?.dismissNote, {
      nextStatus: next,
      currentStatus: link.status,
      relationType: link.relation_type,
    });
    if (!dismissal.ok) {
      return res
        .status(400)
        .json(STATUS_CODE[400](DISMISS_REASON_MESSAGES[dismissal.rejection]));
    }

    // Confirming a suggestion, or restoring a dismissed link, reaches the same
    // end state as a fresh POST — so it runs the same rule. Placed after the
    // transition guard: confirmed -> confirmed is already a 400, so this row is
    // never itself in the confirmed set it is checked against.
    if (next === "confirmed" && link.relation_type === "inherits_from") {
      const parent = hierarchyParentFromLink(link);
      const violation = validateTwoLevel(
        {
          childRiskId: link.source_risk_id,
          parentRiskId: parent.id,
          parentEntityType: parent.entityType,
        },
        await getConfirmedHierarchyEdgesQuery(
          req.organizationId!,
          link.source_risk_id,
          parent,
        ),
      );
      if (violation) {
        return res.status(409).json(STATUS_CODE[409](HIERARCHY_MESSAGES[violation]));
      }
    }

    // The undo back to `suggested` erases the decision so a later recompute may
    // prune the edge normally again.
    const decidedByUserId = next === "suggested" ? null : req.userId!;
    await updateRiskLinkStatusQuery(
      id,
      req.organizationId!,
      next,
      decidedByUserId,
      dismissal.reason,
      dismissal.note,
    );

    logSuccess({
      eventType: "Update",
      description: `risk link ${id} set to ${next}`,
      functionName: "updateRiskLinkStatus",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ id, status: next }));
  } catch (error) {
    if (isSingleParentViolation(error)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](HIERARCHY_MESSAGES.child_already_has_parent));
    }
    logFailure({
      eventType: "Update",
      description: "failed to update risk link status",
      functionName: "updateRiskLinkStatus",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * A human asserting a link the engine did not find. For `inherits_from`,
 * `sourceRiskId` is the risk that inherits and `targetRiskId` is the risk
 * inherited from — matching how `toResponse` reads direction back out.
 */
export async function createRiskLink(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createRiskLink",
    functionName: "createRiskLink",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const sourceRiskId = parseInt(String(req.body?.sourceRiskId), 10);
    const targetRiskId = parseInt(String(req.body?.targetRiskId), 10);
    const relationType = req.body?.relationType;

    if (isNaN(sourceRiskId) || isNaN(targetRiskId) || !isRelationType(relationType)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid request"));
    }
    if (sourceRiskId === targetRiskId) {
      return res.status(400).json(STATUS_CODE[400]("A risk cannot link to itself"));
    }

    const live = await getLiveRiskIdsQuery([sourceRiskId, targetRiskId], req.organizationId!);
    if (live.length !== 2) {
      return res.status(404).json(STATUS_CODE[404]("Risk not found"));
    }

    // Two-level grouping (C1): a risk is either a parent, or a child, or
    // unattached. Subsumes the old reciprocal-pair check — if no risk is both,
    // no cycle of any length can exist.
    //
    // ponytail: application-level, so two admins confirming opposite ends of a
    // chain in the same instant can both pass. The single-parent half is closed
    // by risk_links_single_parent_idx, which is atomic; the two-level outcome is
    // displayable rather than corrupting and either row can be dismissed.
    if (relationType === "inherits_from") {
      const violation = validateTwoLevel(
        { childRiskId: sourceRiskId, parentRiskId: targetRiskId },
        await getConfirmedHierarchyEdgesQuery(req.organizationId!, sourceRiskId, {
          id: targetRiskId,
          entityType: "risk",
        }),
      );
      if (violation) {
        return res.status(409).json(STATUS_CODE[409](HIERARCHY_MESSAGES[violation]));
      }
    }

    // The risk_links_canonical CHECK exempts inherits_from: direction is carried
    // by which column an id sits in, so only related_to is reordered.
    const [storedSource, storedTarget] =
      relationType === "related_to"
        ? canonicalPair(sourceRiskId, targetRiskId)
        : [sourceRiskId, targetRiskId];

    const id = await createUserRiskLinkQuery({
      organizationId: req.organizationId!,
      sourceRiskId: storedSource,
      targetRiskId: storedTarget,
      relationType,
      userId: req.userId!,
    });

    if (id === null) {
      return res
        .status(409)
        .json(
          STATUS_CODE[409](
            'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
          ),
        );
    }

    logSuccess({
      eventType: "Create",
      description: `linked risk ${storedSource} to ${storedTarget} as ${relationType}`,
      functionName: "createRiskLink",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201]({ id }));
  } catch (error) {
    // A lost race is a user-facing conflict, not a system failure — and the
    // endpoint's other 409s do not log either.
    if (isSingleParentViolation(error)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](HIERARCHY_MESSAGES.child_already_has_parent));
    }
    logFailure({
      eventType: "Create",
      description: "failed to create risk link",
      functionName: "createRiskLink",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Backfill. The table starts empty and only fills as risks are saved, so an org
 * needs one full pass before the feature shows anything. Fan out one job per
 * risk rather than one big job: the jobs dedup, retry, and progress
 * independently.
 */
export async function recomputeAllRiskLinks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting recomputeAllRiskLinks",
    functionName: "recomputeAllRiskLinks",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const riskIds = await getActiveRiskIdsQuery(req.organizationId!);
    await Promise.all(riskIds.map((riskId) => enqueueRiskLinkRecompute(req.organizationId!, riskId)));

    logSuccess({
      eventType: "Create",
      description: `enqueued ${riskIds.length} risk link recompute jobs`,
      functionName: "recomputeAllRiskLinks",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ enqueued: riskIds.length }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to enqueue risk link recompute",
      functionName: "recomputeAllRiskLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
