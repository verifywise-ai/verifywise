import { AiAppDiscoveredSource, AiAppPolicyStatus, AiAppStatus } from "../enums/aiApp.enum";

export interface IAIApp {
  id?: number;
  organization_id: number;
  name: string;
  description?: string | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
  owner_id?: number | null;
  status: AiAppStatus;
  risk_score?: number | null;
  discovered_source: AiAppDiscoveredSource;
  shadow_ai_tool_id?: number | null;
  required_training?: string | null;
  is_demo?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface IAIAppVendor {
  id: number;
  vendor_name: string;
  risk_score?: number | null;
  review_status?: string | null;
}

export interface IAIAppOwner {
  id: number;
  name: string;
  surname: string;
  email?: string;
}

export interface IAIAppModel {
  id: number;
  provider: string;
  model: string;
  version: string;
  status: string;
  risk_score?: number | null;
}

export interface IAIAppPolicy {
  id: number;
  title: string;
  status: AiAppPolicyStatus;
}

export interface IAIAppDataExposure {
  data_type: string;
  allowed: boolean;
}

export interface IAIAppDepartment {
  department: string;
  user_count: number;
}

export interface IAIAppDetail extends IAIApp {
  vendor: IAIAppVendor | null;
  owner: IAIAppOwner | null;
  models: IAIAppModel[];
  policies: IAIAppPolicy[];
  data_exposure: IAIAppDataExposure[];
  departments: IAIAppDepartment[];
}

export interface IAIAppListResponse {
  ai_apps: IAIApp[];
  total: number;
}

export interface IAIAppCreatePayload {
  name: string;
  description?: string;
  vendor_id?: number | null;
  owner_id?: number | null;
  status?: AiAppStatus;
  discovered_source?: AiAppDiscoveredSource;
  shadow_ai_tool_id?: number | null;
  required_training?: string;
  model_inventory_ids?: number[];
  policy_ids?: number[];
  data_exposure?: IAIAppDataExposure[];
  departments?: IAIAppDepartment[];
}

export interface IAIAppUpdatePayload {
  name?: string;
  description?: string | null;
  vendor_id?: number | null;
  owner_id?: number | null;
  status?: AiAppStatus;
  discovered_source?: AiAppDiscoveredSource;
  shadow_ai_tool_id?: number | null;
  required_training?: string | null;
  risk_score?: number | null;
}

export interface IAIAppFormErrors {
  name?: string;
  vendor_id?: string;
  owner_id?: string;
  status?: string;
}

export interface IPolicySuggestion {
  id: number | null;
  title: string;
  suggested: boolean;
}

export interface IGetAiAppsFilters {
  status?: AiAppStatus;
  vendorId?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
}
