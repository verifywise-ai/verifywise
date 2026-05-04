/**
 * Form error types for presentation layer
 * These are UI validation concerns and should not be in the domain layer
 */

/**
 * Form validation errors for vendor risk form
 * Moved from domain layer as this is a UI concern
 */
export interface FormErrors {
  vendorName?: string;
  actionOwner?: string;
  riskName?: string;
  reviewDate?: string;
  riskDescription?: string;
}

/**
 * Form validation errors for project creation form
 * Moved from domain layer as this is a UI concern
 */
export interface CreateProjectFormErrors {
  projectTitle?: string;
  members?: string;
  owner?: string;
  startDate?: string;
  riskClassification?: string;
  typeOfHighRiskRole?: string;
  goal?: string;
}
