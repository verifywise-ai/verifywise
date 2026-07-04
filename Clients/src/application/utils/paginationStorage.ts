/**
 * Utility functions for managing pagination row count.
 *
 * Backed by the typed StorageService, which provides JSON safety and SSR/sandbox
 * fallbacks. Values are stored as raw strings under `verifywise_pagination_rows_*`.
 */

import { storageService, dynamicKeys } from "../../infrastructure/storage";

export const getPaginationRowCount = (tableKey: string, defaultCount: number = 10): number => {
  const stored = storageService.getRaw<string | null>(dynamicKeys.paginationRows(tableKey), null, {
    raw: true,
  });
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultCount;
};

export const setPaginationRowCount = (tableKey: string, rowCount: number): void => {
  storageService.setRaw(dynamicKeys.paginationRows(tableKey), rowCount, { raw: true });
};
