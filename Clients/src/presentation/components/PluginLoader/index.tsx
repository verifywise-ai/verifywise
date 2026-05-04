import { useEffect } from "react";
import {
  usePluginRegistry,
  PluginUIConfig,
} from "../../../application/contexts/PluginRegistry.context";
import { apiServices } from "../../../infrastructure/api/networkServices";

interface MarketplacePlugin {
  key: string;
  ui?: PluginUIConfig;
}

interface MarketplaceResponse {
  data: MarketplacePlugin[];
}

/**
 * PluginLoader component
 *
 * This component runs on app startup and loads all UI bundles for installed plugins.
 * It fetches the marketplace data to get UI configurations and dynamically imports
 * the ESM bundles for each installed plugin.
 */
export function PluginLoader() {
  const { installedPlugins, loadPluginUI, isLoading } = usePluginRegistry();

  useEffect(() => {
    if (isLoading || installedPlugins.length === 0) {
      return;
    }

    async function loadAllPluginUIs() {
      try {
        // Fetch marketplace data to get UI configs
        const response = await apiServices.get<MarketplaceResponse>("/plugins/marketplace");

        const marketplacePlugins: MarketplacePlugin[] = (response.data as any)?.data || [];

        for (const installed of installedPlugins) {
          const marketplacePlugin = marketplacePlugins.find((p) => p.key === installed.pluginKey);

          if (marketplacePlugin?.ui) {
            await loadPluginUI(installed.pluginKey, marketplacePlugin.ui);
          }
        }
      } catch (error) {
        console.error("[PluginLoader] Failed to load plugin UIs:", error);
      }
    }

    loadAllPluginUIs();
  }, [installedPlugins, loadPluginUI, isLoading]);

  // This component doesn't render anything
  return null;
}

export default PluginLoader;
