import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import useCommandPalette from "../useCommandPalette";

function pressKey(opts: { key: string; metaKey?: boolean; ctrlKey?: boolean }) {
  const e = new KeyboardEvent("keydown", {
    key: opts.key,
    metaKey: !!opts.metaKey,
    ctrlKey: !!opts.ctrlKey,
    bubbles: true,
    cancelable: true,
  });

  // Make preventDefault observable
  const preventDefault = vi.fn();
  Object.defineProperty(e, "preventDefault", {
    value: preventDefault,
  });

  act(() => {
    document.dispatchEvent(e);
  });

  return { preventDefault };
}

describe("useCommandPalette", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("exposes open/close/toggle and updates isOpen", () => {
    const { result } = renderHook(() => useCommandPalette());

    expect(result.current.isOpen).toBe(false);

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it("Cmd+K toggles and calls preventDefault", async () => {
    const { result } = renderHook(() => useCommandPalette());

    expect(result.current.isOpen).toBe(false);

    const first = pressKey({ key: "k", metaKey: true });
    expect(first.preventDefault).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(result.current.isOpen).toBe(true));

    const second = pressKey({ key: "k", metaKey: true });
    expect(second.preventDefault).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(result.current.isOpen).toBe(false));
  });

  it("Ctrl+K toggles and calls preventDefault", async () => {
    const { result } = renderHook(() => useCommandPalette());

    const { preventDefault } = pressKey({ key: "k", ctrlKey: true });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isOpen).toBe(true));
  });

  it("Escape closes only when open (and calls preventDefault); does nothing when already closed", async () => {
    const { result } = renderHook(() => useCommandPalette());

    // Escape while closed -> should not preventDefault, stays closed
    const first = pressKey({ key: "Escape" });
    expect(first.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);

    // Open then Escape -> closes and preventDefault called
    act(() => result.current.open());
    await waitFor(() => expect(result.current.isOpen).toBe(true));

    const second = pressKey({ key: "Escape" });
    expect(second.preventDefault).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(result.current.isOpen).toBe(false));
  });

  it("locks body scroll when open and restores original overflow when closed", () => {
    document.body.style.overflow = "scroll";

    const { result } = renderHook(() => useCommandPalette());

    expect(document.body.style.overflow).toBe("scroll");

    act(() => result.current.open());
    expect(document.body.style.overflow).toBe("hidden");

    act(() => result.current.close());
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("cleanup removes keydown listener and restores overflow", () => {
    document.body.style.overflow = "auto";

    const { result, unmount } = renderHook(() => useCommandPalette());

    act(() => result.current.open());
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    // overflow restored on cleanup
    expect(document.body.style.overflow).toBe("auto");

    // listener removed: dispatch should not throw
    pressKey({ key: "k", metaKey: true });
  });
});
