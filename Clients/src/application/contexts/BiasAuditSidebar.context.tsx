/**
 * @fileoverview LL 144 Bias Audit Sidebar Context
 *
 * The bias audit page publishes the use case it shows and its section counts
 * here, so the module sidebar can link to that use case's sections and badge
 * them. Follows the same safe-context pattern as AITrustIndexSidebarContext.
 *
 * @module contexts/BiasAuditSidebar.context
 */

import { createContext, useContext, useState, useCallback, ReactNode, FC } from "react";

export interface BiasAuditSidebarSummary {
  /** The use case the page shows; null when there is none. */
  projectId: number | null;
  runsCount: number;
  scopeCount: number;
}

interface BiasAuditSidebarContextType extends BiasAuditSidebarSummary {
  setSummary: (summary: BiasAuditSidebarSummary) => void;
}

const EMPTY: BiasAuditSidebarSummary = { projectId: null, runsCount: 0, scopeCount: 0 };

const BiasAuditSidebarContext = createContext<BiasAuditSidebarContextType | null>(null);

export const BiasAuditSidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [summary, setSummaryState] = useState<BiasAuditSidebarSummary>(EMPTY);

  // Skips an identical summary so a page effect cannot loop on it.
  const setSummary = useCallback((next: BiasAuditSidebarSummary) => {
    setSummaryState((prev) =>
      prev.projectId === next.projectId &&
      prev.runsCount === next.runsCount &&
      prev.scopeCount === next.scopeCount
        ? prev
        : next,
    );
  }, []);

  return (
    <BiasAuditSidebarContext.Provider value={{ ...summary, setSummary }}>
      {children}
    </BiasAuditSidebarContext.Provider>
  );
};

// Safe version that returns null if not in provider (used by ContextSidebar and
// by the page, which also renders outside the dashboard in tests).
export const useBiasAuditSidebarContextSafe = () => {
  return useContext(BiasAuditSidebarContext);
};
