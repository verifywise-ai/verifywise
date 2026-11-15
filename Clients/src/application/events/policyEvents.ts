/**
 * Custom events for policy approval changes.
 * The approval requests modal decides or withdraws a policy request outside
 * the policy pages' tree; it dispatches this event and the policy pages
 * refetch (see usePolicyApprovalChangedListener).
 */

export const POLICY_EVENTS = {
  APPROVAL_STATUS_CHANGED: "policy:approvalStatusChanged",
} as const;

export interface PolicyApprovalChangedDetail {
  policyId?: number;
  status?: "approved" | "rejected" | "withdrawn";
}

/** Dispatch a policy approval status changed event. */
export function dispatchPolicyApprovalChanged(detail?: PolicyApprovalChangedDetail) {
  window.dispatchEvent(new CustomEvent(POLICY_EVENTS.APPROVAL_STATUS_CHANGED, { detail }));
}

/**
 * Subscribe to policy approval status changed events.
 * Returns a cleanup function to remove the listener.
 */
export function onPolicyApprovalChanged(
  callback: (detail?: PolicyApprovalChangedDetail) => void,
): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<PolicyApprovalChangedDetail | undefined>).detail);
  };
  window.addEventListener(POLICY_EVENTS.APPROVAL_STATUS_CHANGED, handler);
  return () => window.removeEventListener(POLICY_EVENTS.APPROVAL_STATUS_CHANGED, handler);
}
