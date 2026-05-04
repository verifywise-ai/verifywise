import { Status } from "../../../types/Status";

export class SubClauseISO42001Model {
  id?: number;
  implementation_description!: string;
  evidence_links!: object[];
  status!: Status;
  owner!: number;
  reviewer!: number;
  approver!: number;
  due_date!: Date;
  auditor_feedback!: string;
  subclause_meta_id!: number;
  projects_frameworks_id!: number;
  created_at!: Date;
  is_demo?: boolean;

  constructor(data: SubClauseISO42001Model) {
    this.id = data.id;
    this.implementation_description = data.implementation_description;
    this.evidence_links = data.evidence_links;
    this.status = data.status;
    this.owner = data.owner;
    this.reviewer = data.reviewer;
    this.approver = data.approver;
    this.due_date = data.due_date;
    this.auditor_feedback = data.auditor_feedback;
    this.subclause_meta_id = data.subclause_meta_id;
    this.projects_frameworks_id = data.projects_frameworks_id;
    this.created_at = data.created_at;
    this.is_demo = data.is_demo;
  }

  static createNewSubClauseISO42001(data: SubClauseISO42001Model): SubClauseISO42001Model {
    return new SubClauseISO42001Model(data);
  }
}
