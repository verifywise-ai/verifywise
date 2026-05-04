import { useState, useMemo } from "react";

export interface GroupedData<T> {
  group: string;
  items: T[];
}

export interface UseTableGroupingProps<T> {
  data: T[];
  groupByField: string | null;
  sortOrder: "asc" | "desc";
  getGroupKey: (item: T, field: string) => string | string[];
}

export function useTableGrouping<T>({
  data,
  groupByField,
  sortOrder,
  getGroupKey,
}: UseTableGroupingProps<T>): GroupedData<T>[] | null {
  return useMemo(() => {
    if (!groupByField) return null;

    const groups: Record<string, T[]> = {};

    data.forEach((item) => {
      const keys = getGroupKey(item, groupByField);
      const groupKeys = Array.isArray(keys) ? keys : [keys];

      groupKeys.forEach((groupKey) => {
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(item);
      });
    });

    // Sort group keys
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      if (sortOrder === "asc") {
        return a.localeCompare(b);
      } else {
        return b.localeCompare(a);
      }
    });

    // Convert to array of {group, items}
    return sortedGroupKeys.map((key) => ({
      group: key,
      items: groups[key],
    }));
  }, [data, groupByField, sortOrder, getGroupKey]);
}

export function useGroupByState(defaultGroupBy?: string, defaultSortOrder: "asc" | "desc" = "asc") {
  const [groupBy, setGroupBy] = useState<string | null>(defaultGroupBy || null);
  const [groupSortOrder, setGroupSortOrder] = useState<"asc" | "desc">(defaultSortOrder);

  const handleGroupChange = (field: string | null, sortOrder: "asc" | "desc") => {
    setGroupBy(field);
    setGroupSortOrder(sortOrder);
  };

  return {
    groupBy,
    groupSortOrder,
    handleGroupChange,
  };
}
