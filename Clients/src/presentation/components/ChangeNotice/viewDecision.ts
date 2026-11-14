import { markViewRequested } from "./noticeStorage";

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

/** Test helper: forget remembered decisions. */
export function resetViewDecisions(): void {
  decisions.clear();
}
