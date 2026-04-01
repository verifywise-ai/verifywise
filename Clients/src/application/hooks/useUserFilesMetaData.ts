/**
 * Custom hook to fetch and manage user files metadata
 *
 * @returns {{
 *   filesData: FileModel[],
 *   loading: boolean,
 *   error: Error | null,
 *   refetch: () => void
 * }} - An object containing the files data, loading state, error, and refetch function
 */

import { useState, useEffect, useCallback } from "react";
import { FileModel } from "../../domain/models/Common/file/file.model";
import { getFilesWithMetadata } from "../repository/file.repository";
import { transformFilesData } from "../utils/fileTransform.utils";

export const useUserFilesMetaData = () => {
  const [filesData, setFilesData] = useState<FileModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchFilesData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Only fetch from file-manager endpoint (org-level files, not project-linked evidence)
        const response = await getFilesWithMetadata({ signal: abortController.signal });
        setFilesData(transformFilesData(response.files));
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setError(
          error instanceof Error ? error : new Error("Unknown error occurred")
        );
      } finally {
        setLoading(false);
      }
    };

    fetchFilesData();

    return () => {
      abortController.abort();
    };
  }, [refetchTrigger]);

  /**
   * Trigger a refetch of the files data
   * Useful after file uploads, deletions, or other mutations
   */
  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return { filesData, loading, error, refetch };
};
