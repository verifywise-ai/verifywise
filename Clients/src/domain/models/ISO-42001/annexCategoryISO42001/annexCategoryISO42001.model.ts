import { Status } from "../../../types/Status";

export class AnnexCategoryISO42001Model {
  id?: number;
  is_applicable?: boolean;
  justification_for_exclusion?: string;
  implementation_description?: string;
  evidence_links?: object[];
  status?: Status;
  owner?: number;
  reviewer?: number;
  approver?: number;
  due_date?: Date;
  auditor_feedback?: string;
  projects_frameworks_id?: number;
  annexcategory_meta_id?: number;
  created_at?: Date;
  is_demo?: boolean;

  constructor(data: AnnexCategoryISO42001Model) {
    this.id = data.id;
    this.is_applicable = data.is_applicable;
    this.justification_for_exclusion = data.justification_for_exclusion;
    this.implementation_description = data.implementation_description;
    this.evidence_links = data.evidence_links;
    this.status = data.status;
    this.owner = data.owner;
    this.reviewer = data.reviewer;
    this.approver = data.approver;
    this.due_date = data.due_date;
    this.auditor_feedback = data.auditor_feedback;
    this.projects_frameworks_id = data.projects_frameworks_id;
    this.annexcategory_meta_id = data.annexcategory_meta_id;
    this.created_at = data.created_at;
    this.is_demo = data.is_demo;
  }

  static createNewAnnexCategoryISO42001(
    data: AnnexCategoryISO42001Model,
  ): AnnexCategoryISO42001Model {
    return new AnnexCategoryISO42001Model(data);
  }
}
