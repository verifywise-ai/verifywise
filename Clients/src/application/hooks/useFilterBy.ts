import { useCallback, useState } from "react";
import { FilterCondition, FilterOperator } from "../../presentation/components/Table/FilterBy";

export interface UseFilterByResult<T> {
  filterData: (data: T[]) => T[];
  conditions: FilterCondition[];
  logic: "and" | "or";
  handleFilterChange: (conditions: FilterCondition[], logic: "and" | "or") => void;
  activeFilterCount: number;
}

// Date operators that don't require a value input
const DATE_OPERATORS: FilterOperator[] = [
  "in_1_day",
  "in_7_days",
  "in_2_weeks",
  "in_30_days",
  "is_past",
  "is_today",
];

// All operators that don't require a value
const NO_VALUE_OPERATORS: FilterOperator[] = ["is_empty", "is_not_empty", ...DATE_OPERATORS];

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

  // Helper to parse date from various formats
  const parseDate = useCallback((value: string | number | Date | null | undefined): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  // Helper to check if a date is within a certain number of days from now
  const isWithinDays = useCallback((date: Date | null, days: number): boolean => {
    if (!date) return false;
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);

    // Create a copy to avoid mutating the original date
    const dateToCompare = new Date(date);

    // Set times to start of day for comparison
    now.setHours(0, 0, 0, 0);
    futureDate.setHours(23, 59, 59, 999);
    dateToCompare.setHours(12, 0, 0, 0); // Midday to avoid timezone issues

    return dateToCompare >= now && dateToCompare <= futureDate;
  }, []);

  // Helper to check if a date is today
  const isToday = useCallback((date: Date | null): boolean => {
    if (!date) return false;
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }, []);

  // Helper to check if a date is in the past
  const isPast = useCallback((date: Date | null): boolean => {
    if (!date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  }, []);

  const evaluateCondition = useCallback(
    (
      itemValue: string | number | Date | null | undefined,
      operator: FilterOperator,
      filterValue: string,
    ): boolean => {
      // Handle date operators
      if (DATE_OPERATORS.includes(operator)) {
        const dateValue = parseDate(itemValue);

        switch (operator) {
          case "in_1_day":
            return isWithinDays(dateValue, 1);
          case "in_7_days":
            return isWithinDays(dateValue, 7);
          case "in_2_weeks":
            return isWithinDays(dateValue, 14);
          case "in_30_days":
            return isWithinDays(dateValue, 30);
          case "is_today":
            return isToday(dateValue);
          case "is_past":
            return isPast(dateValue);
          default:
            return true;
        }
      }

      // Handle text/select operators
      const itemStr = (itemValue ?? "").toString().toLowerCase();
      const filterStr = filterValue.toLowerCase();

      switch (operator) {
        case "is":
          return itemStr === filterStr;
        case "is_not":
          return itemStr !== filterStr;
        case "is_empty":
          return !itemValue || itemStr === "";
        case "is_not_empty":
          return !!itemValue && itemStr !== "";
        case "contains":
          return itemStr.includes(filterStr);
        case "does_not_contain":
          return !itemStr.includes(filterStr);
        default:
          return true;
      }
    },
    [parseDate, isWithinDays, isToday, isPast],
  );

  const filterData = useCallback(
    (data: T[]): T[] => {
      // Filter out conditions that are not active
      // Active = has a value OR uses an operator that doesn't need a value
      const activeConditions = conditions.filter(
        (c) => c.value || NO_VALUE_OPERATORS.includes(c.operator),
      );

      if (activeConditions.length === 0) {
        return data;
      }

      return data.filter((item) => {
        const results = activeConditions.map((condition) => {
          const fieldValue = getFieldValue(item, condition.columnId);
          return evaluateCondition(fieldValue, condition.operator, condition.value);
        });

        if (logic === "and") {
          return results.every((r) => r);
        } else {
          return results.some((r) => r);
        }
      });
    },
    [conditions, logic, getFieldValue, evaluateCondition],
  );

  const activeFilterCount = conditions.filter(
    (c) => c.value || NO_VALUE_OPERATORS.includes(c.operator),
  ).length;

  return {
    filterData,
    conditions,
    logic,
    handleFilterChange,
    activeFilterCount,
  };
}
