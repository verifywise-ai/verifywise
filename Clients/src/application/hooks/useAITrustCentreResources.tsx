import { useState, useEffect, useCallback } from "react";
import {
  getAITrustCentreResources,
  createAITrustCentreResource,
  deleteAITrustCentreResource,
  updateAITrustCentreResource,
} from "../repository/aiTrustCentre.repository";

interface AITrustCentreResource {
  id: number;
  name: string;
  description: string;
  visible: boolean;
  file_id: number;
  filename?: string; // Optional filename field
  updated_at: string;
}

interface UseAITrustCentreResourcesReturn {
  resources: AITrustCentreResource[];
  loading: boolean;
  error: string | null;
  fetchResources: () => Promise<void>;
  createResource: (
    file: File,
    name: string,
    description: string,
    visible?: boolean,
  ) => Promise<void>;
  deleteResource: (resourceId: number) => Promise<void>;
  updateResource: (
    resourceId: number,
    name: string,
    description: string,
    visible: boolean,
    file?: File,
    oldFileId?: number,
  ) => Promise<void>;
}

export const useAITrustCentreResources = (): UseAITrustCentreResourcesReturn => {
  const [resources, setResources] = useState<AITrustCentreResource[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAITrustCentreResources();

      // Handle the nested response structure: response.data.data.resources
      const resources =
        response?.data?.data?.resources || response?.data?.resources || response?.resources || [];
      setResources(resources);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message || err.message || "Failed to fetch AI Trust Centre resources";
      setError(errorMessage);
      console.error("Error fetching AI Trust Centre resources:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createResource = useCallback(
    async (file: File, name: string, description: string, visible: boolean = true) => {
      setLoading(true);
      setError(null);
      try {
        await createAITrustCentreResource(file, name, description, visible);

        // Refresh the resources list after creating a new one
        await fetchResources();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || "Failed to create AI Trust Centre resource";
        setError(errorMessage);
        console.error("Error creating AI Trust Centre resource:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchResources],
  );

  const deleteResource = useCallback(
    async (resourceId: number) => {
      setLoading(true);
      setError(null);
      try {
        await deleteAITrustCentreResource(resourceId);

        // Refresh the resources list after deleting
        await fetchResources();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || "Failed to delete AI Trust Centre resource";
        setError(errorMessage);
        console.error("Error deleting AI Trust Centre resource:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchResources],
  );

  const updateResource = useCallback(
    async (
      resourceId: number,
      name: string,
      description: string,
      visible: boolean,
      file?: File,
      oldFileId?: number,
    ) => {
      setLoading(true);
      setError(null);
      try {
        await updateAITrustCentreResource(resourceId, name, description, visible, file, oldFileId);

        // Refresh the resources list after updating
        await fetchResources();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || "Failed to update AI Trust Centre resource";
        setError(errorMessage);
        console.error("Error updating AI Trust Centre resource:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchResources],
  );

  // Fetch resources on mount
  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return {
    resources,
    loading,
    error,
    fetchResources,
    createResource,
    deleteResource,
    updateResource,
  };
};
