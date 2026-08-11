import { Likelihood, Severity } from "../RiskLevel/constants";
import {
  RiskFormValues as DomainRiskFormValues,
  MitigationFormValues as DomainMitigationFormValues,
} from "../../../domain/types/riskForm.types";

// Re-export domain types for backwards compatibility
export type RiskFormValues = DomainRiskFormValues;
export type MitigationFormValues = DomainMitigationFormValues;

export type ProjectRisk = {
  riskName: string;
  actionOwner: number;
  aiLifecyclePhase: number | string;
  riskDescription: string;
  riskCategory: number[] | string[];
  potentialImpact: string;
  assessmentMapping: number;
  controlsMapping: number;
  likelihood: Likelihood | string;
  riskSeverity: Severity;
  riskLevel: number;
  reviewNotes: string;
  mitigationStatus: number;
  mitigationPlan: string;
  currentRiskLevel: number;
  implementationStrategy: string;
  deadline: string;
  doc: string;
  approver: number;
  approvalStatus: number;
  dateOfAssessment: string;
};

export interface RiskFormErrors {
  riskName?: string;
  actionOwner?: string;
  aiLifecyclePhase?: string;
  riskDescription?: string;
  riskCategory?: string[];
  potentialImpact?: string;
  assessmentMapping?: string;
  controlsMapping?: string;
  reviewNotes?: string;
  applicableProjects?: string;
  applicableFrameworks?: string;
}

export interface MitigationFormErrors {
  mitigationStatus?: string;
  mitigationPlan?: string;
  currentRiskLevel?: string;
  implementationStrategy?: string;
  deadline?: string;
  doc?: string;
  approver?: string;
  approvalStatus?: string;
  dateOfAssessment?: string;
}
