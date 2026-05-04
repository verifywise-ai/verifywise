/**
 * Custom events for file-related actions.
 * Used to communicate between components that don't have direct parent-child relationship.
 */

export const FILE_EVENTS = {
  APPROVAL_STATUS_CHANGED: "file:approvalStatusChanged",
} as const;

/**
 * Dispatch a file approval status changed event.
 * This can be listened to by components that need to refresh file data.
 */
export function dispatchFileApprovalChanged(detail?: { fileId?: number; status?: string }) {
  window.dispatchEvent(new CustomEvent(FILE_EVENTS.APPROVAL_STATUS_CHANGED, { detail }));
}

/**
 * Subscribe to file approval status changed events.
 * Returns a cleanup function to remove the listener.
 */
export function onFileApprovalChanged(
  callback: (detail?: { fileId?: number; status?: string }) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ fileId?: number; status?: string }>;
    callback(customEvent.detail);
  };
  window.addEventListener(FILE_EVENTS.APPROVAL_STATUS_CHANGED, handler);
  return () => window.removeEventListener(FILE_EVENTS.APPROVAL_STATUS_CHANGED, handler);
}
