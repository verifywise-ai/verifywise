import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnVisibility, ColumnConfig } from "../useColumnVisibility";

type TestColumn = "name" | "email" | "role" | "status";

const columns: ColumnConfig<TestColumn>[] = [
  { key: "name", label: "Name", defaultVisible: true, alwaysVisible: true },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "role", label: "Role", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: false },
];

describe("useColumnVisibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with default visible columns", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test", columns })
    );

    expect(result.current.isColumnVisible("name")).toBe(true);
    expect(result.current.isColumnVisible("email")).toBe(true);
    expect(result.current.isColumnVisible("role")).toBe(true);
    expect(result.current.isColumnVisible("status")).toBe(false);
  });

  it("toggleColumn hides a visible column", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test", columns })
    );

    act(() => {
      result.current.toggleColumn("email");
    });

    expect(result.current.isColumnVisible("email")).toBe(false);
  });

  it("toggleColumn cannot hide alwaysVisible columns", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test", columns })
    );

    act(() => {
      result.current.toggleColumn("name");
    });

    expect(result.current.isColumnVisible("name")).toBe(true);
  });

  it("toggleColumn shows a hidden column", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test", columns })
    );

    act(() => {
      result.current.toggleColumn("status");
    });

    expect(result.current.isColumnVisible("status")).toBe(true);
  });

  it("resetToDefaults restores default visibility", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test", columns })
    );

    act(() => {
      result.current.toggleColumn("email");
      result.current.toggleColumn("status");
    });

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.isColumnVisible("email")).toBe(true);
    expect(result.current.isColumnVisible("status")).toBe(false);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test-persist", columns })
    );

    act(() => {
      result.current.toggleColumn("role");
    });

    const stored = JSON.parse(localStorage.getItem("verifywise:columns:test-persist")!);
    expect(stored).not.toContain("role");
  });

  it("restores from localStorage", () => {
    localStorage.setItem("verifywise:columns:test-restore", JSON.stringify(["name", "status"]));

    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test-restore", columns })
    );

    expect(result.current.isColumnVisible("name")).toBe(true);
    expect(result.current.isColumnVisible("status")).toBe(true);
    expect(result.current.isColumnVisible("email")).toBe(false);
  });

  it("getVisibleColumnConfigs returns only visible configs", () => {
    const { result } = renderHook(() =>
      useColumnVisibility({ tableId: "test", columns })
    );

    const visible = result.current.getVisibleColumnConfigs();
    expect(visible.map((c) => c.key)).toEqual(["name", "email", "role"]);
  });
});
