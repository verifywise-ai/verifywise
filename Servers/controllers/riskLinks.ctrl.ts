import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import {
  enqueueRiskLinkDirection,
  enqueueRiskLinkRecompute,
  enqueueVendorRiskLinkRecompute,
} from "../services/automations/automationProducer";
import {
  createUserVendorRiskLinkQuery,
  getActiveVendorRiskIdsQuery,
  getLiveVendorRiskIdsQuery,
} from "../utils/vendorRiskLink.utils";
import { getLLMKeysQuery } from "../utils/llmKey.utils";
import {
  connectedComponents,
  MAX_COMPONENT_SIZE,
} from "../services/riskLinks/direction/components";
import {
  acknowledgeParentLevelChangeQuery,
  createUserRiskLinkQuery,
  getActiveRiskIdsQuery,
  getConfirmedHierarchyEdgesQuery,
  getLiveCrossEntityParentQuery,
  getLiveRiskIdsQuery,
  getDismissalAnalyticsQuery,
  getRelatedPairsQuery,
  getRiskGraphQuery,
  getRiskLinkByIdQuery,
  getRiskLinksForRiskQuery,
  getRiskLinksForVendorRiskQuery,
  getSharedProjectCandidatesQuery,
  getVendorRiskChildCandidatesQuery,
  RISK_GRAPH_EDGE_CAP,
  HierarchyParent,
  RiskLinkWithRelated,
  updateRiskLinkStatusQuery,
} from "../utils/riskLink.utils";
import { findDuplicateCandidates } from "../services/riskLinks/duplicates";
import { findControlCoverage } from "../services/riskLinks/coverage";
import {
  findVendorDuplicateCandidates,
  findVendorExposure,
  findVendorFrameworkCoverage,
} from "../services/riskLinks/vendorReports";
import {
  HierarchyViolation,
  ParentEntityType,
  validateTwoLevel,
} from "../services/riskLinks/hierarchy";
import { DismissReasonRejection, validateDismissReason } from "../services/riskLinks/dismissReason";
import { toId } from "../utils/validations/validation.utils";
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
 *
 * `riskId` is null when the subject is a vendor risk. That subject is never the
 * child, so every inheritance edge is incoming — and comparing its id against
 * `source_risk_id` would be wrong, since the two tables have separate sequences.
 */
const toResponse = (link: RiskLinkWithRelated, riskId: number | null) => ({
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
  parentLevelChangedAt: link.parent_level_changed_at,
  relatedRisk: {
    id: link.related_id,
    entityType: link.related_entity_type,
    name: link.related_risk_name,
    riskLevel: link.related_risk_level,
    ownerId: link.related_risk_owner,
    // Only the vendor panel's read sets it, so other responses keep their shape.
    ...(link.related_vendor_name !== undefined && { vendorName: link.related_vendor_name }),
  },
});

const hierarchyMessage = (req: Request, violation: HierarchyViolation): string => {
  switch (violation) {
    case "child_already_has_parent":
      return req.t!("This risk already has a parent. Remove it first.");
    case "parent_is_a_child":
      return req.t!("That risk is already a child of another risk, so it cannot be a parent.");
    case "child_has_children":
      return req.t!("This risk has child risks, so it cannot become a child.");
  }
};

const dismissReasonMessage = (req: Request, rejection: DismissReasonRejection): string => {
  switch (rejection) {
    case "note_without_reason":
      return req.t!("A note needs a dismissal reason");
    case "note_not_text":
      return req.t!("The note must be text");
    case "not_a_dismissal":
      return req.t!("A dismissal reason only applies when dismissing a link");
    case "not_a_suggestion":
      return req.t!("A dismissal reason only applies to a suggested link");
    case "unknown_reason":
      return req.t!("Invalid dismissal reason");
    case "wrong_relation_type":
      return req.t!("That dismissal reason does not apply to this kind of link");
    case "note_required":
      return req.t!("A note is required when the dismissal reason is Other");
    case "note_too_long":
      return req.t!("The note must be 500 characters or fewer");
  }
};

const SINGLE_PARENT_INDEX = "risk_links_single_parent_idx";

type TargetRejection = "not_exactly_one" | "cross_entity_related_to";

const targetMessage = (req: Request, rejection: TargetRejection): string => {
  switch (rejection) {
    case "not_exactly_one":
      return req.t!("Provide exactly one parent risk.");
    case "cross_entity_related_to":
      return req.t!("Only inheritance links are supported across risk types.");
  }
};

/**
 * Exactly one of the three target fields must be present. The CHECK constraint
 * `risk_links_one_target` says the same thing at the table; this is the layer
 * that produces a readable message instead of a 500.
 */
function resolveTarget(
  body: any,
  relationType: RiskLinkRelationType,
): { parent: HierarchyParent } | { rejection: TargetRejection } {
  const candidates: [ParentEntityType, unknown][] = [
    ["risk", body?.targetRiskId],
    ["model_risk", body?.targetModelRiskId],
    ["vendor_risk", body?.targetVendorRiskId],
  ];
  const given = candidates
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([entityType, value]) => ({ entityType, id: toId(value) }));

  if (given.length !== 1 || isNaN(given[0].id)) return { rejection: "not_exactly_one" };
  if (given[0].entityType !== "risk" && relationType !== "inherits_from") {
    return { rejection: "cross_entity_related_to" };
  }
  return { parent: given[0] };
}

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
    const riskId = toId(req.params.riskId);
    if (isNaN(riskId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid risk ID")));
    }

    const requested = req.query.status;
    if (requested !== undefined && !isRiskLinkStatus(requested)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid status filter")));
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
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * The three vendor risk insights share one shape: read-only, org-wide, and
 * nothing in them that GET /api/vendorRisks/all does not already show any
 * authenticated user, so unlike the project risk reports they are not
 * admin-only.
 */
async function sendVendorReport<T>(
  req: Request,
  res: Response,
  functionName: string,
  label: string,
  load: (organizationId: number) => Promise<T>,
): Promise<any> {
  logProcessing({
    description: `starting ${functionName}`,
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const report = await load(req.organizationId!);

    logSuccess({
      eventType: "Read",
      description: `built the ${label}`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](report));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: `failed to build the ${label}`,
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** How far each vendor risk reaches through the project risks inheriting from it. */
export async function getVendorExposure(req: Request, res: Response): Promise<any> {
  return sendVendorReport(
    req,
    res,
    "getVendorExposure",
    "vendor exposure report",
    findVendorExposure,
  );
}

/** Same-vendor risks that read like one risk entered twice. */
export async function getVendorDuplicateCandidates(req: Request, res: Response): Promise<any> {
  return sendVendorReport(
    req,
    res,
    "getVendorDuplicateCandidates",
    "vendor duplicate report",
    findVendorDuplicateCandidates,
  );
}

/** Vendor risks not mapped to a framework, split into gaps and nothing-to-map-to. */
export async function getVendorFrameworkCoverage(req: Request, res: Response): Promise<any> {
  return sendVendorReport(
    req,
    res,
    "getVendorFrameworkCoverage",
    "vendor framework coverage report",
    findVendorFrameworkCoverage,
  );
}

/**
 * The vendor risk's side of value-chain inheritance: the project risks that
 * inherit from it. Same status filter and response shape as getRiskLinks, so
 * the client renders both lists with one row component.
 */
export async function getVendorRiskLinks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getVendorRiskLinks",
    functionName: "getVendorRiskLinks",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRiskId = toId(req.params.vendorRiskId);
    if (isNaN(vendorRiskId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
    }

    const requested = req.query.status;
    if (requested !== undefined && !isRiskLinkStatus(requested)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid status filter")));
    }
    const statuses = requested ? [requested] : DEFAULT_STATUSES;

    const links = await getRiskLinksForVendorRiskQuery(req.organizationId!, vendorRiskId, statuses);

    logSuccess({
      eventType: "Read",
      description: `fetched ${links.length} links for vendor risk ${vendorRiskId}`,
      functionName: "getVendorRiskLinks",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](links.map((link) => toResponse(link, null))));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch vendor risk links",
      functionName: "getVendorRiskLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** Project risks in the vendor's projects, for ranking the vendor panel's picker. */
export async function getVendorRiskSharedProjects(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getVendorRiskSharedProjects",
    functionName: "getVendorRiskSharedProjects",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRiskId = toId(req.params.vendorRiskId);
    if (isNaN(vendorRiskId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
    }

    const candidates = await getVendorRiskChildCandidatesQuery(req.organizationId!, vendorRiskId);

    logSuccess({
      eventType: "Read",
      description: `fetched ${candidates.length} child candidates for vendor risk ${vendorRiskId}`,
      functionName: "getVendorRiskSharedProjects",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](candidates));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch vendor risk child candidates",
      functionName: "getVendorRiskSharedProjects",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * The whole org's link graph in one payload. Nodes are deduped here so the page
 * does not have to fetch three risk endpoints and re-join them client-side.
 *
 * Capped: a graph page that renders five thousand nodes locks the browser. The
 * query asks for CAP+1 rows so truncation is detectable without a second COUNT.
 */
export async function getRiskGraph(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getRiskGraph",
    functionName: "getRiskGraph",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const requested = req.query.status;
    if (requested !== undefined && !isRiskLinkStatus(requested)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid status filter")));
    }
    const statuses = requested ? [requested] : DEFAULT_STATUSES;

    const rows = await getRiskGraphQuery(req.organizationId!, statuses);
    const truncated = rows.length > RISK_GRAPH_EDGE_CAP;
    const kept = truncated ? rows.slice(0, RISK_GRAPH_EDGE_CAP) : rows;

    const nodes = new Map<
      string,
      {
        key: string;
        entityType: ParentEntityType;
        id: number;
        name: string | null;
        riskLevel: string | null;
        /** Vendor risk nodes only; null everywhere else. */
        vendor: { id: number; name: string | null } | null;
      }
    >();
    const addNode = (
      entityType: ParentEntityType,
      id: number,
      name: string | null,
      riskLevel: string | null,
      vendor: { id: number; name: string | null } | null = null,
    ) => {
      const key = `${entityType}:${id}`;
      if (!nodes.has(key)) nodes.set(key, { key, entityType, id, name, riskLevel, vendor });
    };

    const edges = kept.map((row) => {
      addNode(
        row.source_entity_type,
        row.source_id,
        row.source_name,
        row.source_level,
        row.source_vendor_id != null
          ? { id: row.source_vendor_id, name: row.source_vendor_name }
          : null,
      );
      addNode(
        row.target_entity_type,
        row.target_id,
        row.target_name,
        row.target_level,
        row.target_vendor_id != null
          ? { id: row.target_vendor_id, name: row.target_vendor_name }
          : null,
      );
      return {
        id: row.id,
        sourceKey: `${row.source_entity_type}:${row.source_id}`,
        targetKey: `${row.target_entity_type}:${row.target_id}`,
        relationType: row.relation_type,
        status: row.status,
        score: row.score,
        parentLevelChangedAt: row.parent_level_changed_at,
      };
    });

    logSuccess({
      eventType: "Read",
      description: `fetched ${edges.length} graph edges`,
      functionName: "getRiskGraph",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ nodes: [...nodes.values()], edges, truncated }));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch risk graph",
      functionName: "getRiskGraph",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Dismissal analytics for tuning the suggester: which engine signal humans
 * throw away, why, and what they wrote about it. Read-only, org-scoped, no
 * parameters. The query already returns camelCase rows, so there is no
 * per-row mapping here — unlike getRiskLinks, whose toResponse rewrites
 * subject-relative fields.
 */
export async function getDismissalAnalytics(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getDismissalAnalytics",
    functionName: "getDismissalAnalytics",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const analytics = await getDismissalAnalyticsQuery(req.organizationId!);

    logSuccess({
      eventType: "Read",
      description: `fetched dismissal analytics with ${analytics.signals.length} signals`,
      functionName: "getDismissalAnalytics",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](analytics));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch dismissal analytics",
      functionName: "getDismissalAnalytics",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Duplicate candidate report: pairs of risks that look like the same risk
 * entered twice, ranked by text similarity. Read-only, org-scoped, no
 * parameters — same shape as getDismissalAnalytics. Writes nothing.
 */
export async function getDuplicateCandidates(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getDuplicateCandidates",
    functionName: "getDuplicateCandidates",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const report = await findDuplicateCandidates(req.organizationId!);

    logSuccess({
      eventType: "Read",
      description: `fetched duplicate report with ${report.candidates.length} candidates`,
      functionName: "getDuplicateCandidates",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](report));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch duplicate candidates",
      functionName: "getDuplicateCandidates",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Control coverage gap report: which risk is not mitigated by any control,
 * separated from risks whose projects have no framework attached. Read-only,
 * org-scoped, no parameters — same shape as getDismissalAnalytics. Writes
 * nothing.
 */
export async function getControlCoverage(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getControlCoverage",
    functionName: "getControlCoverage",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const report = await findControlCoverage(req.organizationId!);

    logSuccess({
      eventType: "Read",
      description: `fetched coverage report with ${report.gaps.length} gaps`,
      functionName: "getControlCoverage",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](report));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch control coverage",
      functionName: "getControlCoverage",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Which vendor and model risks share a project with this risk. A ranking hint
 * for the link picker — it writes nothing and asserts nothing beyond the shared
 * project, so an empty list is a normal answer, not an error. A risk outside
 * the caller's org yields an empty list for the same reason `getRiskLinks`
 * yields an empty list rather than a 404.
 */
export async function getSharedProjects(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getSharedProjects",
    functionName: "getSharedProjects",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const riskId = toId(req.params.riskId);
    if (isNaN(riskId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid risk ID")));
    }

    const candidates = await getSharedProjectCandidatesQuery(req.organizationId!, riskId);

    logSuccess({
      eventType: "Read",
      description: `fetched ${candidates.length} shared-project candidates for risk ${riskId}`,
      functionName: "getSharedProjects",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](candidates));
  } catch (error) {
    logFailure({
      eventType: "Read",
      description: "failed to fetch shared-project candidates",
      functionName: "getSharedProjects",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
  return runHierarchyPass(req, res, "suggestRiskHierarchy");
}

/**
 * The same pass, limited to the clusters a vendor risk could parent: those
 * holding at least one project risk in a use case the vendor serves. The
 * direction agent already offers vendor risks that share a project with the
 * cluster, so scoping the clusters is all this needs to do.
 */
export async function suggestVendorRiskHierarchy(req: Request, res: Response): Promise<any> {
  const vendorRiskId = toId(req.params.vendorRiskId);
  if (isNaN(vendorRiskId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid vendor risk ID")));
  }
  return runHierarchyPass(req, res, "suggestVendorRiskHierarchy", vendorRiskId);
}

async function runHierarchyPass(
  req: Request,
  res: Response,
  functionName: string,
  vendorRiskId?: number,
): Promise<any> {
  logProcessing({
    description: `starting ${functionName}`,
    functionName,
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
            req.t!(
              "No LLM key is configured for this organization. Add one under Settings before suggesting a hierarchy.",
            ),
          ),
        );
    }

    let components = connectedComponents(await getRelatedPairsQuery(req.organizationId!));
    if (vendorRiskId !== undefined) {
      const inScope = new Set(
        (await getVendorRiskChildCandidatesQuery(req.organizationId!, vendorRiskId)).map(
          (candidate) => candidate.id,
        ),
      );
      components = components.filter((ids) => ids.some((id) => inScope.has(id)));
    }
    const groupable = components.filter((ids) => ids.length <= MAX_COMPONENT_SIZE);
    const skipped = components.length - groupable.length;

    await Promise.all(groupable.map((ids) => enqueueRiskLinkDirection(req.organizationId!, ids)));

    logSuccess({
      eventType: "Create",
      description: `enqueued ${groupable.length} risk link direction jobs, skipped ${skipped} oversized components`,
      functionName,
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ enqueued: groupable.length, skipped }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to enqueue risk link direction jobs",
      functionName,
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
    const id = toId(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid link ID")));
    }

    const next = req.body?.status;
    if (!isRiskLinkStatus(next)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid status")));
    }

    const link = await getRiskLinkByIdQuery(id, req.organizationId!);
    if (!link) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Risk link not found")));
    }

    if (!ALLOWED_TRANSITIONS[link.status].includes(next)) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!("Cannot change status from {from} to {to}", { from: link.status, to: next }),
          ),
        );
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
      return res.status(400).json(STATUS_CODE[400](dismissReasonMessage(req, dismissal.rejection)));
    }

    // Confirming a suggestion, or restoring a dismissed link, reaches the same
    // end state as a fresh POST — so it runs the same rule. Placed after the
    // transition guard: confirmed -> confirmed is already a 400, so this row is
    // never itself in the confirmed set it is checked against.
    // An inheritance edge always has a project-risk child (risk_links_vendor_pair
    // keeps vendor-sourced rows to related_to), so the null check only narrows.
    if (
      next === "confirmed" &&
      link.relation_type === "inherits_from" &&
      link.source_risk_id != null
    ) {
      const parent = hierarchyParentFromLink(link);
      const violation = validateTwoLevel(
        {
          childRiskId: link.source_risk_id,
          parentRiskId: parent.id,
          parentEntityType: parent.entityType,
        },
        await getConfirmedHierarchyEdgesQuery(req.organizationId!, link.source_risk_id, parent),
      );
      if (violation) {
        return res.status(409).json(STATUS_CODE[409](hierarchyMessage(req, violation)));
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
        .json(STATUS_CODE[409](hierarchyMessage(req, "child_already_has_parent")));
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
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Mark a stale-inheritance warning as reviewed. Clears the flag on exactly one
 * link; org-scoped, so a link in another tenant is a 404, not a silent no-op.
 * Idempotent: acknowledging an already-cleared link is a 200, not a 404.
 */
export async function acknowledgeParentLevelChange(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting acknowledgeParentLevelChange",
    functionName: "acknowledgeParentLevelChange",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const id = toId(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid link ID")));
    }

    const cleared = await acknowledgeParentLevelChangeQuery(req.organizationId!, id);
    if (!cleared) {
      // No flag to clear: distinguish a missing/foreign link (404) from one
      // that was already reviewed (200, idempotent).
      const link = await getRiskLinkByIdQuery(id, req.organizationId!);
      if (!link) {
        return res.status(404).json(STATUS_CODE[404](req.t!("Risk link not found")));
      }
    }

    logSuccess({
      eventType: "Update",
      description: `risk link ${id} parent-level change acknowledged`,
      functionName: "acknowledgeParentLevelChange",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ id, parentLevelChangedAt: null }));
  } catch (error) {
    logFailure({
      eventType: "Update",
      description: "failed to acknowledge parent-level change",
      functionName: "acknowledgeParentLevelChange",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * A human asserting a link the engine did not find. For `inherits_from`,
 * `sourceRiskId` is the risk that inherits and exactly one target field is the
 * risk inherited from — matching how `toResponse` reads direction back out.
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
    if (req.body?.sourceVendorRiskId !== undefined && req.body?.sourceVendorRiskId !== null) {
      return await createVendorRiskPair(req, res);
    }

    const sourceRiskId = toId(req.body?.sourceRiskId);
    const relationType = req.body?.relationType;

    if (isNaN(sourceRiskId) || !isRelationType(relationType)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid link payload")));
    }

    const resolved = resolveTarget(req.body, relationType);
    if ("rejection" in resolved) {
      return res.status(400).json(STATUS_CODE[400](targetMessage(req, resolved.rejection)));
    }
    const { parent } = resolved;

    // Self-linking is only expressible within one table.
    if (parent.entityType === "risk" && sourceRiskId === parent.id) {
      return res.status(400).json(STATUS_CODE[400](req.t!("A risk cannot link to itself")));
    }

    if (parent.entityType === "risk") {
      const live = await getLiveRiskIdsQuery([sourceRiskId, parent.id], req.organizationId!);
      if (live.length !== 2) {
        return res.status(404).json(STATUS_CODE[404](req.t!("Risk not found")));
      }
    } else {
      const childLive = await getLiveRiskIdsQuery([sourceRiskId], req.organizationId!);
      if (childLive.length !== 1) {
        return res.status(404).json(STATUS_CODE[404](req.t!("Risk not found")));
      }
      if (!(await getLiveCrossEntityParentQuery(parent, req.organizationId!))) {
        return res.status(404).json(STATUS_CODE[404](req.t!("Risk not found")));
      }
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
        { childRiskId: sourceRiskId, parentRiskId: parent.id, parentEntityType: parent.entityType },
        await getConfirmedHierarchyEdgesQuery(req.organizationId!, sourceRiskId, parent),
      );
      if (violation) {
        return res.status(409).json(STATUS_CODE[409](hierarchyMessage(req, violation)));
      }
    }

    // The risk_links_canonical CHECK exempts inherits_from: direction is carried
    // by which column an id sits in, so only related_to is reordered.
    const [storedSource, storedTarget] =
      relationType === "related_to"
        ? canonicalPair(sourceRiskId, parent.id)
        : [sourceRiskId, parent.id];
    const storedTargetParent: HierarchyParent =
      relationType === "related_to" ? { id: storedTarget, entityType: "risk" } : parent;

    const id = await createUserRiskLinkQuery({
      organizationId: req.organizationId!,
      sourceRiskId: storedSource,
      target: storedTargetParent,
      relationType,
      userId: req.userId!,
    });

    if (id === null) {
      return res
        .status(409)
        .json(
          STATUS_CODE[409](
            req.t!(
              'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
            ),
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

    return res.status(201).json(
      STATUS_CODE[201]({
        id,
        relatedRisk: { id: parent.id, entityType: parent.entityType },
      }),
    );
  } catch (error) {
    // A lost race is a user-facing conflict, not a system failure — and the
    // endpoint's other 409s do not log either.
    if (isSingleParentViolation(error)) {
      return res
        .status(409)
        .json(STATUS_CODE[409](hierarchyMessage(req, "child_already_has_parent")));
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
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Two vendor risks related by hand. The only shape a vendor-sourced row may
 * take is a `related_to` pair (risk_links_vendor_pair): vendor risks never
 * inherit from each other, because the child of an inheritance edge is always
 * a project risk. Stored smaller id first, like a project risk pair.
 */
async function createVendorRiskPair(req: Request, res: Response): Promise<any> {
  const sourceVendorRiskId = toId(req.body?.sourceVendorRiskId);
  const targetVendorRiskId = toId(req.body?.targetVendorRiskId);
  const otherTarget =
    (req.body?.targetRiskId ?? req.body?.targetModelRiskId ?? req.body?.sourceRiskId) != null;
  if (isNaN(sourceVendorRiskId) || isNaN(targetVendorRiskId) || otherTarget) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid link payload")));
  }
  if (req.body?.relationType !== "related_to") {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Only related links are supported between vendor risks.")));
  }
  if (sourceVendorRiskId === targetVendorRiskId) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A risk cannot link to itself")));
  }

  const live = await getLiveVendorRiskIdsQuery(
    [sourceVendorRiskId, targetVendorRiskId],
    req.organizationId!,
  );
  if (live.length !== 2) {
    return res.status(404).json(STATUS_CODE[404](req.t!("Risk not found")));
  }

  const [first, second] = canonicalPair(sourceVendorRiskId, targetVendorRiskId);
  const id = await createUserVendorRiskLinkQuery({
    organizationId: req.organizationId!,
    sourceVendorRiskId: first,
    targetVendorRiskId: second,
    userId: req.userId!,
  });
  if (id === null) {
    return res
      .status(409)
      .json(
        STATUS_CODE[409](
          req.t!(
            'These risks are already linked. If the link was dismissed, use "Show dismissed" to restore it.',
          ),
        ),
      );
  }

  logSuccess({
    eventType: "Create",
    description: `related vendor risk ${first} to ${second}`,
    functionName: "createRiskLink",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  return res.status(201).json(
    STATUS_CODE[201]({
      id,
      relatedRisk: { id: targetVendorRiskId, entityType: "vendor_risk" },
    }),
  );
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
    await Promise.all(
      riskIds.map((riskId) => enqueueRiskLinkRecompute(req.organizationId!, riskId)),
    );

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
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Backfill for related vendor risks: one job per active vendor risk, as the
 * project risk backfill above does. Vendor risks are rescored on every save
 * from then on.
 */
export async function recomputeAllVendorRiskLinks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting recomputeAllVendorRiskLinks",
    functionName: "recomputeAllVendorRiskLinks",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const vendorRiskIds = await getActiveVendorRiskIdsQuery(req.organizationId!);
    await Promise.all(
      vendorRiskIds.map((id) => enqueueVendorRiskLinkRecompute(req.organizationId!, id)),
    );

    logSuccess({
      eventType: "Create",
      description: `enqueued ${vendorRiskIds.length} vendor risk link recompute jobs`,
      functionName: "recomputeAllVendorRiskLinks",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ enqueued: vendorRiskIds.length }));
  } catch (error) {
    logFailure({
      eventType: "Create",
      description: "failed to enqueue vendor risk link recompute",
      functionName: "recomputeAllVendorRiskLinks",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
