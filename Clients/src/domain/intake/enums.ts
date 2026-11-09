/**
 * Status of an intake form
 */
export enum IntakeFormStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  ARCHIVED = "archived",
}

/**
 * Type of entity the intake form creates
 */
export enum IntakeEntityType {
  MODEL = "model",
  USE_CASE = "use_case",
  /** An approved submission creates an AI app (#5193). */
  AI_APP = "ai_app",
}

/**
 * Status of an intake form submission
 */
export enum IntakeSubmissionStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  SUPERSEDED = "superseded",
}
