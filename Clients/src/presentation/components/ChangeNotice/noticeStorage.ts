const OFF_SWITCH_KEY = "vw-change-notices";
const REQUESTED_PREFIX = "vw-change-notice-requested:";

/** True when notices are switched off (E2E setup and video recordings set this). */
export function noticesSuppressed(): boolean {
  try {
    return localStorage.getItem(OFF_SWITCH_KEY) === "off";
  } catch {
    return false;
  }
}

/**
 * Marks a notice's view as requested in this tab session. Returns false when it
 * already was, so StrictMode double mounts and re-renders don't count as visits.
 * Storage blocked: returns true, so the notice still works.
 */
export function markViewRequested(id: string): boolean {
  try {
    const key = `${REQUESTED_PREFIX}${id}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
