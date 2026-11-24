/**
 * An incident as a task link option: its visible id ("INC-12") and its use
 * case, the same name the server gives an incident link.
 */
export const incidentLinkLabel = (incident: {
  id: number;
  incident_id?: string | null;
  ai_project?: string | null;
}): string => {
  const reference = incident.incident_id?.trim() || `INC-${incident.id}`;
  const useCase = incident.ai_project?.trim().slice(0, 60);
  return useCase ? `${reference} · ${useCase}` : reference;
};
