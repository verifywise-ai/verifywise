import { useEffect, useState, useCallback, useRef } from "react";
import { getAllEntities, getEntityById } from "../repository/entity.repository";
import type { ProgressStep } from "../../presentation/components/StepProgressDialog";

// Cache configuration
export const CACHE_KEY = "dashboard_metrics_cache";
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

// Cache utility functions
const getCache = (): MetricsCache => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCache = (cache: MetricsCache): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage might be full or disabled
  }
};

const getCachedValue = <T>(
  key: keyof MetricsCache,
): { data: T | null; isFresh: boolean; isStale: boolean } => {
  const cache = getCache();
  const entry = cache[key] as CacheEntry<T> | undefined;

  if (!entry) {
    return { data: null, isFresh: false, isStale: false };
  }

  const age = Date.now() - entry.timestamp;
  const isFresh = age < CACHE_TTL_MS;
  const isStale = age < STALE_TTL_MS;

  return { data: entry.data, isFresh, isStale };
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

// Main hook for dashboard metrics
export const useDashboardMetrics = () => {
  // Initialize state from cache for instant display
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(
    () => getCachedValue<RiskMetrics>("riskMetrics").data,
  );
  const [evidenceMetrics, setEvidenceMetrics] = useState<EvidenceMetrics | null>(
    () => getCachedValue<EvidenceMetrics>("evidenceMetrics").data,
  );
  const [vendorRiskMetrics, setVendorRiskMetrics] = useState<VendorRiskMetrics | null>(
    () => getCachedValue<VendorRiskMetrics>("vendorRiskMetrics").data,
  );
  const [vendorMetrics, setVendorMetrics] = useState<VendorMetrics | null>(
    () => getCachedValue<VendorMetrics>("vendorMetrics").data,
  );
  const [policyMetrics, setPolicyMetrics] = useState<PolicyMetrics | null>(
    () => getCachedValue<PolicyMetrics>("policyMetrics").data,
  );
  const [incidentMetrics, setIncidentMetrics] = useState<IncidentMetrics | null>(
    () => getCachedValue<IncidentMetrics>("incidentMetrics").data,
  );
  const [modelRiskMetrics, setModelRiskMetrics] = useState<ModelRiskMetrics | null>(
    () => getCachedValue<ModelRiskMetrics>("modelRiskMetrics").data,
  );
  const [trainingMetrics, setTrainingMetrics] = useState<TrainingMetrics | null>(
    () => getCachedValue<TrainingMetrics>("trainingMetrics").data,
  );
  const [policyStatusMetrics, setPolicyStatusMetrics] = useState<PolicyStatusMetrics | null>(
    () => getCachedValue<PolicyStatusMetrics>("policyStatusMetrics").data,
  );
  const [incidentStatusMetrics, setIncidentStatusMetrics] = useState<IncidentStatusMetrics | null>(
    () => getCachedValue<IncidentStatusMetrics>("incidentStatusMetrics").data,
  );
  const [evidenceHubMetrics, setEvidenceHubMetrics] = useState<EvidenceHubMetrics | null>(
    () => getCachedValue<EvidenceHubMetrics>("evidenceHubMetrics").data,
  );
  const [modelLifecycleMetrics, setModelLifecycleMetrics] = useState<ModelLifecycleMetrics | null>(
    () => getCachedValue<ModelLifecycleMetrics>("modelLifecycleMetrics").data,
  );
  const [organizationalFrameworks, setOrganizationalFrameworks] = useState<
    OrganizationalFrameworkData[]
  >(() => getCachedValue<OrganizationalFrameworkData[]>("organizationalFrameworks").data || []);
  const [taskMetrics, setTaskMetrics] = useState<TaskMetrics | null>(
    () => getCachedValue<TaskMetrics>("taskMetrics").data,
  );
  const [useCaseMetrics, setUseCaseMetrics] = useState<UseCaseMetrics | null>(
    () => getCachedValue<UseCaseMetrics>("useCaseMetrics").data,
  );
  const [governanceScoreMetrics, setGovernanceScoreMetrics] =
    useState<GovernanceScoreMetrics | null>(
      () => getCachedValue<GovernanceScoreMetrics>("governanceScoreMetrics").data,
    );
  const [loading, setLoading] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState(0);

  // Fetch risk metrics - using /projectRisks endpoint (same as Risk Management page)
  const fetchRiskMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/projectRisks" });

      // Handle the API response structure: { message: "ok", data: [...] }
      const risksData = response.data || [];
      const risksArray = Array.isArray(risksData) ? risksData : [];

      // Calculate distribution based on risk_level_autocalculated or current_risk_level
      const distribution = { high: 0, medium: 0, low: 0, resolved: 0 };

      risksArray.forEach((risk: any) => {
        // Use current_risk_level first, fallback to risk_level_autocalculated
        const riskLevel = (
          risk.current_risk_level ||
          risk.risk_level_autocalculated ||
          ""
        ).toLowerCase();

        // Check if resolved (mitigation_status is "Completed")
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
          // Default to medium if unknown
          distribution.medium++;
        }
      });

      const metrics = {
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

      setRiskMetrics(metrics);
      setCachedValue("riskMetrics", metrics);
    } catch (err) {
      console.warn("Failed to fetch risk metrics:", err);
      if (!riskMetrics) {
        setRiskMetrics({
          total: 0,
          distribution: { high: 0, medium: 0, low: 0, resolved: 0 },
          recent: [],
        });
      }
    }
  }, [riskMetrics]);

  // Fetch evidence metrics (from /files endpoint)
  const fetchEvidenceMetrics = useCallback(async () => {
    try {
      // Use the /files endpoint for actual evidence files
      const response = await getAllEntities({ routeUrl: "/files" });

      // The /files endpoint returns data directly in the response, not nested under response.data
      const filesData = response.data || response.files || response;
      const filesArray = Array.isArray(filesData) ? filesData : [];

      const evidenceMetrics = {
        total: filesArray.length,
        recent: filesArray.slice(0, 5).map((file: any, index: number) => ({
          id: file.id || index + 1,
          title: file.filename || file.name || "Evidence File",
          uploaded_at: file.uploaded_time || file.created_at || file.updated_at,
          project_name: file.project_title || file.project_name || "General",
          user_name:
            `${file.uploader_name || ""} ${file.uploader_surname || ""}`.trim() || "System",
        })),
      };

      setEvidenceMetrics(evidenceMetrics);
      setCachedValue("evidenceMetrics", evidenceMetrics);
    } catch {
      setEvidenceMetrics(null);
    }
  }, []);

  // Fetch vendor risk metrics - using vendorRisks endpoint
  const fetchVendorRiskMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/vendorRisks/all" });

      // Handle the API response structure: { message: "ok", data: [...] }
      const risksData = response.data || [];
      const risksArray = Array.isArray(risksData) ? risksData : [];

      // Calculate distribution based on risk_level
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
          // Default to medium if unknown
          distribution.medium++;
        }
      });

      const vendorRiskMetrics = {
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

      setVendorRiskMetrics(vendorRiskMetrics);
      setCachedValue("vendorRiskMetrics", vendorRiskMetrics);
    } catch {
      setVendorRiskMetrics(null);
    }
  }, []);

  // Fetch vendor metrics
  const fetchVendorMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/vendors" });

      // Handle the API response structure
      const vendorsData = response.data || response.vendors || response;
      const vendorsArray = Array.isArray(vendorsData) ? vendorsData : [];

      const vendorMetrics = {
        total: vendorsArray.length,
        recent: vendorsArray.slice(0, 5).map((vendor: any, index: number) => ({
          id: vendor.id || index + 1,
          name: vendor.name || vendor.vendor_name || vendor.company_name || "Unknown Vendor",
          created_at: vendor.created_at || vendor.createdAt,
          status: vendor.status || vendor.vendor_status || "Active",
        })),
      };

      setVendorMetrics(vendorMetrics);
      setCachedValue("vendorMetrics", vendorMetrics);
    } catch {
      setVendorMetrics(null);
    }
  }, []);

  // Fetch policy metrics (also sets policyStatusMetrics to avoid duplicate API call)
  const fetchPolicyMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/policies" });

      // Handle the special API response structure: { data: { data: Policy[] } }
      const policiesData = response.data?.data || response.data || response.policies || response;
      const policiesArray = Array.isArray(policiesData) ? policiesData : [];

      // Count policies with pending_review status from ALL policies
      const pendingReviewCount = policiesArray.filter(
        (policy: any) => policy.status === "pending_review",
      ).length;

      const metrics = {
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

      setPolicyMetrics(metrics);
      setCachedValue("policyMetrics", metrics);

      // Also calculate policy status distribution (avoids duplicate /policies call)
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
          statusDistribution.draft++; // Default to draft
        }
      });

      const statusMetrics = {
        total: policiesArray.length,
        distribution: statusDistribution,
      };
      setPolicyStatusMetrics(statusMetrics);
      setCachedValue("policyStatusMetrics", statusMetrics);
    } catch {
      if (!policyMetrics) setPolicyMetrics(null);
      if (!policyStatusMetrics) setPolicyStatusMetrics(null);
    }
  }, [policyMetrics, policyStatusMetrics]);

  // Fetch incident metrics (also sets incidentStatusMetrics to avoid duplicate API call)
  const fetchIncidentMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/ai-incident-managements" });

      // Handle the API response structure
      const incidentsData = response.data || response.incidents || response;
      const incidentsArray = Array.isArray(incidentsData) ? incidentsData : [];

      // Count open incidents from ALL incidents
      const openCount = incidentsArray.filter((incident: any) => incident.status === "Open").length;

      const metrics = {
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

      setIncidentMetrics(metrics);
      setCachedValue("incidentMetrics", metrics);

      // Also calculate incident status distribution (avoids duplicate API call)
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
          statusDistribution.open++; // Default to open
        }
      });

      const statusMetrics = {
        total: incidentsArray.length,
        distribution: statusDistribution,
      };
      setIncidentStatusMetrics(statusMetrics);
      setCachedValue("incidentStatusMetrics", statusMetrics);
    } catch {
      if (!incidentMetrics) setIncidentMetrics(null);
      if (!incidentStatusMetrics) setIncidentStatusMetrics(null);
    }
  }, [incidentMetrics, incidentStatusMetrics]);

  // Fetch model risk metrics - using /modelRisks endpoint
  const fetchModelRiskMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/modelRisks" });

      // Handle the API response structure
      const modelRisksData = response.data || response;
      const modelRisksArray = Array.isArray(modelRisksData) ? modelRisksData : [];

      // Calculate distribution based on risk_level (Low, Medium, High, Critical)
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
          // Default to medium if unknown
          distribution.medium++;
        }
      });

      const modelRiskMetrics = {
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

      setModelRiskMetrics(modelRiskMetrics);
      setCachedValue("modelRiskMetrics", modelRiskMetrics);
    } catch (err) {
      console.warn("Failed to fetch model risk metrics:", err);
      setModelRiskMetrics({
        total: 0,
        distribution: { critical: 0, high: 0, medium: 0, low: 0 },
        recent: [],
      });
    }
  }, []);

  // Fetch training metrics - for Training Completion card
  const fetchTrainingMetrics = useCallback(async () => {
    try {
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
          // Default unknown statuses to planned
          distribution.planned++;
        }
      });

      const total = trainingsArray.length;
      const completionPercentage =
        total > 0 ? Math.round((distribution.completed / total) * 100) : 0;

      const metrics = {
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
      setTrainingMetrics(metrics);
      setCachedValue("trainingMetrics", metrics);
    } catch (err) {
      console.warn("Failed to fetch training metrics:", err);
      if (!trainingMetrics) setTrainingMetrics(null);
    }
  }, [trainingMetrics]);

  // Fetch task metrics - for Recent Activity
  const fetchTaskMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/tasks" });
      const tasksData = response.data || response;
      const tasksArray = Array.isArray(tasksData) ? tasksData : [];

      const metrics = {
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
      setTaskMetrics(metrics);
      setCachedValue("taskMetrics", metrics);
    } catch (err) {
      console.warn("Failed to fetch task metrics:", err);
      if (!taskMetrics) setTaskMetrics(null);
    }
  }, [taskMetrics]);

  // Fetch governance score metrics - for AI Governance Score card
  const fetchGovernanceScoreMetrics = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/compliance/score" });
      const data = response.data || response;

      if (data && typeof data.overallScore === "number") {
        const modules = data.modules || {};
        const metrics: GovernanceScoreMetrics = {
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
        setGovernanceScoreMetrics(metrics);
        setCachedValue("governanceScoreMetrics", metrics);
      } else {
        // Fallback to default values if API doesn't return expected format
        setGovernanceScoreMetrics({
          score: 0,
          modules: [
            { name: "Risk management", score: 0, weight: 0.3 },
            { name: "Vendor management", score: 0, weight: 0.3 },
            { name: "Project governance", score: 0, weight: 0.25 },
            { name: "Model lifecycle", score: 0, weight: 0.1 },
            { name: "Policy & documentation", score: 0, weight: 0.05 },
          ],
        });
      }
    } catch (err) {
      console.warn("Failed to fetch governance score metrics:", err);
      if (!governanceScoreMetrics) {
        setGovernanceScoreMetrics({
          score: 0,
          modules: [
            { name: "Risk management", score: 0, weight: 0.3 },
            { name: "Vendor management", score: 0, weight: 0.3 },
            { name: "Project governance", score: 0, weight: 0.25 },
            { name: "Model lifecycle", score: 0, weight: 0.1 },
            { name: "Policy & documentation", score: 0, weight: 0.05 },
          ],
        });
      }
    }
  }, [governanceScoreMetrics]);

  // Merged model metrics: fetches /modelInventory once, computes both
  // evidenceHubMetrics and modelLifecycleMetrics from the same data
  const fetchModelMetrics = useCallback(async () => {
    try {
      const [evidenceResponse, modelsResponse] = await Promise.all([
        getAllEntities({ routeUrl: "/evidenceHub" }),
        getAllEntities({ routeUrl: "/modelInventory" }),
      ]);

      const modelsData = modelsResponse.data || modelsResponse;
      const modelsArray = Array.isArray(modelsData) ? modelsData : [];

      // --- Evidence Hub metrics ---
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

      const ehMetrics = {
        total: evidenceArray.length,
        totalFiles,
        modelsWithEvidence: modelsWithEvidence.size,
        totalModels,
        coveragePercentage,
      };
      setEvidenceHubMetrics(ehMetrics);
      setCachedValue("evidenceHubMetrics", ehMetrics);

      // --- Model Lifecycle metrics ---
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
          distribution.pending++; // Default to pending
        }
      });

      const mlMetrics = {
        total: modelsArray.length,
        distribution,
      };
      setModelLifecycleMetrics(mlMetrics);
      setCachedValue("modelLifecycleMetrics", mlMetrics);
    } catch (err) {
      console.warn("Failed to fetch model metrics:", err);
      if (!evidenceHubMetrics) setEvidenceHubMetrics(null);
      if (!modelLifecycleMetrics) setModelLifecycleMetrics(null);
    }
  }, [evidenceHubMetrics, modelLifecycleMetrics]);

  // Merged project metrics: fetches /projects once, computes both
  // useCaseMetrics and organizationalFrameworks from the same data
  const fetchProjectMetrics = useCallback(async () => {
    try {
      const projectsResponse = await getAllEntities({ routeUrl: "/projects" });
      const projectsData = projectsResponse.data || projectsResponse;
      const projectsArray = Array.isArray(projectsData) ? projectsData : [];

      // --- Use Case metrics (non-organizational projects) ---
      const useCases = projectsArray.filter((project: any) => !project.is_organizational);

      const ucMetrics = {
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
      setUseCaseMetrics(ucMetrics);
      setCachedValue("useCaseMetrics", ucMetrics);

      // --- Organizational Frameworks ---
      const orgProject = projectsArray.find((p: any) => p.is_organizational === true);
      if (!orgProject || !orgProject.framework || orgProject.framework.length === 0) {
        setOrganizationalFrameworks([]);
        setCachedValue("organizationalFrameworks", []);
        return;
      }

      // Get all available frameworks
      const frameworksResponse = await getAllEntities({ routeUrl: "/frameworks" });
      const allFrameworks = frameworksResponse.data || frameworksResponse || [];

      // Build framework data for each enabled framework
      // Collect all sub-call promises and run in parallel
      const frameworkPromises = orgProject.framework.map(async (projectFramework: any) => {
        const frameworkId = Number(projectFramework.framework_id);
        const projectFrameworkId = projectFramework.project_framework_id || frameworkId;

        // Find framework details
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
          // Fetch clause and annex progress in parallel
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
          // Fetch clause and annex progress in parallel
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

      // Run all framework sub-calls in parallel
      const frameworkResults = await Promise.all(frameworkPromises);
      const frameworksData = frameworkResults.filter(Boolean) as OrganizationalFrameworkData[];

      // Sort: ISO 42001 first, then ISO 27001, then NIST AI RMF
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

      setOrganizationalFrameworks(frameworksData);
      setCachedValue("organizationalFrameworks", frameworksData);
    } catch {
      console.warn("Failed to fetch project metrics");
      if (!useCaseMetrics) setUseCaseMetrics(null);
      setOrganizationalFrameworks([]);
    }
  }, [useCaseMetrics]);

  // Check if we have fresh cached data (skip network if so)
  const shouldSkipFetch = useCallback(() => {
    const cache = getCache();
    const now = Date.now();

    // Check if any critical metric has fresh data
    const criticalKeys: (keyof MetricsCache)[] = [
      "trainingMetrics",
      "policyStatusMetrics",
      "incidentStatusMetrics",
      "evidenceHubMetrics",
      "modelLifecycleMetrics",
    ];

    return criticalKeys.every((key) => {
      const entry = cache[key];
      return entry && now - entry.timestamp < CACHE_TTL_MS;
    });
  }, []);

  // Use ref for fetchAllMetrics to avoid infinite re-render loops from useCallback deps
  const fetchAllMetricsRef = useRef<(forceRefresh?: boolean) => Promise<void>>(undefined);

  // Fetch all dashboard metrics safely with stale-while-revalidate
  // Grouped into 5 sequential stages for progress tracking
  const fetchAllMetrics = useCallback(
    async (forceRefresh = false) => {
      // If we have fresh cache and not forcing refresh, skip fetch
      if (!forceRefresh && shouldSkipFetch()) {
        return;
      }

      // Check if we have any cached data to show immediately
      const hasAnyCache = getCache() && Object.keys(getCache()).length > 0;

      // If we have cached data, show it and revalidate in background
      if (hasAnyCache && !forceRefresh) {
        setIsRevalidating(true);
      } else {
        setLoading(true);
      }

      setError(null);
      setProgressStep(0);

      try {
        // Group 1: Core - risks, evidence files
        await Promise.allSettled([fetchRiskMetrics(), fetchEvidenceMetrics()]);
        setProgressStep(1);

        // Group 2: Vendors & policies
        await Promise.allSettled([
          fetchVendorRiskMetrics(),
          fetchVendorMetrics(),
          fetchPolicyMetrics(),
          fetchIncidentMetrics(),
        ]);
        setProgressStep(2);

        // Group 3: Models - merged model metrics (evidenceHub + modelLifecycle), model risks, training
        await Promise.allSettled([
          fetchModelMetrics(),
          fetchModelRiskMetrics(),
          fetchTrainingMetrics(),
        ]);
        setProgressStep(3);

        // Group 4: Frameworks - merged project metrics (useCases + orgFrameworks)
        await Promise.allSettled([fetchProjectMetrics()]);
        setProgressStep(4);

        // Group 5: Scores - governance score, tasks
        await Promise.allSettled([fetchGovernanceScoreMetrics(), fetchTaskMetrics()]);
        setProgressStep(5);
      } catch (err) {
        setError("Failed to fetch dashboard metrics");
        console.error("Error fetching dashboard metrics:", err);
      } finally {
        setLoading(false);
        setIsRevalidating(false);
      }
    },
    [
      shouldSkipFetch,
      fetchRiskMetrics,
      fetchEvidenceMetrics,
      fetchVendorRiskMetrics,
      fetchVendorMetrics,
      fetchPolicyMetrics,
      fetchIncidentMetrics,
      fetchModelMetrics,
      fetchModelRiskMetrics,
      fetchTrainingMetrics,
      fetchProjectMetrics,
      fetchGovernanceScoreMetrics,
      fetchTaskMetrics,
    ],
  );

  fetchAllMetricsRef.current = fetchAllMetrics;

  // Initialize data on mount
  useEffect(() => {
    fetchAllMetricsRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    fetchPolicyMetrics, // Also refreshes policyStatusMetrics
    fetchIncidentMetrics, // Also refreshes incidentStatusMetrics
    fetchModelRiskMetrics,
    fetchTrainingMetrics,
    fetchModelMetrics, // Replaces fetchEvidenceHubMetrics + fetchModelLifecycleMetrics
    fetchProjectMetrics, // Replaces fetchUseCaseMetrics + fetchOrganizationalFrameworks
    fetchGovernanceScoreMetrics,
    fetchTaskMetrics,
  };
};
