export interface IQualityScore {
  relevance: number;
  completeness: number;
  recency: number;
  reliability: number;
  specificity: number;
  overall: number;
}

export interface ISuggestedControlLink {
  framework: string;
  control_id: number;
  confidence: number;
}

export interface IKeyFinding {
  finding: string;
  relevance: "high" | "medium" | "low";
}

export interface IEvidenceAiAnalysis {
  id?: number;
  file_id: number;
  summary: string | null;
  key_findings: IKeyFinding[] | null;
  compliance_areas: string[] | null;
  quality_score: IQualityScore | null;
  overall_quality_score: number | null;
  suggested_control_links: ISuggestedControlLink[] | null;
  analysis_model: string | null;
  analysis_version: number;
  analyzed_at: Date;
  analyzed_by: number | null;
  organization_id: number;
}
