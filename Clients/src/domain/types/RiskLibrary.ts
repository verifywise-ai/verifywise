export interface RiskLibraryEntry {
  id: number;
  source: string;
  source_id?: string | null;
  summary: string;
  description: string;
  risk_type?: string | null;
  risk_source?: string | null;
  domain?: string | null;
  subdomain?: string | null;
  eu_ai_act_tier?: string | null;
  risk_category?: string | null;
  severity?: string | null;
  likelihood?: string | null;
  marginal_risk_description?: string | null;
  industry?: string | null;
  use_case?: string | null;
  ai_lifecycle_phase?: string | null;
  applicable_model_types?: string[] | null;
  tags?: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  mitigation_count?: number;
}

export interface RiskLibraryMitigation {
  id: number;
  risk_entry_id: number;
  strategy: "avoid" | "transfer" | "mitigate" | "accept";
  title: string;
  description: string;
  implementation_guidance?: string | null;
  evidence_requirements?: string | null;
  source?: string | null;
  framework_ref?: string | null;
  created_at: string;
}

export interface RiskLibraryIncident {
  id: number;
  risk_entry_id: number;
  incident_title: string;
  incident_description?: string | null;
  incident_date?: string | null;
  source_url?: string | null;
  source_db?: string | null;
  source_incident_id?: string | null;
  harm_type?: string | null;
  sector?: string | null;
  created_at: string;
}

export interface RiskLibraryOrgCustomization {
  id: number;
  organization_id: number;
  library_entry_id: number;
  custom_mitigations?: string | null;
  custom_notes?: string | null;
  is_hidden: boolean;
  relevance_score?: number | null;
}

export interface RiskLibraryFeedback {
  upvotes: number;
  downvotes: number;
  flags: number;
  userVote?: string | null;
}

export interface RiskLibraryEntryDetail {
  entry: RiskLibraryEntry;
  mitigations: RiskLibraryMitigation[];
  incidents: RiskLibraryIncident[];
  orgCustomization: RiskLibraryOrgCustomization | null;
  feedback: RiskLibraryFeedback;
}

export interface RiskLibrarySearchParams {
  search?: string;
  source?: string;
  risk_type?: string;
  risk_source?: string;
  domain?: string;
  eu_ai_act_tier?: string;
  severity?: string;
  likelihood?: string;
  industry?: string;
  lifecycle_phase?: string;
  model_type?: string;
  page?: number;
  limit?: number;
}

export interface RiskLibrarySearchResult {
  entries: RiskLibraryEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface RiskLibraryFilters {
  sources: string[];
  riskTypes: string[];
  riskSources: string[];
  domains: string[];
  euAiActTiers: string[];
  severities: string[];
  likelihoods: string[];
  industries: string[];
  lifecyclePhases: string[];
}

export interface RiskLibraryStats {
  total: number;
  totalMitigations: number;
  totalIncidents: number;
  bySource: Array<{ source: string; count: string }>;
  byRiskType: Array<{ risk_type: string; count: string }>;
  byDomain: Array<{ domain: string; count: string }>;
  bySeverity: Array<{ severity: string; count: string }>;
  byEuAiActTier: Array<{ eu_ai_act_tier: string; count: string }>;
}

export interface GeneratedRisk {
  summary: string;
  description: string;
  risk_type?: string;
  risk_source?: string;
  domain?: string;
  eu_ai_act_tier?: string;
  severity?: string;
  likelihood?: string;
  marginal_risk_description?: string;
  applicable_model_types?: string[];
}

export interface GeneratedMitigation {
  strategy: string;
  title: string;
  description: string;
  implementation_guidance?: string;
  evidence_requirements?: string;
  framework_ref?: string;
}

export interface GeneratedAssessment {
  risks: Array<GeneratedRisk & { mitigations: GeneratedMitigation[] }>;
  overall_risk_level: string;
  eu_ai_act_tier: string;
  summary: string;
}
