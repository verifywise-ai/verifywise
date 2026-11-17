/**
 * Who may create a share link for a resource type, and which columns a
 * public share link may ever show.
 */
import type { PermissionKey } from "../config/rolePermissions.config";

/** Creating or changing a link takes the edit permission of what it shares. */
const SHARE_PERMISSION: Record<string, PermissionKey> = {
  model: "model.edit",
  vendor: "vendor.edit",
  project: "useCase.edit",
  policy: "policy.edit",
  risk: "risks.edit",
};

export function sharePermissionFor(resourceType: string): PermissionKey | null {
  return Object.prototype.hasOwnProperty.call(SHARE_PERMISSION, resourceType)
    ? SHARE_PERMISSION[resourceType]
    : null;
}

/**
 * True when a share link update only turns the link off: `is_enabled: false`
 * and no other field it can change (settings, expires_at).
 */
export function isDisableOnlyUpdate(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const { is_enabled, settings, expires_at } = body as Record<string, unknown>;
  return is_enabled === false && settings === undefined && expires_at === undefined;
}

/**
 * The columns "Share all fields" shows, per resource type. Anything not
 * listed (organization ids, external keys, user ids, MRM internals, security
 * assessment files, workflow and demo flags, contact emails) is never sent
 * to a public viewer. A new column stays private until it is added here.
 */
const SHARED_FIELDS: Record<string, readonly string[]> = {
  model: [
    "id",
    "provider_model",
    "provider",
    "model",
    "version",
    // Replaced by the approver's name before the response is sent.
    "approver",
    "approver_name",
    "capabilities",
    "security_assessment",
    "status",
    "status_date",
    "type",
    "reference_link",
    "biases",
    "limitations",
    "hosting_provider",
    "intended_use",
    "created_at",
    "updated_at",
  ],
  vendor: [
    "id",
    "order_no",
    "vendor_name",
    "vendor_provides",
    "website",
    "vendor_contact_person",
    "review_result",
    "review_status",
    "review_date",
    "data_sensitivity",
    "business_criticality",
    "past_issues",
    "regulatory_exposure",
    "risk_score",
    "created_at",
    "updated_at",
  ],
  project: [
    "id",
    "uc_id",
    "project_title",
    "start_date",
    "ai_risk_classification",
    "goal",
    "target_industry",
    "description",
    "geography",
    "status",
    "use_case_category",
    "use_case_purpose",
    "use_case_audience",
    "deployment_context",
    "high_risk_roles",
    "type_of_high_risk_role",
    "lifecycle_stage",
    "go_live_date",
    "retired_at",
    "department",
    "created_at",
    "last_updated",
  ],
  policy: [
    "id",
    "title",
    "content_html",
    "status",
    "tags",
    "next_review_date",
    "review_status",
    "created_at",
    "last_updated_at",
  ],
  risk: [
    "id",
    "risk_name",
    "ai_lifecycle_phase",
    "risk_description",
    "risk_category",
    "impact",
    "likelihood",
    "severity",
    "risk_level_autocalculated",
    "mitigation_status",
    "current_risk_level",
    "deadline",
    "mitigation_plan",
    "implementation_strategy",
    "final_risk_level",
    "approval_status",
    "date_of_assessment",
    "created_at",
    "updated_at",
  ],
};

/** The record with only the columns a share link may show for its type. */
export function pickSharedFields(
  record: Record<string, unknown>,
  resourceType: string,
): Record<string, unknown> {
  const allowed = Object.prototype.hasOwnProperty.call(SHARED_FIELDS, resourceType)
    ? SHARED_FIELDS[resourceType]
    : [];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(record, key)) out[key] = record[key];
  }
  return out;
}

/**
 * A shared model record with its approver as a name. The approver's user id
 * is never sent: without a name (no approver, or a user without one) the
 * field is left out.
 */
export function withApproverName(record: Record<string, unknown>): Record<string, unknown> {
  const out = { ...record };
  const name = out.approver_name;
  delete out.approver_name;
  delete out.approver;
  if (typeof name === "string" && name.trim() !== "") out.approver = name;
  return out;
}
