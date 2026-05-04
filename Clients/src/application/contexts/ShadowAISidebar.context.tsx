/**
 * Shadow AI Sidebar Context
 *
 * Provides state management for the Shadow AI sidebar.
 * Follows the same pattern as AIDetectionSidebarContext.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, FC } from "react";
import { getTools } from "../repository/shadowAi.repository";

export interface RecentTool {
  id: number;
  name: string;
}

interface ShadowAISidebarContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  toolsCount: number;
  setToolsCount: (count: number) => void;
  alertsCount: number;
  setAlertsCount: (count: number) => void;
  recentTools: RecentTool[];
  setRecentTools: (tools: RecentTool[]) => void;
  refreshRecentTools: () => void;
}

const ShadowAISidebarContext = createContext<ShadowAISidebarContextType | null>(null);

export const ShadowAISidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState("insights");
  const [toolsCount, setToolsCount] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [recentTools, setRecentTools] = useState<RecentTool[]>([]);

  // Load recent tools for sidebar on mount
  const refreshRecentTools = useCallback(async () => {
    try {
      const response = await getTools({
        page: 1,
        limit: 5,
        sort_by: "last_seen_at",
        order: "desc",
      });
      setToolsCount(response.total);
      setRecentTools(response.tools.map((t) => ({ id: t.id, name: t.name })));
    } catch (error) {
      console.error("Failed to load recent tools:", error);
    }
  }, []);

  useEffect(() => {
    refreshRecentTools();
  }, [refreshRecentTools]);

  return (
    <ShadowAISidebarContext.Provider
      value={{
        activeTab,
        setActiveTab,
        toolsCount,
        setToolsCount,
        alertsCount,
        setAlertsCount,
        recentTools,
        setRecentTools,
        refreshRecentTools,
      }}
    >
      {children}
    </ShadowAISidebarContext.Provider>
  );
};

export const useShadowAISidebarContext = () => {
  const context = useContext(ShadowAISidebarContext);
  if (!context) {
    throw new Error("useShadowAISidebarContext must be used within ShadowAISidebarProvider");
  }
  return context;
};

export const useShadowAISidebarContextSafe = () => {
  return useContext(ShadowAISidebarContext);
};
