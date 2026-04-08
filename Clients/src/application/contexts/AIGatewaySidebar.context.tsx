/**
 * AI Gateway Sidebar Context
 *
 * Provides state management for the AI Gateway sidebar.
 * Follows the ShadowAISidebar pattern.
 */

import { createContext, useContext, useState, useEffect, ReactNode, FC } from "react";
import { apiServices } from "../../infrastructure/api/networkServices";

interface AIGatewaySidebarContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  endpointsCount: number;
  setEndpointsCount: (count: number) => void;
  promptsCount: number;
  setPromptsCount: (count: number) => void;
  virtualKeysCount: number;
  setVirtualKeysCount: (count: number) => void;
}

const AIGatewaySidebarContext = createContext<AIGatewaySidebarContextType | null>(null);

export const AIGatewaySidebarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState("analytics");
  const [endpointsCount, setEndpointsCount] = useState(0);
  const [promptsCount, setPromptsCount] = useState(0);
  const [virtualKeysCount, setVirtualKeysCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [endpointsRes, promptsRes, vkeysRes] = await Promise.all([
          apiServices.get<Record<string, any>>("/ai-gateway/endpoints").catch(() => null),
          apiServices.get<Record<string, any>>("/ai-gateway/prompts").catch(() => null),
          apiServices.get<Record<string, any>>("/ai-gateway/virtual-keys").catch(() => null),
        ]);
        if (cancelled) return;
        const endpoints = endpointsRes?.data?.endpoints;
        if (Array.isArray(endpoints)) {
          setEndpointsCount(endpoints.filter((e: { is_active: boolean }) => e.is_active).length);
        }
        const prompts = promptsRes?.data?.prompts;
        if (Array.isArray(prompts)) {
          setPromptsCount(prompts.length);
        }
        const vkeys = vkeysRes?.data?.data;
        if (Array.isArray(vkeys)) {
          setVirtualKeysCount(vkeys.filter((k: { is_active: boolean }) => k.is_active).length);
        }
      } catch {
        // Silently fail — user may not have access or module not configured
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <AIGatewaySidebarContext.Provider
      value={{
        activeTab,
        setActiveTab,
        endpointsCount,
        setEndpointsCount,
        promptsCount,
        setPromptsCount,
        virtualKeysCount,
        setVirtualKeysCount,
      }}
    >
      {children}
    </AIGatewaySidebarContext.Provider>
  );
};

export const useAIGatewaySidebarContext = () => {
  const context = useContext(AIGatewaySidebarContext);
  if (!context) {
    throw new Error("useAIGatewaySidebarContext must be used within AIGatewaySidebarProvider");
  }
  return context;
};

export const useAIGatewaySidebarContextSafe = () => {
  return useContext(AIGatewaySidebarContext);
};
