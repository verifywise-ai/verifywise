import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileColumnVisibility, DEFAULT_COLUMNS } from "../useFileColumnVisibility";

describe("useFileColumnVisibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with all default columns visible", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    DEFAULT_COLUMNS.forEach((col) => {
      if (col.defaultVisible) {
        expect(result.current.isColumnVisible(col.key)).toBe(true);
      }
    });
  });

  it("toggles column visibility", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    expect(result.current.isColumnVisible("uploader")).toBe(true);

    act(() => {
      result.current.toggleColumn("uploader");
    });

    expect(result.current.isColumnVisible("uploader")).toBe(false);

    act(() => {
      result.current.toggleColumn("uploader");
    });

    expect(result.current.isColumnVisible("uploader")).toBe(true);
  });

  it("cannot hide always-visible columns", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.toggleColumn("file");
    });

    expect(result.current.isColumnVisible("file")).toBe(true);
  });

  it("setColumnVisible works", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.setColumnVisible("version", false);
    });

    expect(result.current.isColumnVisible("version")).toBe(false);

    act(() => {
      result.current.setColumnVisible("version", true);
    });

    expect(result.current.isColumnVisible("version")).toBe(true);
  });

  it("resets to defaults", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.toggleColumn("uploader");
      result.current.toggleColumn("source");
    });

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.isColumnVisible("uploader")).toBe(true);
    expect(result.current.isColumnVisible("source")).toBe(true);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.toggleColumn("status");
    });

    const stored = JSON.parse(localStorage.getItem("verifywise:file-column-visibility")!);
    expect(stored).not.toContain("status");
  });

  it("getTableColumns returns visible columns with proper format", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    const columns = result.current.getTableColumns();
    expect(columns.length).toBeGreaterThan(0);
    expect(columns[0]).toHaveProperty("id");
    expect(columns[0]).toHaveProperty("name");
    expect(columns[0]).toHaveProperty("sx");
  });

  it("visibleColumnKeys returns ordered array", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    expect(result.current.visibleColumnKeys).toContain("file");
    expect(result.current.visibleColumnKeys).toContain("action");
  });
});
