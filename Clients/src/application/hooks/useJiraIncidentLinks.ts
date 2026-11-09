import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useExtensions } from "../contexts/Extensions.context";
import {
  getJiraIncidentLinks,
  type JiraIncidentLink,
} from "../repository/jiraIncidents.repository";

const EMPTY = new Map<number, JiraIncidentLink>();

/**
 * Jira links for the given incidents, by incident id. Empty when the Jira
 * incidents extension is off, before the first answer, or when the read fails
 * (the chips are extra information, never a reason to break the incidents page).
 */
export function useJiraIncidentLinks(incidentIds: number[]): Map<number, JiraIncidentLink> {
  const { isEnabled } = useExtensions();
  const ids = useMemo(
    () =>
      [...new Set(incidentIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
        (a, b) => a - b,
      ),
    [incidentIds],
  );
  const enabled = isEnabled("jira-incidents") && ids.length > 0;
  const { data } = useQuery({
    queryKey: ["jira-incident-links", ids],
    queryFn: () => getJiraIncidentLinks(ids),
    enabled,
    staleTime: 60_000,
  });
  return useMemo(
    () => (enabled && data ? new Map(data.map((l) => [l.incident_id, l])) : EMPTY),
    [enabled, data],
  );
}
