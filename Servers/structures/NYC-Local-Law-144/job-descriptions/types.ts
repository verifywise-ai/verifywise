export interface ExpectedCriterion {
  key: string;
  label: string;
  description: string;
  gradable: boolean;
}

export type JobDescriptionKey = "commercial-ae" | "operational-hourly";

export interface QualificationTier {
  key: string;
  label: string;
  criteriaMet: string[];
  narrative: string;
}

export interface JobDescription {
  key: JobDescriptionKey;
  roleTitle: string;
  body: string;
  expectedCriteria: ExpectedCriterion[];
  tiers: QualificationTier[];
}
