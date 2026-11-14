/**
 * @fileoverview The table filter for both looks: the rule-builder `FilterBy`
 * in the classic look, `FilterChips` in phase 1. Use this, not `FilterBy`,
 * for new tables.
 *
 * Both emit `onFilterChange(conditions, logic)`, so a page wires it to
 * `useFilterBy` the same way. Pass `data` (the rows before filtering) and the
 * page's `getFieldValue` so the chip menus can list values with counts.
 *
 * @module presentation/components/Table/TableFilter
 */

import React from "react";
import { FilterBy } from "./FilterBy";
import { FilterChips, type FilterChipsProps } from "./FilterChips";
import { isClassicUi } from "../../themes/uiStyle";

export type TableFilterProps<T> = FilterChipsProps<T>;

export function TableFilter<T>({
  data,
  getFieldValue,
  ...filterByProps
}: TableFilterProps<T>): React.ReactElement | null {
  if (isClassicUi()) return <FilterBy {...filterByProps} />;
  return <FilterChips<T> {...filterByProps} data={data} getFieldValue={getFieldValue} />;
}

export default TableFilter;
