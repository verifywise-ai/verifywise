/**
 * Shared constants and small utility components for the Shadow AI pages.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { TableHead, TableRow, TableCell, Box, Typography, Tooltip } from "@mui/material";
import { ChevronsUpDown, ChevronUp, ChevronDown, Info } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";

/** Period filter options shared by InsightsPage and UserActivityPage. */
export const PERIOD_OPTIONS = [
  { _id: "7d", name: "Last 7 days" },
  { _id: "30d", name: "Last 30 days" },
  { _id: "90d", name: "Last 90 days" },
];

/** Icon component used as the MUI Select dropdown indicator. */
export const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

// ─── Table sorting ──────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc" | null;

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export interface SortableColumn {
  id: string;
  label: string;
  sortable?: boolean;
  tooltip?: string;
}

/**
 * Hook for table sorting with localStorage persistence.
 * Returns sortConfig, handleSort, and a sortRows helper.
 */
export function useTableSort(
  storageKey: string,
  defaultKey = "",
  defaultDirection: SortDirection = null,
) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.key !== undefined && parsed.direction !== undefined) return parsed;
      } catch {
        /* ignore */
      }
    }
    return { key: defaultKey, direction: defaultDirection };
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(sortConfig));
  }, [storageKey, sortConfig]);

  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prev) => {
      if (prev.key === columnId) {
        if (prev.direction === "asc") return { key: columnId, direction: "desc" as SortDirection };
        if (prev.direction === "desc") return { key: "", direction: null };
      }
      return { key: columnId, direction: "asc" as SortDirection };
    });
  }, []);

  return { sortConfig, handleSort };
}

/**
 * Generic sort helper for an array of objects.
 * getValue maps a row + column key to a comparable value.
 */
export function useSortedRows<T>(
  rows: T[],
  sortConfig: SortConfig,
  getValue: (row: T, key: string) => string | number,
): T[] {
  return useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const aVal = getValue(a, sortConfig.key);
      const bVal = getValue(b, sortConfig.key);
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortConfig.direction === "asc" ? cmp : -cmp;
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, sortConfig, getValue]);
}

/**
 * Reusable sortable table header for Shadow AI tables.
 */
export function SortableTableHead({
  columns,
  sortConfig,
  onSort,
}: {
  columns: SortableColumn[];
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
}) {
  return (
    <TableHead>
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((col) => (
          <TableCell
            key={col.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              ...(col.sortable !== false
                ? {
                    "cursor": "pointer",
                    "userSelect": "none",
                    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
                  }
                : {}),
            }}
            onClick={() => col.sortable !== false && onSort(col.id)}
          >
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  fontSize: "13px",
                  color: sortConfig.key === col.id ? "primary.main" : "inherit",
                }}
              >
                {col.label}
              </Typography>
              {col.tooltip && (
                <Tooltip
                  title={col.tooltip}
                  arrow
                  placement="top"
                  slotProps={{
                    tooltip: { sx: { maxWidth: 280, fontSize: 12, lineHeight: 1.5 } },
                  }}
                >
                  <Box
                    sx={{ display: "flex", alignItems: "center", cursor: "help" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info size={13} strokeWidth={1.5} color={palette.text.disabled} />
                  </Box>
                </Tooltip>
              )}
              {col.sortable !== false && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: sortConfig.key === col.id ? "primary.main" : palette.text.disabled,
                  }}
                >
                  {sortConfig.key === col.id && sortConfig.direction === "asc" && (
                    <ChevronUp size={14} />
                  )}
                  {sortConfig.key === col.id && sortConfig.direction === "desc" && (
                    <ChevronDown size={14} />
                  )}
                  {sortConfig.key !== col.id && <ChevronsUpDown size={14} />}
                </Box>
              )}
            </Box>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}
