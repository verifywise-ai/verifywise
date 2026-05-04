import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PluginInstallation } from "../../domain/types/plugins";
import { getInstalledPlugins } from "../repository/plugin.repository";
import { PluginRenderType } from "../../domain/constants/pluginSlots";
import { getBuiltinPluginComponents } from "../registry/builtinPlugins.registry";

const PLUGINS_QUERY_KEY = ["plugins", "installations"] as const;

// Get the backend API base URL for dynamic imports
// Dynamic import() bypasses Vite's proxy, so we need the actual backend URL
const getBackendUrl = (): string => {
  // Check for explicit API base URL from environment
  if (import.meta.env.VITE_APP_API_BASE_URL) {
    return import.meta.env.VITE_APP_API_BASE_URL;
  }
  // In development, Vite runs on 5173 but backend is on 3000
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  // In production, API is on same origin
  return window.location.origin;
};

// Convert plugin key to global variable name (e.g., "risk-import" -> "PluginRiskImport")
const getPluginGlobalName = (pluginKey: string): string => {
  const pascalCase = pluginKey
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `Plugin${pascalCase}`;
};

// Load script and return promise that resolves when loaded
const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

/**
 * Configuration for a plugin's slot injection
 */
export interface PluginSlotConfig {
  slotId: string;
  componentName: string;
  renderType: PluginRenderType;
  props?: Record<string, any>;
  trigger?: string; // For modals - what component triggers this
}

/**
 * Plugin UI configuration from marketplace
 */
export interface PluginUIConfig {
  bundleUrl: string;
  globalName?: string; // Custom IIFE global name (if different from default)
  slots: PluginSlotConfig[];
}

/**
 * A loaded plugin component ready to render
 */
export interface LoadedPluginComponent {
  pluginKey: string;
  slotId: string;
  componentName: string;
  Component: React.ComponentType<any>;
  renderType: PluginRenderType;
  props?: Record<string, any>;
  trigger?: string;
}

/**
 * Tab configuration for plugin tabs
 */
export interface PluginTabConfig {
  pluginKey: string;
  label: string;
  value: string;
  icon?: string;
}

/**
 * Plugin registry context type
 */
interface PluginRegistryContextType {
  installedPlugins: PluginInstallation[];
  isLoading: boolean;
  loadedComponents: Map<string, LoadedPluginComponent[]>; // slotId -> components
  getComponentsForSlot: (slotId: string) => LoadedPluginComponent[];
  getPluginTabs: (slotId: string) => PluginTabConfig[];
  loadPluginUI: (pluginKey: string, uiConfig: PluginUIConfig) => Promise<void>;
  unloadPlugin: (pluginKey: string) => void;
  refreshPlugins: () => Promise<void>;
  isPluginInstalled: (pluginKey: string) => boolean;
}

const PluginRegistryContext = createContext<PluginRegistryContextType | null>(null);

interface PluginRegistryProviderProps {
  children: ReactNode;
}

export function PluginRegistryProvider({ children }: PluginRegistryProviderProps) {
  const queryClient = useQueryClient();
  const [loadedComponents, setLoadedComponents] = useState<Map<string, LoadedPluginComponent[]>>(
    new Map(),
  );
  // Use ref for loadedBundles to avoid stale closure issues in loadPluginUI callback
  const loadedBundlesRef = React.useRef<Set<string>>(new Set());

  // Fetch installed plugins with React Query caching
  const { data: installedPlugins = [], isLoading } = useQuery({
    queryKey: PLUGINS_QUERY_KEY,
    queryFn: async () => {
      const plugins = await getInstalledPlugins({});
      return plugins.filter((p) => p.status === "installed");
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const refreshPlugins = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PLUGINS_QUERY_KEY });
  }, [queryClient]);

  // Check if a plugin is installed
  const isPluginInstalled = useCallback(
    (pluginKey: string): boolean => {
      return installedPlugins.some((p) => p.pluginKey === pluginKey && p.status === "installed");
    },
    [installedPlugins],
  );

  // Track bundles currently being loaded to prevent duplicate loads
  const loadingBundles = React.useRef<Set<string>>(new Set());

  // Load a plugin's UI bundle dynamically
  const loadPluginUI = useCallback(async (pluginKey: string, uiConfig: PluginUIConfig) => {
    // Handle built-in plugins: resolve components from the main bundle
    if (uiConfig.bundleUrl === "__builtin__") {
      const builtinComponents = getBuiltinPluginComponents(pluginKey);
      if (!builtinComponents) {
        console.warn(`[PluginRegistry] No built-in components found for plugin ${pluginKey}`);
        return;
      }

      setLoadedComponents((prevComponents) => {
        const newComponents = new Map(prevComponents);

        for (const slotConfig of uiConfig.slots) {
          const Component = builtinComponents[slotConfig.componentName];
          if (!Component) {
            console.warn(
              `[PluginRegistry] Built-in component ${slotConfig.componentName} not found for plugin ${pluginKey}`,
            );
            continue;
          }

          const loadedComponent: LoadedPluginComponent = {
            pluginKey,
            slotId: slotConfig.slotId,
            componentName: slotConfig.componentName,
            Component,
            renderType: slotConfig.renderType,
            props: slotConfig.props,
            trigger: slotConfig.trigger,
          };

          const existing = newComponents.get(slotConfig.slotId) || [];
          const alreadyRegistered = existing.some(
            (c) => c.pluginKey === pluginKey && c.componentName === slotConfig.componentName,
          );
          if (!alreadyRegistered) {
            newComponents.set(slotConfig.slotId, [...existing, loadedComponent]);
          }
        }

        return newComponents;
      });
      return;
    }

    // Check if currently loading to prevent concurrent loads
    if (loadingBundles.current.has(uiConfig.bundleUrl)) {
      return;
    }

    const globalName = uiConfig.globalName || getPluginGlobalName(pluginKey);
    const bundleAlreadyLoaded = loadedBundlesRef.current.has(uiConfig.bundleUrl);

    // If bundle was previously loaded, the script is still in DOM
    // Just need to re-register the components from the existing global
    if (bundleAlreadyLoaded) {
      const module = (window as any)[globalName];
      if (module) {
        // Re-register components for the re-installed plugin
        setLoadedComponents((prevComponents) => {
          const newComponents = new Map(prevComponents);

          for (const slotConfig of uiConfig.slots) {
            const Component = module[slotConfig.componentName];
            if (!Component) {
              console.warn(
                `[PluginRegistry] Component ${slotConfig.componentName} not found in plugin ${pluginKey}`,
              );
              continue;
            }

            const loadedComponent: LoadedPluginComponent = {
              pluginKey,
              slotId: slotConfig.slotId,
              componentName: slotConfig.componentName,
              Component,
              renderType: slotConfig.renderType,
              props: slotConfig.props,
              trigger: slotConfig.trigger,
            };

            const existing = newComponents.get(slotConfig.slotId) || [];
            // Check if this plugin's component is already registered for this slot
            const alreadyRegistered = existing.some(
              (c) => c.pluginKey === pluginKey && c.componentName === slotConfig.componentName,
            );
            if (!alreadyRegistered) {
              newComponents.set(slotConfig.slotId, [...existing, loadedComponent]);
            }
          }

          return newComponents;
        });
      }
      return;
    }

    // Mark as loading immediately to prevent concurrent loads
    loadingBundles.current.add(uiConfig.bundleUrl);

    try {
      // Resolve the bundle URL - for /api/ paths, use the backend URL directly
      let resolvedUrl = uiConfig.bundleUrl;
      if (uiConfig.bundleUrl.startsWith("/api/")) {
        resolvedUrl = `${getBackendUrl()}${uiConfig.bundleUrl}`;
      }

      // Load IIFE bundle via script tag - it exposes exports on window.PluginName
      await loadScript(resolvedUrl);

      // Get the module from the global variable (use config globalName if provided)
      const module = (window as any)[globalName];

      if (!module) {
        throw new Error(`Plugin global ${globalName} not found after loading script`);
      }

      // Register each slot component
      setLoadedComponents((prevComponents) => {
        const newComponents = new Map(prevComponents);

        for (const slotConfig of uiConfig.slots) {
          const Component = module[slotConfig.componentName];
          if (!Component) {
            console.warn(
              `[PluginRegistry] Component ${slotConfig.componentName} not found in plugin ${pluginKey}`,
            );
            continue;
          }

          const loadedComponent: LoadedPluginComponent = {
            pluginKey,
            slotId: slotConfig.slotId,
            componentName: slotConfig.componentName,
            Component,
            renderType: slotConfig.renderType,
            props: slotConfig.props,
            trigger: slotConfig.trigger,
          };

          const existing = newComponents.get(slotConfig.slotId) || [];
          newComponents.set(slotConfig.slotId, [...existing, loadedComponent]);
        }

        return newComponents;
      });

      loadedBundlesRef.current.add(uiConfig.bundleUrl);
    } catch (error) {
      console.error(`[PluginRegistry] Failed to load plugin UI for ${pluginKey}:`, error);
    } finally {
      loadingBundles.current.delete(uiConfig.bundleUrl);
    }
  }, []);

  const getComponentsForSlot = useCallback(
    (slotId: string): LoadedPluginComponent[] => {
      return loadedComponents.get(slotId) || [];
    },
    [loadedComponents],
  );

  // Unload a plugin's components from all slots
  const unloadPlugin = useCallback((pluginKey: string) => {
    setLoadedComponents((prevComponents) => {
      const newComponents = new Map(prevComponents);

      // Remove components for this plugin from all slots
      for (const [slotId, components] of newComponents) {
        const filtered = components.filter((c) => c.pluginKey !== pluginKey);
        if (filtered.length === 0) {
          newComponents.delete(slotId);
        } else {
          newComponents.set(slotId, filtered);
        }
      }

      return newComponents;
    });
  }, []);

  // Get tab configurations for plugins registered in a slot
  // De-duplicates tabs by value (so multiple plugins can share the same tab)
  const getPluginTabs = useCallback(
    (slotId: string): PluginTabConfig[] => {
      const components = loadedComponents.get(slotId) || [];
      const tabs = components
        .filter((c) => c.renderType === "tab")
        .map((c) => ({
          pluginKey: c.pluginKey,
          label: c.props?.label || c.pluginKey,
          value: c.props?.value || c.pluginKey,
          icon: c.props?.icon,
        }));

      // De-duplicate by value (first one wins)
      const seen = new Set<string>();
      return tabs.filter((tab) => {
        if (seen.has(tab.value)) return false;
        seen.add(tab.value);
        return true;
      });
    },
    [loadedComponents],
  );

  return (
    <PluginRegistryContext.Provider
      value={{
        installedPlugins,
        isLoading,
        loadedComponents,
        getComponentsForSlot,
        getPluginTabs,
        loadPluginUI,
        unloadPlugin,
        refreshPlugins,
        isPluginInstalled,
      }}
    >
      {children}
    </PluginRegistryContext.Provider>
  );
}

export function usePluginRegistry() {
  const context = useContext(PluginRegistryContext);
  if (!context) {
    throw new Error("usePluginRegistry must be used within PluginRegistryProvider");
  }
  return context;
}
