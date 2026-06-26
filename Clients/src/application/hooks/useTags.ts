import { useQuery } from "@tanstack/react-query";
import { getAllTags } from "../repository/policy.repository";

export const tagQueryKeys = {
  all: ["policy-tags"] as const,
};

export function useTags() {
  return useQuery({
    queryKey: tagQueryKeys.all,
    queryFn: async () => getAllTags(),
  });
}
