import { useEffect, useRef } from "react";

/** Focus and visibilitychange often fire together; calls closer than this are dropped. */
export const POLL_RESUME_MIN_GAP_MS = 2000;

const isVisible = () => document.visibilityState === "visible";

/**
 * Calls `onPoll` every `intervalMs` while the browser tab is visible, and once
 * when the tab comes back (visible again or window focus). Nothing runs while
 * the tab is hidden or `enabled` is false. The first load is the caller's job.
 */
export const usePollWhileVisible = (onPoll: () => void, intervalMs: number, enabled = true) => {
  const onPollRef = useRef(onPoll);
  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  useEffect(() => {
    if (!enabled) return;
    let lastRun = Date.now();
    const run = () => {
      lastRun = Date.now();
      onPollRef.current();
    };

    const interval = setInterval(() => {
      if (isVisible()) run();
    }, intervalMs);

    const onResume = () => {
      if (isVisible() && Date.now() - lastRun >= POLL_RESUME_MIN_GAP_MS) run();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [intervalMs, enabled]);
};
