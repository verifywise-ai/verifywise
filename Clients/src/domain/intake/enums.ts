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
