import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommandPalette } from "../useCommandPalette";

describe("useCommandPalette", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.isOpen).toBe(false);
  });

  it("opens with open()", () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("closes with close()", () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it("toggles with toggle()", () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it("opens on Cmd+K", () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("closes on Escape when open", () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      result.current.open();
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(result.current.isOpen).toBe(false);
  });

  it("toggles on Ctrl+K", () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });

    expect(result.current.isOpen).toBe(true);
  });
});
