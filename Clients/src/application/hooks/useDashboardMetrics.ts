import { useEffect, useCallback, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { getAllEntities, getEntityById } from "../repository/entity.repository";
import type { ProgressStep } from "../../presentation/components/StepProgressDialog";
import { storageService, type DashboardMetricsCache } from "../../infrastructure/storage";

// Cache configuration — canonical namespaced key (migrated once from the old
// "dashboard_metrics_cache" via the StorageService legacy-key mechanism).
export const CACHE_KEY = "verifywise_dashboard_metrics_cache";
const CACHE_TTL_MS = 30 * 1000; // 30 seconds - data is considered fresh
const STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes - data can still be shown while revalidating

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface MetricsCache {
  riskMetrics?: CacheEntry<any>;
  evidenceMetrics?: CacheEntry<any>;
  vendorRiskMetrics?: CacheEntry<any>;
  vendorMetrics?: CacheEntry<any>;
  policyMetrics?: CacheEntry<any>;
  incidentMetrics?: CacheEntry<any>;
  modelRiskMetrics?: CacheEntry<any>;
  trainingMetrics?: CacheEntry<any>;
  policyStatusMetrics?: CacheEntry<any>;
  incidentStatusMetrics?: CacheEntry<any>;
  evidenceHubMetrics?: CacheEntry<any>;
  modelLifecycleMetrics?: CacheEntry<any>;
  organizationalFrameworks?: CacheEntry<any>;
  taskMetrics?: CacheEntry<any>;
  useCaseMetrics?: CacheEntry<any>;
  governanceScoreMetrics?: CacheEntry<any>;
}

// Cache utility functions — backed by the typed StorageService (JSON, SSR/sandbox
// safe). The "dashboardMetricsCache" registry entry owns the canonical key and the
// one-time legacy migration.
const getCache = (): MetricsCache => storageService.get("dashboardMetricsCache", {});

const setCache = (cache: MetricsCache): void => {
  storageService.set("dashboardMetricsCache", cache as DashboardMetricsCache);
};

const getCachedValue = <T>(
  key: keyof MetricsCache,
): { data: T | null; timestamp: number | null; isFresh: boolean; isStale: boolean } => {
  const cache = getCache();
  const entry = cache[key] as CacheEntry<T> | undefined;

  if (!entry) {
    return { data: null, timestamp: null, isFresh: false, isStale: false };
  }

  const age = Date.now() - entry.timestamp;
  const isFresh = age < CACHE_TTL_MS;
  const isStale = age < STALE_TTL_MS;

  return { data: entry.data, timestamp: entry.timestamp, isFresh, isStale };
};

const setCachedValue = <T>(key: keyof MetricsCache, data: T): void => {
  const cache = getCache();
  cache[key] = { data, timestamp: Date.now() };
  setCache(cache);
};

/**
 * Check if any cached dashboard metrics exist in localStorage.
 * Used by IntegratedDashboard to decide whether to show the progress dialog.
 */
export const hasDashboardCache = (): boolean => {
  return Object.keys(getCache()).length > 0;
};

// Types for the additional dashboard metrics
export interface RiskMetrics {
  total: number;
  distribution: {
    high: number;
    medium: number;
    low: number;
    resolved: number;
  };
  recent: Array<{
    id: number;
    title: string;
    severity: "high" | "medium" | "low";
    created_at: string;
    updated_at?: string;
    project_name: string;
  }>;
}

export interface EvidenceMetrics {
  total: number;
  recent: Array<{
    id: number;
    title: string;
    uploaded_at: string;
    updated_at?: string;
    project_name: string;
    user_name: string;
  }>;
}

export interface VendorRiskMetrics {
  total: number;
  distribution: {
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
    veryLow: number;
  };
  recent: Array<{
    id: number;
    title: string;
    severity: "high" | "medium" | "low";
    created_at: string;
    updated_at?: string;
    vendor_name: string;
  }>;
  statusDistribution?: Array<{ name: string; value: number; color: string }>;
}

export interface VendorMetrics {
  total: number;
  recent: Array<{
    id: number;
    name: string;
    created_at: string;
    updated_at?: string;
    status: string;
  }>;
  statusDistribution?: Array<{ name: string; value: number; color: string }>;
}

export interface PolicyMetrics {
  total: number;
  pendingReviewCount: number;
  recent: Array<{
    id: string;
    title: string;
    status: string;
    last_updated_at: string;
    author_id: number;
  }>;
  statusDistribution?: Array<{ name: string; value: number; color: string }>;
}

export interface IncidentMetrics {
  total: number;
  openCount: number;
  recent: Array<{
    id: number;
    incident_id: string;
    description: string;
    severity: string;
    status: string;
    created_at: string;
    updated_at?: string;
  }>;
  statusDistribution?: Array<{ name: string; value: number; color: string }>;
}

export interface ModelRiskMetrics {
  total: number;
  distribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recent: Array<{
    id: number;
    title: string;
    severity: "critical" | "high" | "medium" | "low";
    created_at: string;
    updated_at?: string;
    model_name?: string;
  }>;
}

export interface TrainingMetrics {
  total: number;
  distribution: {
    planned: number;
    inProgress: number;
    completed: number;
  };
  completionPercentage: number;
  totalPeople: number;
  recent: Array<{
    id: number;
    title: string;
    status: string;
    created_at: string;
    updated_at?: string;
  }>;
}

export interface TaskMetrics {
  total: number;
  recent: Array<{
    id: number;
    title: string;
    status: string;
    priority: string;
    created_at: string;
    updated_at?: string;
  }>;
}

export interface UseCaseMetrics {
  total: number;
  recent: Array<{
    id: number;
    title: string;
    status: string;
    created_at: string;
    last_updated?: string;
  }>;
}

export interface GovernanceScoreMetrics {
  score: number;
  modules: Array<{
    name: string;
    score: number;
    weight: number;
  }>;
  calculatedAt?: string;
}

export interface PolicyStatusMetrics {
  total: number;
  distribution: {
    draft: number;
    underReview: number;
    approved: number;
    published: number;
    archived: number;
    deprecated: number;
  };
}

export interface IncidentStatusMetrics {
  total: number;
  distribution: {
    open: number;
    investigating: number;
    mitigated: number;
    closed: number;
  };
}

export interface EvidenceHubMetrics {
  total: number;
  totalFiles: number;
  modelsWithEvidence: number;
  totalModels: number;
  coveragePercentage: number;
}

export interface ModelLifecycleMetrics {
  total: number;
  distribution: {
    pending: number;
    approved: number;
    restricted: number;
    blocked: number;
  };
}

// Organizational Framework data structure (matches StatusBreakdownCard)
export interface OrganizationalFrameworkData {
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
  clauseProgress?: {
    totalSubclauses: number;
    doneSubclauses: number;
  };
  annexProgress?: {
    totalAnnexControls?: number;
    doneAnnexControls?: number;
    totalAnnexcategories?: number;
    doneAnnexcategories?: number;
  };
  nistStatusBreakdown?: {
    notStarted: number;
    draft: number;
    inProgress: number;
    awaitingReview: number;
    awaitingApproval: number;
    implemented: number;
    needsRework: number;
  };
}

// Progress step definitions for loading dialog
const PROGRESS_STEPS: ProgressStep[] = [
  { label: "Loading risks and evidence...", progress: 15 },
  { label: "Loading vendors, policies, and incidents...", progress: 40 },
  { label: "Loading models and training data...", progress: 60 },
  { label: "Loading compliance frameworks...", progress: 80 },
  { label: "Calculating governance scores...", progress: 100 },
];

// ---------------------------------------------------------------------------
// React Query keys — single namespace for dashboard metrics
// ---------------------------------------------------------------------------
const DASHBOARD_KEYS = {
  all: ["dashboard"] as const,
  risk: ["dashboard", "risk"] as const,
  evidence: ["dashboard", "evidence"] as const,
  vendorRisk: ["dashboard", "vendorRisk"] as const,
  vendor: ["dashboard", "vendor"] as const,
  policy: ["dashboard", "policy"] as const,
  incident: ["dashboard", "incident"] as const,
  modelRisk: ["dashboard", "modelRisk"] as const,
  training: ["dashboard", "training"] as const,
  model: ["dashboard", "model"] as const,
  project: ["dashboard", "project"] as const,
  governanceScore: ["dashboard", "governanceScore"] as const,
  task: ["dashboard", "task"] as const,
};

// ---------------------------------------------------------------------------
// Pure query functions — no React state or localStorage side effects
// ---------------------------------------------------------------------------

const queryRiskMetrics = async (): Promise<RiskMetrics> => {
  const response = await getAllEntities({ routeUrl: "/projectRisks" });
  const risksData = response.data || [];
  const risksArray = Array.isArray(risksData) ? risksData : [];

  const distribution = { high: 0, medium: 0, low: 0, resolved: 0 };

  risksArray.forEach((risk: any) => {
    const riskLevel = (
      risk.current_risk_level ||
      risk.risk_level_autocalculated ||
      ""
    ).toLowerCase();

    if (risk.mitigation_status === "Completed") {
      distribution.resolved++;
    } else if (
      riskLevel.includes("high") ||
      riskLevel.includes("very high") ||
      riskLevel.includes("critical")
    ) {
      distribution.high++;
    } else if (riskLevel.includes("medium") || riskLevel.includes("moderate")) {
      distribution.medium++;
    } else if (
      riskLevel.includes("low") ||
      riskLevel.includes("very low") ||
      riskLevel.includes("no risk") ||
      riskLevel.includes("negligible")
    ) {
      distribution.low++;
    } else {
      distribution.medium++;
    }
  });

  return {
    total: risksArray.length,
    distribution,
    recent: risksArray.slice(0, 5).map((risk: any, index: number) => ({
      id: risk.id || index + 1,
      title: risk.risk_name || "Untitled Risk",
      severity: (risk.current_risk_level || risk.risk_level_autocalculated || "medium")
        .toLowerCase()
        .includes("high")
        ? ("high" as const)
        : (risk.current_risk_level || risk.risk_level_autocalculated || "medium")
              .toLowerCase()
              .includes("low")
          ? ("low" as const)
          : ("medium" as const),
      created_at: risk.created_at || risk.createdAt || risk.date_of_assessment,
      project_name: risk.project_name || "General",
    })),
  };
};

const queryEvidenceMetrics = async (): Promise<EvidenceMetrics> => {
  const response = await getAllEntities({ routeUrl: "/files" });
  const filesData = response.data || response.files || response;
  const filesArray = Array.isArray(filesData) ? filesData : [];

  return {
    total: filesArray.length,
    recent: filesArray.slice(0, 5).map((file: any, index: number) => ({
      id: file.id || index + 1,
      title: file.filename || file.name || "Evidence File",
      uploaded_at: file.uploaded_time || file.created_at || file.updated_at,
      project_name: file.project_title || file.project_name || "General",
      user_name: `${file.uploader_name || ""} ${file.uploader_surname || ""}`.trim() || "System",
    })),
  };
};

const queryVendorRiskMetrics = async (): Promise<VendorRiskMetrics> => {
  const response = await getAllEntities({ routeUrl: "/vendorRisks/all" });
  const risksData = response.data || [];
  const risksArray = Array.isArray(risksData) ? risksData : [];

  const distribution = { veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 };

  risksArray.forEach((risk: any) => {
    const riskLevel = (risk.risk_level || "").toLowerCase().replace(" risk", "").trim();

    if (riskLevel === "very high" || riskLevel === "veryhigh") {
      distribution.veryHigh++;
    } else if (riskLevel === "high") {
      distribution.high++;
    } else if (riskLevel === "medium" || riskLevel === "moderate") {
      distribution.medium++;
    } else if (riskLevel === "low") {
      distribution.low++;
    } else if (riskLevel === "very low" || riskLevel === "verylow") {
      distribution.veryLow++;
    } else {
      distribution.medium++;
    }
  });

  return {
    total: risksArray.length,
    distribution,
    recent: risksArray.slice(0, 5).map((risk: any, index: number) => ({
      id: risk.id || index + 1,
      title: risk.risk_name || risk.title || "Vendor Risk",
      severity: risk.risk_level?.toLowerCase().replace(" risk", "") || "medium",
      created_at: risk.review_date || risk.created_at || risk.createdAt,
      vendor_name: risk.vendor_name || "Unknown Vendor",
    })),
  };
};

const queryVendorMetrics = async (): Promise<VendorMetrics> => {
  const response = await getAllEntities({ routeUrl: "/vendors" });
  const vendorsData = response.data || response.vendors || response;
  const vendorsArray = Array.isArray(vendorsData) ? vendorsData : [];

  return {
    total: vendorsArray.length,
    recent: vendorsArray.slice(0, 5).map((vendor: any, index: number) => ({
      id: vendor.id || index + 1,
      name: vendor.name || vendor.vendor_name || vendor.company_name || "Unknown Vendor",
      created_at: vendor.created_at || vendor.createdAt,
      status: vendor.status || vendor.vendor_status || "Active",
    })),
  };
};

interface PolicyQueryResult {
  policyMetrics: PolicyMetrics;
  policyStatusMetrics: PolicyStatusMetrics;
}

const queryPolicyMetrics = async (): Promise<PolicyQueryResult> => {
  const response = await getAllEntities({ routeUrl: "/policies" });
  const policiesData = response.data?.data || response.data || response.policies || response;
  const policiesArray = Array.isArray(policiesData) ? policiesData : [];

  const pendingReviewCount = policiesArray.filter(
    (policy: any) => policy.status === "pending_review",
  ).length;

  const policyMetrics: PolicyMetrics = {
    total: policiesArray.length,
    pendingReviewCount,
    recent: policiesArray.slice(0, 5).map((policy: any) => ({
      id: policy.id || "unknown",
      title: policy.title || "Untitled Policy",
      status: policy.status || "unknown",
      last_updated_at: policy.last_updated_at || policy.updated_at || policy.updatedAt,
      author_id: policy.author_id || 0,
    })),
  };

  const statusDistribution = {
    draft: 0,
    underReview: 0,
    approved: 0,
    published: 0,
    archived: 0,
    deprecated: 0,
  };

  policiesArray.forEach((policy: any) => {
    const status = (policy.status || "").toLowerCase().replace(/\s+/g, "");

    if (status === "draft") {
      statusDistribution.draft++;
    } else if (
      status === "underreview" ||
      status === "under_review" ||
      status === "pending_review"
    ) {
      statusDistribution.underReview++;
    } else if (status === "approved") {
      statusDistribution.approved++;
    } else if (status === "published") {
      statusDistribution.published++;
    } else if (status === "archived") {
      statusDistribution.archived++;
    } else if (status === "deprecated") {
      statusDistribution.deprecated++;
    } else {
      statusDistribution.draft++;
    }
  });

  const policyStatusMetrics: PolicyStatusMetrics = {
    total: policiesArray.length,
    distribution: statusDistribution,
  };

  return { policyMetrics, policyStatusMetrics };
};

interface IncidentQueryResult {
  incidentMetrics: IncidentMetrics;
  incidentStatusMetrics: IncidentStatusMetrics;
}

const queryIncidentMetrics = async (): Promise<IncidentQueryResult> => {
  const response = await getAllEntities({ routeUrl: "/ai-incident-managements" });
  const incidentsData = response.data || response.incidents || response;
  const incidentsArray = Array.isArray(incidentsData) ? incidentsData : [];

  const openCount = incidentsArray.filter((incident: any) => incident.status === "Open").length;

  const incidentMetrics: IncidentMetrics = {
    total: incidentsArray.length,
    openCount,
    recent: incidentsArray.slice(0, 5).map((incident: any, index: number) => ({
      id: incident.id || index + 1,
      incident_id: incident.incident_id || `INC-${index + 1}`,
      description: incident.description || incident.title || "Incident",
      severity: incident.severity || "Unknown",
      status: incident.status || "Unknown",
      created_at: incident.created_at || incident.createdAt,
      updated_at: incident.updated_at || incident.updatedAt,
    })),
  };

  const statusDistribution = { open: 0, investigating: 0, mitigated: 0, closed: 0 };

  incidentsArray.forEach((incident: any) => {
    const status = (incident.status || "").toLowerCase();

    if (status === "open") {
      statusDistribution.open++;
    } else if (status === "investigating") {
      statusDistribution.investigating++;
    } else if (status === "mitigated") {
      statusDistribution.mitigated++;
    } else if (status === "closed") {
      statusDistribution.closed++;
    } else {
      statusDistribution.open++;
    }
  });

  const incidentStatusMetrics: IncidentStatusMetrics = {
    total: incidentsArray.length,
    distribution: statusDistribution,
  };

  return { incidentMetrics, incidentStatusMetrics };
};

const queryModelRiskMetrics = async (): Promise<ModelRiskMetrics> => {
  const response = await getAllEntities({ routeUrl: "/modelRisks" });
  const modelRisksData = response.data || response;
  const modelRisksArray = Array.isArray(modelRisksData) ? modelRisksData : [];

  const distribution = { critical: 0, high: 0, medium: 0, low: 0 };

  modelRisksArray.forEach((risk: any) => {
    const riskLevel = (risk.risk_level || "").toLowerCase();

    if (riskLevel === "critical") {
      distribution.critical++;
    } else if (riskLevel === "high") {
      distribution.high++;
    } else if (riskLevel === "medium") {
      distribution.medium++;
    } else if (riskLevel === "low") {
      distribution.low++;
    } else {
      distribution.medium++;
    }
  });

  return {
    total: modelRisksArray.length,
    distribution,
    recent: modelRisksArray.slice(0, 5).map((risk: any, index: number) => ({
      id: risk.id || index + 1,
      title: risk.risk_name || "Untitled Risk",
      severity: (risk.risk_level || "medium").toLowerCase() as
        | "critical"
        | "high"
        | "medium"
        | "low",
      created_at: risk.created_at || risk.createdAt,
      model_name: risk.model_name || undefined,
    })),
  };
};

const queryTrainingMetrics = async (): Promise<TrainingMetrics> => {
  const response = await getAllEntities({ routeUrl: "/training" });
  const trainingsData = response.data || response;
  const trainingsArray = Array.isArray(trainingsData) ? trainingsData : [];

  const distribution = { planned: 0, inProgress: 0, completed: 0 };
  let totalPeople = 0;

  trainingsArray.forEach((training: any) => {
    const status = (training.status || "").toLowerCase().trim();
    totalPeople += training.numberOfPeople || training.people || 0;

    if (status === "planned") {
      distribution.planned++;
    } else if (status === "in progress" || status === "inprogress") {
      distribution.inProgress++;
    } else if (status === "completed") {
      distribution.completed++;
    } else {
      distribution.planned++;
    }
  });

  const total = trainingsArray.length;
  const completionPercentage = total > 0 ? Math.round((distribution.completed / total) * 100) : 0;

  return {
    total,
    distribution,
    completionPercentage,
    totalPeople,
    recent: trainingsArray
      .filter((training: any) => training.created_at || training.createdAt)
      .slice(0, 5)
      .map((training: any, index: number) => ({
        id: training.id || index + 1,
        title: training.training_name || training.name || "Untitled Training",
        status: training.status || "Planned",
        created_at: training.created_at || training.createdAt,
      })),
  };
};

interface ModelQueryResult {
  evidenceHubMetrics: EvidenceHubMetrics;
  modelLifecycleMetrics: ModelLifecycleMetrics;
}

const queryModelMetrics = async (): Promise<ModelQueryResult> => {
  const [evidenceResponse, modelsResponse] = await Promise.all([
    getAllEntities({ routeUrl: "/evidenceHub" }),
    getAllEntities({ routeUrl: "/modelInventory" }),
  ]);

  const modelsData = modelsResponse.data || modelsResponse;
  const modelsArray = Array.isArray(modelsData) ? modelsData : [];

  const evidenceData = evidenceResponse.data || evidenceResponse;
  const evidenceArray = Array.isArray(evidenceData) ? evidenceData : [];

  let totalFiles = 0;
  const modelsWithEvidence = new Set<number>();

  evidenceArray.forEach((evidence: any) => {
    const files = evidence.evidence_files || [];
    totalFiles += files.length;
    const mappedModels = evidence.mapped_model_ids || [];
    mappedModels.forEach((modelId: number) => modelsWithEvidence.add(modelId));
  });

  const totalModels = modelsArray.length;
  const coveragePercentage =
    totalModels > 0 ? Math.round((modelsWithEvidence.size / totalModels) * 100) : 0;

  const evidenceHubMetrics: EvidenceHubMetrics = {
    total: evidenceArray.length,
    totalFiles,
    modelsWithEvidence: modelsWithEvidence.size,
    totalModels,
    coveragePercentage,
  };

  const distribution = { pending: 0, approved: 0, restricted: 0, blocked: 0 };

  modelsArray.forEach((model: any) => {
    const status = (model.status || "").toLowerCase();

    if (status === "pending") {
      distribution.pending++;
    } else if (status === "approved") {
      distribution.approved++;
    } else if (status === "restricted") {
      distribution.restricted++;
    } else if (status === "blocked") {
      distribution.blocked++;
    } else {
      distribution.pending++;
    }
  });

  const modelLifecycleMetrics: ModelLifecycleMetrics = {
    total: modelsArray.length,
    distribution,
  };

  return { evidenceHubMetrics, modelLifecycleMetrics };
};

interface ProjectQueryResult {
  useCaseMetrics: UseCaseMetrics;
  organizationalFrameworks: OrganizationalFrameworkData[];
}

const queryProjectMetrics = async (): Promise<ProjectQueryResult> => {
  const projectsResponse = await getAllEntities({ routeUrl: "/projects" });
  const projectsData = projectsResponse.data || projectsResponse;
  const projectsArray = Array.isArray(projectsData) ? projectsData : [];

  const useCases = projectsArray.filter((project: any) => !project.is_organizational);

  const useCaseMetrics: UseCaseMetrics = {
    total: useCases.length,
    recent: useCases
      .filter((project: any) => project.created_at || project.createdAt || project.last_updated)
      .sort((a: any, b: any) => {
        const dateA = new Date(a.last_updated || a.created_at || a.createdAt);
        const dateB = new Date(b.last_updated || b.created_at || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5)
      .map((project: any, index: number) => ({
        id: project.id || index + 1,
        title: project.project_title || project.name || "Untitled Use Case",
        status: project.status || "Active",
        created_at: project.created_at || project.createdAt,
        last_updated: project.last_updated,
      })),
  };

  const orgProject = projectsArray.find((p: any) => p.is_organizational === true);
  if (!orgProject || !orgProject.framework || orgProject.framework.length === 0) {
    return { useCaseMetrics, organizationalFrameworks: [] };
  }

  const frameworksResponse = await getAllEntities({ routeUrl: "/frameworks" });
  const allFrameworks = frameworksResponse.data || frameworksResponse || [];

  const frameworkPromises = orgProject.framework.map(async (projectFramework: any) => {
    const frameworkId = Number(projectFramework.framework_id);
    const projectFrameworkId = projectFramework.project_framework_id || frameworkId;

    const frameworkInfo = allFrameworks.find((f: any) => Number(f.id) === frameworkId);
    if (!frameworkInfo) return null;

    const frameworkName = frameworkInfo.name || `Framework ${frameworkId}`;
    const isISO27001 = frameworkName.toLowerCase().includes("iso 27001");
    const isISO42001 = frameworkName.toLowerCase().includes("iso 42001");
    const isNISTAIRMF = frameworkName.toLowerCase().includes("nist ai rmf");

    const data: OrganizationalFrameworkData = {
      frameworkId,
      frameworkName,
      projectFrameworkId,
    };

    if (isNISTAIRMF) {
      try {
        const statusRes = await getEntityById({ routeUrl: `/nist-ai-rmf/status-breakdown` });
        if (statusRes?.data) {
          data.nistStatusBreakdown = {
            notStarted: statusRes.data.notStarted || 0,
            draft: statusRes.data.draft || 0,
            inProgress: statusRes.data.inProgress || 0,
            awaitingReview: statusRes.data.awaitingReview || 0,
            awaitingApproval: statusRes.data.awaitingApproval || 0,
            implemented: statusRes.data.implemented || 0,
            needsRework: statusRes.data.needsRework || 0,
          };
        }
      } catch {
        // NIST status fetch failed, skip
      }
    } else if (isISO27001) {
      const [clauseRes, annexRes] = await Promise.allSettled([
        getEntityById({ routeUrl: `/iso-27001/clauses/progress/${projectFrameworkId}` }),
        getEntityById({ routeUrl: `/iso-27001/annexes/progress/${projectFrameworkId}` }),
      ]);

      if (clauseRes.status === "fulfilled" && clauseRes.value?.data) {
        data.clauseProgress = {
          totalSubclauses: clauseRes.value.data.totalSubclauses || 0,
          doneSubclauses: clauseRes.value.data.doneSubclauses || 0,
        };
      } else {
        data.clauseProgress = { totalSubclauses: 0, doneSubclauses: 0 };
      }

      if (annexRes.status === "fulfilled" && annexRes.value?.data) {
        data.annexProgress = {
          totalAnnexControls: annexRes.value.data.totalAnnexControls || 0,
          doneAnnexControls: annexRes.value.data.doneAnnexControls || 0,
        };
      } else {
        data.annexProgress = { totalAnnexControls: 0, doneAnnexControls: 0 };
      }
    } else if (isISO42001) {
      const [clauseRes, annexRes] = await Promise.allSettled([
        getEntityById({ routeUrl: `/iso-42001/clauses/progress/${projectFrameworkId}` }),
        getEntityById({ routeUrl: `/iso-42001/annexes/progress/${projectFrameworkId}` }),
      ]);

      if (clauseRes.status === "fulfilled" && clauseRes.value?.data) {
        data.clauseProgress = {
          totalSubclauses: clauseRes.value.data.totalSubclauses || 0,
          doneSubclauses: clauseRes.value.data.doneSubclauses || 0,
        };
      } else {
        data.clauseProgress = { totalSubclauses: 0, doneSubclauses: 0 };
      }

      if (annexRes.status === "fulfilled" && annexRes.value?.data) {
        data.annexProgress = {
          totalAnnexcategories: annexRes.value.data.totalAnnexcategories || 0,
          doneAnnexcategories: annexRes.value.data.doneAnnexcategories || 0,
        };
      } else {
        data.annexProgress = { totalAnnexcategories: 0, doneAnnexcategories: 0 };
      }
    }

    return data;
  });

  const frameworkResults = await Promise.all(frameworkPromises);
  const frameworksData = frameworkResults.filter(Boolean) as OrganizationalFrameworkData[];

  frameworksData.sort((a, b) => {
    const aIsISO42001 = a.frameworkName.toLowerCase().includes("iso 42001");
    const bIsISO42001 = b.frameworkName.toLowerCase().includes("iso 42001");
    const aIsNIST = a.frameworkName.toLowerCase().includes("nist");
    const bIsNIST = b.frameworkName.toLowerCase().includes("nist");

    if (aIsISO42001 && !bIsISO42001) return -1;
    if (!aIsISO42001 && bIsISO42001) return 1;
    if (aIsNIST && !bIsNIST) return 1;
    if (!aIsNIST && bIsNIST) return -1;
    return 0;
  });

  return { useCaseMetrics, organizationalFrameworks: frameworksData };
};

const queryGovernanceScoreMetrics = async (): Promise<GovernanceScoreMetrics> => {
  const response = await getAllEntities({ routeUrl: "/compliance/score" });
  const data = response.data || response;

  if (data && typeof data.overallScore === "number") {
    const modules = data.modules || {};
    return {
      score: data.overallScore,
      modules: [
        {
          name: "Risk management",
          score: modules.riskManagement?.score || 0,
          weight: modules.riskManagement?.weight || 0.3,
        },
        {
          name: "Vendor management",
          score: modules.vendorManagement?.score || 0,
          weight: modules.vendorManagement?.weight || 0.3,
        },
        {
          name: "Project governance",
          score: modules.projectGovernance?.score || 0,
          weight: modules.projectGovernance?.weight || 0.25,
        },
        {
          name: "Model lifecycle",
          score: modules.modelLifecycle?.score || 0,
          weight: modules.modelLifecycle?.weight || 0.1,
        },
        {
          name: "Policy & documentation",
          score: modules.policyDocumentation?.score || 0,
          weight: modules.policyDocumentation?.weight || 0.05,
        },
      ],
      calculatedAt: data.calculatedAt,
    };
  }

  return {
    score: 0,
    modules: [
      { name: "Risk management", score: 0, weight: 0.3 },
      { name: "Vendor management", score: 0, weight: 0.3 },
      { name: "Project governance", score: 0, weight: 0.25 },
      { name: "Model lifecycle", score: 0, weight: 0.1 },
      { name: "Policy & documentation", score: 0, weight: 0.05 },
    ],
  };
};

const queryTaskMetrics = async (): Promise<TaskMetrics> => {
  const response = await getAllEntities({ routeUrl: "/tasks" });
  const tasksData = response.data || response;
  const tasksArray = Array.isArray(tasksData) ? tasksData : [];

  return {
    total: tasksArray.length,
    recent: tasksArray
      .filter((task: any) => task.created_at || task.createdAt)
      .slice(0, 5)
      .map((task: any, index: number) => ({
        id: task.id || index + 1,
        title: task.title || "Untitled Task",
        status: task.status || "Open",
        priority: task.priority || "Medium",
        created_at: task.created_at || task.createdAt,
      })),
  };
};

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

const getInitialDataAndUpdatedAt = <T>(key: keyof MetricsCache) => {
  const cached = getCachedValue<T>(key);
  return {
    initialData: cached.data ?? undefined,
    initialDataUpdatedAt: cached.timestamp ?? undefined,
  };
};

export const useDashboardMetrics = () => {
  const queryClient = useQueryClient();

  // Errors are handled per-query by returning fallback/default metric values,
  // matching the original hook behavior where `error` was rarely surfaced.
  const error = null;

  // React Query manages parallel fetching, deduplication, retries, and cache
  // freshness. Each query is seeded from localStorage so fresh cached data
  // avoids a network round-trip on mount.
  const [
    riskQuery,
    evidenceQuery,
    vendorRiskQuery,
    vendorQuery,
    policyQuery,
    incidentQuery,
    modelRiskQuery,
    trainingQuery,
    modelQuery,
    projectQuery,
    governanceScoreQuery,
    taskQuery,
  ] = useQueries({
    queries: [
      {
        queryKey: DASHBOARD_KEYS.risk,
        queryFn: queryRiskMetrics,
        ...getInitialDataAndUpdatedAt<RiskMetrics>("riskMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.evidence,
        queryFn: queryEvidenceMetrics,
        ...getInitialDataAndUpdatedAt<EvidenceMetrics>("evidenceMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.vendorRisk,
        queryFn: queryVendorRiskMetrics,
        ...getInitialDataAndUpdatedAt<VendorRiskMetrics>("vendorRiskMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.vendor,
        queryFn: queryVendorMetrics,
        ...getInitialDataAndUpdatedAt<VendorMetrics>("vendorMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.policy,
        queryFn: queryPolicyMetrics,
        ...getInitialDataAndUpdatedAt<PolicyQueryResult>("policyMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.incident,
        queryFn: queryIncidentMetrics,
        ...getInitialDataAndUpdatedAt<IncidentQueryResult>("incidentMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.modelRisk,
        queryFn: queryModelRiskMetrics,
        ...getInitialDataAndUpdatedAt<ModelRiskMetrics>("modelRiskMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.training,
        queryFn: queryTrainingMetrics,
        ...getInitialDataAndUpdatedAt<TrainingMetrics>("trainingMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.model,
        queryFn: queryModelMetrics,
        ...getInitialDataAndUpdatedAt<ModelQueryResult>("evidenceHubMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.project,
        queryFn: queryProjectMetrics,
        ...getInitialDataAndUpdatedAt<ProjectQueryResult>("useCaseMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.governanceScore,
        queryFn: queryGovernanceScoreMetrics,
        ...getInitialDataAndUpdatedAt<GovernanceScoreMetrics>("governanceScoreMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: DASHBOARD_KEYS.task,
        queryFn: queryTaskMetrics,
        ...getInitialDataAndUpdatedAt<TaskMetrics>("taskMetrics"),
        staleTime: CACHE_TTL_MS,
        refetchOnWindowFocus: false,
      },
    ],
  });

  // Derived metric values (fall back to null when a query has not yet succeeded)
  const riskMetrics = useMemo(
    () =>
      riskQuery.data ??
      getCachedValue<RiskMetrics>("riskMetrics").data ?? {
        total: 0,
        distribution: { high: 0, medium: 0, low: 0, resolved: 0 },
        recent: [],
      },
    [riskQuery.data],
  );

  const evidenceMetrics = useMemo(
    () => evidenceQuery.data ?? getCachedValue<EvidenceMetrics>("evidenceMetrics").data,
    [evidenceQuery.data],
  );

  const vendorRiskMetrics = useMemo(
    () =>
      vendorRiskQuery.data ??
      getCachedValue<VendorRiskMetrics>("vendorRiskMetrics").data ?? {
        total: 0,
        distribution: { veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 },
        recent: [],
      },
    [vendorRiskQuery.data],
  );

  const vendorMetrics = useMemo(
    () =>
      vendorQuery.data ??
      getCachedValue<VendorMetrics>("vendorMetrics").data ?? {
        total: 0,
        recent: [],
      },
    [vendorQuery.data],
  );

  const policyMetrics = useMemo(
    () =>
      policyQuery.data?.policyMetrics ??
      getCachedValue<PolicyMetrics>("policyMetrics").data ?? {
        total: 0,
        pendingReviewCount: 0,
        recent: [],
      },
    [policyQuery.data],
  );

  const policyStatusMetrics = useMemo(
    () =>
      policyQuery.data?.policyStatusMetrics ??
      getCachedValue<PolicyStatusMetrics>("policyStatusMetrics").data ?? {
        total: 0,
        distribution: {
          draft: 0,
          underReview: 0,
          approved: 0,
          published: 0,
          archived: 0,
          deprecated: 0,
        },
      },
    [policyQuery.data],
  );

  const incidentMetrics = useMemo(
    () =>
      incidentQuery.data?.incidentMetrics ??
      getCachedValue<IncidentMetrics>("incidentMetrics").data ?? {
        total: 0,
        openCount: 0,
        recent: [],
      },
    [incidentQuery.data],
  );

  const incidentStatusMetrics = useMemo(
    () =>
      incidentQuery.data?.incidentStatusMetrics ??
      getCachedValue<IncidentStatusMetrics>("incidentStatusMetrics").data ?? {
        total: 0,
        distribution: { open: 0, investigating: 0, mitigated: 0, closed: 0 },
      },
    [incidentQuery.data],
  );

  const modelRiskMetrics = useMemo(
    () =>
      modelRiskQuery.data ??
      getCachedValue<ModelRiskMetrics>("modelRiskMetrics").data ?? {
        total: 0,
        distribution: { critical: 0, high: 0, medium: 0, low: 0 },
        recent: [],
      },
    [modelRiskQuery.data],
  );

  const trainingMetrics = useMemo(
    () =>
      trainingQuery.data ??
      getCachedValue<TrainingMetrics>("trainingMetrics").data ?? {
        total: 0,
        distribution: { planned: 0, inProgress: 0, completed: 0 },
        completionPercentage: 0,
        totalPeople: 0,
        recent: [],
      },
    [trainingQuery.data],
  );

  const evidenceHubMetrics = useMemo(
    () =>
      modelQuery.data?.evidenceHubMetrics ??
      getCachedValue<EvidenceHubMetrics>("evidenceHubMetrics").data ?? {
        total: 0,
        totalFiles: 0,
        modelsWithEvidence: 0,
        totalModels: 0,
        coveragePercentage: 0,
      },
    [modelQuery.data],
  );

  const modelLifecycleMetrics = useMemo(
    () =>
      modelQuery.data?.modelLifecycleMetrics ??
      getCachedValue<ModelLifecycleMetrics>("modelLifecycleMetrics").data ?? {
        total: 0,
        distribution: { pending: 0, approved: 0, restricted: 0, blocked: 0 },
      },
    [modelQuery.data],
  );

  const useCaseMetrics = useMemo(
    () =>
      projectQuery.data?.useCaseMetrics ??
      getCachedValue<UseCaseMetrics>("useCaseMetrics").data ?? {
        total: 0,
        recent: [],
      },
    [projectQuery.data],
  );

  const organizationalFrameworks = useMemo(
    () =>
      projectQuery.data?.organizationalFrameworks ??
      getCachedValue<OrganizationalFrameworkData[]>("organizationalFrameworks").data ??
      [],
    [projectQuery.data],
  );

  const governanceScoreMetrics = useMemo(
    () =>
      governanceScoreQuery.data ??
      getCachedValue<GovernanceScoreMetrics>("governanceScoreMetrics").data ?? {
        score: 0,
        modules: [
          { name: "Risk management", score: 0, weight: 0.3 },
          { name: "Vendor management", score: 0, weight: 0.3 },
          { name: "Project governance", score: 0, weight: 0.25 },
          { name: "Model lifecycle", score: 0, weight: 0.1 },
          { name: "Policy & documentation", score: 0, weight: 0.05 },
        ],
      },
    [governanceScoreQuery.data],
  );

  const taskMetrics = useMemo(
    () =>
      taskQuery.data ??
      getCachedValue<TaskMetrics>("taskMetrics").data ?? {
        total: 0,
        recent: [],
      },
    [taskQuery.data],
  );

  // Group queries to preserve the 5-stage progress semantics
  const group0Done = riskQuery.isSuccess && evidenceQuery.isSuccess;
  const group1Done =
    vendorRiskQuery.isSuccess &&
    vendorQuery.isSuccess &&
    policyQuery.isSuccess &&
    incidentQuery.isSuccess;
  const group2Done = modelRiskQuery.isSuccess && trainingQuery.isSuccess && modelQuery.isSuccess;
  const group3Done = projectQuery.isSuccess;
  const group4Done = governanceScoreQuery.isSuccess && taskQuery.isSuccess;

  const progressStep = useMemo(() => {
    const groupDone = [group0Done, group1Done, group2Done, group3Done, group4Done];
    let completedPrefix = 0;
    while (completedPrefix < groupDone.length && groupDone[completedPrefix]) {
      completedPrefix += 1;
    }
    return completedPrefix;
  }, [group0Done, group1Done, group2Done, group3Done, group4Done]);

  const loading =
    riskQuery.isLoading ||
    evidenceQuery.isLoading ||
    vendorRiskQuery.isLoading ||
    vendorQuery.isLoading ||
    policyQuery.isLoading ||
    incidentQuery.isLoading ||
    modelRiskQuery.isLoading ||
    trainingQuery.isLoading ||
    modelQuery.isLoading ||
    projectQuery.isLoading ||
    governanceScoreQuery.isLoading ||
    taskQuery.isLoading;

  const isRevalidating =
    (riskQuery.isFetching && riskQuery.isFetched) ||
    (evidenceQuery.isFetching && evidenceQuery.isFetched) ||
    (vendorRiskQuery.isFetching && vendorRiskQuery.isFetched) ||
    (vendorQuery.isFetching && vendorQuery.isFetched) ||
    (policyQuery.isFetching && policyQuery.isFetched) ||
    (incidentQuery.isFetching && incidentQuery.isFetched) ||
    (modelRiskQuery.isFetching && modelRiskQuery.isFetched) ||
    (trainingQuery.isFetching && trainingQuery.isFetched) ||
    (modelQuery.isFetching && modelQuery.isFetched) ||
    (projectQuery.isFetching && projectQuery.isFetched) ||
    (governanceScoreQuery.isFetching && governanceScoreQuery.isFetched) ||
    (taskQuery.isFetching && taskQuery.isFetched);

  // Persist successful query data back to localStorage so the legacy cache
  // helpers (used by IntegratedDashboard etc.) continue to work.
  useEffect(() => {
    if (riskQuery.data) setCachedValue("riskMetrics", riskQuery.data);
  }, [riskQuery.data]);
  useEffect(() => {
    if (evidenceQuery.data) setCachedValue("evidenceMetrics", evidenceQuery.data);
  }, [evidenceQuery.data]);
  useEffect(() => {
    if (vendorRiskQuery.data) setCachedValue("vendorRiskMetrics", vendorRiskQuery.data);
  }, [vendorRiskQuery.data]);
  useEffect(() => {
    if (vendorQuery.data) setCachedValue("vendorMetrics", vendorQuery.data);
  }, [vendorQuery.data]);
  useEffect(() => {
    if (policyQuery.data) {
      setCachedValue("policyMetrics", policyQuery.data.policyMetrics);
      setCachedValue("policyStatusMetrics", policyQuery.data.policyStatusMetrics);
    }
  }, [policyQuery.data]);
  useEffect(() => {
    if (incidentQuery.data) {
      setCachedValue("incidentMetrics", incidentQuery.data.incidentMetrics);
      setCachedValue("incidentStatusMetrics", incidentQuery.data.incidentStatusMetrics);
    }
  }, [incidentQuery.data]);
  useEffect(() => {
    if (modelRiskQuery.data) setCachedValue("modelRiskMetrics", modelRiskQuery.data);
  }, [modelRiskQuery.data]);
  useEffect(() => {
    if (trainingQuery.data) setCachedValue("trainingMetrics", trainingQuery.data);
  }, [trainingQuery.data]);
  useEffect(() => {
    if (modelQuery.data) {
      setCachedValue("evidenceHubMetrics", modelQuery.data.evidenceHubMetrics);
      setCachedValue("modelLifecycleMetrics", modelQuery.data.modelLifecycleMetrics);
    }
  }, [modelQuery.data]);
  useEffect(() => {
    if (projectQuery.data) {
      setCachedValue("useCaseMetrics", projectQuery.data.useCaseMetrics);
      setCachedValue("organizationalFrameworks", projectQuery.data.organizationalFrameworks);
    }
  }, [projectQuery.data]);
  useEffect(() => {
    if (governanceScoreQuery.data)
      setCachedValue("governanceScoreMetrics", governanceScoreQuery.data);
  }, [governanceScoreQuery.data]);
  useEffect(() => {
    if (taskQuery.data) setCachedValue("taskMetrics", taskQuery.data);
  }, [taskQuery.data]);

  // Imperative refetch functions — keep the same public API
  const fetchRiskMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.risk }),
    [queryClient],
  );
  const fetchEvidenceMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.evidence }),
    [queryClient],
  );
  const fetchVendorRiskMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.vendorRisk }),
    [queryClient],
  );
  const fetchVendorMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.vendor }),
    [queryClient],
  );
  const fetchPolicyMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.policy }),
    [queryClient],
  );
  const fetchIncidentMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.incident }),
    [queryClient],
  );
  const fetchModelRiskMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.modelRisk }),
    [queryClient],
  );
  const fetchTrainingMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.training }),
    [queryClient],
  );
  const fetchModelMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.model }),
    [queryClient],
  );
  const fetchProjectMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.project }),
    [queryClient],
  );
  const fetchGovernanceScoreMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.governanceScore }),
    [queryClient],
  );
  const fetchTaskMetrics = useCallback(
    () => queryClient.refetchQueries({ queryKey: DASHBOARD_KEYS.task }),
    [queryClient],
  );

  const fetchAllMetrics = useCallback(
    (forceRefresh = false) =>
      queryClient.refetchQueries({
        queryKey: DASHBOARD_KEYS.all,
        type: "active",
        ...(forceRefresh ? {} : { stale: true }),
      }),
    [queryClient],
  );

  return {
    // Data
    riskMetrics,
    evidenceMetrics,
    vendorRiskMetrics,
    vendorMetrics,
    policyMetrics,
    incidentMetrics,
    modelRiskMetrics,
    trainingMetrics,
    policyStatusMetrics,
    incidentStatusMetrics,
    evidenceHubMetrics,
    modelLifecycleMetrics,
    organizationalFrameworks,
    taskMetrics,
    useCaseMetrics,
    governanceScoreMetrics,

    // State
    loading,
    isRevalidating,
    error,

    // Progress
    progressStep,
    progressSteps: PROGRESS_STEPS,

    // Actions
    fetchAllMetrics,
    fetchRiskMetrics,
    fetchEvidenceMetrics,
    fetchVendorRiskMetrics,
    fetchVendorMetrics,
    fetchPolicyMetrics,
    fetchIncidentMetrics,
    fetchModelRiskMetrics,
    fetchTrainingMetrics,
    fetchModelMetrics,
    fetchProjectMetrics,
    fetchGovernanceScoreMetrics,
    fetchTaskMetrics,
  };
};
