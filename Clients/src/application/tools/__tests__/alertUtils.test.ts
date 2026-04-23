import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAlert } from "../alertUtils";

describe("alertUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("handleAlert", () => {
    it("sets the alert with provided properties", () => {
      const setAlert = vi.fn();
      handleAlert({
        variant: "success",
        body: "Operation completed",
        title: "Success",
        setAlert,
      });

      expect(setAlert).toHaveBeenCalledWith({
        variant: "success",
        title: "Success",
        body: "Operation completed",
      });
    });

    it("clears the alert after default timeout (2500ms)", () => {
      const setAlert = vi.fn();
      handleAlert({
        variant: "error",
        body: "Something failed",
        title: "Error",
        setAlert,
      });

      expect(setAlert).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2500);
      expect(setAlert).toHaveBeenCalledTimes(2);
      expect(setAlert).toHaveBeenLastCalledWith(null);
    });

    it("uses custom timeout when provided", () => {
      const setAlert = vi.fn();
      handleAlert({
        variant: "info",
        body: "Info message",
        title: "Info",
        setAlert,
        alertTimeout: 5000,
      });

      vi.advanceTimersByTime(2500);
      expect(setAlert).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2500);
      expect(setAlert).toHaveBeenCalledTimes(2);
      expect(setAlert).toHaveBeenLastCalledWith(null);
    });

    it("returns a cleanup function that clears the timeout", () => {
      const setAlert = vi.fn();
      const cleanup = handleAlert({
        variant: "warning",
        body: "Warning",
        title: "Warn",
        setAlert,
      });

      cleanup();
      vi.advanceTimersByTime(3000);
      // setAlert should only have been called once (the initial set)
      expect(setAlert).toHaveBeenCalledTimes(1);
    });
  });
});
