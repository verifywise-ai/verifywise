import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useFileColumnVisibility,
  DEFAULT_COLUMNS,
  SCHEMA_VERSION,
} from "../useFileColumnVisibility";

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

    const stored = JSON.parse(localStorage.getItem("verifywise_file_column_visibility")!);
    expect(stored).not.toContain("status");
  });

  it("migrates from the legacy un-namespaced key once", () => {
    localStorage.setItem("verifywise:file-column-visibility", JSON.stringify(["file", "action"]));
    // Seed the CURRENT version so this exercises migration only, with no schema
    // upgrade. Hardcoding a number here is what silently broke this test when
    // SCHEMA_VERSION was bumped from 3 to 4 for the "quality" column.
    localStorage.setItem("verifywise:file-column-visibility-version", String(SCHEMA_VERSION));

    const { result } = renderHook(() => useFileColumnVisibility());

    // Restored from legacy data (version is current, so no new defaults added).
    expect(result.current.isColumnVisible("uploader")).toBe(false);
    expect(result.current.isColumnVisible("file")).toBe(true);
    // Value migrated to the namespaced key; legacy key removed.
    expect(localStorage.getItem("verifywise_file_column_visibility")).not.toBeNull();
    expect(localStorage.getItem("verifywise:file-column-visibility")).toBeNull();
  });

  // The schema-upgrade path had no coverage, which is why bumping
  // SCHEMA_VERSION broke the test above instead of failing a test of its own.
  it("adds newly-defaulted columns when the stored version is behind", () => {
    localStorage.setItem("verifywise_file_column_visibility", JSON.stringify(["file", "action"]));
    localStorage.setItem("verifywise_file_column_visibility_version", String(SCHEMA_VERSION - 1));

    const { result } = renderHook(() => useFileColumnVisibility());

    // An outdated stored set gains every defaultVisible column it was missing.
    expect(result.current.isColumnVisible("uploader")).toBe(true);
    expect(result.current.isColumnVisible("quality")).toBe(true);
    // And the stored version is advanced so this only happens once.
    expect(localStorage.getItem("verifywise_file_column_visibility_version")).toBe(
      String(SCHEMA_VERSION),
    );
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
