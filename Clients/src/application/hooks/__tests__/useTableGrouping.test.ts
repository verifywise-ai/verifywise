import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableGrouping, useGroupByState } from "../useTableGrouping";

interface TestItem {
  id: number;
  category: string;
  status: string;
}

describe("useTableGrouping", () => {
  const data: TestItem[] = [
    { id: 1, category: "A", status: "active" },
    { id: 2, category: "B", status: "active" },
    { id: 3, category: "A", status: "inactive" },
    { id: 4, category: "C", status: "active" },
  ];

  const getGroupKey = (item: TestItem, field: string) => (item as any)[field] as string;

  it("returns null when groupByField is null", () => {
    const { result } = renderHook(() =>
      useTableGrouping({ data, groupByField: null, sortOrder: "asc", getGroupKey }),
    );
    expect(result.current).toBeNull();
  });

  it("groups items by field", () => {
    const { result } = renderHook(() =>
      useTableGrouping({ data, groupByField: "category", sortOrder: "asc", getGroupKey }),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.map((g) => g.group)).toEqual(["A", "B", "C"]);
    expect(result.current![0].items).toHaveLength(2);
  });

  it("sorts groups in descending order", () => {
    const { result } = renderHook(() =>
      useTableGrouping({ data, groupByField: "category", sortOrder: "desc", getGroupKey }),
    );
    expect(result.current!.map((g) => g.group)).toEqual(["C", "B", "A"]);
  });

  it("handles multi-key grouping (array return)", () => {
    const multiKeyGetter = (item: TestItem, _field: string) => [item.category, item.status];
    const { result } = renderHook(() =>
      useTableGrouping({
        data,
        groupByField: "multi",
        sortOrder: "asc",
        getGroupKey: multiKeyGetter,
      }),
    );
    expect(result.current!.some((g) => g.group === "active")).toBe(true);
    expect(result.current!.some((g) => g.group === "A")).toBe(true);
  });
});

describe("useGroupByState", () => {
  it("initializes with defaults", () => {
    const { result } = renderHook(() => useGroupByState());
    expect(result.current.groupBy).toBeNull();
    expect(result.current.groupSortOrder).toBe("asc");
  });

  it("handleGroupChange updates state", () => {
    const { result } = renderHook(() => useGroupByState());

    act(() => {
      result.current.handleGroupChange("category", "desc");
    });

    expect(result.current.groupBy).toBe("category");
    expect(result.current.groupSortOrder).toBe("desc");
  });
});
