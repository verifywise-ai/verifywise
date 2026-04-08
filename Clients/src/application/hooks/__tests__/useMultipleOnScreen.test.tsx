import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useMultipleOnScreen from "../useMultipleOnScreen";

describe("useMultipleOnScreen", () => {
  let mockIntersectionObserver: {
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIntersectionObserver = window.IntersectionObserver as unknown as typeof mockIntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("basic functionality", () => {
    it("should return refs array with correct length", () => {
      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 3 })
      );

      expect(result.current.refs).toHaveLength(3);
      expect(result.current.refs.every((ref) => typeof ref === "function")).toBe(true);
    });

    it("should return allVisible as false initially", () => {
      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 3 })
      );

      expect(result.current.allVisible).toBe(false);
    });

    it("should return refs array for countToTrigger of 1", () => {
      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 1 })
      );

      expect(result.current.refs).toHaveLength(1);
      expect(result.current.allVisible).toBe(false);
    });
  });

  describe("callback ref behavior", () => {
    it("should call observe when node is provided", async () => {
      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 2 })
      );

      const mockNode = document.createElement("div");

      await act(async () => {
        result.current.refs[0](mockNode);
      });

      await waitFor(() => {
        expect(result.current.refs[0]).toBeDefined();
      });
    });

    it("should generate unique refs for each element", async () => {
      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 3 })
      );

      expect(result.current.refs[0]).not.toBe(result.current.refs[1]);
      expect(result.current.refs[1]).not.toBe(result.current.refs[2]);
    });
  });

  describe("visibility tracking", () => {
    it("should set allVisible to true when countToTrigger elements are registered", async () => {
      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 2 })
      );

      const mockNode1 = document.createElement("div");
      const mockNode2 = document.createElement("div");

      await act(async () => {
        result.current.refs[0](mockNode1);
      });

      await act(async () => {
        result.current.refs[1](mockNode2);
      });

      await waitFor(() => {
        expect(result.current.refs).toHaveLength(2);
      });

      expect(result.current.refs).toHaveLength(2);
    });

    it("should handle visibility tracking for different counts", async () => {
      const { result: result1 } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 1 })
      );

      expect(result1.current.allVisible).toBe(false);

      const { result: result3 } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 3 })
      );

      expect(result3.current.allVisible).toBe(false);
    });
  });

  describe("options", () => {
    it("should accept options parameter", () => {
      const options: IntersectionObserverInit = {
        root: null,
        rootMargin: "100px",
        threshold: 0.5,
      };

      const { result } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 1, options })
      );

      expect(result.current.refs).toHaveLength(1);
    });
  });

  describe("updates", () => {
    it("should regenerate refs when countToTrigger changes", async () => {
      const { result, rerender } = renderHook(
        ({ count }) => useMultipleOnScreen<HTMLDivElement>({ countToTrigger: count }),
        { initialProps: { count: 2 } }
      );

      expect(result.current.refs).toHaveLength(2);

      rerender({ count: 4 });

      expect(result.current.refs).toHaveLength(4);
    });

    it("should update allVisible when countToTrigger increases", async () => {
      const { result: result1 } = renderHook(() =>
        useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 1 })
      );

      expect(result1.current.allVisible).toBe(false);
    });
  });
});
