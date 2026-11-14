import { clearNoticeMarkers, clearViewMarker, markViewRequested } from "./noticeStorage";

const decisions = new Map<string, boolean>();

/**
 * Whether this page load may ask the server about a notice. markViewRequested
 * answers true only the first time, so the answer is remembered per id: later
 * renders and remounts read the stored decision instead of asking again.
 */
export function mayRequestView(id: string | null): boolean {
  if (id === null) return false;
  const known = decisions.get(id);
  if (known !== undefined) return known;
  const allowed = markViewRequested(id);
  decisions.set(id, allowed);
  return allowed;
}

/**
 * A view request failed: free its marker so a later page load asks again. The
 * remembered decision flips to false (not deleted), so a re-render in this page
 * load does not mark the id as requested again without sending a request.
 */
export function failView(id: string): void {
  clearViewMarker(id);
  decisions.set(id, false);
}

/** Forgets every marker and remembered decision: a session ended or started. */
export function clearNoticeSessionState(): void {
  clearNoticeMarkers();
  decisions.clear();
}

/** Test helper: forget remembered decisions. */
export function resetViewDecisions(): void {
  decisions.clear();
}
