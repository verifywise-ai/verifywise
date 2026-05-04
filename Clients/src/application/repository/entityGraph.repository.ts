import { apiServices } from "../../infrastructure/api/networkServices";

export interface EntityGraphData {
  useCases: Array<{
    id: number;
    uc_id?: string;
    project_title: string;
    owner: number;
    review_date?: string;
    created_at?: string;
    // Additional fields
    ai_risk_classification?: string;
    type_of_high_risk_role?: string;
    start_date?: string;
    last_updated?: string;
    goal?: string;
    target_industry?: string;
    status?: string;
    framework?: Array<{ framework_id: number; name: string }>;
    doneSubcontrols?: number;
    totalSubcontrols?: number;
    answeredAssessments?: number;
    totalAssessments?: number;
  }>;
  models: Array<{
    id: number;
    provider: string;
    model: string;
    status: string;
    projects: number[];
    frameworks: number[];
    owner?: number;
    created_at?: string;
    // Additional fields
    version?: string;
    approver?: string;
    capabilities?: string;
    security_assessment?: boolean;
    status_date?: string;
  }>;
  risks: Array<{
    id: number;
    risk_name: string;
    risk_level: string;
    model_id: number | null;
    project_id?: number;
    vendor_id?: number;
    source: "model" | "project" | "vendor";
    created_at?: string;
    // Additional fields for project risks
    risk_owner?: string;
    ai_lifecycle_phase?: string;
    risk_category?: string[];
    impact?: string;
    likelihood?: string;
    severity?: string;
    mitigation_status?: string;
    deadline?: string;
    approval_status?: string;
    date_of_assessment?: string;
    risk_description?: string;
    // Additional fields for vendor risks
    impact_description?: string;
    action_plan?: string;
    action_owner?: number;
    vendor_name?: string;
  }>;
  vendors: Array<{
    id: number;
    vendor_name: string;
    review_status: string;
    risk_level?: string;
    projects?: number[];
    owner?: number;
    created_at?: string;
    // Additional fields
    vendor_provides?: string;
    website?: string;
    vendor_contact_person?: string;
    assignee?: number;
    reviewer?: number;
    review_date?: string;
    review_result?: string;
    data_sensitivity?: string;
    business_criticality?: string;
    past_issues?: string;
    regulatory_exposure?: string;
    risk_score?: number;
  }>;
  evidence: Array<{
    id: number;
    name: string;
    file_type?: string;
    uploaded_at?: string;
    control_id?: number;
    project_id?: number;
    created_at?: string;
    // Additional fields
    evidence_type?: string;
    description?: string;
    expiry_date?: string;
    file_count?: number;
    mapped_model_ids?: number[];
    updated_at?: string;
  }>;
  frameworks: Array<{
    id: number;
    name: string;
    // Additional fields
    description?: string;
    is_organizational?: boolean;
  }>;
  users: Array<{
    id: number;
    name: string;
    surname: string;
  }>;
}

// Callback for tracking loading progress
type ProgressCallback = (loaded: number, total: number) => void;

export async function fetchEntityGraphData(
  onProgress?: ProgressCallback,
): Promise<EntityGraphData> {
  const endpoints = [
    { name: "useCases", url: "/projects" },
    { name: "models", url: "/modelInventory" },
    { name: "modelRisks", url: "/modelRisks" },
    { name: "vendors", url: "/vendors" },
    { name: "vendorRisks", url: "/vendorRisks/all" },
    { name: "projectRisks", url: "/projectRisks" },
    { name: "evidence", url: "/evidenceHub" },
    { name: "frameworks", url: "/frameworks" },
    { name: "users", url: "/users" },
  ];

  const total = endpoints.length;
  let loaded = 0;

  // Extract data from responses - handle both {data: []} and {data: {data: []}} formats
  const extractData = (res: { data: unknown }): unknown[] => {
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (
      data &&
      typeof data === "object" &&
      "data" in data &&
      Array.isArray((data as { data: unknown[] }).data)
    ) {
      return (data as { data: unknown[] }).data;
    }
    return [];
  };

  // Fetch with progress tracking
  const fetchWithProgress = async (url: string) => {
    const result = await apiServices.get(url).catch(() => ({ data: { data: [] } }));
    loaded++;
    onProgress?.(loaded, total);
    return result;
  };

  const [
    useCasesRes,
    modelsRes,
    modelRisksRes,
    vendorsRes,
    vendorRisksRes,
    projectRisksRes,
    evidenceRes,
    frameworksRes,
    usersRes,
  ] = await Promise.all(endpoints.map((e) => fetchWithProgress(e.url)));

  // Combine all risks into unified array with source indicator
  const modelRisks = extractData(modelRisksRes) as Array<{
    id: number;
    risk_name: string;
    risk_level: string;
    model_id: number | null;
    risk_description?: string;
  }>;
  const projectRisks = extractData(projectRisksRes) as Array<{
    id: number;
    risk_name: string;
    current_risk_level: string;
    project_id: number;
    risk_owner?: string;
    ai_lifecycle_phase?: string;
    risk_category?: string[];
    impact?: string;
    likelihood?: string;
    severity?: string;
    mitigation_status?: string;
    deadline?: string;
    approval_status?: string;
    date_of_assessment?: string;
    risk_description?: string;
  }>;
  const vendorRisks = extractData(vendorRisksRes) as Array<{
    risk_id: number;
    risk_description: string;
    risk_severity: string;
    vendor_id: number;
    impact?: string;
    impact_description?: string;
    likelihood?: string;
    action_plan?: string;
    action_owner?: number;
    vendor_name?: string;
  }>;

  const combinedRisks: EntityGraphData["risks"] = [
    ...modelRisks.map((r) => ({
      id: r.id,
      risk_name: r.risk_name,
      risk_level: r.risk_level,
      model_id: r.model_id,
      source: "model" as const,
      risk_description: r.risk_description,
    })),
    ...projectRisks.map((r) => ({
      id: r.id + 100000, // Offset to avoid ID collision
      risk_name: r.risk_name,
      risk_level: r.current_risk_level,
      model_id: null,
      project_id: r.project_id,
      source: "project" as const,
      risk_owner: r.risk_owner,
      ai_lifecycle_phase: r.ai_lifecycle_phase,
      risk_category: r.risk_category,
      impact: r.impact,
      likelihood: r.likelihood,
      severity: r.severity,
      mitigation_status: r.mitigation_status,
      deadline: r.deadline,
      approval_status: r.approval_status,
      date_of_assessment: r.date_of_assessment,
      risk_description: r.risk_description,
    })),
    ...vendorRisks.map((r) => ({
      id: r.risk_id + 200000, // Offset to avoid ID collision
      risk_name: r.risk_description?.substring(0, 50) || "Vendor Risk",
      risk_level: r.risk_severity,
      model_id: null,
      vendor_id: r.vendor_id,
      source: "vendor" as const,
      impact: r.impact,
      impact_description: r.impact_description,
      likelihood: r.likelihood,
      action_plan: r.action_plan,
      action_owner: r.action_owner,
      vendor_name: r.vendor_name,
      risk_description: r.risk_description,
    })),
  ];

  return {
    useCases: extractData(useCasesRes) as EntityGraphData["useCases"],
    models: extractData(modelsRes) as EntityGraphData["models"],
    risks: combinedRisks,
    vendors: extractData(vendorsRes) as EntityGraphData["vendors"],
    evidence: extractData(evidenceRes) as EntityGraphData["evidence"],
    frameworks: extractData(frameworksRes) as EntityGraphData["frameworks"],
    users: extractData(usersRes) as EntityGraphData["users"],
  };
}
