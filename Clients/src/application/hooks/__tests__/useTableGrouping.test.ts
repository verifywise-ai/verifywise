import { renderHook, act } from "@testing-library/react";
import { useTableGrouping, useGroupByState } from "../useTableGrouping";

interface TestItem {
  id: number;
  category: string;
  subcategory?: string;
  name: string;
}

describe("useTableGrouping", () => {
  const mockData: TestItem[] = [
    { id: 1, category: "A", name: "Item 1" },
    { id: 2, category: "B", name: "Item 2" },
    { id: 3, category: "A", name: "Item 3" },
    { id: 4, category: "B", name: "Item 4" },
  ];

  const mockGetGroupKey = (item: TestItem, field: string) => {
    if (field === "category") return item.category;
    if (field === "subcategory") return item.subcategory || "none";
    return item.name;
  };

  describe("null groupByField", () => {
    it("should return null when groupByField is null", () => {
      const { result } = renderHook(() =>
        useTableGrouping({
          data: mockData,
          groupByField: null,
          sortOrder: "asc",
          getGroupKey: mockGetGroupKey,
        })
      );

      expect(result.current).toBeNull();
    });

    it("should return null when groupByField is undefined", () => {
      const { result } = renderHook(() =>
        useTableGrouping({
          data: mockData,
          groupByField: null as unknown as string,
          sortOrder: "asc",
          getGroupKey: mockGetGroupKey,
        })
      );

      expect(result.current).toBeNull();
    });
  });

  describe("grouping behavior", () => {
    it("should group data by category in ascending order", () => {
      const { result } = renderHook(() =>
        useTableGrouping({
          data: mockData,
          groupByField: "category",
          sortOrder: "asc",
          getGroupKey: mockGetGroupKey,
        })
      );

      expect(result.current).toHaveLength(2);
      expect(result.current![0].group).toBe("A");
      expect(result.current![0].items).toHaveLength(2);
      expect(result.current![1].group).toBe("B");
      expect(result.current![1].items).toHaveLength(2);
    });

    it("should group data by category in descending order", () => {
      const { result } = renderHook(() =>
        useTableGrouping({
          data: mockData,
          groupByField: "category",
          sortOrder: "desc",
          getGroupKey: mockGetGroupKey,
        })
      );

      expect(result.current![0].group).toBe("B");
      expect(result.current![1].group).toBe("A");
    });

    it("should handle empty data array", () => {
      const { result } = renderHook(() =>
        useTableGrouping({
          data: [],
          groupByField: "category",
          sortOrder: "asc",
          getGroupKey: mockGetGroupKey,
        })
      );

      expect(result.current).toHaveLength(0);
    });

    it("should handle data with missing group key values", () => {
      const dataWithMissing: TestItem[] = [
        { id: 1, category: "A", name: "Item 1" },
        { id: 2, category: "", name: "Item 2" },
        { id: 3, category: "A", name: "Item 3" },
      ];

      const { result } = renderHook(() =>
        useTableGrouping({
          data: dataWithMissing,
          groupByField: "category",
          sortOrder: "asc",
          getGroupKey: mockGetGroupKey,
        })
      );

      expect(result.current).toHaveLength(2);
      expect(result.current![0].group).toBe("");
      expect(result.current![0].items).toHaveLength(1);
    });
  });

  describe("getGroupKey returning array", () => {
    it("should handle multiple group keys from single item", () => {
      const dataWithMultiTags: Array<{ id: number; tags: string[] }> = [
        { id: 1, tags: ["red", "blue"] },
        { id: 2, tags: ["blue", "green"] },
      ];

      const multiGroupGetKey = (item: { id: number; tags: string[] }, field: string) => {
        return item.tags;
      };

      const { result } = renderHook(() =>
        useTableGrouping({
          data: dataWithMultiTags,
          groupByField: "tags",
          sortOrder: "asc",
          getGroupKey: multiGroupGetKey,
        })
      );

      expect(result.current).toHaveLength(3);
      expect(result.current!.map((g) => g.group).sort()).toEqual(["blue", "green", "red"]);
      expect(result.current!.find((g) => g.group === "blue")!.items).toHaveLength(2);
      expect(result.current!.find((g) => g.group === "red")!.items).toHaveLength(1);
    });
  });

  describe("performance", () => {
    it("should not recreate result when dependencies are stable", () => {
      const { result, rerender } = renderHook(
        ({ data }: { data: TestItem[] }) =>
          useTableGrouping({
            data,
            groupByField: "category",
            sortOrder: "asc",
            getGroupKey: mockGetGroupKey,
          }),
        { initialProps: { data: mockData } }
      );

      const firstResult = result.current;

      rerender({ data: mockData });

      expect(result.current).toBe(firstResult);
    });
  });
});

describe("useGroupByState", () => {
  describe("initialization", () => {
    it("should initialize with null groupBy and default sort order", () => {
      const { result } = renderHook(() => useGroupByState());

      expect(result.current.groupBy).toBeNull();
      expect(result.current.groupSortOrder).toBe("asc");
    });

    it("should initialize with provided default values", () => {
      const { result } = renderHook(() =>
        useGroupByState("category", "desc")
      );

      expect(result.current.groupBy).toBe("category");
      expect(result.current.groupSortOrder).toBe("desc");
    });

    it("should use default sort order when only groupBy is provided", () => {
      const { result } = renderHook(() => useGroupByState("category"));

      expect(result.current.groupBy).toBe("category");
      expect(result.current.groupSortOrder).toBe("asc");
    });

    it("should handle empty string as default", () => {
      const { result } = renderHook(() =>
        useGroupByState("")
      );

      expect(result.current.groupBy).toBeNull();
    });
  });

  describe("handleGroupChange", () => {
    it("should update groupBy and sort order", () => {
      const { result } = renderHook(() => useGroupByState());

      act(() => {
        result.current.handleGroupChange("category", "desc");
      });

      expect(result.current.groupBy).toBe("category");
      expect(result.current.groupSortOrder).toBe("desc");
    });

    it("should clear groupBy when set to null", () => {
      const { result } = renderHook(() =>
        useGroupByState("category", "asc")
      );

      act(() => {
        result.current.handleGroupChange(null, "asc");
      });

      expect(result.current.groupBy).toBeNull();
    });

    it("should handle multiple group changes", () => {
      const { result } = renderHook(() => useGroupByState());

      act(() => {
        result.current.handleGroupChange("category", "asc");
      });
      expect(result.current.groupBy).toBe("category");

      act(() => {
        result.current.handleGroupChange("subcategory", "desc");
      });
      expect(result.current.groupBy).toBe("subcategory");
      expect(result.current.groupSortOrder).toBe("desc");
    });
  });
});
