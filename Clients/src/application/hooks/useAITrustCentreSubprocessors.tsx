import { useState, useEffect, useCallback } from "react";
import {
  getAITrustCentreSubprocessors,
  createAITrustCentreSubprocessor,
  deleteAITrustCentreSubprocessor,
  updateAITrustCentreSubprocessor,
} from "../repository/aiTrustCentre.repository";

interface AITrustCentreSubprocessor {
  id: number;
  name: string;
  purpose: string;
  location: string;
  url: string;
  updated_at?: string;
}

interface UseAITrustCentreSubprocessorsReturn {
  subprocessors: AITrustCentreSubprocessor[];
  loading: boolean;
  error: string | null;
  fetchSubprocessors: () => Promise<void>;
  createSubprocessor: (
    name: string,
    purpose: string,
    location: string,
    url: string,
  ) => Promise<void>;
  deleteSubprocessor: (subprocessorId: number) => Promise<void>;
  updateSubprocessor: (
    subprocessorId: number,
    name: string,
    purpose: string,
    location: string,
    url: string,
  ) => Promise<void>;
}

export const useAITrustCentreSubprocessors = (): UseAITrustCentreSubprocessorsReturn => {
  const [subprocessors, setSubprocessors] = useState<AITrustCentreSubprocessor[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubprocessors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAITrustCentreSubprocessors();

      // Handle the nested response structure: response.data.data.subprocessors
      const subprocessors =
        response?.data?.data?.subprocessors ||
        response?.data?.subprocessors ||
        response?.subprocessors ||
        [];
      setSubprocessors(subprocessors);
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to fetch AI Trust Centre subprocessors";
      setError(errorMessage);
      console.error("Error fetching AI Trust Centre subprocessors:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSubprocessor = useCallback(
    async (name: string, purpose: string, location: string, url: string) => {
      setLoading(true);
      setError(null);
      try {
        await createAITrustCentreSubprocessor(name, purpose, location, url);

        // Refresh the subprocessors list after creating a new one
        await fetchSubprocessors();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message ||
          err.message ||
          "Failed to create AI Trust Centre subprocessor";
        setError(errorMessage);
        console.error("Error creating AI Trust Centre subprocessor:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubprocessors],
  );

  const deleteSubprocessor = useCallback(
    async (subprocessorId: number) => {
      setLoading(true);
      setError(null);
      try {
        await deleteAITrustCentreSubprocessor(subprocessorId);

        // Refresh the subprocessors list after deleting
        await fetchSubprocessors();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message ||
          err.message ||
          "Failed to delete AI Trust Centre subprocessor";
        setError(errorMessage);
        console.error("Error deleting AI Trust Centre subprocessor:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubprocessors],
  );

  const updateSubprocessor = useCallback(
    async (
      subprocessorId: number,
      name: string,
      purpose: string,
      location: string,
      url: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        await updateAITrustCentreSubprocessor(subprocessorId, name, purpose, location, url);

        // Refresh the subprocessors list after updating
        await fetchSubprocessors();
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message ||
          err.message ||
          "Failed to update AI Trust Centre subprocessor";
        setError(errorMessage);
        console.error("Error updating AI Trust Centre subprocessor:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchSubprocessors],
  );

  // Fetch subprocessors on mount
  useEffect(() => {
    fetchSubprocessors();
  }, [fetchSubprocessors]);

  return {
    subprocessors,
    loading,
    error,
    fetchSubprocessors,
    createSubprocessor,
    deleteSubprocessor,
    updateSubprocessor,
  };
};
