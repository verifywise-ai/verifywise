/**
 * Custom events for AI action approvals.
 *
 * When the user approves an AI write action (e.g. `agent_create_risk`)
 * from the approval modal, the underlying entity (a risk, a vendor, etc.)
 * is created server-side as part of the approval transaction. The page
 * showing that entity's table is usually mounted in the background and
 * has no idea anything changed. We dispatch a window-scoped CustomEvent
 * here so those pages can subscribe and refetch.
 *
 * Mirrors the pattern in `./fileEvents.ts` — keep them in sync if either
 * grows new helpers.
 */

export const AI_ACTION_EVENTS = {
  COMPLETED: "aiAction:completed",
} as const;

export interface AiActionCompletedDetail {
  /** Tool name from the approval payload — e.g. `agent_create_risk`. */
  toolName?: string;
  /** Final approval status. Listeners typically only act on `approved`. */
  status?: "approved" | "rejected";
}

/**
 * Dispatch an AI-action completion event. Called from the approval modal
 * after the approve/reject API call succeeds.
 */
export function dispatchAiActionCompleted(detail?: AiActionCompletedDetail) {
  window.dispatchEvent(new CustomEvent(AI_ACTION_EVENTS.COMPLETED, { detail }));
}

/**
 * Subscribe to AI-action completion events. Returns a cleanup function
 * suitable for a useEffect return.
 */
export function onAiActionCompleted(
  callback: (detail?: AiActionCompletedDetail) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<AiActionCompletedDetail>;
    callback(customEvent.detail);
  };
  window.addEventListener(AI_ACTION_EVENTS.COMPLETED, handler);
  return () => window.removeEventListener(AI_ACTION_EVENTS.COMPLETED, handler);
}
