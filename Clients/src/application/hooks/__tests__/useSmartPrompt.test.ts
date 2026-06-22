import { renderHook } from "@testing-library/react";
import React from "react";
import { SmartPromptProvider } from "../../contexts/SmartPrompt.context";
import { useSmartPrompt } from "../useSmartPrompt";

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(SmartPromptProvider, null, children);
}

describe("useSmartPrompt", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("should return all context values", () => {
    const { result } = renderHook(() => useSmartPrompt(), {
      wrapper: createWrapper(),
    });

    expect(result.current.showPrompt).toBeDefined();
    expect(result.current.dismissPrompt).toBeDefined();
    expect(result.current.hasDontAskAgain).toBeDefined();
    expect(result.current.setDontAskAgain).toBeDefined();
  });

  it("should be able to toggle dontAskAgain", () => {
    const { result } = renderHook(() => useSmartPrompt(), {
      wrapper: createWrapper(),
    });

    expect(result.current.hasDontAskAgain("test-key")).toBe(false);

    result.current.setDontAskAgain("test-key", true);
    expect(result.current.hasDontAskAgain("test-key")).toBe(true);

    result.current.setDontAskAgain("test-key", false);
    expect(result.current.hasDontAskAgain("test-key")).toBe(false);
  });

  it("should check different keys independently", () => {
    const { result } = renderHook(() => useSmartPrompt(), {
      wrapper: createWrapper(),
    });

    result.current.setDontAskAgain("key-a", true);
    expect(result.current.hasDontAskAgain("key-a")).toBe(true);
    expect(result.current.hasDontAskAgain("key-b")).toBe(false);
  });
});
