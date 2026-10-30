import { useEffect, useRef } from "react";

/**
 * Polls closer together than this are dropped: focus and visibilitychange often
 * fire together, focus fires on every switch back to the window, and a resume
 * can land just before an interval tick.
 */
export const POLL_RESUME_MIN_GAP_MS = 10_000;

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
    const minGap = Math.min(POLL_RESUME_MIN_GAP_MS, intervalMs);
    let lastRun = Date.now();
    const run = () => {
      lastRun = Date.now();
      onPollRef.current();
    };

    const runIfDue = () => {
      if (isVisible() && Date.now() - lastRun >= minGap) run();
    };

    const interval = setInterval(runIfDue, intervalMs);
    document.addEventListener("visibilitychange", runIfDue);
    window.addEventListener("focus", runIfDue);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", runIfDue);
      window.removeEventListener("focus", runIfDue);
    };
  }, [intervalMs, enabled]);
};
