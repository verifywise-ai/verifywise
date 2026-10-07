import type { ActivityEntityType } from "../../components/ActivityItem/activityRoutes";

interface RecentRecord {
  id?: string | number;
  title?: string;
  name?: string;
  description?: string;
  incident_id?: string;
  last_updated_at?: string;
  updated_at?: string;
  created_at?: string;
  uploaded_at?: string;
  last_updated?: string;
}

interface RecentList {
  recent?: RecentRecord[] | null;
}

export interface RecentActivitySources {
  policyMetrics?: RecentList | null;
  incidentMetrics?: RecentList | null;
  riskMetrics?: RecentList | null;
  evidenceMetrics?: RecentList | null;
  vendorMetrics?: RecentList | null;
  vendorRiskMetrics?: RecentList | null;
  modelRiskMetrics?: RecentList | null;
  taskMetrics?: RecentList | null;
  useCaseMetrics?: RecentList | null;
  trainingMetrics?: RecentList | null;
}

export interface RecentActivityItem {
  id: string;
  title: string;
  timestamp: string;
  type: string;
  entityId: string | number;
  entityType: ActivityEntityType;
}

const RECENT_ACTIVITY_LIMIT = 5;

const incidentTitle = (incident: RecentRecord): string => {
  if (!incident.description) return incident.incident_id ?? "";
  return incident.description.length > 60
    ? `${incident.description.slice(0, 60)}...`
    : incident.description;
};

export function buildRecentActivities(sources: RecentActivitySources): RecentActivityItem[] {
  const allActivities: RecentActivityItem[] = [];

  const push = (
    records: RecentRecord[] | null | undefined,
    entityType: ActivityEntityType,
    type: string,
    titleOf: (record: RecentRecord) => string,
    timestampOf: (record: RecentRecord) => string | undefined,
  ) => {
    records?.forEach((record) => {
      if (record.id == null) return;
      const timestamp = timestampOf(record);
      if (!timestamp) return;
      allActivities.push({
        id: `${entityType}-${record.id}`,
        title: titleOf(record),
        timestamp,
        type,
        entityId: record.id,
        entityType,
      });
    });
  };

  push(
    sources.policyMetrics?.recent,
    "policy",
    "Policy",
    (policy) => policy.title ?? "",
    (policy) => policy.last_updated_at,
  );
  push(
    sources.incidentMetrics?.recent,
    "incident",
    "Incident",
    incidentTitle,
    (incident) => incident.updated_at || incident.created_at,
  );
  push(
    sources.riskMetrics?.recent,
    "risk",
    "Risk",
    (risk) => risk.title ?? "",
    (risk) => risk.updated_at || risk.created_at,
  );
  push(
    sources.evidenceMetrics?.recent,
    "evidence",
    "Evidence",
    (evidence) => evidence.title ?? "",
    (evidence) => evidence.updated_at || evidence.uploaded_at,
  );
  push(
    sources.vendorMetrics?.recent,
    "vendor",
    "Vendor",
    (vendor) => vendor.name ?? "",
    (vendor) => vendor.updated_at || vendor.created_at,
  );
  push(
    sources.vendorRiskMetrics?.recent,
    "vendorRisk",
    "Vendor risk",
    (vendorRisk) => vendorRisk.title ?? "",
    (vendorRisk) => vendorRisk.updated_at || vendorRisk.created_at,
  );
  push(
    sources.modelRiskMetrics?.recent,
    "modelRisk",
    "Model risk",
    (modelRisk) => modelRisk.title ?? "",
    (modelRisk) => modelRisk.updated_at || modelRisk.created_at,
  );
  push(
    sources.taskMetrics?.recent,
    "task",
    "Task",
    (task) => task.title ?? "",
    (task) => task.updated_at || task.created_at,
  );
  push(
    sources.useCaseMetrics?.recent,
    "useCase",
    "Use case",
    (useCase) => useCase.title ?? "",
    (useCase) => useCase.last_updated || useCase.created_at,
  );
  push(
    sources.trainingMetrics?.recent,
    "training",
    "Training",
    (training) => training.title ?? "",
    (training) => training.updated_at || training.created_at,
  );

  return allActivities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, RECENT_ACTIVITY_LIMIT);
}
