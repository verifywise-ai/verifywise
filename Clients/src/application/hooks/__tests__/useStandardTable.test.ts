import { renderHook, act } from "@testing-library/react";
import { useStandardTable } from "../useStandardTable";

interface TestRow {
  id: number;
  name: string;
  value: number;
}

describe("useStandardTable", () => {
  const mockRows: TestRow[] = [
    { id: 1, name: "Alice", value: 100 },
    { id: 2, name: "Bob", value: 200 },
    { id: 3, name: "Charlie", value: 150 },
    { id: 4, name: "Diana", value: 50 },
    { id: 5, name: "Eve", value: 300 },
  ];

  const defaultSortComparator = (a: TestRow, b: TestRow, key: string) => {
    if (key === "name") {
      return a.name.localeCompare(b.name);
    }
    if (key === "value") {
      return a.value - b.value;
    }
    return 0;
  };

  beforeEach(() => {
    localStorage.clear();
  });

  describe("initialization", () => {
    it("should initialize with default values", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortConfig).toEqual({
        key: "name",
        direction: "desc",
      });
      expect(result.current.page).toBe(0);
      expect(result.current.rowsPerPage).toBe(10);
    });

    it("should use custom default sort direction", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultSortDirection: "asc",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortConfig).toEqual({
        key: "name",
        direction: "asc",
      });
    });

    it("should use saved rows per page from localStorage", () => {
      localStorage.setItem("pagination_rows_test-table", "25");

      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultRowsPerPage: 50,
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.rowsPerPage).toBe(25);
    });

    it("should use default rows per page when no saved value", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultRowsPerPage: 50,
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.rowsPerPage).toBe(50);
    });

    it("should load saved sort config from localStorage", () => {
      localStorage.setItem(
        "verifywise_test-table_sorting",
        JSON.stringify({ key: "value", direction: "asc" })
      );

      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortConfig).toEqual({
        key: "value",
        direction: "asc",
      });
    });

    it("should fall back to defaults for invalid saved config", () => {
      localStorage.setItem("verifywise_test-table_sorting", "invalid-json");

      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortConfig).toEqual({
        key: "name",
        direction: "desc",
      });
    });

    it("should fall back to defaults for partial saved config", () => {
      localStorage.setItem(
        "verifywise_test-table_sorting",
        JSON.stringify({ key: "value" })
      );

      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortConfig).toEqual({
        key: "name",
        direction: "desc",
      });
    });
  });

  describe("sorting", () => {
    it("should sort rows using provided comparator", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultSortDirection: "asc",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortedRows[0].name).toBe("Alice");
      expect(result.current.sortedRows[4].name).toBe("Eve");
    });

    it("should handle three-state sort toggle", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultSortDirection: "asc",
          sortComparator: defaultSortComparator,
        })
      );

      act(() => {
        result.current.handleSort("name");
      });
      expect(result.current.sortConfig.direction).toBe("desc");

      act(() => {
        result.current.handleSort("name");
      });
      expect(result.current.sortConfig.direction).toBeNull();
      expect(result.current.sortConfig.key).toBe("");

      act(() => {
        result.current.handleSort("name");
      });
      expect(result.current.sortConfig.direction).toBe("asc");
    });

    it("should switch column on different sort click", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      act(() => {
        result.current.handleSort("value");
      });

      expect(result.current.sortConfig.key).toBe("value");
      expect(result.current.sortConfig.direction).toBe("asc");
    });

    it("should return unsorted rows when sort is cleared", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      act(() => {
        result.current.handleSort("name");
      });
      act(() => {
        result.current.handleSort("name");
      });

      expect(result.current.sortedRows).toEqual(mockRows);
    });
  });

  describe("pagination", () => {
    it("should calculate correct range string", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultRowsPerPage: 2,
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.getRange).toBe("1 - 2");
      expect(result.current.totalCount).toBe(5);
    });

    it("should handle page change", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultRowsPerPage: 2,
          sortComparator: defaultSortComparator,
        })
      );

      act(() => {
        result.current.handleChangePage({}, 2);
      });

      expect(result.current.page).toBe(2);
      expect(result.current.getRange).toBe("5 - 5");
    });

    it("should handle rows per page change", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          defaultRowsPerPage: 2,
          sortComparator: defaultSortComparator,
        })
      );

      const mockEvent = {
        target: { value: "3" },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleChangeRowsPerPage(mockEvent);
      });

      expect(result.current.rowsPerPage).toBe(3);
      expect(result.current.page).toBe(0);
      expect(localStorage.getItem("pagination_rows_test-table")).toBe("3");
    });

    it("should adjust page when rows decrease below current page", async () => {
      const { result, rerender } = renderHook(
        ({ rows }: { rows: TestRow[] }) =>
          useStandardTable({
            rows,
            storageKey: "test-table",
            defaultSortColumn: "name",
            defaultRowsPerPage: 2,
            sortComparator: defaultSortComparator,
          }),
        { initialProps: { rows: mockRows } }
      );

      act(() => {
        result.current.handleChangePage({}, 2);
      });

      expect(result.current.page).toBe(2);

      rerender({ rows: mockRows.slice(0, 2) });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.validPage).toBe(0);
    });

    it("should handle empty rows", () => {
      const { result } = renderHook(() =>
        useStandardTable({
          rows: [],
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      expect(result.current.sortedRows).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.getRange).toBe("1 - 0");
    });
  });

  describe("localStorage persistence", () => {
    it("should persist sort config to localStorage", () => {
      renderHook(() =>
        useStandardTable({
          rows: mockRows,
          storageKey: "test-table",
          defaultSortColumn: "name",
          sortComparator: defaultSortComparator,
        })
      );

      const saved = localStorage.getItem("verifywise_test-table_sorting");
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved!)).toEqual({
        key: "name",
        direction: "desc",
      });
    });
  });
});
