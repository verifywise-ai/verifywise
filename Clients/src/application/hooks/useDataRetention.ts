import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  getDataRetention,
  type DataRetentionOverview,
} from "../repository/dataRetention.repository";

export const DATA_RETENTION_QUERY_KEY = ["data-retention"] as const;

export const useDataRetention = (): UseQueryResult<DataRetentionOverview, Error> =>
  useQuery({
    queryKey: DATA_RETENTION_QUERY_KEY,
    queryFn: async ({ signal }) => await getDataRetention(signal),
  });

/** Refetches the overview; call after any save made from the Data retention tab. */
export const useInvalidateDataRetention = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: DATA_RETENTION_QUERY_KEY });
};
