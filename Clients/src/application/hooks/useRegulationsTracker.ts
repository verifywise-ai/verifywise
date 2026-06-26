// Clients/src/application/hooks/useRegulationsTracker.ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getCountries,
  getCountryDetail,
  getTracked,
  trackCountry,
  trackBulk,
  untrackCountry,
  getSettings,
  updateSettings,
} from "../repository/regulationsTracker.repository";

const KEY = "regulations-tracker";

// keepPreviousData on the read queries: track/untrack invalidates these keys,
// which triggers a background refetch. Without it, `data` briefly becomes
// undefined and the page's content unmounts and re-mounts — a visible flicker.
// Keeping the previous data holds the UI steady while the fresh data loads.
export function useCountries(filters: { region?: string; q?: string } = {}) {
  return useQuery({
    queryKey: [KEY, "countries", filters],
    queryFn: () => getCountries(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCountryDetail(slug: string) {
  return useQuery({
    queryKey: [KEY, "country", slug],
    queryFn: () => getCountryDetail(slug),
    enabled: !!slug,
    placeholderData: keepPreviousData,
  });
}

export function useTracked() {
  return useQuery({
    queryKey: [KEY, "tracked"],
    queryFn: () => getTracked(),
    placeholderData: keepPreviousData,
  });
}

export function useTrackCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => trackCountry(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "countries"] });
      qc.invalidateQueries({ queryKey: [KEY, "tracked"] });
      // The detail page reads is_tracked from [KEY, "country", slug]; invalidate the
      // "country" prefix so its Track/Untrack button reflects the new state.
      qc.invalidateQueries({ queryKey: [KEY, "country"] });
    },
  });
}

export function useUntrackCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => untrackCountry(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "countries"] });
      qc.invalidateQueries({ queryKey: [KEY, "tracked"] });
      qc.invalidateQueries({ queryKey: [KEY, "country"] });
    },
  });
}

export function useTrackBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slugs: string[]) => trackBulk(slugs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "countries"] });
      qc.invalidateQueries({ queryKey: [KEY, "tracked"] });
      qc.invalidateQueries({ queryKey: [KEY, "country"] });
    },
  });
}

export function useSettings() {
  // Settings change rarely; a 60s staleTime avoids the global 2s default
  // refetching on every interaction.
  return useQuery({
    queryKey: [KEY, "settings"],
    queryFn: () => getSettings(),
    staleTime: 60 * 1000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { recipient_user_ids: number[]; recipient_emails: string[] }) =>
      updateSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, "settings"] }),
  });
}
