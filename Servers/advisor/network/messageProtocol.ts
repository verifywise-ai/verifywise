/**
 * Phase 3 — Agent Message Protocol
 *
 * Defines the standardized message format for inter-agent communication.
 */

export interface AgentRequest {
  from: string;
  to: string;
  intent: string;
  payload: {
    message: string;
    context?: Record<string, unknown>;
    tools?: string[];
  };
  correlationId: string;
  organizationId: number;
  userId: number;
  sessionId?: string;
  timestamp: string;
}

export interface AgentResponse {
  from: string;
  to: string;
  correlationId: string;
  result: {
    content: string;
    toolResults?: Record<string, unknown>[];
    confidence: number;
  };
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  duration: number;
  status: "success" | "error" | "partial";
  error?: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  domains: string[];
  keywords: string[];
}

export interface AgentStatus {
  name: string;
  status: "healthy" | "degraded" | "offline";
  lastHeartbeat: string;
  activeRequests: number;
  totalProcessed: number;
}

/**
 * Create a new agent request.
 */
export function createAgentRequest(
  from: string,
  to: string,
  intent: string,
  message: string,
  organizationId: number,
  userId: number,
  context?: Record<string, unknown>,
): AgentRequest {
  return {
    from,
    to,
    intent,
    payload: { message, context },
    correlationId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId,
    userId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a new agent response.
 */
export function createAgentResponse(
  from: string,
  to: string,
  correlationId: string,
  content: string,
  tokensUsed: { input: number; output: number; total: number },
  duration: number,
  status: "success" | "error" | "partial" = "success",
): AgentResponse {
  return {
    from,
    to,
    correlationId,
    result: { content, confidence: 1.0 },
    tokensUsed,
    duration,
    status,
  };
}
