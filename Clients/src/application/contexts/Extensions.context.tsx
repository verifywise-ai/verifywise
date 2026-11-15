import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  disableExtension as disableExtensionApi,
  enableExtension as enableExtensionApi,
  listExtensions,
  updateExtensionConfiguration as updateExtensionConfigurationApi,
} from "../repository/extension.repository";
import { Extension } from "../../domain/types/extensions";
import { useAuth } from "../hooks/useAuth";

/**
 * Single fetch of /api/extensions shared across every consumer (Extensions
 * page for the list, Datasets/Models/... pages for individual isEnabled
 * checks). Mutations write through the local cache so consumers re-render
 * immediately.
 */

interface ExtensionsContextValue {
  extensions: Extension[];
  loading: boolean;
  /**
   * True once the first fetch for the signed-in organization has settled,
   * whether it succeeded or failed. `loading` starts false with an empty
   * list, so "not enabled" cannot be told apart from "not fetched yet"
   * without this.
   */
  loaded: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  enable: (key: string, configuration?: Record<string, unknown>) => Promise<Extension>;
  disable: (key: string) => Promise<Extension>;
  updateConfiguration: (key: string, configuration: Record<string, unknown>) => Promise<Extension>;
  isEnabled: (key: string) => boolean;
  getByKey: (key: string) => Extension | undefined;
}

const ExtensionsContext = createContext<ExtensionsContextValue | null>(null);

export function ExtensionsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, organizationId } = useAuth();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listExtensions();
      setExtensions(rows);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load extensions");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // Guard the fetch on authentication AND org context. The provider is
  // mounted at the app root (above the router), so on /login the user has
  // no token yet and /api/extensions would 400. Bootstrap SuperAdmin has a
  // token but no organizationId — extensions are org-scoped so the fetch
  // would 401. Clear the local cache on logout too so a subsequent user
  // doesn't see the previous session's data.
  useEffect(() => {
    // A new organization's list is not known until its fetch settles.
    setLoaded(false);
    if (isAuthenticated && organizationId) {
      load();
    } else {
      setExtensions([]);
      setError(null);
    }
  }, [isAuthenticated, organizationId, load]);

  const replaceOne = useCallback((next: Extension) => {
    setExtensions((prev) => prev.map((e) => (e.key === next.key ? next : e)));
  }, []);

  const enable = useCallback(
    async (key: string, configuration?: Record<string, unknown>) => {
      const next = await enableExtensionApi({ key, configuration });
      replaceOne(next);
      return next;
    },
    [replaceOne],
  );

  const disable = useCallback(
    async (key: string) => {
      const next = await disableExtensionApi({ key });
      replaceOne(next);
      return next;
    },
    [replaceOne],
  );

  const updateConfiguration = useCallback(
    async (key: string, configuration: Record<string, unknown>) => {
      const next = await updateExtensionConfigurationApi({ key, configuration });
      replaceOne(next);
      return next;
    },
    [replaceOne],
  );

  const value = useMemo<ExtensionsContextValue>(
    () => ({
      extensions,
      loading,
      loaded,
      error,
      refetch: load,
      enable,
      disable,
      updateConfiguration,
      isEnabled: (key: string) => extensions.some((e) => e.key === key && e.enabled),
      getByKey: (key: string) => extensions.find((e) => e.key === key),
    }),
    [extensions, loading, loaded, error, load, enable, disable, updateConfiguration],
  );

  return <ExtensionsContext.Provider value={value}>{children}</ExtensionsContext.Provider>;
}

export function useExtensions(): ExtensionsContextValue {
  const ctx = useContext(ExtensionsContext);
  if (!ctx) {
    throw new Error("useExtensions must be used inside <ExtensionsProvider>");
  }
  return ctx;
}
