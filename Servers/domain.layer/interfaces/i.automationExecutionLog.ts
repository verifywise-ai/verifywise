export interface IAutomationExecutionLog {
  id?: number;
  automation_id: number;
  triggered_at?: Date;
  trigger_data?: object;
  action_results?: IAutomationActionExecutionResult[];
  status?: "success" | "partial_success" | "failure";
  error_message?: string;
  execution_time_ms?: number;
  created_at?: Date;
}

export interface IAutomationActionExecutionResult {
  id?: number;
  execution_log_id: number;
  action_id?: number;
  action_type: string;
  status: "success" | "failure";
  result_data?: object;
  error_message?: string;
  executed_at?: Date;
}
