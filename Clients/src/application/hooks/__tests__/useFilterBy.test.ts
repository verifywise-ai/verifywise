import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterBy } from "../useFilterBy";

interface TestItem {
  name: string;
  status: string;
  date: string | null;
}

describe("useFilterBy", () => {
  const items: TestItem[] = [
    { name: "Alpha", status: "active", date: "2024-01-15" },
    { name: "Beta", status: "inactive", date: null },
    { name: "Charlie", status: "active", date: "2024-06-01" },
    { name: "", status: "", date: null },
  ];

  const getFieldValue = (item: TestItem, fieldId: string) => (item as any)[fieldId] ?? null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns all data when no conditions set", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));
    expect(result.current.filterData(items)).toHaveLength(4);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("filters with 'is' operator", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "status", operator: "is", value: "active" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.status === "active")).toBe(true);
  });

  it("filters with 'is_not' operator", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "status", operator: "is_not", value: "active" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered.every((i) => i.status !== "active")).toBe(true);
  });

  it("filters with 'contains' operator", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "name", operator: "contains", value: "al" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Alpha");
  });

  it("filters with 'does_not_contain' operator", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "name", operator: "does_not_contain", value: "a" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered.every((i) => !i.name.toLowerCase().includes("a"))).toBe(true);
  });

  it("filters with 'is_empty' operator (no value needed)", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "date", operator: "is_empty", value: "" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(2);
  });

  it("filters with 'is_not_empty' operator", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "date", operator: "is_not_empty", value: "" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.date !== null)).toBe(true);
  });

  it("combines conditions with AND logic", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [
          { id: "1", columnId: "status", operator: "is", value: "active" },
          { id: "2", columnId: "name", operator: "contains", value: "pha" },
        ],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Alpha");
  });

  it("combines conditions with OR logic", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [
          { id: "1", columnId: "name", operator: "is", value: "alpha" },
          { id: "2", columnId: "name", operator: "is", value: "beta" },
        ],
        "or",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(2);
  });

  it("tracks active filter count", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [
          { id: "1", columnId: "status", operator: "is", value: "active" },
          { id: "2", columnId: "name", operator: "contains", value: "" },
        ],
        "and",
      );
    });

    expect(result.current.activeFilterCount).toBe(1);
  });

  it("is_today returns true for today's date", () => {
    vi.setSystemTime(new Date(2026, 5, 8, 12, 0, 0));
    const itemsWithToday = [
      { name: "TodayItem", status: "active", date: "2026-06-08T12:00:00" },
      { name: "OldItem", status: "active", date: "2023-01-01" },
    ];

    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "date", operator: "is_today", value: "" }],
        "and",
      );
    });

    const filtered = result.current.filterData(itemsWithToday);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("TodayItem");
  });

  it("is_past returns true for past dates", () => {
    const itemsWithPast = [
      { name: "Past", status: "active", date: "2023-01-01" },
      { name: "Future", status: "active", date: "2099-01-01" },
    ];

    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "date", operator: "is_past", value: "" }],
        "and",
      );
    });

    const filtered = result.current.filterData(itemsWithPast);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Past");
  });

  it("is_empty matches empty string and null values", () => {
    const itemsEmpty = [
      { name: "HasName", status: "active", date: "2024-01-01" },
      { name: "", status: "inactive", date: null },
      { name: "Solo", status: "", date: "2024-01-01" },
    ];

    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "name", operator: "is_empty", value: "" }],
        "and",
      );
    });

    const filtered = result.current.filterData(itemsEmpty);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("inactive");
  });

  it("unknown operator returns true for all items", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "status", operator: "unknown_op" as any, value: "x" }],
        "and",
      );
    });

    const filtered = result.current.filterData(items);
    expect(filtered).toHaveLength(4);
  });

  it("handleFilterChange updates both conditions and logic", () => {
    const { result } = renderHook(() => useFilterBy<TestItem>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ id: "1", columnId: "status", operator: "is", value: "active" }],
        "or",
      );
    });

    expect(result.current.conditions).toHaveLength(1);
    expect(result.current.logic).toBe("or");
  });
});
