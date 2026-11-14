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
export function clearViewMarker(id: string): void {
  try {
    sessionStorage.removeItem(`${REQUESTED_PREFIX}${id}`);
  } catch {
    // Storage blocked: there is no marker to clear.
  }
}

/** Removes every view marker. Called when a session ends or a new one starts. */
export function clearNoticeMarkers(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(REQUESTED_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage blocked: there are no markers to clear.
  }
}

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
