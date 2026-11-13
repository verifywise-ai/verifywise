import type { FilterOperator } from "../../presentation/components/Table/FilterBy";

/**
 * Pure matching rules for table filter conditions. `useFilterBy` filters rows
 * with them and the phase 1 filter chips count rows with them, so a chip
 * option's count equals the rows the filter keeps once that option is picked,
 * given the other chips. The page's search box and summary cards are applied
 * outside these rules, so the counts do not reflect them.
 *
 * A multi-valued field (a vendor's projects, a task's assignees) is read as an
 * array: `is` then means "includes" and `is not` means "does not include".
 */

/** One value of a field. */
export type FilterScalarValue = string | number | Date | null | undefined;

/** A field's value: one scalar, or an array for a multi-valued field. */
export type FilterFieldValue = FilterScalarValue | ReadonlyArray<string | number>;

/** Date operators: they need no value input. */
export const DATE_FILTER_OPERATORS: FilterOperator[] = [
  "in_1_day",
  "in_7_days",
  "in_2_weeks",
  "in_30_days",
  "is_past",
  "is_today",
];

/** Operators that need no value input. */
export const NO_VALUE_FILTER_OPERATORS: FilterOperator[] = [
  "is_empty",
  "is_not_empty",
  ...DATE_FILTER_OPERATORS,
];

function parseDate(value: FilterScalarValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** True when the date falls between today and `days` days from now. */
function isWithinDays(date: Date | null, days: number): boolean {
  if (!date) return false;
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + days);

  // Copy so the caller's date is not changed
  const dateToCompare = new Date(date);

  // Compare whole days
  now.setHours(0, 0, 0, 0);
  futureDate.setHours(23, 59, 59, 999);
  dateToCompare.setHours(12, 0, 0, 0); // Midday to avoid timezone issues

  return dateToCompare >= now && dateToCompare <= futureDate;
}

function isToday(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isPast(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date < now;
}

/**
 * Whether one field value passes one filter condition. Text matching ignores
 * case. On an array, a positive operator (is, contains, a date range) passes
 * when any element passes, a negative one (is not, does not contain) when no
 * element matches its positive form, and the empty checks look at the length.
 */
export function matchesFilterCondition(
  itemValue: FilterFieldValue,
  operator: FilterOperator,
  filterValue: string,
): boolean {
  if (Array.isArray(itemValue)) {
    const values = itemValue as ReadonlyArray<string | number>;
    switch (operator) {
      case "is_empty":
        return values.length === 0;
      case "is_not_empty":
        return values.length > 0;
      case "is_not":
        return !values.some((v) => matchesScalar(v, "is", filterValue));
      case "does_not_contain":
        return !values.some((v) => matchesScalar(v, "contains", filterValue));
      default:
        return values.some((v) => matchesScalar(v, operator, filterValue));
    }
  }
  return matchesScalar(itemValue as FilterScalarValue, operator, filterValue);
}

function matchesScalar(
  itemValue: FilterScalarValue,
  operator: FilterOperator,
  filterValue: string,
): boolean {
  if (DATE_FILTER_OPERATORS.includes(operator)) {
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
}
