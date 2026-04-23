import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useModalKeyHandling } from "../useModalKeyHandling";

describe("useModalKeyHandling", () => {
  it("calls onClose when ESC is pressed and modal is open", () => {
    const onClose = vi.fn();
    renderHook(() => useModalKeyHandling({ isOpen: true, onClose }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when modal is closed", () => {
    const onClose = vi.fn();
    renderHook(() => useModalKeyHandling({ isOpen: false, onClose }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onEscapeKey instead of onClose when provided", () => {
    const onClose = vi.fn();
    const onEscapeKey = vi.fn();
    renderHook(() => useModalKeyHandling({ isOpen: true, onClose, onEscapeKey }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscapeKey).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not respond to non-Escape keys", () => {
    const onClose = vi.fn();
    renderHook(() => useModalKeyHandling({ isOpen: true, onClose }));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes event listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useModalKeyHandling({ isOpen: true, onClose }));

    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
