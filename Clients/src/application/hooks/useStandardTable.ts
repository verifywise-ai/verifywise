import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../utils/paginationStorage";
import type { SortConfig, SortDirection } from "../../domain/types/standardTable";

export type { SortConfig, SortDirection };

interface UseStandardTableOptions<T> {
  rows: T[];
  storageKey: string;
  defaultSortColumn: string;
  defaultSortDirection?: SortDirection;
  defaultRowsPerPage?: number;
  sortComparator: (a: T, b: T, key: string) => number;
}

interface UseStandardTableReturn<T> {
  sortConfig: SortConfig;
  handleSort: (columnId: string) => void;
  sortedRows: T[];
  page: number;
  validPage: number;
  rowsPerPage: number;
  handleChangePage: (_: unknown, newPage: number) => void;
  handleChangeRowsPerPage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  getRange: string;
  totalCount: number;
}

const SORTING_KEY_PREFIX = "verifywise_";
const SORTING_KEY_SUFFIX = "_sorting";

export function useStandardTable<T>(
  options: UseStandardTableOptions<T>
): UseStandardTableReturn<T> {
  const {
    rows,
    storageKey,
    defaultSortColumn,
    defaultSortDirection = "desc",
    defaultRowsPerPage = 10,
    sortComparator,
  } = options;

  const sortingKey = `${SORTING_KEY_PREFIX}${storageKey}${SORTING_KEY_SUFFIX}`;

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount(storageKey, defaultRowsPerPage)
  );

  // Sorting state from localStorage or defaults
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(sortingKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.key || !parsed.direction) {
          return { key: defaultSortColumn, direction: defaultSortDirection };
        }
        return parsed;
      } catch {
        return { key: defaultSortColumn, direction: defaultSortDirection };
      }
    }
    return { key: defaultSortColumn, direction: defaultSortDirection };
  });

  // Persist sorting state
  useEffect(() => {
    localStorage.setItem(sortingKey, JSON.stringify(sortConfig));
  }, [sortConfig, sortingKey]);

  // Three-state sort toggle: asc → desc → clear
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prev) => {
      if (prev.key === columnId) {
        if (prev.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prev.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort rows using the caller-provided comparator
  const sortedRows = useMemo(() => {
    if (!rows || !sortConfig.key || !sortConfig.direction) {
      return rows || [];
    }

    const sortableRows = [...rows];
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    return sortableRows.sort(
      (a: T, b: T) => direction * sortComparator(a, b, sortConfig.key)
    );
  }, [rows, sortConfig, sortComparator]);

  // Ensure page is valid when rows change
  const validPage =
    sortedRows.length === 0
      ? 0
      : Math.min(
          page,
          Math.max(0, Math.ceil(sortedRows.length / rowsPerPage) - 1)
        );

  useEffect(() => {
    if (page !== validPage) {
      setPage(validPage);
    }
  }, [sortedRows.length, page, validPage]);

  // "Showing X - Y" range string
  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(
      page * rowsPerPage + rowsPerPage,
      sortedRows?.length ?? 0
    );
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedRows?.length]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newRowsPerPage = parseInt(event.target.value, 10);
      setRowsPerPage(newRowsPerPage);
      setPaginationRowCount(storageKey, newRowsPerPage);
      setPage(0);
    },
    [storageKey]
  );

  return {
    sortConfig,
    handleSort,
    sortedRows,
    page,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount: sortedRows.length,
  };
}
