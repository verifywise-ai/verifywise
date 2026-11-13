import { useCallback, useState } from "react";
import { FilterCondition } from "../../presentation/components/Table/FilterBy";
import { matchesFilterCondition, NO_VALUE_FILTER_OPERATORS } from "../utils/filterConditions";

export interface UseFilterByResult<T> {
  filterData: (data: T[]) => T[];
  conditions: FilterCondition[];
  logic: "and" | "or";
  handleFilterChange: (conditions: FilterCondition[], logic: "and" | "or") => void;
  activeFilterCount: number;
}

/**
 * Hook to apply FilterBy conditions to data
 * @param getFieldValue - Function to get the value of a field from a data item
 */
export function useFilterBy<T>(
  getFieldValue: (item: T, fieldId: string) => string | number | Date | null | undefined,
): UseFilterByResult<T> {
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [logic, setLogic] = useState<"and" | "or">("and");

  const handleFilterChange = useCallback(
    (newConditions: FilterCondition[], newLogic: "and" | "or") => {
      setConditions(newConditions);
      setLogic(newLogic);
    },
    [],
  );

  const filterData = useCallback(
    (data: T[]): T[] => {
      // Filter out conditions that are not active
      // Active = has a value OR uses an operator that doesn't need a value
      const activeConditions = conditions.filter(
        (c) => c.value || NO_VALUE_FILTER_OPERATORS.includes(c.operator),
      );

      if (activeConditions.length === 0) {
        return data;
      }

      return data.filter((item) => {
        const results = activeConditions.map((condition) => {
          const fieldValue = getFieldValue(item, condition.columnId);
          return matchesFilterCondition(fieldValue, condition.operator, condition.value);
        });

        if (logic === "and") {
          return results.every((r) => r);
        } else {
          return results.some((r) => r);
        }
      });
    },
    [conditions, logic, getFieldValue],
  );

  const activeFilterCount = conditions.filter(
    (c) => c.value || NO_VALUE_FILTER_OPERATORS.includes(c.operator),
  ).length;

  return {
    filterData,
    conditions,
    logic,
    handleFilterChange,
    activeFilterCount,
  };
}
