/**
 * Approval request events: a request was approved, rejected or withdrawn
 * somewhere other than the top bar's own modal (e.g. the Approval workflows
 * page opened from a Home link), so listeners such as the top-bar count can
 * refresh.
 */

export const APPROVAL_REQUEST_EVENTS = {
  CHANGED: "approvalRequest:changed",
} as const;

export function dispatchApprovalRequestsChanged() {
  window.dispatchEvent(new CustomEvent(APPROVAL_REQUEST_EVENTS.CHANGED));
}

/** Returns a cleanup function that removes the listener. */
export function onApprovalRequestsChanged(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(APPROVAL_REQUEST_EVENTS.CHANGED, handler);
  return () => window.removeEventListener(APPROVAL_REQUEST_EVENTS.CHANGED, handler);
}
