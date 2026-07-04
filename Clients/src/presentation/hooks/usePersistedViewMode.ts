import { useState } from "react";
import { IViewMode } from "../types/toggle.types";
import { storageService, dynamicKeys } from "../../infrastructure/storage";

/**
 * Custom hook for managing view mode with persistence.
 *
 * Backed by the typed StorageService (raw string, namespaced under
 * `verifywise_view_mode_*`), so it never throws in sandboxed/SSR contexts.
 *
 * @param key - logical key for persistence (namespaced internally)
 * @param defaultValue - default view mode if nothing valid is stored
 * @returns [viewMode, setViewMode] tuple
 */
export const usePersistedViewMode = (
  key: string,
  defaultValue: IViewMode = "card",
): [IViewMode, (mode: IViewMode) => void] => {
  const storageKey = dynamicKeys.viewMode(key);

  const [viewMode, setViewMode] = useState<IViewMode>(() => {
    const savedValue = storageService.getRaw<string | null>(storageKey, null, { raw: true });
    if (savedValue === "card" || savedValue === "table") {
      return savedValue;
    }
    return defaultValue;
  });

  const updateViewMode = (mode: IViewMode) => {
    setViewMode(mode);
    storageService.setRaw(storageKey, mode, { raw: true });
  };

  return [viewMode, updateViewMode];
};
