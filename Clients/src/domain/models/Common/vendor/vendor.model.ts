import {
  ReviewStatus,
  DataSensitivity,
  BusinessCriticality,
  PastIssues,
  RegulatoryExposure,
} from "../../../enums/status.enum";

export class VendorModel {
  id?: number;
  order_no?: number;
  vendor_name!: string;
  vendor_provides!: string;
  assignee!: number;
  website!: string;
  vendor_contact_person!: string;
  review_result!: string;
  review_status!: ReviewStatus;
  reviewer!: number;
  review_date!: Date;
  is_demo?: boolean;
  created_at?: Date;
  projects?: number[];

  // Vendor scorecard fields
  data_sensitivity?: DataSensitivity;
  business_criticality?: BusinessCriticality;
  past_issues?: PastIssues;
  regulatory_exposure?: RegulatoryExposure;
  risk_score?: number;

  // DORA Register of Information fields (descriptive)
  is_ict_provider?: boolean;
  ict_service_type?:
    | "Cloud services"
    | "Data analysis"
    | "Security services"
    | "Network infrastructure"
    | "Software or applications"
    | "IT project management"
    | "Other ICT services";
  function_criticality?: "Critical" | "Important" | "Not critical";
  substitutability?: "Easily substitutable" | "Difficult to substitute" | "Not substitutable";
  has_exit_plan?: boolean;
  country_of_provision?: string;
  provider_lei?: string;

  custom_fields?: Array<{
    definition_id: number;
    field_key: string;
    label: string;
    field_type: string;
    value: unknown;
  }>;

  constructor(data: VendorModel) {
    this.id = data.id;
    this.order_no = data.order_no;
    this.vendor_name = data.vendor_name;
    this.vendor_provides = data.vendor_provides;
    this.assignee = data.assignee;
    this.website = data.website;
    this.vendor_contact_person = data.vendor_contact_person;
    this.review_result = data.review_result;
    this.review_status = data.review_status;
    this.reviewer = data.reviewer;
    this.review_date = data.review_date;
    this.is_demo = data.is_demo;
    this.created_at = data.created_at;
    this.projects = data.projects;
    this.data_sensitivity = data.data_sensitivity;
    this.business_criticality = data.business_criticality;
    this.past_issues = data.past_issues;
    this.regulatory_exposure = data.regulatory_exposure;
    this.risk_score = data.risk_score;
    this.is_ict_provider = data.is_ict_provider;
    this.ict_service_type = data.ict_service_type;
    this.function_criticality = data.function_criticality;
    this.substitutability = data.substitutability;
    this.has_exit_plan = data.has_exit_plan;
    this.country_of_provision = data.country_of_provision;
    this.provider_lei = data.provider_lei;
    this.custom_fields = data.custom_fields;
  }

  static createNewVendor(data: VendorModel): VendorModel {
    return new VendorModel(data);
  }
}
