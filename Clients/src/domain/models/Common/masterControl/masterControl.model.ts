/**
 * Master Control — client-side domain model for the Controls Hub feature.
 *
 * A master control represents an organization-owned control that can be mapped
 * to one or more framework requirements (EU AI Act, ISO 42001, ISO 27001,
 * NIST AI RMF). Backed on the server by the `master_controls` table.
 *
 * See:
 *  - `application/repository/masterControl.repository.ts`  (HTTP layer)
 *  - `application/hooks/useMasterControls.ts`             (React Query hooks)
 *  - `presentation/pages/ControlsHub/**`                   (UI)
 */

export type MasterControlStatus = "Waiting" | "In progress" | "Done";

export type MasterControlRiskReview =
  | "Acceptable risk"
  | "Residual risk"
  | "Unacceptable risk";

export const MASTER_CONTROL_STATUSES: readonly MasterControlStatus[] = [
  "Waiting",
  "In progress",
  "Done",
] as const;

export const MASTER_CONTROL_RISK_REVIEWS: readonly MasterControlRiskReview[] = [
  "Acceptable risk",
  "Residual risk",
  "Unacceptable risk",
] as const;

export type Framework =
  | "eu_ai_act"
  | "iso_42001"
  | "iso_27001"
  | "nist_ai_rmf";

export type FrameworkEntityType =
  | "control_eu"
  | "subcontrol_eu"
  | "subclause_struct_iso"
  | "annex_category_iso"
  | "subcategory_nist"
  | "iso27001_subclause"
  | "iso27001_annex_category";

export interface MasterControlFrameworkMapping {
  id?: number;
  master_control_id: number;
  framework: Framework;
  framework_entity_type: FrameworkEntityType;
  framework_entity_id: number;
  /** Optional human-readable identifier resolved server-side. */
  framework_entity_code?: string;
  framework_entity_title?: string;
  created_at?: string;
}

export class MasterControlModel {
  id?: number;
  title!: string;
  description?: string | null;
  status!: MasterControlStatus;
  risk_review?: MasterControlRiskReview | null;
  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;
  due_date?: string | null;
  implementation_details?: string | null;
  is_demo?: boolean;
  created_at?: string;
  updated_at?: string;

  /** Optional — populated by endpoints that eager-load mappings. */
  mappings?: MasterControlFrameworkMapping[];

  constructor(data: Partial<MasterControlModel>) {
    this.id = data.id;
    this.title = data.title ?? "";
    this.description = data.description ?? null;
    this.status = (data.status as MasterControlStatus) ?? "Waiting";
    this.risk_review = data.risk_review ?? null;
    this.owner = data.owner ?? null;
    this.reviewer = data.reviewer ?? null;
    this.approver = data.approver ?? null;
    this.due_date = data.due_date ?? null;
    this.implementation_details = data.implementation_details ?? null;
    this.is_demo = data.is_demo ?? false;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.mappings = data.mappings ?? [];
  }

  static createNewMasterControl(
    data: Partial<MasterControlModel>
  ): MasterControlModel {
    return new MasterControlModel({
      title: data.title ?? "",
      status: (data.status as MasterControlStatus) ?? "Waiting",
      is_demo: false,
      ...data,
    });
  }

  static fromApiData(apiData: any): MasterControlModel {
    return new MasterControlModel({
      id: apiData?.id,
      title: apiData?.title ?? "",
      description: apiData?.description ?? null,
      status: apiData?.status ?? "Waiting",
      risk_review: apiData?.risk_review ?? null,
      owner: apiData?.owner ?? null,
      reviewer: apiData?.reviewer ?? null,
      approver: apiData?.approver ?? null,
      due_date: apiData?.due_date ?? null,
      implementation_details: apiData?.implementation_details ?? null,
      is_demo: Boolean(apiData?.is_demo),
      created_at: apiData?.created_at,
      updated_at: apiData?.updated_at,
      mappings: Array.isArray(apiData?.mappings) ? apiData.mappings : [],
    });
  }

  isValid(): boolean {
    return (
      typeof this.title === "string" &&
      this.title.trim().length > 0 &&
      MASTER_CONTROL_STATUSES.includes(this.status)
    );
  }

  isComplete(): boolean {
    return this.status === "Done";
  }

  isInProgress(): boolean {
    return this.status === "In progress";
  }

  isWaiting(): boolean {
    return this.status === "Waiting";
  }

  getMappingCountByFramework(framework: Framework): number {
    if (!this.mappings) return 0;
    return this.mappings.filter((m) => m.framework === framework).length;
  }

  getFormattedDueDate(): string {
    if (!this.due_date) return "—";
    const d = new Date(this.due_date);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}
