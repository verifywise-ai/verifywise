export enum Status {
  Active = "active",
  Inactive = "inactive",
  Canceled = "canceled",
}

export enum TrainingStatus {
  Planned = "Planned",
  InProgress = "In Progress",
  Completed = "Completed",
}

export enum ReviewStatus {
  NotStarted = "Not started",
  InReview = "In review",
  Reviewed = "Reviewed",
  RequiresFollowUp = "Requires follow-up",
}

export enum DataSensitivity {
  None = "None",
  InternalOnly = "Internal only",
  PII = "Personally identifiable information (PII)",
  FinancialData = "Financial data",
  HealthData = "Health data (e.g. HIPAA)",
  ModelWeights = "Model weights or AI assets",
  OtherSensitive = "Other sensitive data",
}

export enum BusinessCriticality {
  Low = "Low (vendor supports non-core functions)",
  Medium = "Medium (affects operations but is replaceable)",
  High = "High (critical to core services or products)",
}

export enum PastIssues {
  None = "None",
  MinorIncident = "Minor incident (e.g. small delay, minor bug)",
  MajorIncident = "Major incident (e.g. data breach, legal issue)",
}

export enum RegulatoryExposure {
  None = "None",
  GDPR = "GDPR (EU)",
  HIPAA = "HIPAA (US)",
  SOC2 = "SOC 2",
  ISO27001 = "ISO 27001",
  EUAIAct = "EU AI act",
  CCPA = "CCPA (california)",
  Other = "Other",
}
