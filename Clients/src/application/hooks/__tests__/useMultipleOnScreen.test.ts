import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import useMultipleOnScreen from "../useMultipleOnScreen";

describe("useMultipleOnScreen", () => {
  it("returns refs array with the correct length", () => {
    const { result } = renderHook(() =>
      useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 3 })
    );

    expect(result.current.refs).toHaveLength(3);
    expect(result.current.allVisible).toBe(false);
  });

  it("allVisible is false initially", () => {
    const { result } = renderHook(() =>
      useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 2 })
    );

    expect(result.current.allVisible).toBe(false);
  });

  it("creates ref callbacks that are functions", () => {
    const { result } = renderHook(() =>
      useMultipleOnScreen<HTMLDivElement>({ countToTrigger: 2 })
    );

    result.current.refs.forEach((ref) => {
      expect(typeof ref).toBe("function");
    });
  });
});
