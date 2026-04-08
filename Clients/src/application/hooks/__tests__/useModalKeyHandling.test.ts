import { renderHook } from "@testing-library/react";
import { useModalKeyHandling } from "../useModalKeyHandling";

describe("useModalKeyHandling", () => {
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(document, "addEventListener");
    removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe("initial state", () => {
    it("should not add keydown event listener when modal is closed", () => {
      const onClose = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: false, onClose })
      );

      const keydownCalls = addEventListenerSpy.mock.calls.filter(
        call => call[0] === 'keydown'
      );
      expect(keydownCalls).toHaveLength(0);
    });
  });

  describe("event listener registration", () => {
    it("should add event listener when modal is open", () => {
      const onClose = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose })
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
    });

    it("should remove event listener on unmount", () => {
      const onClose = vi.fn();

      const { unmount } = renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose })
      );

      expect(removeEventListenerSpy).not.toHaveBeenCalled();

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
    });

    it("should remove old listener and add new when isOpen changes", () => {
      const onClose = vi.fn();

      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalKeyHandling({ isOpen, onClose }),
        { initialProps: { isOpen: true } }
      );

      const firstCall = addEventListenerSpy.mock.calls.length;

      rerender({ isOpen: false });

      expect(removeEventListenerSpy).toHaveBeenCalled();

      rerender({ isOpen: true });

      expect(addEventListenerSpy.mock.calls.length).toBeGreaterThan(firstCall);
    });
  });

  describe("keyboard handling", () => {
    it("should call onClose when Escape key is pressed and modal is open", () => {
      const onClose = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose })
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should not call onClose when Escape key is pressed and modal is closed", () => {
      const onClose = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: false, onClose })
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onClose).not.toHaveBeenCalled();
    });

    it("should not call onClose for other keys", () => {
      const onClose = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose })
      );

      const event = new KeyboardEvent("keydown", { key: "Enter" });
      document.dispatchEvent(event);

      expect(onClose).not.toHaveBeenCalled();
    });

    it("should call onEscapeKey when provided and Escape is pressed", () => {
      const onClose = vi.fn();
      const onEscapeKey = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose, onEscapeKey })
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onEscapeKey).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("should call onClose when onEscapeKey is not provided", () => {
      const onClose = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose })
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onEscapeKey and not onClose when both are provided", () => {
      const onClose = vi.fn();
      const onEscapeKey = vi.fn();

      renderHook(() =>
        useModalKeyHandling({ isOpen: true, onClose, onEscapeKey })
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onEscapeKey).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("dependency changes", () => {
    it("should update handler when onClose changes", () => {
      const onClose1 = vi.fn();
      const onClose2 = vi.fn();

      const { rerender } = renderHook(
        ({ onClose }: { onClose: () => void }) =>
          useModalKeyHandling({ isOpen: true, onClose }),
        { initialProps: { onClose: onClose1 } }
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onClose1).toHaveBeenCalledTimes(1);

      rerender({ onClose: onClose2 });

      const event2 = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event2);

      expect(onClose2).toHaveBeenCalledTimes(1);
    });

    it("should update handler when onEscapeKey changes", () => {
      const onClose = vi.fn();
      const onEscapeKey1 = vi.fn();
      const onEscapeKey2 = vi.fn();

      const { rerender } = renderHook(
        ({ onEscapeKey }: { onEscapeKey?: () => void }) =>
          useModalKeyHandling({ isOpen: true, onClose, onEscapeKey }),
        { initialProps: { onEscapeKey: onEscapeKey1 } }
      );

      let event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onEscapeKey1).toHaveBeenCalledTimes(1);

      rerender({ onEscapeKey: onEscapeKey2 });

      event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      expect(onEscapeKey2).toHaveBeenCalledTimes(1);
      expect(onEscapeKey1).not.toHaveBeenCalledTimes(2);
    });
  });
});
