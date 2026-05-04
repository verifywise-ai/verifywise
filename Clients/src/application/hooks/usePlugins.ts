import { useState, useEffect, useCallback } from "react";
import { Plugin, PluginInstallationStatus } from "../../domain/types/plugins";
import { getAllPlugins, getInstalledPlugins } from "../repository/plugin.repository";

export function usePlugins(category?: string) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchPlugins = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both marketplace plugins and installed plugins
        const [marketplacePlugins, installedPlugins] = await Promise.all([
          getAllPlugins({
            category,
            signal: controller.signal,
          }),
          getInstalledPlugins({
            signal: controller.signal,
          }).catch(() => []), // Don't fail if installed plugins fetch fails
        ]);

        // Create a map of installed plugins by key
        const installedMap = new Map(
          installedPlugins.map((installation) => [
            installation.plugin?.key || installation.pluginKey,
            {
              installationId: installation.id,
              status: installation.status,
              installedAt: installation.installedAt,
            },
          ]),
        );

        // Merge installation status into marketplace plugins, normalizing optional array fields
        const mergedPlugins = marketplacePlugins.map((plugin) => {
          const normalized = {
            ...plugin,
            tags: plugin.tags || [],
            features: plugin.features || [],
          };
          const installation = installedMap.get(plugin.key);
          if (installation) {
            return {
              ...normalized,
              installationId: installation.installationId,
              installationStatus: installation.status as PluginInstallationStatus,
              installedAt: installation.installedAt,
            };
          }
          return normalized;
        });

        setPlugins(mergedPlugins);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to fetch plugins");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlugins();

    return () => controller.abort();
  }, [category, refetchTrigger]);

  return { plugins, loading, error, refetch };
}
