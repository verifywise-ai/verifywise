import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getModelInventories } from "../repository/modelInventory.repository";
import { IModelInventory } from "../../domain/interfaces/i.modelInventory";

export const modelInventoryQueryKeys = {
  all: ["modelInventories"] as const,
  lists: () => [...modelInventoryQueryKeys.all, "list"] as const,
};

export const useModelInventories = (): UseQueryResult<IModelInventory[], Error> => {
  return useQuery({
    queryKey: modelInventoryQueryKeys.lists(),
    queryFn: async ({ signal }) => {
      return await getModelInventories(signal);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
