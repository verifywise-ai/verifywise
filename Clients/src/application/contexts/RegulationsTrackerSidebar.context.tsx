/**
 * @fileoverview Regulations Tracker Sidebar Context
 *
 * Provides the tracked-country count badge to the Regulations Tracker sidebar.
 * Follows the same safe-context pattern as AITrustIndexSidebarContext so the
 * shared ContextSidebar can read counts without crashing outside the provider.
 *
 * @module contexts/RegulationsTrackerSidebar.context
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  FC,
} from "react";
import { getTracked } from "../repository/regulationsTracker.repository";

interface RegulationsTrackerSidebarContextType {
  trackedCount: number;
  setTrackedCount: (n: number) => void;
  refreshTrackedCount: () => void;
}

const RegulationsTrackerSidebarContext =
  createContext<RegulationsTrackerSidebarContextType | null>(null);

export const RegulationsTrackerSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [trackedCount, setTrackedCount] = useState(0);

  const refreshTrackedCount = useCallback(async () => {
    try {
      const response = await getTracked();
      const rows = Array.isArray(response?.data) ? response.data : [];
      setTrackedCount(rows.length);
    } catch {
      // Sidebar badge is non-critical; ignore failures.
    }
  }, []);

  useEffect(() => {
    refreshTrackedCount();
  }, [refreshTrackedCount]);

  return (
    <RegulationsTrackerSidebarContext.Provider
      value={{ trackedCount, setTrackedCount, refreshTrackedCount }}
    >
      {children}
    </RegulationsTrackerSidebarContext.Provider>
  );
};

export const useRegulationsTrackerSidebarContext = () => {
  const context = useContext(RegulationsTrackerSidebarContext);
  if (!context) {
    throw new Error(
      "useRegulationsTrackerSidebarContext must be used within RegulationsTrackerSidebarProvider",
    );
  }
  return context;
};

// Safe version that returns null if not in provider (used by ContextSidebar).
export const useRegulationsTrackerSidebarContextSafe = () => {
  return useContext(RegulationsTrackerSidebarContext);
};
