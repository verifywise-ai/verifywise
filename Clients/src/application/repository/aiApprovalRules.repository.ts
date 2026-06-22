import { apiServices } from "../../infrastructure/api/networkServices";

export interface ApprovalRule {
  id: number | null;
  name: string;
  description: string;
  conditions: Record<string, unknown>;
  event_type: "auto-approve" | "require-approval" | "auto-reject";
  event_params: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  is_default: boolean;
  organization_id: number;
}

export async function listApprovalRules(): Promise<ApprovalRule[]> {
  const response = await apiServices.get<any>("/ai-approval-rules");
  return response.data?.data || response.data || [];
}

export async function createApprovalRule(rule: Partial<ApprovalRule>): Promise<ApprovalRule> {
  const response = await apiServices.post<any>("/ai-approval-rules", rule);
  return response.data?.data || response.data;
}

export async function updateApprovalRule(
  id: number,
  rule: Partial<ApprovalRule>,
): Promise<ApprovalRule> {
  const response = await apiServices.put<any>(`/ai-approval-rules/${id}`, rule);
  return response.data?.data || response.data;
}

export async function deleteApprovalRule(id: number): Promise<void> {
  await apiServices.delete<any>(`/ai-approval-rules/${id}`);
}

export async function testApprovalRule(
  rule: Partial<ApprovalRule>,
  facts: Record<string, unknown>,
): Promise<{ matched: boolean; decision?: string; evaluatedFacts: Record<string, unknown> }> {
  const response = await apiServices.post<any>("/ai-approval-rules/test", { rule, facts });
  return response.data?.data || response.data;
}
