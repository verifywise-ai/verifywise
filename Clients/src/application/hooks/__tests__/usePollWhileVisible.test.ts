import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePollWhileVisible, POLL_RESUME_MIN_GAP_MS } from "../usePollWhileVisible";

let visibility: DocumentVisibilityState = "visible";

const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("usePollWhileVisible", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls on the interval while the tab is visible", () => {
    const onPoll = vi.fn();
    renderHook(() => usePollWhileVisible(onPoll, 30_000));
    expect(onPoll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(onPoll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("sends nothing while the tab is hidden", () => {
    const onPoll = vi.fn();
    renderHook(() => usePollWhileVisible(onPoll, 30_000));
    setVisibility("hidden");
    vi.advanceTimersByTime(120_000);
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("polls once when the tab becomes visible again", () => {
    const onPoll = vi.fn();
    renderHook(() => usePollWhileVisible(onPoll, 30_000));
    setVisibility("hidden");
    vi.advanceTimersByTime(45_000);
    setVisibility("visible");
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("polls on window focus, but not twice when focus follows visibility", () => {
    const onPoll = vi.fn();
    renderHook(() => usePollWhileVisible(onPoll, 30_000));
    vi.advanceTimersByTime(POLL_RESUME_MIN_GAP_MS);
    window.dispatchEvent(new Event("focus"));
    expect(onPoll).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("skips an interval tick that lands right after a resume poll", () => {
    const onPoll = vi.fn();
    renderHook(() => usePollWhileVisible(onPoll, 30_000));
    setVisibility("hidden");
    vi.advanceTimersByTime(29_500);
    setVisibility("visible");
    expect(onPoll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(onPoll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("ignores window focus soon after the last poll", () => {
    const onPoll = vi.fn();
    renderHook(() => usePollWhileVisible(onPoll, 30_000));
    vi.advanceTimersByTime(POLL_RESUME_MIN_GAP_MS - 1);
    window.dispatchEvent(new Event("focus"));
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("does nothing while disabled and stops on unmount", () => {
    const onPoll = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled }) => usePollWhileVisible(onPoll, 30_000, enabled),
      { initialProps: { enabled: false } },
    );
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("focus"));
    expect(onPoll).not.toHaveBeenCalled();

    rerender({ enabled: true });
    vi.advanceTimersByTime(30_000);
    expect(onPoll).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(60_000);
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback without restarting the interval", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => usePollWhileVisible(cb, 30_000), {
      initialProps: { cb: first },
    });
    vi.advanceTimersByTime(20_000);
    rerender({ cb: second });
    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
