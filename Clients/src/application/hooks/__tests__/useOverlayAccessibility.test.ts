import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { useOverlayAccessibility } from "../useOverlayAccessibility";

describe("useOverlayAccessibility", () => {
  it("calls onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    const containerRef = createRef<HTMLDivElement>();

    renderHook(() =>
      useOverlayAccessibility({
        isOpen: true,
        onClose,
        containerRef,
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the previously focused element on close", () => {
    const onClose = vi.fn();
    const containerRef = createRef<HTMLDivElement>();
    const trigger = document.createElement("button");
    trigger.textContent = "Trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderHook(() =>
      useOverlayAccessibility({
        isOpen: true,
        onClose,
        containerRef,
        restoreFocus: true,
      }),
    );

    unmount();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it("does not close on Escape when a nested MUI modal is open above the container", () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-modal", "true");
    document.body.appendChild(container);
    const containerRef = { current: container };

    const modalRoot = document.createElement("div");
    modalRoot.className = "MuiModal-root";
    modalRoot.setAttribute("aria-hidden", "false");
    document.body.appendChild(modalRoot);

    renderHook(() =>
      useOverlayAccessibility({
        isOpen: true,
        onClose,
        containerRef,
      }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    document.body.removeChild(container);
    document.body.removeChild(modalRoot);
  });
});
