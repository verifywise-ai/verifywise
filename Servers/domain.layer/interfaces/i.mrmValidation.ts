import { MrmValidationOutcome, MrmValidationStage, MrmValidationTrigger } from "../enums/mrm.enum";

/**
 * One section of a validation report. Free-text plus attached evidence links.
 */
export interface MrmValidationReportSection {
  text: string;
  evidence_links: number[];
}

/**
 * The 6 sections of an MRM validation report, stored as JSONB on
 * mrm_validations.report.
 */
export interface MrmValidationReport {
  purpose_scope?: MrmValidationReportSection;
  conceptual_soundness?: MrmValidationReportSection;
  data_review?: MrmValidationReportSection;
  outcomes_analysis?: MrmValidationReportSection;
  findings_limitations?: MrmValidationReportSection;
  conclusion_signoff?: MrmValidationReportSection;
}

export interface IMrmValidation {
  id?: number;
  organization_id: number;
  model_inventory_id: number;
  stage: MrmValidationStage;
  trigger?: MrmValidationTrigger;
  validator_id?: number;
  outcome?: MrmValidationOutcome;
  report_version?: string;
  report: MrmValidationReport;
  signed_off_at?: Date;
  signed_off_by?: number;
  next_due?: Date;
  created_at?: Date;
  updated_at?: Date;
}
