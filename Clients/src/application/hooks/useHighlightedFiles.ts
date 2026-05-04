/**
 * @fileoverview Highlighted Files Hook
 *
 * React hook for tracking files that need attention:
 * - Due for update (expiry date approaching)
 * - Pending approval
 * - Recently modified
 *
 * @module application/hooks/useHighlightedFiles
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { getHighlightedFiles, HighlightedFilesResponse } from "../repository/file.repository";

export type HighlightType = "dueForUpdate" | "pendingApproval" | "recentlyModified";

interface UseHighlightedFilesOptions {
  /** Days before expiry to flag as "due for update" (default: 30) */
  daysUntilExpiry?: number;
  /** Days to consider as "recently modified" (default: 7) */
  recentDays?: number;
  /** Auto-refresh interval in ms (default: 5 minutes, 0 to disable) */
  refreshInterval?: number;
}

interface UseHighlightedFilesReturn {
  // Data
  dueForUpdate: Set<number>;
  pendingApproval: Set<number>;
  recentlyModified: Set<number>;

  // Loading state
  loading: boolean;

  // Error state
  error: string | null;

  // Actions
  refresh: () => Promise<void>;

  // Helpers
  getHighlightType: (fileId: number | string) => HighlightType | null;
  isHighlighted: (fileId: number | string) => boolean;
  getHighlightTypes: (fileId: number | string) => HighlightType[];
}

/**
 * Hook for managing highlighted files (files that need attention)
 */
export function useHighlightedFiles(
  options: UseHighlightedFilesOptions = {},
): UseHighlightedFilesReturn {
  const {
    daysUntilExpiry = 30,
    recentDays = 7,
    refreshInterval = 5 * 60 * 1000, // 5 minutes
  } = options;

  const [data, setData] = useState<HighlightedFilesResponse>({
    dueForUpdate: [],
    pendingApproval: [],
    recentlyModified: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch highlighted files from API
   */
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await getHighlightedFiles({
        daysUntilExpiry,
        recentDays,
      });

      setData(result);
    } catch (err) {
      console.error("Error fetching highlighted files:", err);
      setError("Failed to load highlighted files");
    } finally {
      setLoading(false);
    }
  }, [daysUntilExpiry, recentDays]);

  // Initial load and refresh interval
  useEffect(() => {
    refresh();

    if (refreshInterval > 0) {
      const intervalId = setInterval(refresh, refreshInterval);
      return () => clearInterval(intervalId);
    }
    return undefined;
  }, [refresh, refreshInterval]);

  // Convert arrays to Sets for O(1) lookup
  const dueForUpdate = useMemo(() => new Set(data.dueForUpdate), [data.dueForUpdate]);
  const pendingApproval = useMemo(() => new Set(data.pendingApproval), [data.pendingApproval]);
  const recentlyModified = useMemo(() => new Set(data.recentlyModified), [data.recentlyModified]);

  /**
   * Get the primary highlight type for a file
   * Priority: dueForUpdate > pendingApproval > recentlyModified
   */
  const getHighlightType = useCallback(
    (fileId: number | string): HighlightType | null => {
      const id = typeof fileId === "string" ? parseInt(fileId, 10) : fileId;

      if (dueForUpdate.has(id)) return "dueForUpdate";
      if (pendingApproval.has(id)) return "pendingApproval";
      if (recentlyModified.has(id)) return "recentlyModified";

      return null;
    },
    [dueForUpdate, pendingApproval, recentlyModified],
  );

  /**
   * Check if a file is highlighted
   */
  const isHighlighted = useCallback(
    (fileId: number | string): boolean => {
      const id = typeof fileId === "string" ? parseInt(fileId, 10) : fileId;
      return dueForUpdate.has(id) || pendingApproval.has(id) || recentlyModified.has(id);
    },
    [dueForUpdate, pendingApproval, recentlyModified],
  );

  /**
   * Get all highlight types for a file (a file can have multiple)
   */
  const getHighlightTypes = useCallback(
    (fileId: number | string): HighlightType[] => {
      const id = typeof fileId === "string" ? parseInt(fileId, 10) : fileId;
      const types: HighlightType[] = [];

      if (dueForUpdate.has(id)) types.push("dueForUpdate");
      if (pendingApproval.has(id)) types.push("pendingApproval");
      if (recentlyModified.has(id)) types.push("recentlyModified");

      return types;
    },
    [dueForUpdate, pendingApproval, recentlyModified],
  );

  return {
    dueForUpdate,
    pendingApproval,
    recentlyModified,
    loading,
    error,
    refresh,
    getHighlightType,
    isHighlighted,
    getHighlightTypes,
  };
}

export default useHighlightedFiles;
