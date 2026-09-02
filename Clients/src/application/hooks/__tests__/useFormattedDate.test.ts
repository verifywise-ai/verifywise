import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { UserDateFormat } from "../../../domain/enums/userDateFormat.enum";

const prefs = { current: { date_format: UserDateFormat.DD_MM_YYYY_DASH } };

vi.mock("../useUserPreferences", () => ({
  default: () => ({ userPreferences: prefs.current }),
}));

import useFormattedDate from "../useFormattedDate";

describe("useFormattedDate", () => {
  beforeEach(() => {
    prefs.current = { date_format: UserDateFormat.DD_MM_YYYY_DASH };
  });

  it("formats with DD-MM-YYYY by default", () => {
    const { result } = renderHook(() => useFormattedDate());
    expect(result.current("2024-11-01")).toBe("01-11-2024");
  });

  it.each([
    [UserDateFormat.DD_MM_YYYY_DASH, "01-11-2024"],
    [UserDateFormat.MM_DD_YYYY_DASH, "11-01-2024"],
    [UserDateFormat.DD_MM_YY_SLASH, "01/11/24"],
    [UserDateFormat.MM_DD_YY_SLASH, "11/01/24"],
  ])("formats 2024-11-01 as %s", (dateFormat, expected) => {
    prefs.current = { date_format: dateFormat };
    const { result } = renderHook(() => useFormattedDate());
    expect(result.current("2024-11-01")).toBe(expected);
  });

  it("appends HH:mm when includeTime is true", () => {
    const { result } = renderHook(() => useFormattedDate());
    expect(result.current("2024-11-01T14:30:25", { includeTime: true })).toBe("01-11-2024, 14:30");
  });

  it("includes seconds when requested", () => {
    const { result } = renderHook(() => useFormattedDate());
    expect(result.current("2024-11-01T14:30:25", { includeTime: true, includeSeconds: true })).toBe(
      "01-11-2024, 14:30:25",
    );
  });

  it("does not throw for an invalid date", () => {
    const { result } = renderHook(() => useFormattedDate());
    expect(() => result.current("not-a-date")).not.toThrow();
    expect(result.current("not-a-date")).toBe("not-a-date");
  });

  it("returns an em dash for empty values", () => {
    const { result } = renderHook(() => useFormattedDate());
    expect(result.current(null)).toBe("—");
    expect(result.current(undefined)).toBe("—");
    expect(result.current("")).toBe("—");
  });

  it("updates output when the preference changes", () => {
    const { result, rerender } = renderHook(() => useFormattedDate());
    expect(result.current("2024-11-01")).toBe("01-11-2024");

    prefs.current = { date_format: UserDateFormat.MM_DD_YYYY_DASH };
    rerender();

    expect(result.current("2024-11-01")).toBe("11-01-2024");
  });
});
