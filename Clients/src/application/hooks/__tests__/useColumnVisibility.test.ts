import { renderHook, act } from "@testing-library/react";
import { useColumnVisibility } from "../useColumnVisibility";

vi.mock("react", async () => {
  const actual = await vi.importActual("react");
  return {
    ...actual,
    useState: (initialValue: unknown) => {
      const original = (actual as Record<string, unknown>).useState;
      return original!(initialValue);
    },
  };
});

const TEST_COLUMNS = [
  { key: "col1", label: "Column 1", defaultVisible: true },
  { key: "col2", label: "Column 2", defaultVisible: true },
  { key: "col3", label: "Column 3", defaultVisible: false },
  { key: "col4", label: "Column 4", defaultVisible: false, alwaysVisible: true },
];

describe("useColumnVisibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("initialization", () => {
    it("should initialize with default visible columns when localStorage is empty", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns).toEqual(new Set(["col1", "col2"]));
    });

    it("should include alwaysVisible columns from localStorage when available", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1", "col2"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col1")).toBe(true);
      expect(result.current.visibleColumns.has("col2")).toBe(true);
      expect(result.current.visibleColumns.has("col4")).toBe(true);
    });

    it("should fall back to defaults when localStorage has invalid JSON", () => {
      localStorage.setItem("verifywise:columns:test-table", "invalid-json");

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns).toEqual(new Set(["col1", "col2"]));
    });

    it("should fall back to defaults when localStorage throws", () => {
      const getItemSpy = vi
        .spyOn(localStorage, "getItem")
        .mockImplementation(() => {
          throw new Error("Storage error");
        });

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns).toEqual(new Set(["col1", "col2"]));

      getItemSpy.mockRestore();
    });

    it("should handle columns with only defaultVisible", () => {
      const columns = [
        { key: "col1", label: "Column 1", defaultVisible: true },
        { key: "col2", label: "Column 2", defaultVisible: false },
      ];

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns,
        })
      );

      expect(result.current.visibleColumns).toEqual(new Set(["col1"]));
    });

    it("should handle columns with only alwaysVisible", () => {
      const columns = [
        { key: "col1", label: "Column 1", alwaysVisible: true },
        { key: "col2", label: "Column 2", defaultVisible: false },
      ];

      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col2"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns,
        })
      );

      expect(result.current.visibleColumns.has("col1")).toBe(true);
      expect(result.current.visibleColumns.has("col2")).toBe(true);
    });
  });

  describe("toggleColumn", () => {
    it("should toggle column visibility", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col3")).toBe(false);

      act(() => {
        result.current.toggleColumn("col3");
      });

      expect(result.current.visibleColumns.has("col3")).toBe(true);

      act(() => {
        result.current.toggleColumn("col3");
      });

      expect(result.current.visibleColumns.has("col3")).toBe(false);
    });

    it("should not toggle alwaysVisible columns", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1", "col2"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col4")).toBe(true);

      act(() => {
        result.current.toggleColumn("col4");
      });

      expect(result.current.visibleColumns.has("col4")).toBe(true);
    });

    it("should add alwaysVisible columns to stored state when toggling", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col4")).toBe(true);

      act(() => {
        result.current.toggleColumn("col3");
      });

      expect(result.current.visibleColumns.has("col4")).toBe(true);
    });
  });

  describe("setColumnVisible", () => {
    it("should set column visibility explicitly", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col3")).toBe(false);

      act(() => {
        result.current.setColumnVisible("col3", true);
      });

      expect(result.current.visibleColumns.has("col3")).toBe(true);

      act(() => {
        result.current.setColumnVisible("col3", false);
      });

      expect(result.current.visibleColumns.has("col3")).toBe(false);
    });

    it("should not hide alwaysVisible columns", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1", "col2"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col4")).toBe(true);

      act(() => {
        result.current.setColumnVisible("col4", false);
      });

      expect(result.current.visibleColumns.has("col4")).toBe(true);
    });

    it("should allow making alwaysVisible columns visible", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      act(() => {
        result.current.setColumnVisible("col4", true);
      });

      expect(result.current.visibleColumns.has("col4")).toBe(true);
    });
  });

  describe("resetToDefaults", () => {
    it("should reset all columns to default visibility", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      act(() => {
        result.current.toggleColumn("col3");
      });

      expect(result.current.visibleColumns.has("col3")).toBe(true);

      act(() => {
        result.current.resetToDefaults();
      });

      expect(result.current.visibleColumns).toEqual(new Set(["col1", "col2"]));
    });
  });

  describe("isColumnVisible", () => {
    it("should return correct visibility status", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.isColumnVisible("col1")).toBe(true);
      expect(result.current.isColumnVisible("col2")).toBe(true);
      expect(result.current.isColumnVisible("col3")).toBe(false);
    });

    it("should return true for alwaysVisible columns loaded from localStorage", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.isColumnVisible("col4")).toBe(true);
    });
  });

  describe("getVisibleColumnConfigs", () => {
    it("should return only visible column configs", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      const visibleConfigs = result.current.getVisibleColumnConfigs();

      expect(visibleConfigs).toHaveLength(2);
      expect(visibleConfigs.map((c) => c.key)).toEqual(["col1", "col2"]);
    });

    it("should return alwaysVisible columns when loaded from localStorage", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1", "col2"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      const visibleConfigs = result.current.getVisibleColumnConfigs();

      expect(visibleConfigs).toHaveLength(3);
      expect(visibleConfigs.map((c) => c.key)).toEqual([
        "col1",
        "col2",
        "col4",
      ]);
    });
  });

  describe("columnConfigsWithVisibility", () => {
    it("should return all columns with visibility status", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      const configs = result.current.columnConfigsWithVisibility;

      expect(configs).toHaveLength(4);
      expect(configs[0]).toEqual({
        key: "col1",
        label: "Column 1",
        defaultVisible: true,
        visible: true,
      });
      expect(configs[1]).toEqual({
        key: "col2",
        label: "Column 2",
        defaultVisible: true,
        visible: true,
      });
      expect(configs[2]).toEqual({
        key: "col3",
        label: "Column 3",
        defaultVisible: false,
        visible: false,
      });
      expect(configs[3]).toEqual({
        key: "col4",
        label: "Column 4",
        defaultVisible: false,
        alwaysVisible: true,
        visible: false,
      });
    });

    it("should reflect visibility changes", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      act(() => {
        result.current.toggleColumn("col3");
      });

      const configs = result.current.columnConfigsWithVisibility;

      expect(configs[2].visible).toBe(true);
    });
  });

  describe("localStorage persistence", () => {
    it("should save visibility to localStorage on change", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1", "col2"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      act(() => {
        result.current.toggleColumn("col3");
      });

      const stored = JSON.parse(
        localStorage.getItem("verifywise:columns:test-table") || "[]"
      );

      expect(stored).toContain("col1");
      expect(stored).toContain("col2");
      expect(stored).toContain("col3");
    });

    it("should not save alwaysVisible columns to localStorage", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      act(() => {
        result.current.toggleColumn("col4");
      });

      const stored = JSON.parse(
        localStorage.getItem("verifywise:columns:test-table") || "[]"
      );

      expect(stored).not.toContain("col4");
    });

    it("should handle localStorage.setItem errors gracefully", () => {
      const setItemSpy = vi
        .spyOn(localStorage, "setItem")
        .mockImplementation(() => {
          throw new Error("Storage error");
        });

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(() => {
        act(() => {
          result.current.toggleColumn("col3");
        });
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it("should filter out removed columns when loading from localStorage", () => {
      localStorage.setItem(
        "verifywise:columns:test-table",
        JSON.stringify(["col1", "col2", "removed-col"])
      );

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns.has("col1")).toBe(true);
      expect(result.current.visibleColumns.has("col2")).toBe(true);
      expect(result.current.visibleColumns.has("removed-col")).toBe(false);
    });
  });

  describe("allColumns", () => {
    it("should return all column configurations", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.allColumns).toEqual(TEST_COLUMNS);
    });
  });

  describe("edge cases", () => {
    it("should handle empty columns array", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: [],
        })
      );

      expect(result.current.visibleColumns).toEqual(new Set());
      expect(result.current.allColumns).toEqual([]);
    });

    it("should handle custom storage prefix", () => {
      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
          storagePrefix: "custom:prefix",
        })
      );

      act(() => {
        result.current.toggleColumn("col3");
      });

      const stored = localStorage.getItem("custom:prefix:test-table");
      expect(stored).toBe(JSON.stringify(["col1", "col2", "col3"]));
    });

    it("should handle empty localStorage value", () => {
      localStorage.setItem("verifywise:columns:test-table", "");

      const { result } = renderHook(() =>
        useColumnVisibility({
          tableId: "test-table",
          columns: TEST_COLUMNS,
        })
      );

      expect(result.current.visibleColumns).toEqual(new Set(["col1", "col2"]));
    });
  });
});
