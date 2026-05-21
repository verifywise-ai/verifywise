import { useQuery } from "@tanstack/react-query";

export function useDatasets() {
  return useQuery({
    queryKey: ["datasets"],
    queryFn: async (): Promise<string[]> => {
      const res = await fetch("/api/datasets");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.versions;
    },
  });
}
