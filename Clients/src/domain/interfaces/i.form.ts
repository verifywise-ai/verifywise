import { CreateProjectFormUserModel } from "../models/Common/user/user.model";

export interface FormValues {
  vendorName: number;
  actionOwner: number;
  riskName: string;
  reviewDate: string;
  riskDescription: string;
}

// Note: FormErrors has been moved to: presentation/types/form.props.ts

export interface CreateProjectFormValues {
  project_title: string;
  owner: number;
  external_owner_name: string;
  external_owner_email: string;
  members: CreateProjectFormUserModel[];
  start_date: string;
  ai_risk_classification: number;
  type_of_high_risk_role: number;
  goal: string;
}

// Note: CreateProjectFormErrors has been moved to: presentation/types/form.props.ts
