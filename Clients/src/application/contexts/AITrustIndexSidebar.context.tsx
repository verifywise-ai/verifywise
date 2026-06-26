/**
 * @fileoverview AI Trust Index Sidebar Context
 *
 * Provides the tracked-app count badge to the AI Trust Index sidebar.
 * Follows the same safe-context pattern as AIDetectionSidebarContext so the
 * shared ContextSidebar can read counts without crashing outside the provider.
 *
 * @module contexts/AITrustIndexSidebar.context
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, FC } from "react";
import { getTracked } from "../repository/aiTrustIndex.repository";

interface AITrustIndexSidebarContextType {
  trackedCount: number;
  setTrackedCount: (n: number) => void;
  refreshTrackedCount: () => void;
}

const AITrustIndexSidebarContext = createContext<AITrustIndexSidebarContextType | null>(null);

export const AITrustIndexSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
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
    <AITrustIndexSidebarContext.Provider
      value={{ trackedCount, setTrackedCount, refreshTrackedCount }}
    >
      {children}
    </AITrustIndexSidebarContext.Provider>
  );
};

export const useAITrustIndexSidebarContext = () => {
  const context = useContext(AITrustIndexSidebarContext);
  if (!context) {
    throw new Error(
      "useAITrustIndexSidebarContext must be used within AITrustIndexSidebarProvider",
    );
  }
  return context;
};

// Safe version that returns null if not in provider (used by ContextSidebar).
export const useAITrustIndexSidebarContextSafe = () => {
  return useContext(AITrustIndexSidebarContext);
};
