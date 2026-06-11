import { apiServices } from "../../infrastructure/api/networkServices";
import { store } from "../redux/store";
import { ENV_VARs } from "../../../env.vars";

/**
 * Command plane (multi-step advisor commands) shared contract.
 *
 * These types mirror the canonical definitions in
 * `Servers/advisor/commandEngine/types.ts`. They are duplicated here (rather
 * than imported across the FE/BE boundary) so the frontend stays
 * self-contained — the shapes MUST stay in lock-step with the backend.
 */

/** A single planned step the command engine intends to execute. */
export interface CommandStep {
  order: number;
  description: string;
  intent: string;
  agent: string;
  toolName?: string;
  requiresApproval: boolean;
  inputs: Record<string, unknown>;
}

/** Lifecycle status of a single step during execution. */
export type StepStatus =
  | "pending"
  | "executing"
  | "awaiting_approval"
  | "completed"
  | "failed";

/** A status update emitted (one per SSE event) while a command runs. */
export interface StepStatusEvent {
  stepOrder: number;
  status: StepStatus;
  result?: unknown;
  error?: string;
  approvalId?: string;
}

/** Response of POST /api/advisor/command-plan. */
export interface CommandPlanResponse {
  steps: CommandStep[];
}

/**
 * Plan a multi-step command. Posts the natural-language command to the
 * backend planner and returns the ordered steps it intends to run.
 */
export const postCommandPlan = async (
  command: string,
  llmKeyId?: number,
): Promise<CommandPlanResponse> => {
  const res = await apiServices.post<CommandPlanResponse>("/advisor/command-plan", {
    command,
    llmKeyId,
  });
  return res.data;
};

/**
 * Get the direct backend URL for the command-execute SSE endpoint.
 *
 * Mirrors `useAdvisorRuntime`'s `getChatApiUrl`: in development we bypass the
 * Vite dev proxy (which buffers SSE) by hitting the backend directly.
 */
const getCommandExecuteUrl = (): string => {
  if (import.meta.env.PROD) {
    return `${ENV_VARs.URL}/api/advisor/command-execute`;
  }
  const devBase = import.meta.env.VITE_APP_API_BASE_URL || "http://localhost:3000";
  return `${devBase}/api/advisor/command-execute`;
};

/**
 * Execute a planned command as an SSE stream.
 *
 * Mirrors how `useAdvisorRuntime` talks to the backend: a direct `fetch` with
 * the bearer token pulled from the Redux store, reading the response body as a
 * stream. The backend emits one `data: {json}\n\n` SSE frame per
 * `StepStatusEvent`, terminated by a final event with status
 * `completed`/`failed`. Each parsed event is handed to `onEvent`.
 */
export const executeCommand = async (
  steps: CommandStep[],
  onEvent: (event: StepStatusEvent) => void,
  options?: { conversationId?: string; llmKeyId?: number; signal?: AbortSignal },
): Promise<void> => {
  const token = store.getState().auth?.authToken;

  const response = await fetch(getCommandExecuteUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      steps,
      conversationId: options?.conversationId,
      llmKeyId: options?.llmKeyId,
    }),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Command execute failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE frames are separated by a blank line ("\n\n"). We accumulate chunks
  // and flush complete frames as they arrive, leaving any partial frame in
  // the buffer for the next read.
  const flushFrames = () => {
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (dataLine) {
        const json = dataLine.slice("data:".length).trim();
        if (json) {
          try {
            onEvent(JSON.parse(json) as StepStatusEvent);
          } catch {
            // Ignore malformed frames — a partial/garbage frame must not
            // tear down the whole stream reader.
          }
        }
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flushFrames();
  }

  // Flush any trailing complete frame that wasn't newline-terminated.
  buffer += decoder.decode();
  if (buffer.length > 0 && !buffer.endsWith("\n\n")) {
    buffer += "\n\n";
  }
  flushFrames();
};
