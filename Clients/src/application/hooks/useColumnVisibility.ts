/**
 * @fileoverview Generic Column Visibility Hook
 *
 * A reusable React hook for managing table column visibility with localStorage persistence.
 * Can be used across different tables by providing a unique table ID and column configuration.
 *
 * @module application/hooks/useColumnVisibility
 *
 * @example
 * // Define columns for your table
 * const FILE_COLUMNS: ColumnConfig<FileColumn>[] = [
 *   { key: "filename", label: "File name", defaultVisible: true, alwaysVisible: true },
 *   { key: "size", label: "Size", defaultVisible: true },
 *   { key: "tags", label: "Tags", defaultVisible: false },
 * ];
 *
 * // Use the hook in your component
 * const { visibleColumns, toggleColumn, getVisibleColumnConfigs } = useColumnVisibility({
 *   tableId: "file-manager",
 *   columns: FILE_COLUMNS,
 * });
 *
 * // Get only visible columns for rendering
 * const columnsToRender = getVisibleColumnConfigs();
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { storageService, dynamicKeys } from "../../infrastructure/storage";

/**
 * Column configuration interface
 */
export interface ColumnConfig<TKey extends string = string> {
  /** Unique key identifying the column */
  key: TKey;
  /** Display label for the column */
  label: string;
  /** Whether the column is visible by default */
  defaultVisible: boolean;
  /** If true, column cannot be hidden */
  alwaysVisible?: boolean;
  /** Optional column width */
  width?: number | string;
  /** Optional minimum width */
  minWidth?: number | string;
  /** Optional sort key if different from column key */
  sortKey?: string;
}

/**
 * Hook configuration options
 */
export interface UseColumnVisibilityOptions<TKey extends string> {
  /** Unique identifier for the table (used for localStorage key) */
  tableId: string;
  /** Array of column configurations */
  columns: ColumnConfig<TKey>[];
  /** Optional prefix for localStorage key (default: "verifywise:columns") */
  storagePrefix?: string;
}

/**
 * Hook return type
 */
export interface UseColumnVisibilityReturn<TKey extends string> {
  /** Set of currently visible column keys */
  visibleColumns: Set<TKey>;
  /** All column configurations */
  allColumns: ColumnConfig<TKey>[];
  /** Toggle a column's visibility */
  toggleColumn: (column: TKey) => void;
  /** Set a column's visibility explicitly */
  setColumnVisible: (column: TKey, visible: boolean) => void;
  /** Reset to default visibility */
  resetToDefaults: () => void;
  /** Check if a column is visible */
  isColumnVisible: (column: TKey) => boolean;
  /** Get only the visible column configurations (for rendering) */
  getVisibleColumnConfigs: () => ColumnConfig<TKey>[];
  /** Get column configs with visibility status */
  columnConfigsWithVisibility: (ColumnConfig<TKey> & { visible: boolean })[];
}

/**
 * Generic hook for managing table column visibility
 *
 * @param options - Configuration options
 * @returns Column visibility state and actions
 */
export function useColumnVisibility<TKey extends string = string>(
  options: UseColumnVisibilityOptions<TKey>,
): UseColumnVisibilityReturn<TKey> {
  const { tableId, columns, storagePrefix = "verifywise:columns" } = options;

  // Canonical namespaced key; the old `${storagePrefix}:${tableId}` key is
  // migrated once via the StorageService legacy-key mechanism.
  const storageKey = dynamicKeys.columns(tableId);
  const legacyKey = `${storagePrefix}:${tableId}`;

  // Get default visible columns
  const getDefaultVisibleColumns = useCallback((): Set<TKey> => {
    return new Set(columns.filter((c) => c.defaultVisible).map((c) => c.key));
  }, [columns]);

  // Initialize from storage or defaults
  const [visibleColumns, setVisibleColumns] = useState<Set<TKey>>(() => {
    const parsed = storageService.getRaw<TKey[] | null>(storageKey, null, { legacyKey });
    if (Array.isArray(parsed)) {
      // Validate that stored columns still exist in config
      const validColumns = parsed.filter((key) => columns.some((c) => c.key === key));
      // Always include alwaysVisible columns
      const alwaysVisibleKeys = columns.filter((c) => c.alwaysVisible).map((c) => c.key);
      return new Set([...validColumns, ...alwaysVisibleKeys]);
    }
    return getDefaultVisibleColumns();
  });

  // Persist when visibility changes
  useEffect(() => {
    storageService.setRaw(storageKey, Array.from(visibleColumns));
  }, [visibleColumns, storageKey]);

  /**
   * Toggle a column's visibility
   */
  const toggleColumn = useCallback(
    (column: TKey) => {
      const config = columns.find((c) => c.key === column);
      if (config?.alwaysVisible) return; // Can't hide always-visible columns

      setVisibleColumns((prev) => {
        const next = new Set(prev);
        if (next.has(column)) {
          next.delete(column);
        } else {
          next.add(column);
        }
        return next;
      });
    },
    [columns],
  );

  /**
   * Set a column's visibility explicitly
   */
  const setColumnVisible = useCallback(
    (column: TKey, visible: boolean) => {
      const config = columns.find((c) => c.key === column);
      if (config?.alwaysVisible && !visible) return; // Can't hide always-visible columns

      setVisibleColumns((prev) => {
        const next = new Set(prev);
        if (visible) {
          next.add(column);
        } else {
          next.delete(column);
        }
        return next;
      });
    },
    [columns],
  );

  /**
   * Reset to default visibility
   */
  const resetToDefaults = useCallback(() => {
    setVisibleColumns(getDefaultVisibleColumns());
  }, [getDefaultVisibleColumns]);

  /**
   * Check if a column is visible
   */
  const isColumnVisible = useCallback(
    (column: TKey) => visibleColumns.has(column),
    [visibleColumns],
  );

  /**
   * Get only the visible column configurations (for rendering table headers)
   */
  const getVisibleColumnConfigs = useCallback((): ColumnConfig<TKey>[] => {
    return columns.filter((col) => visibleColumns.has(col.key));
  }, [columns, visibleColumns]);

  /**
   * Get all column configs with visibility status (for column selector UI)
   */
  const columnConfigsWithVisibility = useMemo(
    () =>
      columns.map((config) => ({
        ...config,
        visible: visibleColumns.has(config.key),
      })),
    [columns, visibleColumns],
  );

  return {
    visibleColumns,
    allColumns: columns,
    toggleColumn,
    setColumnVisible,
    resetToDefaults,
    isColumnVisible,
    getVisibleColumnConfigs,
    columnConfigsWithVisibility,
  };
}

export default useColumnVisibility;
