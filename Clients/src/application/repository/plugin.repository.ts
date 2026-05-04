import { apiServices } from "../../infrastructure/api/networkServices";
import { Plugin, PluginInstallation, PluginCategoryInfo } from "../../domain/types/plugins";

/**
 * Get all available plugins from marketplace
 */
export async function getAllPlugins({
  category,
  signal,
  responseType = "json",
}: {
  category?: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Plugin[]> {
  const response = await apiServices.get("/plugins/marketplace", {
    category,
    signal,
    responseType,
  });
  return (response.data as any).data as Plugin[];
}

/**
 * Get plugin by key
 */
export async function getPluginByKey({
  key,
  signal,
  responseType = "json",
}: {
  key: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Plugin> {
  const response = await apiServices.get(`/plugins/marketplace/${key}`, {
    signal,
    responseType,
  });
  return (response.data as any).data as Plugin;
}

/**
 * Search plugins
 */
export async function searchPlugins({
  query,
  signal,
  responseType = "json",
}: {
  query: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<Plugin[]> {
  const response = await apiServices.get("/plugins/marketplace/search", {
    q: query,
    signal,
    responseType,
  });
  return (response.data as any).data as Plugin[];
}

/**
 * Install a plugin
 */
export async function installPlugin({
  pluginKey,
}: {
  pluginKey: string;
}): Promise<PluginInstallation> {
  const response = await apiServices.post("/plugins/install", {
    pluginKey,
  });
  return (response.data as any).data as PluginInstallation;
}

/**
 * Uninstall a plugin
 */
export async function uninstallPlugin({
  installationId,
}: {
  installationId: number;
}): Promise<any> {
  const response = await apiServices.delete(`/plugins/installations/${installationId}`);
  return (response.data as any).data;
}

/**
 * Get installed plugins for current user
 */
export async function getInstalledPlugins({
  signal,
  responseType = "json",
}: {
  signal?: AbortSignal;
  responseType?: string;
} = {}): Promise<PluginInstallation[]> {
  const response = await apiServices.get("/plugins/installations", {
    signal,
    responseType,
  });
  return (response.data as any).data as PluginInstallation[];
}

/**
 * Get plugin categories
 */
export async function getCategories({
  signal,
  responseType = "json",
}: {
  signal?: AbortSignal;
  responseType?: string;
} = {}): Promise<PluginCategoryInfo[]> {
  const response = await apiServices.get("/plugins/categories", {
    signal,
    responseType,
  });
  return (response.data as any).data as PluginCategoryInfo[];
}

/**
 * Update plugin configuration
 */
export async function updatePluginConfiguration({
  installationId,
  configuration,
}: {
  installationId: number;
  configuration: Record<string, any>;
}): Promise<PluginInstallation> {
  const response = await apiServices.put(`/plugins/installations/${installationId}/configuration`, {
    configuration,
  });
  return (response.data as any).data as PluginInstallation;
}

/**
 * Test plugin connection
 */
export async function testPluginConnection({
  pluginKey,
  configuration,
}: {
  pluginKey: string;
  configuration: Record<string, any>;
}): Promise<any> {
  const response = await apiServices.post(`/plugins/${pluginKey}/test-connection`, {
    configuration,
  });
  return (response.data as any).data;
}

/**
 * Connect OAuth workspace (Slack)
 */
export async function connectOAuthWorkspace({
  pluginKey,
  code,
}: {
  pluginKey: string;
  code: string;
}): Promise<any> {
  const response = await apiServices.post(`/plugins/${pluginKey}/oauth/connect`, { code });
  return (response.data as any).data;
}

/**
 * Get OAuth workspaces (Slack)
 */
export async function getOAuthWorkspaces({
  pluginKey,
  signal,
}: {
  pluginKey: string;
  signal?: AbortSignal;
}): Promise<any[]> {
  const response = await apiServices.get(`/plugins/${pluginKey}/oauth/workspaces`, { signal });
  return (response.data as any).data;
}

/**
 * Update OAuth workspace (Slack routing types)
 */
export async function updateOAuthWorkspace({
  pluginKey,
  webhookId,
  routing_type,
  is_active,
}: {
  pluginKey: string;
  webhookId: number;
  routing_type?: string[];
  is_active?: boolean;
}): Promise<any> {
  const response = await apiServices.patch(`/plugins/${pluginKey}/oauth/workspaces/${webhookId}`, {
    routing_type,
    is_active,
  });
  return (response.data as any).data;
}

/**
 * Disconnect OAuth workspace (Slack)
 */
export async function disconnectOAuthWorkspace({
  pluginKey,
  webhookId,
}: {
  pluginKey: string;
  webhookId: number;
}): Promise<void> {
  await apiServices.delete(`/plugins/${pluginKey}/oauth/workspaces/${webhookId}`);
}
