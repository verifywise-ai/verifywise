export type RiskLibrarySource = "MIT" | "IBM" | "AIID" | "AI_GENERATED" | "CUSTOM";

export type MitigationStrategy = "avoid" | "transfer" | "mitigate" | "accept";

export interface IRiskLibraryEntry {
  id?: number;
  source: RiskLibrarySource;
  source_id?: string | null;
  summary: string;
  description: string;

  // Multi-dimensional taxonomy
  risk_type?: string | null;
  risk_source?: string | null;
  domain?: string | null;
  subdomain?: string | null;
  eu_ai_act_tier?: string | null;
  risk_category?: string | null;

  // Assessment defaults
  severity?: string | null;
  likelihood?: string | null;
  marginal_risk_description?: string | null;

  // Context
  industry?: string | null;
  use_case?: string | null;
  ai_lifecycle_phase?: string | null;
  applicable_model_types?: string[] | null;

  tags?: string[] | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface IRiskLibraryMitigation {
  id?: number;
  risk_entry_id: number;
  strategy: MitigationStrategy;
  title: string;
  description: string;
  implementation_guidance?: string | null;
  evidence_requirements?: string | null;
  source?: string | null;
  framework_ref?: string | null;
  created_at?: Date;
}

export interface IRiskLibraryIncident {
  id?: number;
  risk_entry_id: number;
  incident_title: string;
  incident_description?: string | null;
  incident_date?: Date | null;
  source_url?: string | null;
  source_db?: string | null;
  source_incident_id?: string | null;
  harm_type?: string | null;
  sector?: string | null;
  created_at?: Date;
}

export interface IRiskLibraryOrgCustomization {
  id?: number;
  organization_id: number;
  library_entry_id: number;
  custom_mitigations?: string | null;
  custom_notes?: string | null;
  is_hidden?: boolean;
  relevance_score?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface IRiskLibraryFeedback {
  id?: number;
  organization_id: number;
  library_entry_id?: number | null;
  user_id: number;
  feedback_type: "upvote" | "downvote" | "flag";
  flag_reason?: string | null;
  context?: string | null;
  created_at?: Date;
}

export interface IRiskLibraryGeneration {
  id?: number;
  organization_id: number;
  user_id: number;
  generation_type: "taxonomy" | "mitigation" | "assessment";
  input_context: string;
  output_content: string;
  llm_provider?: string | null;
  llm_model?: string | null;
  feedback_type?: string | null;
  created_at?: Date;
}

export interface IRiskLibrarySearchParams {
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

export interface IRiskLibraryEntryDetail extends IRiskLibraryEntry {
  mitigations: IRiskLibraryMitigation[];
  incidents: IRiskLibraryIncident[];
  orgCustomization?: IRiskLibraryOrgCustomization | null;
  feedback: {
    upvotes: number;
    downvotes: number;
    flags: number;
    userVote?: string | null;
  };
}
