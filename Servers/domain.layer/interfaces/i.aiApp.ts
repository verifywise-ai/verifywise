import { AiAppDiscoveredSource, AiAppPolicyStatus, AiAppStatus } from "../enums/ai-app-status.enum";

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
  created_at?: Date;
  updated_at?: Date;
}

export interface IAIAppModel {
  id?: number;
  ai_app_id: number;
  model_inventory_id: number;
  created_at?: Date;
}

export interface IAIAppPolicy {
  id?: number;
  ai_app_id: number;
  policy_id: number;
  status: AiAppPolicyStatus;
  created_at?: Date;
  updated_at?: Date;
}

export interface IAIAppDataExposure {
  id?: number;
  ai_app_id: number;
  data_type: string;
  allowed: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface IAIAppDepartment {
  id?: number;
  ai_app_id: number;
  department: string;
  user_count: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IAIAppDetail extends IAIApp {
  vendor?: {
    id: number;
    vendor_name: string;
    risk_score?: number | null;
    review_status?: string | null;
  } | null;
  owner?: {
    id: number;
    name: string;
    surname: string;
    email?: string;
  } | null;
  models: {
    id: number;
    provider: string;
    model: string;
    version: string;
    status: string;
    risk_score?: number | null;
  }[];
  policies: {
    id: number;
    title: string;
    status: AiAppPolicyStatus;
  }[];
  data_exposure: {
    data_type: string;
    allowed: boolean;
  }[];
  departments: {
    department: string;
    user_count: number;
  }[];
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
  data_exposure?: { data_type: string; allowed: boolean }[];
  departments?: { department: string; user_count: number }[];
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
