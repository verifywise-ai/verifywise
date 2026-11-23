import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import { IVendorRisk } from "../../domain.layer/interfaces/i.vendorRisk";
import { getAllVendorsQuery, getVendorByIdQuery } from "../../utils/vendor.utils";
import {
  getAllVendorRisksAllProjectsQuery,
  getVendorRiskByIdQuery,
} from "../../utils/vendorRisk.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";
import {
  createVendor,
  deleteVendor,
  updateVendor,
  type VendorActor,
  type VendorInput,
} from "../../services/vendor.service";
import {
  createVendorRisk,
  deleteVendorRisk,
  updateVendorRisk,
  type VendorRiskInput,
} from "../../services/vendorRisk.service";
import {
  assertVendorRequestBody,
  assertVendorRiskRequestBody,
} from "../../utils/validations/vendorRequest.utils";
import {
  BusinessLogicException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import { getUserRoleInOrganization } from "../../utils/userPermission.utils";
import { roleInfoHasPermission } from "../../utils/rolePermissions.utils";
import { parseIdValue } from "../../utils/validations/trainingAssignmentValidation.utils";
import { actingRequesterId } from "./actingRequester";

export interface FetchVendorsParams {
  review_status?: "Not started" | "In review" | "Reviewed" | "Requires follow-up";
  data_sensitivity?: string;
  business_criticality?: string;
  regulatory_exposure?: string;
  vendor_name?: string;
  limit?: number;
}

const fetchVendors = async (
  params: FetchVendorsParams,
  organizationId: number,
): Promise<Partial<IVendor>[]> => {
  let vendors: IVendor[] = [];

  try {
    vendors = await getAllVendorsQuery(organizationId);

    // Apply filters
    if (params.review_status) {
      vendors = vendors.filter((v) => v.review_status === params.review_status);
    }
    if (params.data_sensitivity) {
      vendors = vendors.filter((v) => v.data_sensitivity === params.data_sensitivity);
    }
    if (params.business_criticality) {
      vendors = vendors.filter((v) => v.business_criticality === params.business_criticality);
    }
    if (params.regulatory_exposure) {
      vendors = vendors.filter((v) => v.regulatory_exposure === params.regulatory_exposure);
    }
    if (params.vendor_name) {
      vendors = vendors.filter(
        (v) =>
          v.vendor_name && v.vendor_name.toLowerCase().includes(params.vendor_name!.toLowerCase()),
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      vendors = vendors.slice(0, params.limit);
    }

    // Return lightweight projections
    return vendors.map((v) => ({
      id: v.id,
      vendor_name: v.vendor_name,
      vendor_provides: v.vendor_provides,
      review_status: v.review_status,
      review_date: v.review_date,
      data_sensitivity: v.data_sensitivity,
      business_criticality: v.business_criticality,
      regulatory_exposure: v.regulatory_exposure,
      risk_score: v.risk_score,
    }));
  } catch (error) {
    logger.error("Error fetching vendors:", error);
    throw new Error(
      `Failed to fetch vendors: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface FetchVendorRisksParams {
  vendorId?: number;
  likelihood?: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  risk_severity?: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  limit?: number;
}

const fetchVendorRisks = async (
  params: FetchVendorRisksParams,
  organizationId: number,
): Promise<Partial<IVendorRisk>[]> => {
  let risks: IVendorRisk[] = [];

  try {
    risks = (await getAllVendorRisksAllProjectsQuery(organizationId, "active")) as IVendorRisk[];

    // Apply filters
    if (params.vendorId) {
      risks = risks.filter((r) => r.vendor_id === params.vendorId);
    }
    if (params.likelihood) {
      risks = risks.filter((r) => r.likelihood === params.likelihood);
    }
    if (params.risk_severity) {
      risks = risks.filter((r) => r.risk_severity === params.risk_severity);
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      risks = risks.slice(0, params.limit);
    }

    // Return lightweight projections — exclude verbose text fields
    return risks.map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      likelihood: r.likelihood,
      risk_severity: r.risk_severity,
      risk_level: r.risk_level,
      action_owner: r.action_owner,
    }));
  } catch (error) {
    logger.error("Error fetching vendor risks:", error);
    throw new Error(
      `Failed to fetch vendor risks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface VendorAnalytics {
  reviewStatusDistribution: {
    [status: string]: number;
  };
  dataSensitivityDistribution: Array<{
    sensitivity: string;
    count: number;
    percentage: number;
  }>;
  businessCriticalityDistribution: Array<{
    criticality: string;
    count: number;
    percentage: number;
  }>;
  regulatoryExposureDistribution: Array<{
    regulation: string;
    count: number;
    percentage: number;
  }>;
  riskScoreDistribution: {
    high: number; // risk_score > 70
    medium: number; // risk_score 40-70
    low: number; // risk_score < 40
    unassessed: number; // no risk_score
  };
  vendorRiskSeverityDistribution: {
    [severity: string]: number;
  };
  totalVendors: number;
  totalVendorRisks: number;
}

const getVendorAnalytics = async (
  _params: Record<string, never>,
  organizationId: number,
): Promise<VendorAnalytics> => {
  try {
    const vendors = await getAllVendorsQuery(organizationId);
    const vendorRisks = (await getAllVendorRisksAllProjectsQuery(
      organizationId,
      "active",
    )) as IVendorRisk[];

    const totalVendors = vendors.length;
    const totalVendorRisks = vendorRisks.length;

    // 1. Review Status Distribution
    const reviewStatuses = ["Not started", "In review", "Reviewed", "Requires follow-up"];
    const reviewStatusDistribution: { [status: string]: number } = {};
    reviewStatuses.forEach((status) => {
      reviewStatusDistribution[status] = 0;
    });

    vendors.forEach((vendor) => {
      if (vendor.review_status) {
        reviewStatusDistribution[vendor.review_status] =
          (reviewStatusDistribution[vendor.review_status] || 0) + 1;
      } else {
        reviewStatusDistribution["Not started"] =
          (reviewStatusDistribution["Not started"] || 0) + 1;
      }
    });

    // 2. Data Sensitivity Distribution
    const sensitivityMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      const sensitivity = vendor.data_sensitivity || "Not specified";
      sensitivityMap.set(sensitivity, (sensitivityMap.get(sensitivity) || 0) + 1);
    });

    const dataSensitivityDistribution = Array.from(sensitivityMap.entries())
      .map(([sensitivity, count]) => ({
        sensitivity,
        count,
        percentage: totalVendors > 0 ? Math.round((count / totalVendors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Business Criticality Distribution
    const criticalityMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      const criticality = vendor.business_criticality || "Not specified";
      criticalityMap.set(criticality, (criticalityMap.get(criticality) || 0) + 1);
    });

    const businessCriticalityDistribution = Array.from(criticalityMap.entries())
      .map(([criticality, count]) => ({
        criticality,
        count,
        percentage: totalVendors > 0 ? Math.round((count / totalVendors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 4. Regulatory Exposure Distribution
    const regulatoryMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      const regulation = vendor.regulatory_exposure || "None";
      regulatoryMap.set(regulation, (regulatoryMap.get(regulation) || 0) + 1);
    });

    const regulatoryExposureDistribution = Array.from(regulatoryMap.entries())
      .map(([regulation, count]) => ({
        regulation,
        count,
        percentage: totalVendors > 0 ? Math.round((count / totalVendors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. Risk Score Distribution
    const riskScoreDistribution = {
      high: 0,
      medium: 0,
      low: 0,
      unassessed: 0,
    };

    vendors.forEach((vendor) => {
      if (vendor.risk_score === undefined || vendor.risk_score === null) {
        riskScoreDistribution.unassessed++;
      } else if (vendor.risk_score > 70) {
        riskScoreDistribution.high++;
      } else if (vendor.risk_score >= 40) {
        riskScoreDistribution.medium++;
      } else {
        riskScoreDistribution.low++;
      }
    });

    // 6. Vendor Risk Severity Distribution
    const severities = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
    const vendorRiskSeverityDistribution: { [severity: string]: number } = {};
    severities.forEach((severity) => {
      vendorRiskSeverityDistribution[severity] = 0;
    });

    vendorRisks.forEach((risk) => {
      if (risk.risk_severity) {
        vendorRiskSeverityDistribution[risk.risk_severity] =
          (vendorRiskSeverityDistribution[risk.risk_severity] || 0) + 1;
      }
    });

    return {
      reviewStatusDistribution,
      dataSensitivityDistribution,
      businessCriticalityDistribution,
      regulatoryExposureDistribution,
      riskScoreDistribution,
      vendorRiskSeverityDistribution,
      totalVendors,
      totalVendorRisks,
    };
  } catch (error) {
    logger.error("Error getting vendor analytics:", error);
    throw new Error(
      `Failed to get vendor analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface VendorExecutiveSummary {
  totalVendors: number;
  reviewedVendors: number;
  pendingReviewVendors: number;
  highRiskVendors: number;
  criticalBusinessVendors: number;
  vendorsWithPII: number;
  vendorsRequiringFollowUp: number;
  totalVendorRisks: number;
  majorOrCatastrophicRisks: number;
  topRegulations: Array<{
    regulation: string;
    count: number;
  }>;
  vendorsNeedingAttention: Array<{
    id: number;
    vendor_name: string;
    review_status: string;
    risk_score: number | undefined;
    business_criticality: string | undefined;
  }>;
  reviewProgress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

const getVendorExecutiveSummary = async (
  _params: Record<string, never>,
  organizationId: number,
): Promise<VendorExecutiveSummary> => {
  try {
    const vendors = await getAllVendorsQuery(organizationId);
    const vendorRisks = (await getAllVendorRisksAllProjectsQuery(
      organizationId,
      "active",
    )) as IVendorRisk[];

    const totalVendors = vendors.length;

    // Count by review status
    const reviewedVendors = vendors.filter((v) => v.review_status === "Reviewed").length;

    const pendingReviewVendors = vendors.filter(
      (v) =>
        !v.review_status || v.review_status === "Not started" || v.review_status === "In review",
    ).length;

    const vendorsRequiringFollowUp = vendors.filter(
      (v) => v.review_status === "Requires follow-up",
    ).length;

    // High risk vendors (risk_score > 70)
    const highRiskVendors = vendors.filter(
      (v) => v.risk_score !== undefined && v.risk_score > 70,
    ).length;

    // Critical business vendors
    const criticalBusinessVendors = vendors.filter(
      (v) => v.business_criticality === "High (critical to core services or products)",
    ).length;

    // Vendors handling PII
    const vendorsWithPII = vendors.filter(
      (v) => v.data_sensitivity === "Personally identifiable information (PII)",
    ).length;

    // Vendor risks
    const totalVendorRisks = vendorRisks.length;
    const majorOrCatastrophicRisks = vendorRisks.filter(
      (r) => r.risk_severity === "Major" || r.risk_severity === "Catastrophic",
    ).length;

    // Top regulations
    const regulatoryMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      if (vendor.regulatory_exposure && vendor.regulatory_exposure !== "None") {
        regulatoryMap.set(
          vendor.regulatory_exposure,
          (regulatoryMap.get(vendor.regulatory_exposure) || 0) + 1,
        );
      }
    });

    const topRegulations = Array.from(regulatoryMap.entries())
      .map(([regulation, count]) => ({ regulation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Vendors needing attention (high risk or requiring follow-up)
    const vendorsNeedingAttention = vendors
      .filter(
        (v) =>
          v.review_status === "Requires follow-up" ||
          (v.risk_score !== undefined && v.risk_score > 70) ||
          v.business_criticality === "High (critical to core services or products)",
      )
      .map((v) => ({
        id: v.id || 0,
        vendor_name: v.vendor_name,
        review_status: v.review_status || "Not started",
        risk_score: v.risk_score,
        business_criticality: v.business_criticality,
      }))
      .slice(0, 5);

    // Review progress
    const reviewProgress = {
      completed: reviewedVendors,
      total: totalVendors,
      percentage: totalVendors > 0 ? Math.round((reviewedVendors / totalVendors) * 100) : 0,
    };

    return {
      totalVendors,
      reviewedVendors,
      pendingReviewVendors,
      highRiskVendors,
      criticalBusinessVendors,
      vendorsWithPII,
      vendorsRequiringFollowUp,
      totalVendorRisks,
      majorOrCatastrophicRisks,
      topRegulations,
      vendorsNeedingAttention,
      reviewProgress,
    };
  } catch (error) {
    logger.error("Error getting vendor executive summary:", error);
    throw new Error(
      `Failed to get vendor executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ── Write Tools (Human Confirmation Flow) ──────────────────────────
//
// Each write runs as the user who asked (else the approver), with the
// console's permission (vendor.edit), through the console's own services:
// same validation, use case visibility, history, notices and workflows. Its
// checks run once before the approval is requested, so nobody is asked to
// approve a call that cannot run, and again when it executes.

const EDIT_REFUSAL = "your role does not allow editing vendors";

/** Advisor parameter → vendor field (the console's names). */
const VENDOR_FIELDS: Record<string, string> = {
  vendor_name: "vendor_name",
  description: "vendor_provides",
  website: "website",
  contact_person: "vendor_contact_person",
  review_status: "review_status",
  data_sensitivity: "data_sensitivity",
  criticality_level: "business_criticality",
  assignee: "assignee",
};

/** Fields the console requires on create, by Advisor parameter. */
const REQUIRED_ON_CREATE = ["vendor_name", "description", "website", "contact_person"];

/** Advisor parameter → vendor risk field (the console's names). */
const VENDOR_RISK_FIELDS: Record<string, string> = {
  risk_description: "risk_description",
  impact_description: "impact_description",
  severity: "risk_severity",
  likelihood: "likelihood",
  action_plan: "action_plan",
  action_owner: "action_owner",
};

const pick = (params: Record<string, unknown>, fields: Record<string, string>) => {
  const input: Record<string, unknown> = {};
  for (const [param, field] of Object.entries(fields)) {
    const value = params[param];
    if (value !== undefined && value !== null) input[field] = value;
  }
  return input;
};

type Refusal = { ok: false; message: string };
type Request<T> = Refusal | ({ ok: true; actor: VendorActor & { userId: number } } & T);

const refused = (message: string): Refusal => ({ ok: false, message });

/**
 * The acting user, with their role, when it holds vendor.edit in this
 * organization; else why not. Fails closed on an unknown user.
 */
async function vendorEditor(
  params: Record<string, unknown>,
  organizationId: number,
  notDone: string,
): Promise<Refusal | { ok: true; actor: VendorActor & { userId: number } }> {
  const userId = actingRequesterId(params);
  const role = await getUserRoleInOrganization(organizationId, userId);
  if (!userId || !role || !(await roleInfoHasPermission(organizationId, role, "vendor.edit"))) {
    return refused(`${notDone}: ${EDIT_REFUSAL}.`);
  }
  return { ok: true, actor: { userId, role: role.name, organizationId } };
}

/** The console's request checks; a failure is the reason, not an error. */
const bodyProblem = (check: () => void): string | null => {
  try {
    check();
    return null;
  } catch (error) {
    return error instanceof ValidationException ? error.message : String(error);
  }
};

/** Rejected inputs the services throw for (validation, demo vendors) become refusals. */
const refusalFor = async <T>(notDone: string, write: () => Promise<T>) => {
  try {
    return { ok: true as const, value: await write() };
  } catch (error) {
    if (error instanceof ValidationException || error instanceof BusinessLogicException) {
      return { ok: false as const, message: `${notDone}: ${error.message}` };
    }
    throw error;
  }
};

const parseId = (value: unknown, label: string) =>
  parseIdValue(value, `${label} ID must be a positive integer`);

// ── Vendors ──

async function createVendorRequest(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<Request<{ input: VendorInput }>> {
  const notDone = "Vendor was not created";
  const missing = REQUIRED_ON_CREATE.filter(
    (param) => typeof params[param] !== "string" || !(params[param] as string).trim(),
  );
  if (missing.length > 0) return refused(`${notDone}: ${missing.join(", ")} required`);

  const editor = await vendorEditor(params, organizationId, notDone);
  if (!editor.ok) return editor;

  const input: Record<string, unknown> = {
    review_status: "Not started",
    // Assigned to the user who asked unless the request names someone.
    assignee: editor.actor.userId,
    ...pick(params, VENDOR_FIELDS),
  };
  if (params.project_id !== undefined && params.project_id !== null) {
    const projectId = parseId(params.project_id, "Use case");
    if (!projectId.ok) return refused(`${notDone}: ${projectId.message}`);
    input.projects = [projectId.value];
  }
  const problem = bodyProblem(() => assertVendorRequestBody(input));
  if (problem) return refused(`${notDone}: ${problem}`);
  return { ...editor, input: input as VendorInput };
}

async function updateVendorRequest(
  params: Record<string, unknown>,
  organizationId: number,
  fields: Record<string, unknown>,
): Promise<Request<{ id: number; input: VendorInput }>> {
  const id = parseId(params.vendor_id, "Vendor");
  if (!id.ok) return refused(id.message);
  const notDone = `Vendor #${id.value} was not updated`;
  if (Object.keys(fields).length === 0) return refused("No fields to update");

  const editor = await vendorEditor(params, organizationId, notDone);
  if (!editor.ok) return editor;
  const problem = bodyProblem(() => assertVendorRequestBody(fields));
  if (problem) return refused(`${notDone}: ${problem}`);
  if (!(await getVendorByIdQuery(id.value, organizationId))) {
    return refused(`Vendor #${id.value} not found`);
  }
  return { ...editor, id: id.value, input: fields as VendorInput };
}

/** An update changes only what its schema offers (and its card shows): no assignee. */
const VENDOR_UPDATE_FIELDS = Object.fromEntries(
  Object.entries(VENDOR_FIELDS).filter(([param]) => param !== "assignee"),
);
const updateFields = (params: Record<string, unknown>) => pick(params, VENDOR_UPDATE_FIELDS);

const flagFields = (params: Record<string, unknown>) => ({
  review_status: "Requires follow-up",
  review_result: (params.reason as string) || "Flagged for review by AI advisor",
});

async function deleteVendorRequest(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<Request<{ id: number }>> {
  const id = parseId(params.vendor_id, "Vendor");
  if (!id.ok) return refused(id.message);
  const editor = await vendorEditor(params, organizationId, `Vendor #${id.value} was not deleted`);
  if (!editor.ok) return editor;
  if (!(await getVendorByIdQuery(id.value, organizationId))) {
    return refused(`Vendor #${id.value} not found`);
  }
  return { ...editor, id: id.value };
}

// ── Vendor risks ──

async function createVendorRiskRequest(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<Request<{ input: VendorRiskInput }>> {
  const notDone = "Vendor risk was not created";
  const vendorId = parseId(params.vendor_id, "Vendor");
  if (!vendorId.ok) return refused(`${notDone}: ${vendorId.message}`);
  if (!(typeof params.risk_name === "string" && params.risk_name.trim())) {
    return refused(`${notDone}: risk_name required`);
  }

  const editor = await vendorEditor(params, organizationId, notDone);
  if (!editor.ok) return editor;

  const details = typeof params.risk_description === "string" ? params.risk_description : "";
  const input: Record<string, unknown> = {
    vendor_id: vendorId.value,
    risk_description: params.risk_name.trim() + (details ? `: ${details}` : ""),
    impact_description: details || null,
    risk_severity: params.severity ?? "Moderate",
    likelihood: params.likelihood ?? "Possible",
  };
  const problem = bodyProblem(() => assertVendorRiskRequestBody(input, "create"));
  if (problem) return refused(`${notDone}: ${problem}`);
  if (!(await getVendorByIdQuery(vendorId.value, organizationId))) {
    return refused(`${notDone}: vendor #${vendorId.value} not found`);
  }
  return { ...editor, input };
}

async function updateVendorRiskRequest(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<Request<{ id: number; input: VendorRiskInput }>> {
  const id = parseId(params.vendor_risk_id, "Vendor risk");
  if (!id.ok) return refused(id.message);
  const notDone = `Vendor risk #${id.value} was not updated`;
  const input = pick(params, VENDOR_RISK_FIELDS);
  if (Object.keys(input).length === 0) return refused("No fields to update");
  if (input.action_owner !== undefined) {
    const owner = parseId(input.action_owner, "Action owner");
    if (!owner.ok) return refused(`${notDone}: ${owner.message}`);
    input.action_owner = owner.value;
  }

  const editor = await vendorEditor(params, organizationId, notDone);
  if (!editor.ok) return editor;
  const problem = bodyProblem(() => assertVendorRiskRequestBody(input, "update"));
  if (problem) return refused(`${notDone}: ${problem}`);
  if (!(await getVendorRiskByIdQuery(id.value, organizationId))) {
    return refused(`Vendor risk #${id.value} not found`);
  }
  return { ...editor, id: id.value, input };
}

async function deleteVendorRiskRequest(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<Request<{ id: number }>> {
  const id = parseId(params.vendor_risk_id, "Vendor risk");
  if (!id.ok) return refused(id.message);
  const editor = await vendorEditor(
    params,
    organizationId,
    `Vendor risk #${id.value} was not deleted`,
  );
  if (!editor.ok) return editor;
  if (!(await getVendorRiskByIdQuery(id.value, organizationId))) {
    return refused(`Vendor risk #${id.value} not found`);
  }
  return { ...editor, id: id.value };
}

const precheck =
  (
    request: (
      params: Record<string, unknown>,
      organizationId: number,
    ) => Promise<Refusal | { ok: true }>,
  ) =>
  async (params: Record<string, unknown>, organizationId: number) => {
    const result = await request(params, organizationId);
    return result.ok ? null : result.message;
  };

const agentCreateVendor = createWriteToolFn({
  toolName: "agent_create_vendor",
  warningLevel: "warning",
  descriptionFn: (params) => `Create vendor "${params.vendor_name}"`,
  precheckFn: precheck(createVendorRequest),
  executeFn: async (params, organizationId) => {
    const request = await createVendorRequest(params, organizationId);
    if (!request.ok) return { success: false, message: request.message };
    const result = await refusalFor("Vendor was not created", () =>
      createVendor(request.input, request.actor),
    );
    if (!result.ok) return { success: false, message: result.message };
    if (!result.value) return { success: false, message: "Vendor was not created" };
    return {
      success: true,
      id: result.value.id,
      vendor_name: result.value.vendor_name,
      // A use case the user can't see is not linked; this says which were.
      linked_use_case_ids: result.value.projects ?? [],
    };
  },
});

const runVendorUpdate =
  (fieldsFor: (params: Record<string, unknown>) => Record<string, unknown>) =>
  async (params: Record<string, unknown>, organizationId: number) => {
    const request = await updateVendorRequest(params, organizationId, fieldsFor(params));
    if (!request.ok) return { success: false, message: request.message };
    const result = await refusalFor(`Vendor #${request.id} was not updated`, () =>
      updateVendor(request.id, request.input, request.actor),
    );
    if (!result.ok) return { success: false, message: result.message };
    if (!result.value) return { success: false, message: `Vendor #${request.id} not found` };
    return {
      success: true,
      id: result.value.id,
      vendor_name: result.value.vendor_name,
      review_status: result.value.review_status,
    };
  };

const agentUpdateVendor = createWriteToolFn({
  toolName: "agent_update_vendor",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Update vendor #${params.vendor_id}${params.vendor_name ? ` name to "${params.vendor_name}"` : ""}`,
  precheckFn: precheck((params, organizationId) =>
    updateVendorRequest(params, organizationId, updateFields(params)),
  ),
  executeFn: runVendorUpdate(updateFields),
});

const agentDeleteVendor = createWriteToolFn({
  toolName: "agent_delete_vendor",
  warningLevel: "danger",
  descriptionFn: (params) =>
    `Permanently delete vendor #${params.vendor_id} and all associated risks`,
  precheckFn: precheck(deleteVendorRequest),
  executeFn: async (params, organizationId) => {
    const request = await deleteVendorRequest(params, organizationId);
    if (!request.ok) return { success: false, message: request.message };
    const deleted = await deleteVendor(request.id, request.actor);
    if (!deleted) return { success: false, message: `Vendor #${request.id} not found` };
    return { success: true, deleted, vendor_id: request.id };
  },
});

const agentCreateVendorRisk = createWriteToolFn({
  toolName: "agent_create_vendor_risk",
  warningLevel: "warning",
  descriptionFn: (params) => `Create risk "${params.risk_name}" for vendor #${params.vendor_id}`,
  precheckFn: precheck(createVendorRiskRequest),
  executeFn: async (params, organizationId) => {
    const request = await createVendorRiskRequest(params, organizationId);
    if (!request.ok) return { success: false, message: request.message };
    const result = await refusalFor("Vendor risk was not created", () =>
      createVendorRisk(request.input, request.actor),
    );
    if (!result.ok) return { success: false, message: result.message };
    if (!result.value) return { success: false, message: "Vendor risk was not created" };
    return { success: true, id: result.value.id, vendor_id: result.value.vendor_id };
  },
});

const agentUpdateVendorRisk = createWriteToolFn({
  toolName: "agent_update_vendor_risk",
  warningLevel: "warning",
  descriptionFn: (params) => `Update vendor risk #${params.vendor_risk_id}`,
  precheckFn: precheck(updateVendorRiskRequest),
  executeFn: async (params, organizationId) => {
    const request = await updateVendorRiskRequest(params, organizationId);
    if (!request.ok) return { success: false, message: request.message };
    const result = await refusalFor(`Vendor risk #${request.id} was not updated`, () =>
      updateVendorRisk(request.id, request.input, request.actor),
    );
    if (!result.ok) return { success: false, message: result.message };
    if (!result.value) return { success: false, message: `Vendor risk #${request.id} not found` };
    return { success: true, id: result.value.id, vendor_id: result.value.vendor_id };
  },
});

const agentDeleteVendorRisk = createWriteToolFn({
  toolName: "agent_delete_vendor_risk",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete vendor risk #${params.vendor_risk_id}`,
  precheckFn: precheck(deleteVendorRiskRequest),
  executeFn: async (params, organizationId) => {
    const request = await deleteVendorRiskRequest(params, organizationId);
    if (!request.ok) return { success: false, message: request.message };
    const deleted = await deleteVendorRisk(request.id, request.actor);
    if (!deleted) return { success: false, message: `Vendor risk #${request.id} not found` };
    return { success: true, deleted, vendor_risk_id: request.id };
  },
});

const agentFlagVendorForReview = createWriteToolFn({
  toolName: "agent_flag_vendor_for_review",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Flag vendor #${params.vendor_id} for review${params.reason ? `: ${params.reason}` : ""}`,
  precheckFn: precheck((params, organizationId) =>
    updateVendorRequest(params, organizationId, flagFields(params)),
  ),
  executeFn: runVendorUpdate(flagFields),
});

const availableVendorTools: any = {
  fetch_vendors: fetchVendors,
  fetch_vendor_risks: fetchVendorRisks,
  get_vendor_analytics: getVendorAnalytics,
  get_vendor_executive_summary: getVendorExecutiveSummary,
  agent_create_vendor: agentCreateVendor,
  agent_update_vendor: agentUpdateVendor,
  agent_delete_vendor: agentDeleteVendor,
  agent_create_vendor_risk: agentCreateVendorRisk,
  agent_update_vendor_risk: agentUpdateVendorRisk,
  agent_delete_vendor_risk: agentDeleteVendorRisk,
  agent_flag_vendor_for_review: agentFlagVendorForReview,
};

export { availableVendorTools };
