import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useConfig(name: string) {
  return useQuery({
    queryKey: ["config", name],
    queryFn: async (): Promise<string> => {
      const res = await fetch(`/api/configs/${name}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.content;
    },
  });
}

export function useSaveConfig(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/configs/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["config", name] }),
  });
}
