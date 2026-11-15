/**
 * @fileoverview Filter chips: the phase 1 table filter.
 *
 * One chip per select or date column. A chip opens a menu of the values that
 * occur in the table's rows, with a count each; the first item, "All", resets
 * it. Text columns get no chip because the search box covers them.
 *
 * Counts are faceted: an option's count is the rows that pass every other set
 * chip and that option, so it equals what the filter keeps once the option is
 * picked. The page's search box and summary cards filter outside this
 * component, so the counts do not reflect them. A multi-valued field (an
 * array from `getFieldValue`) counts a row once under each value it holds.
 *
 * Emits the same `onFilterChange(conditions, "and")` shape as `FilterBy`, so a
 * page keeps its `useFilterBy` wiring. Render it through `TableFilter`, which
 * keeps `FilterBy` for the classic look.
 *
 * @module presentation/components/Table/FilterChips
 */

import React, { useMemo, useState } from "react";
import { Box, Menu, MenuItem, Stack } from "@mui/material";
import { ChevronDown } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import { VWLink } from "../../Link/VWLink";
import type { FilterByProps, FilterColumn, FilterCondition, FilterOperator } from "../FilterBy";
import {
  matchesFilterCondition,
  type FilterFieldValue,
} from "../../../../application/utils/filterConditions";
import { border, background, text, primitives, radiusPx } from "../../../themes/palette";

export interface FilterChipsProps<T> extends FilterByProps {
  /** The table's rows before filtering. Menus list the values found here, with counts. */
  data?: T[];
  /** Reads a column's value from a row; the same getter the page passes to `useFilterBy`. */
  getFieldValue?: (item: T, columnId: string) => FilterFieldValue;
}

interface ChipSelection {
  operator: FilterOperator;
  value: string;
}

interface ChipMenuOption extends ChipSelection {
  key: string;
  label: string;
}

const DATE_OPTIONS: ChipMenuOption[] = [
  { key: "is_today", operator: "is_today", value: "", label: "Today" },
  { key: "in_7_days", operator: "in_7_days", value: "", label: "In 7 days" },
  { key: "in_30_days", operator: "in_30_days", value: "", label: "In 30 days" },
  { key: "is_past", operator: "is_past", value: "", label: "Past" },
];

const isChipColumn = (column: FilterColumn) => column.type === "select" || column.type === "date";

/** Whether a row passes every selection except the one on `skipColumnId`. */
function passesOtherSelections<T>(
  row: T,
  selections: Record<string, ChipSelection>,
  skipColumnId: string,
  getFieldValue: (item: T, columnId: string) => FilterFieldValue,
): boolean {
  return Object.entries(selections).every(
    ([columnId, selection]) =>
      columnId === skipColumnId ||
      matchesFilterCondition(getFieldValue(row, columnId), selection.operator, selection.value),
  );
}

/** Every option a column's menu can offer, before counting. */
function optionsFor(column: FilterColumn): ChipMenuOption[] {
  if (column.type === "date") return DATE_OPTIONS;
  return (column.options ?? []).map((option) => ({
    key: option.value,
    operator: "is" as const,
    value: option.value,
    label: option.label,
  }));
}

const sameSelection = (a: ChipSelection | undefined, b: ChipSelection) =>
  !!a && a.operator === b.operator && a.value.toLowerCase() === b.value.toLowerCase();

/** Restored conditions a chip can show; anything else (contains, is not, ...) is dropped. */
function selectionsFromConditions(
  columns: FilterColumn[],
  conditions: FilterCondition[] | undefined,
): Record<string, ChipSelection> {
  const result: Record<string, ChipSelection> = {};
  for (const condition of conditions ?? []) {
    const column = columns.find((c) => c.id === condition.columnId);
    if (!column || !isChipColumn(column)) continue;
    const fits =
      column.type === "date"
        ? DATE_OPTIONS.some((o) => o.operator === condition.operator)
        : condition.operator === "is" && condition.value !== "";
    if (fits) result[column.id] = { operator: condition.operator, value: condition.value };
  }
  return result;
}

/** A stable key for a condition list, so re-renders with an equal list are no-ops. */
function conditionsSignature(conditions: FilterCondition[] | undefined): string {
  return (conditions ?? [])
    .map((condition) => `${condition.columnId}|${condition.operator}|${condition.value}`)
    .join("\n");
}

export function FilterChips<T>({
  columns,
  onFilterChange,
  defaultConditions,
  data,
  getFieldValue,
}: FilterChipsProps<T>): React.ReactElement | null {
  const chipColumns = useMemo(() => columns.filter(isChipColumn), [columns]);
  const [selections, setSelections] = useState<Record<string, ChipSelection>>(() =>
    selectionsFromConditions(columns, defaultConditions),
  );

  // The page owns the filter state (`useFilterBy`), and this component remounts
  // whenever its tab does. Follow the page's conditions when their content
  // changes, so a chip never reads "All" over a filtered table. Compared by
  // content, not identity, and never emitted back, so it cannot loop.
  const conditionsKey = conditionsSignature(defaultConditions);
  const [syncedKey, setSyncedKey] = useState(conditionsKey);
  if (conditionsKey !== syncedKey) {
    setSyncedKey(conditionsKey);
    setSelections(selectionsFromConditions(columns, defaultConditions));
  }
  const [menu, setMenu] = useState<{ columnId: string; anchor: HTMLElement } | null>(null);

  const canCount = !!data && !!getFieldValue;

  const emit = (next: Record<string, ChipSelection>) => {
    setSelections(next);
    const conditions: FilterCondition[] = chipColumns
      .filter((column) => next[column.id])
      .map((column) => ({
        id: `chip-${column.id}`,
        columnId: column.id,
        operator: next[column.id].operator,
        value: next[column.id].value,
      }));
    onFilterChange(conditions, "and");
  };

  const select = (columnId: string, selection: ChipSelection | null) => {
    const next = { ...selections };
    if (selection) next[columnId] = selection;
    else delete next[columnId];
    setMenu(null);
    emit(next);
  };

  /**
   * Options for the open menu: those with at least one row, plus the one
   * already picked. A server-filtered column with a value picked lists every
   * option without counts, since the loaded rows hold only the picked value.
   */
  const menuOptions = useMemo(() => {
    if (!menu) return [];
    const column = chipColumns.find((c) => c.id === menu.columnId);
    if (!column) return [];
    const countable = canCount && !(column.serverFiltered && selections[column.id]);
    const facetRows = countable
      ? data!.filter((row) => passesOtherSelections(row, selections, column.id, getFieldValue!))
      : [];
    return optionsFor(column)
      .map((option) => ({
        ...option,
        count: countable
          ? facetRows.filter((row) =>
              matchesFilterCondition(getFieldValue!(row, column.id), option.operator, option.value),
            ).length
          : undefined,
      }))
      .filter(
        (option) =>
          option.count === undefined ||
          option.count > 0 ||
          sameSelection(selections[column.id], option),
      );
  }, [menu, chipColumns, canCount, data, getFieldValue, selections]);

  if (chipColumns.length === 0) return null;

  const hasSelection = Object.keys(selections).length > 0;

  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" gap="8px" data-testid="filter-chips">
      {chipColumns.map((column) => {
        const selection = selections[column.id];
        const valueLabel = selection
          ? (optionsFor(column).find((o) => sameSelection(selection, o))?.label ?? selection.value)
          : "All";
        const isOpen = menu?.columnId === column.id;
        return (
          <CustomizableButton
            key={column.id}
            variant="outlined"
            size="small"
            testId={`filter-chip-${column.id}`}
            data-state={selection ? "set" : "unset"}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) =>
              setMenu({ columnId: column.id, anchor: event.currentTarget })
            }
            endIcon={<ChevronDown size={14} strokeWidth={1.5} />}
            sx={{
              "borderRadius": radiusPx.pill,
              "fontSize": "12px",
              "fontWeight": 400,
              "padding": "4px 10px 4px 12px",
              "gap": "0px",
              "whiteSpace": "nowrap",
              "color": text.primary,
              "border": `1px solid ${selection ? primitives.green[700] : border.light}`,
              "backgroundColor": selection ? primitives.green[50] : background.main,
              "& .MuiButton-endIcon": { marginLeft: "4px", marginRight: 0 },
              "&:hover": {
                borderColor: selection ? primitives.green[700] : border.dark,
                backgroundColor: selection ? primitives.green[50] : background.hover,
              },
            }}
          >
            <Box component="span">{column.label}: </Box>
            <Box component="span" sx={{ fontWeight: selection ? 500 : 400 }}>
              {valueLabel}
            </Box>
          </CustomizableButton>
        );
      })}

      {hasSelection && (
        <VWLink onClick={() => emit({})} showUnderline={false} testId="filter-chips-clear">
          Clear filters
        </VWLink>
      )}

      <Menu
        open={!!menu}
        anchorEl={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        data-testid={menu ? `filter-chip-menu-${menu.columnId}` : undefined}
        slotProps={{
          paper: {
            sx: {
              mt: "4px",
              minWidth: "180px",
              borderRadius: radiusPx.sm,
              border: `1px solid ${border.light}`,
              boxShadow: "none",
            },
          },
        }}
      >
        <MenuItem
          selected={!!menu && !selections[menu.columnId]}
          onClick={() => menu && select(menu.columnId, null)}
          data-testid={menu ? `filter-chip-option-${menu.columnId}-all` : undefined}
          sx={{ fontSize: "13px" }}
        >
          <Box component="span">All</Box>
        </MenuItem>
        {menu &&
          menuOptions.map((option) => (
            <MenuItem
              key={option.key}
              selected={sameSelection(selections[menu.columnId], option)}
              onClick={() =>
                select(menu.columnId, { operator: option.operator, value: option.value })
              }
              data-testid={`filter-chip-option-${menu.columnId}-${option.key}`}
              sx={{ fontSize: "13px", justifyContent: "space-between", gap: "16px" }}
            >
              <Box component="span">{option.label}</Box>
              {option.count !== undefined && (
                <Box component="span" sx={{ color: text.tertiary, fontSize: "12px" }}>
                  {option.count}
                </Box>
              )}
            </MenuItem>
          ))}
      </Menu>
    </Stack>
  );
}

export default FilterChips;
