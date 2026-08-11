export type QualityGrade = "A" | "B" | "C" | "D" | "F";

export interface IQualityScore {
  relevance: QualityGrade;
  completeness: QualityGrade;
  recency: QualityGrade;
  reliability: QualityGrade;
  specificity: QualityGrade;
}

export interface IQualityRationale {
  relevance: string;
  completeness: string;
  recency: string;
  reliability: string;
  specificity: string;
  overall: string;
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
  overall_quality_grade: QualityGrade | null;
  quality_rationale?: IQualityRationale | null;
  suggested_control_links: ISuggestedControlLink[] | null;
  analysis_model: string | null;
  analysis_version: number;
  analyzed_at: Date;
  analyzed_by: number | null;
  organization_id: number;
}
