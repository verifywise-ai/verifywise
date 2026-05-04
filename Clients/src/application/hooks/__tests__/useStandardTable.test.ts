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

    // asc → desc
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

    // asc → desc → clear
    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("name"));

    expect(result.current.sortConfig.direction).toBeNull();
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
});
