export interface Automation {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  trigger: Trigger | null;
  actions: Action[];
  lastRun?: Date;
  status: "active" | "inactive" | "error";
  createdAt: Date;
  updatedAt: Date;
}

export interface Trigger {
  id: string;
  type: TriggerType;
  name: string;
  description: string;
  configuration: Record<string, any>;
  conditions?: TriggerCondition[];
}

export interface Action {
  id: string;
  type: ActionType;
  name: string;
  description: string;
  configuration: Record<string, any>;
  order: number;
}

export interface TriggerCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "in" | "not_in";
  value: any;
}

export type TriggerType =
  | "vendor_added"
  | "model_added"
  | "vendor_review_date_approaching"
  | "project_added"
  | "task_added"
  | "risk_added"
  | "training_added"
  | "vendor_updated"
  | "model_updated"
  | "project_updated"
  | "task_updated"
  | "risk_updated"
  | "training_updated"
  | "policy_updated"
  | "incident_updated"
  | "scheduled_report";

export type ActionType = "send_email";

export interface TriggerTemplate {
  type: TriggerType;
  name: string;
  description: string;
  category:
    | "project"
    | "risk"
    | "control"
    | "vendor"
    | "user"
    | "assessment"
    | "task"
    | "training"
    | "policy"
    | "incident"
    | "reporting";
  icon: string;
  defaultConfiguration: Record<string, any>;
  configurationSchema: ConfigurationField[];
}

export interface ActionTemplate {
  type: ActionType;
  name: string;
  description: string;
  category: "notification" | "record" | "workflow";
  icon: string;
  defaultConfiguration: Record<string, any>;
  configurationSchema: ConfigurationField[];
  compatibleTriggers?: TriggerType[];
}

export interface ConfigurationField {
  key: string;
  label: string;
  type: "text" | "select" | "multiselect" | "number" | "date" | "boolean" | "textarea";
  required: boolean;
  options?: Array<{ value: any; label: string }>;
  placeholder?: string;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface AutomationExecutionLog {
  id: string;
  automationId: string;
  triggered_at: Date;
  trigger_data: Record<string, any>;
  actions: ActionExecutionResult[];
  execution_time_ms?: number;
  status: "success" | "partial_success" | "failure";
  error_message?: string;
}

export interface ActionExecutionResult {
  action_id?: string;
  action_type: string;
  status: "success" | "failure";
  executed_at?: Date;
  result_data?: any;
  error_message?: string;
}
