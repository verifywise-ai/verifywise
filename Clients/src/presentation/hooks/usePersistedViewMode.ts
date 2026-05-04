import { useState } from "react";
import { IViewMode } from "../types/toggle.types";

/**
 * Custom hook for managing view mode with localStorage persistence
 *
 * @param key - localStorage key for persistence
 * @param defaultValue - default view mode if not found in localStorage
 * @returns [viewMode, setViewMode] tuple
 */
export const usePersistedViewMode = (
  key: string,
  defaultValue: IViewMode = "card",
): [IViewMode, (mode: IViewMode) => void] => {
  const [viewMode, setViewMode] = useState<IViewMode>(() => {
    try {
      const savedValue = localStorage.getItem(key);
      if (savedValue && (savedValue === "card" || savedValue === "table")) {
        return savedValue as IViewMode;
      }
    } catch (error) {
      console.warn("Failed to read view mode from localStorage:", error);
    }
    return defaultValue;
  });

  const updateViewMode = (mode: IViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(key, mode);
    } catch (error) {
      console.warn("Failed to save view mode to localStorage:", error);
    }
  };

  return [viewMode, updateViewMode];
};
