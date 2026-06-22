/**
 * Human Confirmation Flow — Type definitions
 *
 * Every AI write operation (agent_* tools) goes through this confirmation flow:
 * 1. Write tool stores a pending ConfirmationRequest in Redis
 * 2. Returns a ConfirmationToolResult to the LLM
 * 3. Frontend renders approve/reject buttons
 * 4. User approves → backend executes the actual write
 */

export type WarningLevel = "info" | "warning" | "danger";

export type ConfirmationStatus = "pending" | "approved" | "rejected" | "expired";

export interface ConfirmationRequest {
  id: string;
  organizationId: number;
  userId: number;
  toolName: string;
  warningLevel: WarningLevel;
  description: string;
  params: Record<string, unknown>;
  status: ConfirmationStatus;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  resolvedBy?: number;
  result?: unknown;
  error?: string;
}

export interface ConfirmationToolResult {
  confirmation_required: true;
  confirmation_id: string;
  warning_level: WarningLevel;
  description: string;
  tool_name: string;
  params_summary: Record<string, unknown>;
}

export interface ConfirmationResolution {
  confirmation_id: string;
  status: "approved" | "rejected";
  result?: unknown;
  error?: string;
}
