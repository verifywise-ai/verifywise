import { describe, it, expect, vi } from "vitest";
import {
  getFocusableElements,
  handleFocusTrapKeyDown,
  hasOpenNestedOverlay,
  isFocusInNestedOverlay,
  shouldYieldFocusTrap,
} from "../focusTrap";

describe("focusTrap utils", () => {
  it("returns focusable elements inside a container", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <button>First</button>
      <input type="text" />
      <button disabled>Disabled</button>
      <a href="#">Link</a>
    `;

    const focusable = getFocusableElements(container);
    expect(focusable).toHaveLength(3);
  });

  it("wraps Tab focus from last to first element", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button id="first">First</button><button id="last">Last</button>`;
    document.body.appendChild(container);

    const lastButton = container.querySelector("#last") as HTMLButtonElement;
    lastButton.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    handleFocusTrapKeyDown(event, container);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("first");

    document.body.removeChild(container);
  });

  it("wraps Shift+Tab focus from first to last element", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button id="first">First</button><button id="last">Last</button>`;
    document.body.appendChild(container);

    const firstButton = container.querySelector("#first") as HTMLButtonElement;
    firstButton.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    handleFocusTrapKeyDown(event, container);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("last");

    document.body.removeChild(container);
  });

  it("does not trap Tab when an open MUI modal is stacked outside the container", () => {
    const sidebar = document.createElement("div");
    sidebar.innerHTML = `<button id="sidebar-first">Sidebar</button>`;
    document.body.appendChild(sidebar);

    const modalRoot = document.createElement("div");
    modalRoot.className = "MuiModal-root";
    modalRoot.setAttribute("aria-hidden", "false");
    modalRoot.innerHTML = `<button id="modal-close">Close</button>`;
    document.body.appendChild(modalRoot);

    const modalClose = modalRoot.querySelector("#modal-close") as HTMLButtonElement;
    modalClose.focus();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    const preventDefault = vi.fn();
    Object.defineProperty(event, "preventDefault", { value: preventDefault });

    handleFocusTrapKeyDown(event, sidebar);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(modalClose);

    document.body.removeChild(sidebar);
    document.body.removeChild(modalRoot);
  });

  it("detects nested overlays outside the trap container", () => {
    const sidebar = document.createElement("div");
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    document.body.appendChild(sidebar);

    const modalRoot = document.createElement("div");
    modalRoot.className = "MuiModal-root";
    modalRoot.setAttribute("aria-hidden", "false");
    modalRoot.innerHTML = `<button id="modal-close">Close</button>`;
    document.body.appendChild(modalRoot);

    expect(hasOpenNestedOverlay(sidebar)).toBe(true);

    const modalClose = modalRoot.querySelector("#modal-close") as HTMLButtonElement;
    modalClose.focus();
    expect(isFocusInNestedOverlay(sidebar)).toBe(true);
    expect(shouldYieldFocusTrap(sidebar)).toBe(true);
    expect(hasOpenNestedOverlay(sidebar)).toBe(true);

    document.body.removeChild(sidebar);
    document.body.removeChild(modalRoot);
  });
});
