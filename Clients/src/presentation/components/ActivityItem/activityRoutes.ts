/**
 * Deep links for dashboard recent-activity rows.
 * Destinations match the query params each page already reads
 * (Wise Search / notification rewrites), so the row opens the record.
 */

export const ACTIVITY_ENTITY_TYPES = [
  "policy",
  "incident",
  "risk",
  "evidence",
  "vendor",
  "vendorRisk",
  "modelRisk",
  "task",
  "useCase",
  "training",
] as const;

export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export interface ActivityLink {
  to: string;
  /** File manager opens a preview from navigation state, not a query param. */
  state?: { previewFileId: string | number };
}

const isActivityEntityType = (value: string): value is ActivityEntityType =>
  (ACTIVITY_ENTITY_TYPES as readonly string[]).includes(value);

export function getActivityLink(
  entityType: string | undefined,
  entityId: string | number | undefined,
): ActivityLink | null {
  if (!entityType || entityId == null || !isActivityEntityType(entityType)) return null;

  const id = String(entityId).trim();
  if (!id || id === "unknown") return null;

  const encoded = encodeURIComponent(id);

  switch (entityType) {
    case "useCase":
      return { to: `/project-view?projectId=${encoded}` };
    case "risk":
      return { to: `/risk-management?riskId=${encoded}` };
    case "task":
      return { to: `/tasks?taskId=${encoded}` };
    case "policy":
      return { to: `/policies/${encoded}/edit` };
    case "incident":
      return { to: `/ai-incident-managements?incidentId=${encoded}` };
    case "vendor":
      return { to: `/vendors?vendorId=${encoded}` };
    case "vendorRisk":
      return { to: `/vendors/risks?riskId=${encoded}` };
    case "training":
      return { to: `/training?trainingId=${encoded}` };
    case "modelRisk":
      return { to: `/model-inventory/model-risks?modelRiskId=${encoded}` };
    case "evidence":
      return { to: "/file-manager", state: { previewFileId: entityId } };
  }
}
