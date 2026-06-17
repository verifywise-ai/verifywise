import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStandardTable } from "../useStandardTable";

interface TestRow {
  id: number;
  name: string;
}

const rows: TestRow[] = [
  { id: 3, name: "Charlie" },
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

const sortComparator = (a: TestRow, b: TestRow, key: string) => {
  const aVal = (a as any)[key];
  const bVal = (b as any)[key];
  if (typeof aVal === "string") return aVal.localeCompare(bVal);
  return aVal - bVal;
};

describe("useStandardTable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sorts rows by default column", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "test",
        defaultSortColumn: "name",
        defaultSortDirection: "asc",
        sortComparator,
      }),
    );

    expect(result.current.sortedRows[0].name).toBe("Alice");
    expect(result.current.sortedRows[2].name).toBe("Charlie");
  });

  it("defaults to desc direction when not provided", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "test",
        defaultSortColumn: "name",
        sortComparator,
      }),
    );

    expect(result.current.sortConfig.direction).toBe("desc");
  });

  it("returns empty array when rows is undefined", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows: undefined as any,
        storageKey: "test",
        defaultSortColumn: "name",
        sortComparator,
      }),
    );

    expect(result.current.sortedRows).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it("handleSort toggles sort direction", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "test",
        defaultSortColumn: "name",
        defaultSortDirection: "asc",
        sortComparator,
      }),
    );

    act(() => {
      result.current.handleSort("name");
    });

    expect(result.current.sortConfig.direction).toBe("desc");
    expect(result.current.sortedRows[0].name).toBe("Charlie");
  });

  it("handleSort clears after desc", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "test",
        defaultSortColumn: "name",
        defaultSortDirection: "asc",
        sortComparator,
      }),
    );

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortConfig.direction).toBeNull();
  });

  it("handleSort on a new column starts asc", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "test",
        defaultSortColumn: "name",
        defaultSortDirection: "asc",
        sortComparator,
      }),
    );

    act(() => result.current.handleSort("id"));

    expect(result.current.sortConfig.key).toBe("id");
    expect(result.current.sortConfig.direction).toBe("asc");
  });

  it("handleSort cycles back to asc from cleared state", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "test",
        defaultSortColumn: "name",
        defaultSortDirection: "asc",
        sortComparator,
      }),
    );

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortConfig.direction).toBe("asc");
  });

  it("pagination works correctly", () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Item ${i}` }));

    const { result } = renderHook(() =>
      useStandardTable({
        rows: manyRows,
        storageKey: "test-page",
        defaultSortColumn: "id",
        defaultRowsPerPage: 10,
        sortComparator,
      }),
    );

    expect(result.current.totalCount).toBe(25);
    expect(result.current.getRange).toBe("1 - 10");

    act(() => {
      result.current.handleChangePage(null, 1);
    });

    expect(result.current.getRange).toBe("11 - 20");
  });

  it("getRange returns '1 - 0' when sortedRows is empty", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows: [],
        storageKey: "test-empty",
        defaultSortColumn: "id",
        sortComparator,
      }),
    );

    expect(result.current.getRange).toBe("1 - 0");
  });

  it("handleChangeRowsPerPage changes rows per page and resets to page 0", () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Item ${i}` }));

    const { result } = renderHook(() =>
      useStandardTable({
        rows: manyRows,
        storageKey: "test-rpp",
        defaultSortColumn: "id",
        defaultRowsPerPage: 10,
        sortComparator,
      }),
    );

    act(() => result.current.handleChangePage(null, 1));
    expect(result.current.page).toBe(1);

    act(() => {
      const event = { target: { value: "25" } } as React.ChangeEvent<HTMLInputElement>;
      result.current.handleChangeRowsPerPage(event);
    });

    expect(result.current.rowsPerPage).toBe(25);
    expect(result.current.page).toBe(0);
    expect(localStorage.getItem("verifywise_pagination_rows_test-rpp")).toBe("25");
  });

  it("validPage adjusts when current page exceeds max", () => {
    const { result } = renderHook(() =>
      useStandardTable({
        rows: Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Item ${i}` })),
        storageKey: "test-vp",
        defaultSortColumn: "id",
        defaultRowsPerPage: 10,
        sortComparator,
      }),
    );

    act(() => result.current.handleChangePage(null, 5));

    expect(result.current.validPage).toBeLessThanOrEqual(2);
    expect(result.current.validPage).toBe(2);
  });

  it("persists sort config to localStorage", () => {
    renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "persist-test",
        defaultSortColumn: "id",
        sortComparator,
      }),
    );

    const stored = JSON.parse(localStorage.getItem("verifywise_persist-test_sorting")!);
    expect(stored.key).toBe("id");
  });

  it("falls back to defaults when localStorage has invalid JSON", () => {
    localStorage.setItem("verifywise_bad-json_sorting", "not-json");

    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "bad-json",
        defaultSortColumn: "name",
        defaultSortDirection: "asc",
        sortComparator,
      }),
    );

    expect(result.current.sortConfig.key).toBe("name");
    expect(result.current.sortConfig.direction).toBe("asc");
  });

  it("falls back to defaults when localStorage has missing key", () => {
    localStorage.setItem("verifywise_bad-key_sorting", JSON.stringify({ direction: "asc" }));

    const { result } = renderHook(() =>
      useStandardTable({
        rows,
        storageKey: "bad-key",
        defaultSortColumn: "id",
        sortComparator,
      }),
    );

    expect(result.current.sortConfig.key).toBe("id");
  });

  it("handleChangePage sets page correctly", () => {
    const manyRows = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Item ${i}` }));
    const { result } = renderHook(() =>
      useStandardTable({
        rows: manyRows,
        storageKey: "test-hcp",
        defaultSortColumn: "id",
        defaultRowsPerPage: 10,
        sortComparator,
      }),
    );

    act(() => result.current.handleChangePage(null, 2));
    expect(result.current.page).toBe(2);
    expect(result.current.getRange).toBe("21 - 30");
  });
});
