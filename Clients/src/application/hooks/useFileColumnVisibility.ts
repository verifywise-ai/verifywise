/**
 * @fileoverview File Column Visibility Hook
 *
 * React hook for managing file table column visibility with localStorage persistence.
 *
 * @module application/hooks/useFileColumnVisibility
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { storageService } from "../../infrastructure/storage";

/**
 * Available columns for the file table
 * Keys match the display names used in the table for consistency
 */
export type FileColumn =
  | "file"
  | "upload_date"
  | "uploader"
  | "source"
  | "version"
  | "status"
  | "action";

/**
 * Column configuration with display name and default visibility
 */
export interface ColumnConfig {
  key: FileColumn;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
  width?: number | string;
}

/**
 * Default column configurations
 * These match the columns currently used in the file manager table
 */
export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "file", label: "File", defaultVisible: true, alwaysVisible: true },
  { key: "upload_date", label: "Upload date", defaultVisible: true },
  { key: "uploader", label: "Uploader", defaultVisible: true },
  { key: "source", label: "Source", defaultVisible: true },
  { key: "version", label: "Version", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "action", label: "Action", defaultVisible: true, alwaysVisible: true },
];

const SCHEMA_VERSION = 3;
const STORAGE_KEY = "verifywise_file_column_visibility";
const VERSION_KEY = "verifywise_file_column_visibility_version";
// Old un-namespaced keys, migrated once via the StorageService legacy-key mechanism.
const LEGACY_STORAGE_KEY = "verifywise:file-column-visibility";
const LEGACY_VERSION_KEY = "verifywise:file-column-visibility-version";

// Always-visible column keys that must be included
const ALWAYS_VISIBLE_KEYS = DEFAULT_COLUMNS.filter((c) => c.alwaysVisible).map((c) => c.key);

// Valid column keys for validation
const VALID_COLUMN_KEYS = new Set(DEFAULT_COLUMNS.map((c) => c.key));

/**
 * Table column format expected by FileTable/FileBasicTable
 */
export interface TableColumn {
  id: number;
  name: string;
  sx: { minWidth: string; width: string; maxWidth: string };
}

interface UseFileColumnVisibilityReturn {
  // Current visibility state
  visibleColumns: Set<FileColumn>;
  columnConfigs: (ColumnConfig & { visible: boolean })[];

  // Actions
  toggleColumn: (column: FileColumn) => void;
  setColumnVisible: (column: FileColumn, visible: boolean) => void;
  resetToDefaults: () => void;
  isColumnVisible: (column: FileColumn) => boolean;

  // For column selector UI
  availableColumns: ColumnConfig[];

  // For table rendering - returns columns in the format expected by the table
  getTableColumns: () => TableColumn[];

  // For FileBasicTable - which columns are visible (for conditional cell rendering)
  visibleColumnKeys: FileColumn[];
}

/**
 * Hook for managing file table column visibility
 *
 * Persists column visibility preferences to localStorage
 */
export function useFileColumnVisibility(): UseFileColumnVisibilityReturn {
  // Initialize from storage or defaults
  const [visibleColumns, setVisibleColumns] = useState<Set<FileColumn>>(() => {
    const parsed = storageService.getRaw<FileColumn[] | null>(STORAGE_KEY, null, {
      legacyKey: LEGACY_STORAGE_KEY,
    });
    if (Array.isArray(parsed)) {
      const validKeys = parsed.filter((key) => VALID_COLUMN_KEYS.has(key));

      // Check if schema version has changed (new columns added)
      const storedVersion = Number(
        storageService.getRaw<string | null>(VERSION_KEY, null, {
          raw: true,
          legacyKey: LEGACY_VERSION_KEY,
        }) || "0",
      );
      if (storedVersion < SCHEMA_VERSION) {
        // Add any new defaultVisible columns that weren't in the stored set
        const storedSet = new Set(validKeys);
        const newDefaults = DEFAULT_COLUMNS.filter(
          (c) => c.defaultVisible && !storedSet.has(c.key),
        ).map((c) => c.key);
        storageService.setRaw(VERSION_KEY, SCHEMA_VERSION, { raw: true });
        return new Set([...validKeys, ...newDefaults, ...ALWAYS_VISIBLE_KEYS]);
      }

      return new Set([...validKeys, ...ALWAYS_VISIBLE_KEYS]);
    }

    // First visit — save current version
    storageService.setRaw(VERSION_KEY, SCHEMA_VERSION, { raw: true });
    return new Set(DEFAULT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  });

  // Persist when visibility changes
  useEffect(() => {
    storageService.setRaw(STORAGE_KEY, Array.from(visibleColumns));
  }, [visibleColumns]);

  /**
   * Toggle a column's visibility
   */
  const toggleColumn = useCallback((column: FileColumn) => {
    const config = DEFAULT_COLUMNS.find((c) => c.key === column);
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
  }, []);

  /**
   * Set a column's visibility explicitly
   */
  const setColumnVisible = useCallback((column: FileColumn, visible: boolean) => {
    const config = DEFAULT_COLUMNS.find((c) => c.key === column);
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
  }, []);

  /**
   * Reset to default visibility
   */
  const resetToDefaults = useCallback(() => {
    setVisibleColumns(new Set(DEFAULT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)));
  }, []);

  /**
   * Check if a column is visible
   */
  const isColumnVisible = useCallback(
    (column: FileColumn) => visibleColumns.has(column),
    [visibleColumns],
  );

  // Get column configs with current visibility
  const columnConfigs = useMemo(
    () =>
      DEFAULT_COLUMNS.map((config) => ({
        ...config,
        visible: visibleColumns.has(config.key),
      })),
    [visibleColumns],
  );

  // Get visible column keys in order (for conditional cell rendering)
  const visibleColumnKeys = useMemo(
    () => DEFAULT_COLUMNS.filter((c) => visibleColumns.has(c.key)).map((c) => c.key),
    [visibleColumns],
  );

  /**
   * Get table columns in the format expected by FileTable/FileBasicTable
   * Only returns visible columns with proper IDs and styling
   */
  const getTableColumns = useCallback((): TableColumn[] => {
    return DEFAULT_COLUMNS.filter((col) => visibleColumns.has(col.key)).map((col, index) => ({
      id: index + 1,
      name: col.label,
      sx: {
        minWidth: "fit-content",
        width: "fit-content",
        maxWidth: "50%",
      },
    }));
  }, [visibleColumns]);

  return {
    visibleColumns,
    columnConfigs,
    toggleColumn,
    setColumnVisible,
    resetToDefaults,
    isColumnVisible,
    availableColumns: DEFAULT_COLUMNS,
    getTableColumns,
    visibleColumnKeys,
  };
}

export default useFileColumnVisibility;
