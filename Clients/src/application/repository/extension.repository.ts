import { apiServices } from "../../infrastructure/api/networkServices";
import { Extension } from "../../domain/types/extensions";

/**
 * Repository wrappers for /api/extensions/*.
 * Backend contract lives at Servers/routes/extension.route.ts (registry
 * endpoints) — not the per-extension routes mounted at
 * /api/extensions/<key>/*, which each extension owns.
 */

export async function listExtensions({
  category,
  signal,
}: {
  category?: string;
  signal?: AbortSignal;
} = {}): Promise<Extension[]> {
  const response = await apiServices.get("/extensions", { category, signal });
  return (response.data as any).data as Extension[];
}

export async function getExtensionByKey({
  key,
  signal,
}: {
  key: string;
  signal?: AbortSignal;
}): Promise<Extension> {
  const response = await apiServices.get(`/extensions/${key}`, { signal });
  return (response.data as any).data as Extension;
}

export async function enableExtension({
  key,
  configuration,
}: {
  key: string;
  configuration?: Record<string, unknown>;
}): Promise<Extension> {
  const response = await apiServices.post(`/extensions/${key}/enable`, {
    configuration: configuration ?? {},
  });
  return (response.data as any).data as Extension;
}

export async function disableExtension({ key }: { key: string }): Promise<Extension> {
  const response = await apiServices.post(`/extensions/${key}/disable`, {});
  return (response.data as any).data as Extension;
}

export async function updateExtensionConfiguration({
  key,
  configuration,
}: {
  key: string;
  configuration: Record<string, unknown>;
}): Promise<Extension> {
  const response = await apiServices.patch(`/extensions/${key}/configuration`, {
    configuration,
  });
  return (response.data as any).data as Extension;
}

export interface ExtensionTestConnectionResult {
  success: boolean;
  message: string;
  testedAt: string;
}

export async function testExtensionConnection({
  key,
  configuration,
}: {
  key: string;
  configuration: Record<string, unknown>;
}): Promise<ExtensionTestConnectionResult> {
  const response = await apiServices.post(`/extensions/${key}/test-connection`, {
    configuration,
  });
  return (response.data as any).data as ExtensionTestConnectionResult;
}
